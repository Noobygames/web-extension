import OGBIData from "./OGBIData.js";
import {
  DEFAULT_BASH_LIMIT,
  bashKey,
  bashKeyFromTarget,
  bashStatus,
  confirmBashAttack,
  countsForBashing,
  pruneBashLog,
  recordBashAttack,
} from "../game/bashing.js";

/**
 * Store side of the bashing counter: `{ "1:2:3": [{t, ref?}, ...], "1:2:3:M": [...] }`
 * under `ogk-data.bashLog`, i.e. `localStorage` - it survives closing the browser, so
 * the count is still there the next day, which is exactly the span the rule covers.
 *
 * Two feeds, because the account is not only played here:
 *
 * - `recordAttack()` from the fleet-dispatch hook, at launch. Covers fleets still in
 *   flight, which no report exists for yet.
 * - `confirmAttackFromReport()` from the battle-report analyzer, whenever the player
 *   opens the messages tab. This one does not care which device sent the fleet, so an
 *   attack launched from a phone shows up here as soon as its report is read.
 *
 * Neither adds a request: both run off work the extension was already doing
 * (AGENTS.md 1.3 / 4).
 */

/** The universe's own limit from serverData.xml (`bashlimit`), or the rule default. */
export function getBashLimit() {
  return Number(OGBIData.json.bashLimit) > 0 ? Number(OGBIData.json.bashLimit) : DEFAULT_BASH_LIMIT;
}

/** Universes can switch the bashing system off entirely (`bashingSystemEnabled`). */
export function isBashingSystemEnabled() {
  return OGBIData.json.bashingSystemEnabled !== false;
}

/**
 * Records one attack the player just launched, unless the mission is exempt (spy,
 * missile, transport, ...).
 *
 * @param {string} coords "g:s:p"
 * @param {number|string} planetType OGame target type (1 planet, 2 debris, 3 moon)
 * @param {number|string} mission OGame mission id
 * @param {number} [now] epoch ms
 */
export function recordAttack(coords, planetType, mission, now = Date.now()) {
  if (!countsForBashing(mission)) return;

  const log = OGBIData.bashLog || {};
  recordBashAttack(log, bashKeyFromTarget(coords, planetType), now);
  OGBIData.bashLog = log;
}

/**
 * Records an attack read off a battle report the player opened.
 *
 * Idempotent per `ref`, so scrolling through the messages tab repeatedly cannot inflate
 * the count, and it reconciles with a launch record when this browser sent the fleet.
 * Reports older than the window are ignored by `confirmBashAttack()`.
 *
 * @param {string} coords "g:s:p" of the defender - the position that was attacked
 * @param {number|string} planetType OGame target type of the defender
 * @param {number} timestamp epoch ms of the battle
 * @param {string} ref the report's hashcode (or message id), stable across re-parses
 * @param {number} [now] epoch ms
 */
export function confirmAttackFromReport(coords, planetType, timestamp, ref, now = Date.now()) {
  const log = OGBIData.bashLog || {};
  if (!confirmBashAttack(log, bashKeyFromTarget(coords, planetType), timestamp, ref, now)) return;

  OGBIData.bashLog = log;
}

/**
 * @param {string} coords "g:s:p"
 * @param {number|string} planetType
 * @param {number} [now] epoch ms
 * @returns {ReturnType<typeof bashStatus>}
 */
export function getBashStatus(coords, planetType, now = Date.now()) {
  return bashStatus(OGBIData.bashLog || {}, bashKeyFromTarget(coords, planetType), now, getBashLimit());
}

/** Same, for a key already built by `bashKey()`. */
export function getBashStatusByKey(key, now = Date.now()) {
  return bashStatus(OGBIData.bashLog || {}, key, now, getBashLimit());
}

export { bashKey };

/**
 * Drops entries older than the window. Called once per galaxy render rather than on a
 * timer, and writes only when something actually aged out.
 *
 * @param {number} [now] epoch ms
 */
export function pruneAttacks(now = Date.now()) {
  const log = OGBIData.bashLog || {};
  if (pruneBashLog(log, now)) OGBIData.bashLog = log;
}
