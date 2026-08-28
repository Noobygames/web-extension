/**
 * Characterisation tests for the calculation core of `OGInfinity`.
 *
 * These pin **what the code does today**, not what it should do. Phase 3 of
 * refactoring.md moves this arithmetic into modules of its own; without a record of
 * the current output, that move is unverifiable - the numbers are plausible-looking
 * either way and nothing on screen says which is right.
 *
 * The expected values were produced by running the current implementation. Where one
 * of them is wrong, the test says so with a `KNOWN BUG:` prefix and keeps asserting
 * the wrong value, per the convention in docs/testing.md.
 *
 * The methods are reached through `OGInfinity.prototype` with a hand-made `this`
 * rather than through a constructed instance: they read only `this.json`,
 * `this.playerClass` and the module-level game tables, so a full instance would add
 * setup without adding coverage. `new OGInfinity()` itself is exercised once, at the
 * bottom of this file.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "./helpers/globals.js";
import { overviewPage } from "./fixtures/ogamePage.js";

// An excluded page: ogkush.js runs a boot IIFE at module scope, and "intro" is one of
// the three components it bails out on before it touches the DOM or the network.
const INTRO_URL = "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame&component=intro";

const browser = setupBrowser({ url: INTRO_URL });
document.documentElement.dataset.ogiCallbackEventToken = "0123456789ab";
const { OGInfinity } = await import("../src/ogkush.js");
const OGIData = (await import("../src/util/OGIData.js")).default;

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
    geologistActive: false,
    empire: [],
    productionProgress: {},
    researchProgress: {},
    averageMines: null,
    totalProd: null,
  };
}

/** A bare object carrying the prototype - no constructor, no DOM. */
function ogi(overrides = {}) {
  const { json: jsonOverrides, ...rest } = overrides;
  return Object.assign(Object.create(OGInfinity.prototype), {
    json: Object.assign(baseJson(), jsonOverrides),
    playerClass: 0,
    saveData() {},
    ...rest,
  });
}

/** One fully specified planet, in the shape `OGIData.empire` entries have. */
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

// --------------------------------------------------------------------------
// consumption
// --------------------------------------------------------------------------

test("consumption follows base * level * factor^level", () => {
  assert.equal(ogi().consumption(1, 10), 259);
});

test("consumption is zero for buildings that have no energy cost", () => {
  // The solar plant (4) produces energy rather than consuming it, so it carries no
  // baseCons and the guard returns a plain 0 rather than NaN.
  assert.equal(ogi().consumption(4, 10), 0);
});

test("consumption of a level-0 building is zero", () => {
  assert.equal(ogi().consumption(1, 0), 0);
});

// --------------------------------------------------------------------------
// minesProduction
// --------------------------------------------------------------------------

test("minesProduction applies the metal position bonus only on positions 6 to 10", () => {
  const o = ogi();
  assert.equal(o.minesProduction(1, 20, 5, 0), 4036, "no bonus outside the band");
  assert.equal(o.minesProduction(1, 20, 8, 0), 5449, "position 8 is the 1.35 slot");
});

test("minesProduction applies the crystal position bonus only on positions 1 to 3", () => {
  const o = ogi();
  assert.equal(o.minesProduction(2, 20, 1, 0), 3767);
  assert.equal(o.minesProduction(2, 20, 5, 0), 2690, "no bonus on position 5");
});

test("minesProduction makes deuterium colder-is-better", () => {
  const o = ogi();
  const cold = o.minesProduction(3, 20, 5, -10);
  const hot = o.minesProduction(3, 20, 5, 30);
  assert.equal(cold, 1991);
  assert.equal(hot, 1776);
  assert.ok(cold > hot);
});

test("minesProduction scales metal, crystal and deuterium with the universe speed, but not the solar plant", () => {
  const fast = ogi({ json: { speed: 8 } });
  assert.equal(fast.minesProduction(1, 20, 5, 0), 32291, "8x speed on a mine");
  assert.equal(fast.minesProduction(4, 20, 5, 0), 2690, "the solar plant is unscaled");
});

test("minesProduction reads energy technology for the fusion reactor", () => {
  assert.equal(ogi().minesProduction(12, 10, 5, 0), 488);
  assert.equal(ogi({ json: { technology: { 113: 10 } } }).minesProduction(12, 10, 5, 0), 1213);
});

// --------------------------------------------------------------------------
// research
// --------------------------------------------------------------------------

test("research returns cost and time for a plain technology", () => {
  assert.deepEqual(ogi().research(113, 5, false, false, false), { time: 23040, cost: [0, 12800, 6400] });
});

