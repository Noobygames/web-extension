/**
 * The technology-id facts that answer "what kind of thing is this", with no cost
 * tables behind them.
 *
 * Separate from `game/upgradeCost.js` for one measured reason: importing that module
 * pulls in `buildingInfo.js`, `researchInfo.js` and `gameFormulas.js`, roughly 93 KB
 * of tables and arithmetic. The planet bar runs on every page load and needs to know
 * whether a level is per planet or per account, but not what anything costs - and
 * `test/bundle.test.js` caps the page entry at 512 000 bytes, which that 93 KB blows
 * through. So the cheap questions live here and the expensive ones stay in the chunk.
 */

import { FACILITIES_TECHID, SUPPLIES_TECHID } from "./gameConstants.js";

/**
 * OGame's classic research - the only technologies whose level is bought once for the
 * whole account. Everything else (buildings, lifeform buildings and, despite the name,
 * lifeform research) is per planet.
 *
 * Kept in step with `RESEARCH_INFO` by `test/util/upgradeCost.test.js`, which walks the
 * table and asserts the two agree - a research added to one and not the other would
 * otherwise read its level off the wrong object and silently never look finished.
 * @type {readonly number[]}
 */
export const CLASSIC_RESEARCH_TECHID = Object.freeze([
  106, 108, 109, 110, 111, 113, 114, 115, 117, 118, 120, 121, 122, 123, 124, 199,
]);

/** Lifeform buildings are `1X101`-`1X112`, one block per lifeform. */
export const LIFEFORM_BUILDING_FLOOR = 11101;

/** Lifeform research is `1X201`-`1X218`. */
export const LIFEFORM_RESEARCH_FLOOR = 11201;

/**
 * @param {number|string} technoId
 * @returns {boolean} true for classic research, which is bought once per account
 */
export function isAccountWideResearch(technoId) {
  return CLASSIC_RESEARCH_TECHID.includes(Number(technoId));
}

/**
 * Whether the level of this technology is counted per planet.
 *
 * `reconcile()` needs the distinction to find out whether a planned upgrade has been
 * built: a per-planet level sits on the planet object under its own id, an
 * account-wide one in `OGBIData.json.technology`.
 *
 * @param {number|string} technoId
 * @returns {boolean}
 */
export function isPlanetScoped(technoId) {
  return !isAccountWideResearch(technoId);
}

/**
 * Which build page a technology is bought on, decided from id ranges alone.
 *
 * `categoryOf()` in `game/upgradeCost.js` answers the same question and is the
 * authority: it looks the id up in `BUIDLING_INFO` / `RESEARCH_INFO`, so it also
 * rejects ids that are in neither, and it keeps answering correctly if a future
 * lifeform ever breaks the numbering pattern. It costs 93 KB to import.
 *
 * This one is for the page entry, which cannot pay that and only ever asks about ids
 * that came out of the plan store - i.e. ids `categoryOf()` already accepted once, on
 * the chunk side, when the plan was written. `test/util/upgradeCost.test.js` walks both
 * cost tables and asserts the two agree on every id in them, so a divergence fails
 * there rather than showing up as a highlight on the wrong menu entry.
 *
 * Unlike `categoryOf()` this does **not** validate: an id in neither table gets sorted
 * by its range rather than rejected. That is the trade for leaving the tables behind.
 *
 * @param {number|string} technoId
 * @returns {"supplies"|"facilities"|"research"|"lfbuildings"|"lfresearch"|null}
 */
export function buildPageOf(technoId) {
  const id = Number(technoId);

  if (!Number.isFinite(id)) return null;

  if (SUPPLIES_TECHID.includes(id)) return "supplies";
  if (FACILITIES_TECHID.includes(id)) return "facilities";

  // Lifeform ids are `1X101`-`1X112` for buildings and `1X201`-`1X218` for research,
  // one block per lifeform - so the lifeform digit has to be divided out before the
  // two can be told apart. `id >= LIFEFORM_RESEARCH_FLOOR` is the tempting one-liner
  // and it is wrong: 12101, a Rock'tal building, clears 11201 comfortably.
  if (id >= LIFEFORM_BUILDING_FLOOR) return id % 1000 >= LIFEFORM_RESEARCH_FLOOR % 1000 ? "lfresearch" : "lfbuildings";

  if (isAccountWideResearch(id)) return "research";

  return null;
}
