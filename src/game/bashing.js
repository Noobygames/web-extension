import missionType from "./missionType.js";

/**
 * Bashing rule bookkeeping.
 *
 * OGame's rule (verified against https://en.ogame.gameforge.com/ajax/main/rules and the
 * `bashlimit` / `bashingSystemEnabled` fields of `api/serverData.xml`):
 *
 *   "You are not allowed to attack any given planet or moon owned by an active player
 *    more than 6 times in a 24-hour period."
 *
 * Details this file encodes:
 * - The limit is per **position**, and a planet and its moon count separately - hence
 *   the `:M` suffix in `bashKey()`.
 * - Espionage and interplanetary missiles are exempt. Attack, ACS attack and moon
 *   destruction count. See `BASHING_MISSIONS`.
 * - The window is rolling: an attack stops counting once it is older than 24h. The
 *   practical read-out players expect - "resets 24h after the first attack" - is the
 *   same number, so `bashStatus()` reports `resetAt` = oldest attack in window + 24h.
 * - 6 is only the default. Universes ship their own `bashlimit` (20 in some), so the
 *   limit is always passed in and this module never hardcodes it into a verdict.
 *
 * TWO SOURCES, ONE COUNT. The same attack can reach the log twice, and the account is
 * played from more than one device, so an entry is `{t, ref?}` rather than a bare
 * timestamp:
 *
 *   provisional  `{t}`        the fleet-dispatch hook, at launch. Covers fleets still in
 *                             flight, which no report exists for yet - and which the
 *                             rule already counts.
 *   confirmed    `{t, ref}`   a battle report in the player's inbox, `ref` being the
 *                             report's hashcode. This is the half that survives playing
 *                             from a phone or a second browser: the report is there
 *                             whatever device sent the fleet.
 *
 * `confirmBashAttack()` reconciles them - see its own comment for how, and for the one
 * case where the reconciliation can be one short.
 *
 * Compliance note (AGENTS.md 1.1/1.3/4): pure functions over data the extension already
 * has. Nothing here sends a request, schedules anything, or acts on a game action - it
 * counts what the player already did and shows the number.
 */

/** 24h in ms - the bashing window. */
export const BASH_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Fallback when `serverData.xml` has not been read yet. */
export const DEFAULT_BASH_LIMIT = 6;

/** Missions that count towards the limit. Spy (6) and missile (10) are exempt by rule. */
export const BASHING_MISSIONS = Object.freeze([
  missionType.ATTACK,
  missionType.ACS_ATTACK,
  missionType.MOON_DESTRUCTION,
]);

/** OGame's `PLANETTYPE_MOON`. */
const PLANET_TYPE_MOON = 3;

/**
 * @typedef {Object} BashEntry
 * @property {number} t epoch ms
 * @property {string} [ref] battle-report hashcode; absent means "provisional, from launch"
 */

/**
 * @param {string} coords "g:s:p"
 * @param {boolean} isMoon
 * @returns {string} log key - planet and moon are separate targets under the rule
 */
export function bashKey(coords, isMoon) {
  return isMoon ? `${coords}:M` : coords;
}

/** @param {number|string} planetType OGame's target type (1 planet, 2 debris, 3 moon) */
export function bashKeyFromTarget(coords, planetType) {
  return bashKey(coords, Number(planetType) === PLANET_TYPE_MOON);
}

/** @param {number|string} mission @returns {boolean} */
export function countsForBashing(mission) {
  return BASHING_MISSIONS.includes(Number(mission));
}

/**
 * Entries for one key, tolerating the bare-timestamp shape an older build wrote.
 *
 * @param {Object<string, Array<BashEntry|number>>} log
 * @param {string} key
 * @returns {BashEntry[]}
 */
export function entriesFor(log, key) {
  return (log?.[key] || []).map((entry) => (typeof entry === "number" ? { t: entry } : entry)).filter((e) => e?.t);
}

/**
 * Drops entries that fell out of the window, and keys that ran empty. Also normalises
 * the legacy shape in passing, so nothing downstream has to know about it.
 *
 * @param {Object<string, Array<BashEntry|number>>} log
 * @param {number} now epoch ms
 * @returns {boolean} whether anything changed - callers use it to skip a store write
 */
export function pruneBashLog(log, now) {
  let changed = false;
  for (const key of Object.keys(log)) {
    const before = log[key] || [];
    const kept = entriesFor(log, key).filter((entry) => now - entry.t < BASH_WINDOW_MS);

    if (kept.length === before.length && kept.every((entry, i) => entry === before[i])) continue;

    changed = true;
    if (kept.length) log[key] = kept;
    else delete log[key];
  }
  return changed;
}

