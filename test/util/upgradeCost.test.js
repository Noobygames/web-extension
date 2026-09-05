/**
 * `game/upgradeCost.js` - summing one planned upgrade over a range of levels.
 *
 * The one test that earns its keep here is "matches the technoDetail loop": the
 * detail panel and the upgrade-plan list show the same upgrade, and if the two
 * disagree by one level nothing breaks, nothing logs, and the player just sees two
 * different numbers for the same thing.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const browser = setupBrowser();

const OGBIData = (await import("../../src/store/OGBIData.js")).default;
const { building, research } = await import("../../src/game/gameFormulas.js");
const { upgradeCostRange, categoryOf, isPlanetScoped, isResearchTech } = await import("../../src/game/upgradeCost.js");
const { buildPageOf } = await import("../../src/game/technoIds.js");
const { BUIDLING_INFO } = await import("../../src/game/buildingInfo.js");
const { RESEARCH_INFO } = await import("../../src/game/researchInfo.js");

test.after(() => browser.cleanup());

/** A universe with speed 1 and no bonuses - the same baseline gameFormulas.test.js uses. */
function withState() {
  OGBIData.json = {
    speed: 1,
    researchDivisor: 1,
    technology: { 113: 0, 122: 0, 123: 0, 124: 4 },
    lifeformBonus: {
      classBonus: { explorer: 0, miner: 0, warrior: 0 },
      technologyCostReduction: {},
      technologyTimeReduction: {},
      productionBonus: [0, 0, 0],
      crawlerBonus: {},
    },
    lifeformPlanetBonus: {},
    empire: [],
    options: {},
  };
}

/** One planet in the shape `OGBIData.empire` entries have. */
function planetRow(overrides = {}) {
  return Object.assign({ 1: 20, 14: 5, 15: 0, 31: 10, id: 1, index: 0, position: 8, db_par2: 20 }, overrides);
}

/**
 * The summing loop as `technoDetail.updateResearchDetails()` writes it, verbatim in
 * shape: levels `baselvl` through `tolvl` inclusive, energy assigned rather than added.
 *
 * Energy is left out of the comparison below. technoDetail leaves `resSum[3]`
 * `undefined` for a technology that carries no energy cost, where `upgradeCostRange()`
 * normalises it to 0 - a deliberate difference, since the plan list adds the four
 * numbers up across entries and `undefined` would poison the total.
 */
function technoDetailSum(kind, technoId, baselvl, tolvl, object) {
  const step = (lvl) =>
    kind === "research" ? research(technoId, lvl, false, false, false, object) : building(technoId, lvl, object);

  const resSum = [0, 0, 0];
  for (let i = baselvl; i <= tolvl; i++) {
    const techno = step(i);
    resSum[0] += techno.cost[0];
    resSum[1] += techno.cost[1];
    resSum[2] += techno.cost[2];
  }

  return resSum;
}

// --------------------------------------------------------------------------
// categoryOf / isPlanetScoped / isResearchTech
// --------------------------------------------------------------------------

test("categoryOf sorts each technology onto the build page it lives on", () => {
  assert.equal(categoryOf(1), "supplies", "metal mine");
  assert.equal(categoryOf(24), "supplies", "deuterium storage");
  assert.equal(categoryOf(14), "facilities", "robotics factory");
  assert.equal(categoryOf(41), "facilities", "lunar base shares the facilities page");
  assert.equal(categoryOf(113), "research", "energy technology");
  assert.equal(categoryOf(11101), "lfbuildings", "human residential sector");
  assert.equal(categoryOf(14112), "lfbuildings", "the last kaelesh building");
  assert.equal(categoryOf(11201), "lfresearch", "the first human research");
  assert.equal(categoryOf(14218), "lfresearch", "the last kaelesh research");
});

test("categoryOf returns null for something that is in neither table", () => {
  assert.equal(categoryOf(202), null, "a small cargo has no level");
  assert.equal(categoryOf(99999), null);
  assert.equal(categoryOf(undefined), null);
});

test("only classic research is counted once for the whole account", () => {
  assert.equal(isPlanetScoped(113), false, "energy technology is account-wide");
  assert.equal(isPlanetScoped(1), true, "a mine belongs to its planet");
  // Lifeform research is bought per planet, unlike classic research - the levels sit
  // on the planet object, so reconcile() has to read them from there.
  assert.equal(isPlanetScoped(11201), true);
  assert.equal(isPlanetScoped(11101), true);
});

test("isResearchTech picks the formula, not the page", () => {
  assert.equal(isResearchTech(113), true);
  assert.equal(isResearchTech(11201), true, "lifeform research still costs like research");
  assert.equal(isResearchTech(11101), false, "lifeform buildings cost like buildings");
  assert.equal(isResearchTech(1), false);
});

// --------------------------------------------------------------------------
// upgradeCostRange
// --------------------------------------------------------------------------

test("a range of one level costs exactly what that level costs", () => {
  withState();
  const object = planetRow();

  assert.deepEqual(upgradeCostRange(1, 20, 21, { object }).cost.slice(0, 3), building(1, 21, object).cost.slice(0, 3));
});

