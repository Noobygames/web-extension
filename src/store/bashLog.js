import OGBIData from "./OGBIData.js";
import {
  DEFAULT_BASH_LIMIT,
  bashKeyFromTarget,
  bashStatus,
  countsForBashing,
  pruneBashLog,
  recordBashAttack,
} from "../game/bashing.js";

/**
 * Store side of the bashing counter: `{ "1:2:3": [epochMs, ...], "1:2:3:M": [...] }`
 * under `ogk-data.bashLog`.
 *
 * Fed by the fleet-dispatch hook, which already runs once per fleet the player sends -
 * no extra request, no polling (AGENTS.md 1.3 / 4). Only attacks the player sends from
 * this browser are counted; attacks sent elsewhere are invisible to the extension, so
 * the number is a lower bound and the UI says so.
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
 * Records one attack, unless the mission is exempt (spy, missile, transport, ...).
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
 * @param {string} coords "g:s:p"
 * @param {number|string} planetType
 * @param {number} [now] epoch ms
 * @returns {ReturnType<typeof bashStatus>}
 */
export function getBashStatus(coords, planetType, now = Date.now()) {
  return bashStatus(OGBIData.bashLog || {}, bashKeyFromTarget(coords, planetType), now, getBashLimit());
}

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