/**
 * Records an attack the player just launched from this browser. Provisional: the battle
 * report that will confirm it does not exist yet.
 *
 * @param {Object<string, Array<BashEntry|number>>} log
 * @param {string} key from `bashKey()`
 * @param {number} now epoch ms
 */
export function recordBashAttack(log, key, now) {
  pruneBashLog(log, now);
  log[key] = [...entriesFor(log, key), { t: now }].sort((a, b) => a.t - b.t);
  return log;
}

/**
 * Records an attack read off a battle report, and reconciles it with the launch record
 * if this browser is the one that sent it.
 *
 * Three cases, in order:
 *
 * 1. `ref` already in the log - the report was parsed before. Nothing happens, so
 *    re-opening the messages tab can never inflate the count.
 * 2. A provisional entry exists at or before the report's timestamp - that is this same
 *    attack, launched here and now landed. The newest such entry is replaced by the
 *    confirmed one.
 * 3. Neither - the attack was sent from another device. It is simply added, which is the
 *    whole point of reading reports at all.
 *
 * Case 2 picks the newest matching provisional rather than trying to identify *which*
 * attack the report belongs to, because the count is what matters and it is unchanged
 * either way (one removed, one added). The one way this loses an attack: a report from
 * another device arrives while a fleet this browser sent is still in flight to the same
 * target - the in-flight record is consumed instead, and the count catches up when that
 * fleet's own report lands.
 *
 * @param {Object<string, Array<BashEntry|number>>} log
 * @param {string} key from `bashKey()`
 * @param {number} timestamp epoch ms of the battle
 * @param {string} ref battle-report hashcode - must be stable across re-parses
 * @param {number} [now] epoch ms
 * @returns {boolean} whether the log changed
 */
export function confirmBashAttack(log, key, timestamp, ref, now = Date.now()) {
  if (!ref || !(timestamp > 0)) return false;
  if (now - timestamp >= BASH_WINDOW_MS) return false;

  const entries = entriesFor(log, key);
  if (entries.some((entry) => entry.ref === ref)) return false;

  let provisionalIndex = -1;
  entries.forEach((entry, index) => {
    if (entry.ref || entry.t > timestamp) return;
    if (provisionalIndex === -1 || entry.t > entries[provisionalIndex].t) provisionalIndex = index;
  });
  if (provisionalIndex !== -1) entries.splice(provisionalIndex, 1);

  entries.push({ t: timestamp, ref });
  log[key] = entries.sort((a, b) => a.t - b.t);
  return true;
}

/** @typedef {"none"|"ok"|"warn"|"limit"} BashLevel */

/**
 * @param {Object<string, Array<BashEntry|number>>} log
 * @param {string} key
 * @param {number} now epoch ms
 * @param {number} [limit]
 * @returns {{count: number, confirmed: number, pending: number, limit: number,
 *            remaining: number, resetAt: number|null, level: BashLevel}}
 */
export function bashStatus(log, key, now, limit = DEFAULT_BASH_LIMIT) {
  const effectiveLimit = Number(limit) > 0 ? Number(limit) : DEFAULT_BASH_LIMIT;
  const inWindow = entriesFor(log, key).filter((entry) => now - entry.t < BASH_WINDOW_MS);
  const count = inWindow.length;
  const confirmed = inWindow.filter((entry) => entry.ref).length;

  return {
    count,
    confirmed,
    // Launched here, no report yet - typically a fleet still in flight.
    pending: count - confirmed,
    limit: effectiveLimit,
    remaining: Math.max(0, effectiveLimit - count),
    // The oldest attack still in the window is the next one to age out, so this is when
    // the counter first drops - "24h after the first attack" as players phrase it.
    resetAt: count ? Math.min(...inWindow.map((entry) => entry.t)) + BASH_WINDOW_MS : null,
    level: bashLevel(count, effectiveLimit),
  };
}

/** @returns {BashLevel} */
export function bashLevel(count, limit) {
  if (count <= 0) return "none";
  if (count >= limit) return "limit";
  if (count >= limit - 1) return "warn";
  return "ok";
}

/**
 * "4h 12m", "12m", "<1m" - relative on purpose, so no timezone offset is involved.
 *
 * @param {number} ms
 */
export function formatBashCountdown(ms) {
  if (!(ms > 0)) return "0m";
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  if (minutes < 1) return "<1m";
  if (!hours) return `${minutes}m`;
  return `${hours}h ${minutes % 60}m`;
}
