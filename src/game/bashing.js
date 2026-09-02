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
 * Compliance note (AGENTS.md 1.1/1.3/4): pure functions over a log the extension already
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
 * Drops timestamps that fell out of the window, and keys that ran empty.
 *
 * @param {Object<string, number[]>} log
 * @param {number} now epoch ms
 * @returns {boolean} whether anything was removed - callers use it to skip a store write
 */
export function pruneBashLog(log, now) {
  let changed = false;
  for (const key of Object.keys(log)) {
    const kept = (log[key] || []).filter((timestamp) => now - timestamp < BASH_WINDOW_MS);
    if (kept.length === (log[key] || []).length) continue;
    changed = true;
    if (kept.length) log[key] = kept;
    else delete log[key];
  }
  return changed;
}

/**
 * Appends one attack. Prunes first so the log cannot grow without bound.
 *
 * @param {Object<string, number[]>} log
 * @param {string} key from `bashKey()`
 * @param {number} now epoch ms
 */
export function recordBashAttack(log, key, now) {
  pruneBashLog(log, now);
  log[key] = [...(log[key] || []), now].sort((a, b) => a - b);
  return log;
}

/** @typedef {"none"|"ok"|"warn"|"limit"} BashLevel */

/**
 * @param {Object<string, number[]>} log
 * @param {string} key
 * @param {number} now epoch ms
 * @param {number} [limit]
 * @returns {{count: number, limit: number, remaining: number, resetAt: number|null, level: BashLevel}}
 */
export function bashStatus(log, key, now, limit = DEFAULT_BASH_LIMIT) {
  const effectiveLimit = Number(limit) > 0 ? Number(limit) : DEFAULT_BASH_LIMIT;
  const inWindow = (log?.[key] || []).filter((timestamp) => now - timestamp < BASH_WINDOW_MS);
  const count = inWindow.length;
  const remaining = Math.max(0, effectiveLimit - count);

  return {
    count,
    limit: effectiveLimit,
    remaining,
    // The oldest attack still in the window is the next one to age out, so this is when
    // the counter first drops - "24h after the first attack" as players phrase it.
    resetAt: count ? Math.min(...inWindow) + BASH_WINDOW_MS : null,
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
