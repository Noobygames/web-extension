/**
 * `game/gameFormulas.js` - the game's arithmetic.
 *
 * These began life in `test/ogCore.calculations.test.js`, pinned against
 * `OGBeyondInfinity.prototype`. Phase 3 of refactoring.md moved the functions into this
 * module; the tests moved with them and **every expected value is unchanged**. That
 * is what verifies the move: the numbers were recorded before it and still hold
 * after it.
 *
 * They remain characterisation tests - they say what the code does, not what it
 * should. Both defects they originally recorded (`getBestRoi`'s averaging and
 * `roiMine`'s cost sum) are fixed now; no `KNOWN BUG:` remains in this file.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const browser = setupBrowser();

const OGBIData = (await import("../../src/store/OGBIData.js")).default;
const {
  consumption,
  minesProduction,
  research,
  building,
  roiPlasmatechnology,
  roiLfResearch,
  roiLfBuilding,
  roiAstrophysics,
  roiMine,
  getBestRoi,
} = await import("../../src/game/gameFormulas.js");

test.after(() => browser.cleanup());

/** A universe with speed 1 and no bonuses of any kind - the arithmetic baseline. */
function baseJson() {
  return {
    speed: 1,
    researchDivisor: 1,
    technology: { 113: 0, 122: 0, 123: 0, 124: 4 },
    lifeformBonus: {
      classBonus: { explorer: 0, miner: 0, warrior: 0 },
      technologyCostReduction: {},
      technologyTimeReduction: {},
      productionBonus: [0, 0, 0],
      lifeformLevel: { 1: 10 },
      crawlerBonus: {},
    },
    lifeformPlanetBonus: {},
    lifeFormProductionBoostFromResearch: { 11201: [10, 5, 0] },
    lifeFormProductionBoostFromBuildings: { 11101: [10, 5, 0] },
    selectedLifeforms: { 1: 1 },
    options: { tradeRate: [2.5, 1.5, 1], fret: 203, limitCrawler: false, crawlerPercent: 1 },
    ships: {
      202: { cargoCapacity: 5000 },
      203: { cargoCapacity: 25000 },
      210: { cargoCapacity: 0 },
      219: { cargoCapacity: 250000 },
    },
    resourceBuggyProductionBoost: 0.0002,
    resourceBuggyMaxProductionBoost: 0.5,
    minerBonusResourceProduction: 0.25,
    // Only the collector branch of roiMine() reads this; without it that branch
    // silently produces NaN rather than a number.
    minerBonusAdditionalCrawler: 0.5,
    geologistActive: false,
    empire: [],
    productionProgress: {},
    researchProgress: {},
    averageMines: null,
    totalProd: null,
  };
}

/**
 * The formulas read their state from `OGBIData`, so the store is what a test varies.
 * Assigning `OGBIData.json` is a full reset and keeps the coverage report honest -
 * see the note on `importFresh()` in docs/testing.md.
 */
function withState(overrides = {}) {
  OGBIData.json = Object.assign(baseJson(), overrides);
}

/** No class, no officers - what every test uses unless it says otherwise. */
const NOBODY = { playerClass: 0, geologist: false, allOfficers: false };

/** One fully specified planet, in the shape `OGBIData.empire` entries have. */
function planetRow(overrides = {}) {
  return Object.assign(
    {
      1: 20,
      2: 18,
      3: 15,
      14: 5,
      15: 0,
      217: 0,
      id: 1,
      position: 8,
      db_par2: 20,
      coordinates: "[1:2:3]",
      production: { hourly: [10000, 5000, 2000] },
    },
    overrides
  );
}

/** `OGBIData.empire` and `OGBIData.json.empire` are one and the same array. */
function withEmpire(planets) {
  withState({ empire: planets });
}

// --------------------------------------------------------------------------
// consumption
// --------------------------------------------------------------------------

test("consumption follows base * level * factor^level", () => {
  withState();
  assert.equal(consumption(1, 10), 259);
});

test("consumption is zero for buildings that have no energy cost", () => {
  // The solar plant (4) produces energy rather than consuming it, so it carries no
  // baseCons and the guard returns a plain 0 rather than NaN.
  withState();
  assert.equal(consumption(4, 10), 0);
});

test("consumption of a level-0 building is zero", () => {
  withState();
  assert.equal(consumption(1, 0), 0);
});

// --------------------------------------------------------------------------
// minesProduction
// --------------------------------------------------------------------------

test("minesProduction applies the metal position bonus only on positions 6 to 10", () => {
  withState();
  assert.equal(minesProduction(1, 20, 5, 0), 4036, "no bonus outside the band");
  assert.equal(minesProduction(1, 20, 8, 0), 5449, "position 8 is the 1.35 slot");
});