test("from equals to costs nothing", () => {
  withState();

  assert.deepEqual(upgradeCostRange(1, 20, 20, { object: planetRow() }), { cost: [0, 0, 0, 0], time: 0, pop: 0 });
});

test("a downgrade costs nothing rather than a negative sum", () => {
  withState();

  // Demolishing is not something a plan entry can express; the loop simply does not
  // run. `technoDetail` has its own separate demolish branch for that.
  assert.deepEqual(upgradeCostRange(1, 30, 25, { object: planetRow() }).cost, [0, 0, 0, 0]);
});

test("an unknown technology sums to zero instead of throwing", () => {
  withState();

  assert.deepEqual(upgradeCostRange(202, 0, 5, {}), { cost: [0, 0, 0, 0], time: 0, pop: 0 });
});

test("matches the technoDetail loop for a building", () => {
  withState();
  const object = planetRow();

  // `from` is the level owned, technoDetail's `baselvl` is the level being built.
  const mine = upgradeCostRange(1, 20, 24, { object });
  assert.deepEqual(mine.cost.slice(0, 3), technoDetailSum("building", 1, 21, 24, object));
});

test("matches the technoDetail loop for a research", () => {
  withState();
  const object = planetRow();

  const energy = upgradeCostRange(113, 8, 12, { object });
  assert.deepEqual(energy.cost.slice(0, 3), technoDetailSum("research", 113, 9, 12, object));
});

test("matches the technoDetail loop for a lifeform building", () => {
  withState();
  const object = planetRow({ 11101: 6 });

  const residential = upgradeCostRange(11101, 6, 10, { object });
  assert.deepEqual(residential.cost.slice(0, 3), technoDetailSum("building", 11101, 7, 10, object));
});

test("matches the technoDetail loop for a lifeform research", () => {
  withState();
  const object = planetRow({ 11201: 3 });

  const lfResearch = upgradeCostRange(11201, 3, 7, { object });
  assert.deepEqual(lfResearch.cost.slice(0, 3), technoDetailSum("research", 11201, 4, 7, object));
});

test("energy is the highest level's draw, not the sum over the range", () => {
  withState();
  const object = planetRow({ 33: 4 });

  // The terraformer draws energy at whatever level it ends up at; adding each level's
  // draw to the previous one would report several times the truth.
  const terraformer = upgradeCostRange(33, 4, 8, { object });
  assert.equal(terraformer.cost[3], building(33, 8, object).cost[3]);
});

test("a technology without an energy cost reports 0, not undefined", () => {
  withState();

  // technoDetail leaves this slot undefined; the plan list sums entries, so a
  // missing energy cost has to be a number.
  assert.equal(upgradeCostRange(1, 20, 24, { object: planetRow() }).cost[3], 0);
});

test("the lifeform cost reduction of the planet reaches the sum", () => {
  withState();
  const object = planetRow();
  const plain = upgradeCostRange(1, 20, 24, { object }).cost[0];

  OGBIData.json.lifeformPlanetBonus = { 1: { buildingCostReduction: { 1: 0.25 } } };
  const reduced = upgradeCostRange(1, 20, 24, { object }).cost[0];

  assert.ok(reduced < plain, "a 25% reduction has to show up in the total");
});

test("costs are computed without bonuses when no planet is passed", () => {
  withState();

  // The plan panel can be opened before the empire data has landed; a missing planet
  // must produce the unreduced cost rather than NaN.
  const cost = upgradeCostRange(1, 0, 5, {}).cost;
  assert.ok(cost[0] > 0);
  assert.ok(Number.isFinite(cost[0]));
});

/**
 * `buildPageOf()` in `game/technoIds.js` answers the same question as `categoryOf()`,
 * from id ranges rather than the cost tables, so the page entry can ask it without
 * paying for 93 KB of tables (`ctxpage/planHighlight`).
 *
 * Two implementations of one classification is exactly the setup where a technology
 * added to the tables silently lands on the wrong build page - the menu would light up
 * next to the wrong entry and nothing would log. So the ranges are checked against the
 * tables here, over every id in both, rather than against a handful of examples.
 */
test("buildPageOf agrees with categoryOf on every technology in the cost tables", () => {
  const disagreements = [];

  for (const id of new Set([...Object.keys(BUIDLING_INFO), ...Object.keys(RESEARCH_INFO)])) {
    const table = categoryOf(id);
    const ranges = buildPageOf(id);

    if (table !== ranges) disagreements.push(`${id}: categoryOf=${table}, buildPageOf=${ranges}`);
  }

  assert.deepEqual(disagreements, []);
});

test("buildPageOf does not pretend to validate", () => {
  // The trade for leaving the tables behind: an id in neither table gets sorted by its
  // range instead of rejected. Harmless where it is used - the ids come out of the plan
  // store, which only accepts what categoryOf() already recognised - but worth pinning
  // so nobody reaches for it as a validity check.
  assert.equal(categoryOf(202), null, "a small cargo has no level");
  assert.equal(buildPageOf(202), null, "202 is in no list either, so this one agrees");
  assert.equal(buildPageOf("nonsense"), null);
});