test("research shortens the time by a quarter for technocrat, explorer and acceleration alike", () => {
  const o = ogi();
  const plain = o.research(113, 5, false, false, false).time;
  for (const flags of [
    [true, false, false],
    [false, true, false],
    [false, false, true],
  ]) {
    assert.equal(o.research(113, 5, ...flags).time, 17280, `flags ${flags}`);
  }
  assert.equal(plain * 0.75, 17280);
});

test("research rounds astrophysics time to a whole hundred", () => {
  const result = ogi().research(124, 5, false, false, false);
  assert.equal(result.time, 202600);
  assert.equal(result.time % 100, 0);
  assert.deepEqual(result.cost, [37515, 75031, 37515]);
});

test("research discounts cost through the lifeform cost reduction, but only when given an object", () => {
  // Passing an `object` sends research() down the laboratory branch, and that branch
  // reads OGIData.empire directly rather than `this.json.empire` - so the singleton
  // has to be primed even though nothing about this test is about the empire.
  OGIData.json = { ...OGIData.json, empire: [] };
  const withBonus = ogi({
    json: { lifeformBonus: { ...baseJson().lifeformBonus, technologyCostReduction: { 113: 0.5 } } },
  });

  assert.deepEqual(withBonus.research(113, 5, false, false, false).cost, [0, 12800, 6400], "no object, no discount");
  assert.deepEqual(
    withBonus.research(113, 5, false, false, false, { type: 3, id: 1, index: 0, 31: 0 }).cost,
    [0, 6400, 3200],
    "half price with the object"
  );
});

// --------------------------------------------------------------------------
// building
// --------------------------------------------------------------------------

test("building returns cost and time for a plain mine", () => {
  assert.deepEqual(ogi().building(1, 10), { time: 4150, cost: [2306, 576, 0] });
});

test("building divides the time by robotics and nanites, but leaves the cost alone", () => {
  const withFacilities = ogi().building(1, 10, { 14: 5, 15: 2, id: 1 });
  assert.deepEqual(withFacilities.cost, [2306, 576, 0], "facilities never change price");
  assert.equal(withFacilities.time, 172);
});

test("building reports an energy cost for the fusion reactor", () => {
  const result = ogi().building(12, 10);
  assert.equal(result.cost.length, 3, "the fusion reactor consumes deuterium, not energy");
  assert.deepEqual(result.cost, [178523, 71409, 35704]);
});

// --------------------------------------------------------------------------
// The ROI family
// --------------------------------------------------------------------------

/**
 * The ROI methods read the empire from BOTH `OGIData.empire` and `this.json.empire`.
 * Every test here keeps the two in step, which is what production does - see the
 * KNOWN BUG at the end of this section for what happens when they drift.
 */
function withEmpire(planets, overrides = {}) {
  OGIData.json = { ...OGIData.json, empire: planets };
  return ogi({ json: { empire: planets, ...(overrides.json || {}) }, ...overrides });
}

test("roiPlasmatechnology prices one plasma level against the whole empire's mine output", () => {
  const o = withEmpire([planetRow()]);
  assert.equal(Math.round(o.roiPlasmatechnology(1)), 486113);
});

test("roiPlasmatechnology gets cheaper per level the more planets produce", () => {
  const one = withEmpire([planetRow()]).roiPlasmatechnology(1);
  const two = withEmpire([planetRow(), planetRow({ id: 2 })]).roiPlasmatechnology(1);
  assert.ok(two < one, "same research cost spread over twice the production");
  assert.ok(Math.abs(two * 2 - one) < 1e-6, "and exactly half, since the planets are identical");
});

test("roiLfBuilding prices a lifeform building against the planet it stands on", () => {
  const planet = planetRow();
  const o = withEmpire([planet]);
  assert.equal(Math.round(o.roiLfBuilding(11101, 1, 2, planet) * 1e6), 83467997);
});

test("roiLfBuilding returns undefined for a building with no production boost", () => {
  const planet = planetRow();
  assert.equal(withEmpire([planet]).roiLfBuilding(99999, 1, 2, planet), undefined);
});

test("roiLfResearch prices a lifeform research against the whole empire", () => {
  const planet = planetRow();
  const o = withEmpire([planet]);

  assert.equal(Math.round(o.roiLfResearch(11201, 1, 2, planet)), 93911);
});

test("roiLfResearch returns undefined for a technology with no production boost", () => {
  const planet = planetRow();
  assert.equal(withEmpire([planet]).roiLfResearch(99999, 1, 2, planet), undefined);
});

test("roiAstrophysics fills in the empire averages when they are missing", () => {
  const o = withEmpire([planetRow()]);
  assert.equal(o.json.averageMines, null);

  const result = o.roiAstrophysics(5, 6);

  assert.deepEqual(o.json.averageMines, [20, 18, 15], "computed on the way through");
  assert.deepEqual(o.json.totalProd, [10000, 5000, 2000]);
  assert.equal(Math.round(result), 1049909);
});

