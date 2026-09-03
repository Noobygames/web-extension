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