test("minesProduction applies the crystal position bonus only on positions 1 to 3", () => {
  withState();
  assert.equal(minesProduction(2, 20, 1, 0), 3767);
  assert.equal(minesProduction(2, 20, 5, 0), 2690, "no bonus on position 5");
});

test("minesProduction makes deuterium colder-is-better", () => {
  withState();
  const cold = minesProduction(3, 20, 5, -10);
  const hot = minesProduction(3, 20, 5, 30);
  assert.equal(cold, 1991);
  assert.equal(hot, 1776);
  assert.ok(cold > hot);
});

test("minesProduction scales the mines with the universe speed, but not the solar plant", () => {
  withState({ speed: 8 });
  assert.equal(minesProduction(1, 20, 5, 0), 32291, "8x speed on a mine");
  assert.equal(minesProduction(4, 20, 5, 0), 2690, "the solar plant is unscaled");
});

test("minesProduction reads energy technology for the fusion reactor", () => {
  withState();
  assert.equal(minesProduction(12, 10, 5, 0), 488);
  withState({ technology: { 113: 10 } });
  assert.equal(minesProduction(12, 10, 5, 0), 1213);
});

// --------------------------------------------------------------------------
// research
// --------------------------------------------------------------------------

test("research returns cost and time for a plain technology", () => {
  withState();
  assert.deepEqual(research(113, 5, false, false, false), { time: 23040, cost: [0, 12800, 6400] });
});

test("research shortens the time by a quarter for technocrat, explorer and acceleration alike", () => {
  withState();
  const plain = research(113, 5, false, false, false).time;
  for (const flags of [
    [true, false, false],
    [false, true, false],
    [false, false, true],
  ]) {
    assert.equal(research(113, 5, ...flags).time, 17280, `flags ${flags}`);
  }
  assert.equal(plain * 0.75, 17280);
});

test("research rounds astrophysics time to a whole hundred", () => {
  withState();
  const result = research(124, 5, false, false, false);
  assert.equal(result.time, 202600);
  assert.equal(result.time % 100, 0);
  assert.deepEqual(result.cost, [37515, 75031, 37515]);
});

test("research discounts cost through the lifeform cost reduction, but only when given an object", () => {
  const bonuses = baseJson().lifeformBonus;
  withState({ lifeformBonus: { ...bonuses, technologyCostReduction: { 113: 0.5 } }, empire: [] });

  assert.deepEqual(research(113, 5, false, false, false).cost, [0, 12800, 6400], "no object, no discount");
  assert.deepEqual(
    research(113, 5, false, false, false, { type: 3, id: 1, index: 0, 31: 0 }).cost,
    [0, 6400, 3200],
    "half price with the object"
  );
});

// --------------------------------------------------------------------------
// building
// --------------------------------------------------------------------------

test("building returns cost and time for a plain mine", () => {
  withState();
  assert.deepEqual(building(1, 10), { time: 4150, cost: [2306, 576, 0] });
});

test("building divides the time by robotics and nanites, but leaves the cost alone", () => {
  withState();
  const withFacilities = building(1, 10, { 14: 5, 15: 2, id: 1 });
  assert.deepEqual(withFacilities.cost, [2306, 576, 0], "facilities never change price");
  assert.equal(withFacilities.time, 172);
});

test("building reports a deuterium cost, not an energy one, for the fusion reactor", () => {
  withState();
  const result = building(12, 10);
  assert.equal(result.cost.length, 3);
  assert.deepEqual(result.cost, [178523, 71409, 35704]);
});

// --------------------------------------------------------------------------
// The ROI family
// --------------------------------------------------------------------------

test("roiPlasmatechnology prices one plasma level against the whole empire's mine output", () => {
  withEmpire([planetRow()]);
  assert.equal(Math.round(roiPlasmatechnology(1)), 486113);
});

test("roiPlasmatechnology gets cheaper per level the more planets produce", () => {
  withEmpire([planetRow()]);
  const one = roiPlasmatechnology(1);
  withEmpire([planetRow(), planetRow({ id: 2 })]);
  const two = roiPlasmatechnology(1);

  assert.ok(two < one, "same research cost spread over twice the production");
  assert.ok(Math.abs(two * 2 - one) < 1e-6, "and exactly half, since the planets are identical");
});

test("roiLfResearch prices a lifeform research against the whole empire", () => {
  const planet = planetRow();
  withEmpire([planet]);
  assert.equal(Math.round(roiLfResearch(11201, 1, 2, planet)), 93911);
});

