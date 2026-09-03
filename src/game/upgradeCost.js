import { BUIDLING_INFO } from "./buildingInfo.js";
import { RESEARCH_INFO } from "./researchInfo.js";
import { FACILITIES_TECHID, SUPPLIES_TECHID } from "./gameConstants.js";
import { LIFEFORM_BUILDING_FLOOR, isAccountWideResearch, isPlanetScoped } from "./technoIds.js";
import { building, research } from "./gameFormulas.js";

/**
 * What one planned upgrade costs across a whole range of levels.
 *
 * `gameFormulas.js` answers for a single level only, so every caller that wanted a
 * range summed it itself - `technoDetail()` in a loop, `roiLfBuilding()` in another.
 * The upgrade plans need the same sum from a module with no DOM around it, so the
 * loop lives here once and both sides read the same number.
 *
 * The level convention is the one the plan store uses: `from` is the level the player
 * already owns, `to` the level they want. So the sum runs over `from + 1 … to`, and
 * `from === to` costs nothing. `technoDetail()` counts differently - its `baselvl` is
 * the level being built, i.e. one higher - which is why it passes `baseLvl - 1` when
 * it records an entry.
 */

/**
 * Which build page a technology belongs to. Doubles as the `component=` value for a
 * deep link, which is why the names are OGame's and not prettier ones.
 *
 * Moon facilities (41, 42, 43) are part of `FACILITIES_TECHID` already and share the
 * `facilities` page with the planet ones - there is deliberately no separate category.
 *
 * @param {number|string} technoId
 * @returns {"supplies"|"facilities"|"research"|"lfbuildings"|"lfresearch"|null}
 */
export function categoryOf(technoId) {
  const id = Number(technoId);

  if (SUPPLIES_TECHID.includes(id)) return "supplies";
  if (FACILITIES_TECHID.includes(id)) return "facilities";

  // Table membership rather than an id-range check: the ranges (1X101-1X112 for
  // buildings, 1X201-1X218 for research) are real, but a new lifeform would add a
  // fifth block and the tables are the only thing that has to be edited for it.
  if (id >= LIFEFORM_BUILDING_FLOOR) {
    if (RESEARCH_INFO[id]) return "lfresearch";
    if (BUIDLING_INFO[id]) return "lfbuildings";
    return null;
  }

  if (isAccountWideResearch(id) && RESEARCH_INFO[id]) return "research";
  if (BUIDLING_INFO[id]) return "facilities";

  return null;
}

// Re-exported so a caller that already has the cost tables loaded does not need a
// second import for the cheap question. The definition lives in `technoIds.js`,
// which the planet bar can afford to load.
export { isPlanetScoped };

/**
 * @param {number|string} technoId
 * @returns {boolean} true when the cost comes from `research()`, false for `building()`
 */
export function isResearchTech(technoId) {
  const category = categoryOf(technoId);

  return category === "research" || category === "lfresearch";
}

/**
 * @param {number|string} technoId
 * @param {number} from level already owned
 * @param {number} to level wanted
 * @param {object} [options]
 * @param {object} [options.object] the planet's empire entry, for the lifeform and
 *   robotics/nanite bonuses. Costs are computed without any bonus when it is missing.
 * @param {boolean} [options.technocrat]
 * @param {boolean} [options.explorer]
 * @param {boolean} [options.acceleration]
 * @returns {{cost: number[], time: number, pop: number}} cost is `[metal, crystal, deuterium, energy]`
 */
export function upgradeCostRange(technoId, from, to, options = {}) {
  const id = Number(technoId);
  const cost = [0, 0, 0, 0];
  let time = 0;
  let pop = 0;

  if (!BUIDLING_INFO[id] && !RESEARCH_INFO[id]) return { cost, time, pop };

  const start = Math.max(0, Math.floor(Number(from) || 0));
  const end = Math.floor(Number(to) || 0);
  const useResearch = isResearchTech(id);
  const object = options.object ?? null;

  for (let lvl = start + 1; lvl <= end; lvl++) {
    const step = useResearch
      ? research(id, lvl, Boolean(options.technocrat), Boolean(options.explorer), Boolean(options.acceleration), object)
      : building(id, lvl, object);

    cost[0] += step.cost[0];
    cost[1] += step.cost[1];
    cost[2] += step.cost[2];

    // Energy and population are not paid per level, they are what the building draws
    // once it stands - so the highest planned level wins rather than the sum. Same
    // rule technoDetail's `resSum[3] = techno.cost[3]` follows.
    cost[3] = step.cost[3] || 0;
    pop = step.pop || 0;

    time += step.time;
  }

  return { cost, time, pop };
}

export default upgradeCostRange;