test("getBestRoi enumerates one candidate per mine level and per astrophysics step", () => {
  const o = withEmpire([planetRow()]);
  const roi = o.getBestRoi();

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

test("KNOWN BUG: roiMine charges the target level once per level instead of summing the levels", () => {
  // The loop counts from the current level to `tolvl` but calls
  // `this.building(technoId, tolvl, object)` inside it - `lvl` is never used. So
  // upgrading 20 -> 25 is priced as five times the cost of level 25, rather than the
  // sum of levels 21..25. It always over-states the cost, and the more levels are
  // spanned the worse it gets. roiLfBuilding, two methods up, does it correctly.
  const planet = planetRow();
  const o = withEmpire([planet]);

  const oneLevel = o.roiMine(1, 21, planet);
  const fiveLevels = o.roiMine(1, 25, planet);

  assert.equal(Math.round(oneLevel), 1091176);
  assert.equal(Math.round(fiveLevels), 4209440);

  // The tell: the five-level result is exactly 5 x cost(level 25) over the same
  // production difference, which no correct summation could produce.
  const costOf25 = o.building(1, 25, planet).cost;
  const rate = o.json.options.tradeRate;
  const mse = (cost) => cost.map((x, n) => (x * rate[0]) / rate[n]).reduce((sum, cur) => sum + cur, 0);
  const prodDiffMSE = (5 * mse(costOf25) * 3600) / fiveLevels;
  const impliedSingle = (mse(costOf25) * 3600) / prodDiffMSE;
  assert.ok(Math.abs(impliedSingle * 5 - fiveLevels) < 1e-6);
});

test("KNOWN BUG: getBestRoi averages over two different empire lists", () => {
  // It sums the mine levels over `OGIData.empire` but divides by
  // `this.json.empire.length`. In production those are the same array, so this is
  // latent - but any refactor that lets them drift silently doubles or halves every
  // average, and the degenerate case (an empty `json.empire`) divides by zero,
  // making `averageMines` Infinity. `roiAstrophysics()` then counts `for (lvl = 1;
  // lvl <= Infinity; lvl++)` and hangs the page - which is why this test drifts the
  // two lists by a factor of two rather than emptying one of them.
  OGIData.json = { ...OGIData.json, empire: [planetRow(), planetRow({ id: 2 })] };
  const o = ogi({ json: { empire: [planetRow()] } });

  o.getBestRoi();

  assert.deepEqual(o.json.averageMines, [40, 36, 30], "two planets' levels over one planet's count");
});

// --------------------------------------------------------------------------
// calcNeededShips / selectBestCargoShip
// --------------------------------------------------------------------------

/** The three resource counters `calcNeededShips()` reads off the page. */
function resourceBar({ metal = "1.000.000", crystal = "500.000", deuterium = "0" } = {}) {
  document.body.innerHTML = `
    <span id="resources_metal">${metal}</span>
    <span id="resources_crystal">${crystal}</span>
    <span id="resources_deuterium">${deuterium}</span>
  `;
}

test("calcNeededShips rounds up to whole ships of the configured type", () => {
  resourceBar();
  // 1.500.000 resources over a large cargo's 25.000 capacity.
  assert.equal(ogi().calcNeededShips(), 60);
  assert.equal(ogi().calcNeededShips({ fret: 202 }), 300, "small cargoes carry a fifth as much");
});

test("calcNeededShips prefers an explicit resource amount over the page", () => {
  resourceBar();
  assert.equal(ogi().calcNeededShips({ resources: 25_001 }), 2);
  assert.equal(ogi().calcNeededShips({ resources: 0 }), 0, "an explicit zero is honoured, not treated as absent");
});

test("calcNeededShips adds 7 percent when more freight is asked for", () => {
  resourceBar();
  assert.equal(ogi().calcNeededShips({ resources: 25_000, moreFret: true }), 2);
  assert.equal(ogi().calcNeededShips({ resources: 25_000 }), 1);
});

/**
 * The fleet-dispatch page state `selectBestCargoShip()` reads.
 *
 * `fleetDispatcher` is an OGame page global, not something the extension owns, so
 * the test installs one. Only the members the method touches are present - anything
 * else would be inventing a contract.
 */
function fleetDispatchPage({ metal = 0, crystal = 0, deuterium = 0, shipsOnPlanet = [], filled = {} } = {}) {
  // The resource counters are here because calcNeededShips() reads them even when it
  // is handed an explicit amount - selectBestCargoShip() always passes one, and it
  // still crashes without these three elements.
  document.body.innerHTML = `
    <span id="resources_metal">0</span>
    <span id="resources_crystal">0</span>
    <span id="resources_deuterium">0</span>
    <span class="resourceIcon metal"></span><input value="${filled.metal ?? "0"}">
    <span class="resourceIcon crystal"></span><input value="${filled.crystal ?? "0"}">
    <span class="resourceIcon deuterium"></span><input value="${filled.deuterium ?? "0"}">
  `;
  globalThis.fleetDispatcher = {
    currentPage: "fleet1",
    metalOnPlanet: metal,
    crystalOnPlanet: crystal,
    deuteriumOnPlanet: deuterium,
    shipsOnPlanet,
    getConsumption: () => 0,
    fleetHelper: {
      shipsData: {
        202: { baseCargoCapacity: 5000 },
        203: { baseCargoCapacity: 25000 },
        219: { baseCargoCapacity: 250000 },
      },
    },
  };
  globalThis.fadeBox = () => {};
}

function cargoInstance() {
  const selected = [];
  const instance = ogi({
    selectShips: (id, count) => selected.push([id, count]),
    getTranslatedText: () => "not enough cargo",
  });
  return { instance, selected };
}

test("selectBestCargoShip picks the first cargo type that can carry the load in one go", () => {
  fleetDispatchPage({
    metal: 1_000_000,
    filled: { metal: "1.000.000" },
    shipsOnPlanet: [
      { id: 202, number: 10 },
      { id: 203, number: 100 },
    ],
  });
  const { instance, selected } = cargoInstance();

  instance.selectBestCargoShip();

  // 1.000.000 needs 200 small cargoes (only 10 available) or 40 large ones.
  assert.deepEqual(selected, [[203, 40]]);
});

test("selectBestCargoShip honours an explicitly preferred ship before the default order", () => {
  fleetDispatchPage({
    metal: 1_000_000,
    filled: { metal: "1.000.000" },
    shipsOnPlanet: [
      { id: 203, number: 100 },
      { id: 219, number: 100 },
    ],
  });
  const { instance, selected } = cargoInstance();

  instance.selectBestCargoShip(219);

  assert.deepEqual(selected, [[219, 4]], "the pathfinder was asked for, so it wins over the large cargo");
});

test("selectBestCargoShip spreads the load over several types when no single one suffices", () => {
  fleetDispatchPage({
    metal: 1_000_000,
    filled: { metal: "1.000.000" },
    shipsOnPlanet: [
      { id: 202, number: 100 },
      { id: 203, number: 10 },
    ],
  });
  const { instance, selected } = cargoInstance();

  instance.selectBestCargoShip();

  // Neither type alone is enough, so it falls through to the second pass and takes
  // what it can from each, in the order the ids are tried.
  assert.deepEqual(selected, [
    [202, 100],
    [203, 10],
  ]);
});

test("selectBestCargoShip caps a resource field at what is actually on the planet", () => {
  fleetDispatchPage({
    metal: 1000,
    filled: { metal: "1.000.000" },
    shipsOnPlanet: [{ id: 203, number: 100 }],
  });
  const { instance } = cargoInstance();

  instance.selectBestCargoShip();

  // Formatted through Intl with the game language, which the harness sets to "en" -
  // note that the value was READ back with LocalizationStrings, which the harness
  // sets to the German separators. On a real page both come from the same locale.
  assert.equal(
    document.querySelector(".resourceIcon.metal+input").value,
    new Intl.NumberFormat("en").format(1000),
    "the field was corrected down to the available amount"
  );
});

test("selectBestCargoShip does nothing outside the fleet-1 step", () => {
  fleetDispatchPage({ metal: 1_000_000, shipsOnPlanet: [{ id: 203, number: 100 }] });
  globalThis.fleetDispatcher.currentPage = "fleet2";
  const { instance, selected } = cargoInstance();

  instance.selectBestCargoShip();

  assert.deepEqual(selected, []);
});

test("selectBestCargoShip does nothing when there are no ships on the planet", () => {
  fleetDispatchPage({ metal: 1_000_000, shipsOnPlanet: [] });
  const { instance, selected } = cargoInstance();

  instance.selectBestCargoShip();

  assert.deepEqual(selected, []);
});

// --------------------------------------------------------------------------
// The constructor
// --------------------------------------------------------------------------

test("OGInfinity can be constructed from a page fixture", () => {
  // The point of the readPageContext() seam: before it, this line threw on the very
  // first statement of the constructor and no test could get past it.
  const page = setupBrowser({
    html: overviewPage(),
    url: "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame&component=overview",
  });
  try {
    const instance = new OGInfinity();

    assert.equal(instance.playerId, 12345);
    assert.equal(instance.page, "overview");
    assert.equal(instance.universeName, "Quantum");
    assert.equal(instance.current.coords, "4:5:6");
    assert.deepEqual(instance.markedPlayers, []);
  } finally {
    page.cleanup();
  }
});

test.after(() => {
  delete globalThis.fleetDispatcher;
  delete globalThis.fadeBox;
  browser.cleanup();
});
