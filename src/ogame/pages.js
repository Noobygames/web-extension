/**
 * The `component=` values OGBI branches on, as one list per group.
 *
 * These used to be spelled out wherever they were needed - seven page names in
 * `technoDetail()`, the same seven nowhere else, `"fleetdispatch"` in eight
 * modules. That was survivable while every branch sat in one file. Phase 5 of
 * refactoring.md loads those files on demand, so the check that decides whether to
 * fetch a chunk now lives in `ogCore.js` while the check inside the chunk stays
 * where it is: two copies of the same list, in two files, one of which is only
 * evaluated when the other already said yes.
 *
 * One frozen list, imported by both. `test/util/gamePages.test.js` pins the
 * contents, because a page dropped from here is not an error anywhere - it is a
 * feature that silently stops appearing on one page.
 */

/**
 * The building and research pages, where `technoDetail()` rewrites the detail panel.
 * @type {readonly string[]}
 */
export const BUILD_PAGES = Object.freeze([
  "research",
  "supplies",
  "facilities",
  "shipyard",
  "defenses",
  "lfbuildings",
  "lfresearch",
]);

/**
 * @param {string} page the `component=` value of the current page
 * @returns {boolean}
 */
export function isBuildPage(page) {
  return BUILD_PAGES.includes(page);
}

/**
 * The two build pages whose detail panel shows a research, not a building.
 *
 * `technoDetail()` asks this twenty times over, because a research level costs the
 * same everywhere while a building's cost depends on the planet it stands on.
 * @type {readonly string[]}
 */
export const RESEARCH_PAGES = Object.freeze(["research", "lfresearch"]);

/**
 * The build pages whose entries have levels, so cost and duration can be summed
 * over a range. `shipyard` and `defenses` are build pages too, but a ship has no
 * level - `building()` has nothing to compute there, which is why those two are
 * absent from every branch that uses this list.
 * @type {readonly string[]}
 */
export const LEVELED_BUILDING_PAGES = Object.freeze(["supplies", "facilities", "lfbuildings"]);

/**
 * @param {string} page the `component=` value of the current page
 * @returns {boolean}
 */
export function isResearchPage(page) {
  return RESEARCH_PAGES.includes(page);
}

/**
 * @param {string} page the `component=` value of the current page
 * @returns {boolean}
 */
export function isLeveledBuildingPage(page) {
  return LEVELED_BUILDING_PAGES.includes(page);
}

export default {
  BUILD_PAGES,
  RESEARCH_PAGES,
  LEVELED_BUILDING_PAGES,
  isBuildPage,
  isResearchPage,
  isLeveledBuildingPage,
};