test("roiLfResearch returns undefined for a technology with no production boost", () => {
  const planet = planetRow();
  withEmpire([planet]);
  assert.equal(roiLfResearch(99999, 1, 2, planet), undefined);
});

test("roiLfBuilding prices a lifeform building against the planet it stands on", () => {
  const planet = planetRow();
  withEmpire([planet]);
  assert.equal(Math.round(roiLfBuilding(11101, 1, 2, planet) * 1e6), 83467997);
});

test("roiLfBuilding returns undefined for a building with no production boost", () => {
  const planet = planetRow();
  withEmpire([planet]);
  assert.equal(roiLfBuilding(99999, 1, 2, planet), undefined);
});

test("roiAstrophysics fills in the empire averages when they are missing", () => {
  withEmpire([planetRow()]);
  assert.equal(OGBIData.json.averageMines, null);

  const result = roiAstrophysics(5, 6, NOBODY);

  assert.deepEqual(OGBIData.json.averageMines, [20, 18, 15], "computed on the way through");
  assert.deepEqual(OGBIData.json.totalProd, [10000, 5000, 2000]);
  assert.equal(Math.round(result), 1049909);
});

test("getBestRoi enumerates one candidate per mine level and per research step", () => {
  withEmpire([planetRow()]);
  const roi = getBestRoi(NOBODY);

  assert.equal(roi.length, 25);
  assert.deepEqual(
    [...new Set(roi.map((entry) => entry.technoId))].sort((a, b) => a - b),
    [1, 2, 3, 122, 124],
    "the three mines, plasma technology and astrophysics"
  );
  assert.ok(
    roi.every((entry) => typeof entry.time === "number"),
    "every candidate carries a payback time"
  );
});

test("getBestRoi averages the mine levels over the planets it summed", () => {
  // This used to be a KNOWN BUG: the sum ran over `OGBIData.empire` while the divisor
  // came from `this.json.empire.length`, two reads that only happened to agree. The
  // move to this module collapsed both onto `OGBIData.json.empire`, so they can no
  // longer drift - and with them went the degenerate case where an empty list made
  // `averageMines` Infinity and `roiAstrophysics()` looped to it.
  withEmpire([planetRow(), planetRow({ id: 2, 1: 40, 2: 36, 3: 30 })]);

  getBestRoi(NOBODY);

  assert.deepEqual(OGBIData.json.averageMines, [30, 27, 22.5]);
});

test("roiMine sums the cost of every level spanned, not the target level repeated", () => {
  // Fixed in refactoring-new.md Phase A.2: the loop counted from the current level to
  // `tolvl` but called `building(technoId, tolvl, object)` inside it - `lvl` was never
  // used. Upgrading 20 -> 25 was priced as five times the cost of level 25 instead of
  // the sum of levels 21..25, which always over-stated the cost and got worse the more
  // levels a suggestion spanned. roiLfBuilding, two functions up, was already correct
  // and is the fix's template.
  const planet = planetRow();
  withEmpire([planet]);

  const oneLevel = roiMine(1, 21, planet, NOBODY);
  const fiveLevels = roiMine(1, 25, planet, NOBODY);

  // A single-level upgrade is unaffected by the fix: summing one level is that level,
  // same as charging the target level once. Five levels used to come out as 4209440 -
  // exactly 5x this result. It no longer does.
  assert.equal(Math.round(oneLevel), 1091176);
  assert.equal(Math.round(fiveLevels), 2193065);
});

// --------------------------------------------------------------------------
// The player argument
// --------------------------------------------------------------------------

test("a collector pays off a mine faster than a player with no class", () => {
  // `player` replaced `this.playerClass` when the formulas left OGBeyondInfinity. This is
  // what says the argument is actually wired through rather than ignored.
  const planet = planetRow();
  withEmpire([planet]);

  const plain = roiMine(1, 21, planet, NOBODY);
  const collector = roiMine(1, 21, planet, { playerClass: 1, geologist: false, allOfficers: false });

  assert.ok(collector < plain, "the collector's crawler bonus shortens the payback");
});

test("a geologist and the officer bundle each shorten the payback on their own", () => {
  const planet = planetRow();
  withEmpire([planet]);

  const plain = roiMine(1, 21, planet, NOBODY);
  const geologist = roiMine(1, 21, planet, { playerClass: 0, geologist: true, allOfficers: false });
  const officers = roiMine(1, 21, planet, { playerClass: 0, geologist: false, allOfficers: true });

  assert.ok(geologist < plain, "more crawlers and more resources");
  assert.ok(officers < plain);
  assert.ok(officers > geologist, "the geologist alone is worth more here than the bundle without them");
});
