/**
 * `ctxpage/fleetdispatch/` - the cargo helpers.
 *
 * These tests came from `test/ogCore.calculations.test.js`, where they ran against
 * `OGBeyondInfinity.prototype`. Phase 3 of refactoring.md moved the fleet-dispatch page out
 * of the monolith; the tests moved with it, and every expected value is unchanged -
 * which is what verifies the move.
 *
 * Only the cargo helpers are covered. The rest of the module rebuilds OGame's own
 * dispatcher UI and patches `FleetDispatcher.prototype`; testing that needs a fixture
 * of the real fleet page, which does not exist yet.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const browser = setupBrowser({
  url: "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame&component=fleetdispatch",
});

const OGBIData = (await import("../../src/store/OGBIData.js")).default;
const { calcNeededShips, selectBestCargoShip, correctCargoCount } = await import(
  "../../src/ctxpage/fleetdispatch/index.js"
);

test.after(() => {
  delete globalThis.fleetDispatcher;
  delete globalThis.fadeBox;
  browser.cleanup();
});

/** What the two helpers read out of the store. */
function withStore() {
  OGBIData.json = {
    options: { fret: 203 },
    ships: {
      202: { cargoCapacity: 5000 },
      203: { cargoCapacity: 25000 },
      210: { cargoCapacity: 0 },
      219: { cargoCapacity: 250000 },
    },
  };
}

/** The three resource counters `calcNeededShips()` reads off the page. */
function resourceBar({ metal = "1.000.000", crystal = "500.000", deuterium = "0" } = {}) {
  document.body.innerHTML = `
    <span id="resources_metal">${metal}</span>
    <span id="resources_crystal">${crystal}</span>
    <span id="resources_deuterium">${deuterium}</span>
  `;
}

/**
 * The fleet-dispatch page state `selectBestCargoShip()` reads.
 *
 * `fleetDispatcher` is an OGame page global, not something the extension owns, so the
 * test installs one. `selectShip` records what was chosen - that is the observable,
 * now that the helper calls a module function rather than a method a test could stub.
 */
function fleetDispatchPage({ metal = 0, crystal = 0, deuterium = 0, shipsOnPlanet = [], filled = {} } = {}) {
  const selected = [];
  // calcNeededShips() reads the resource counters even when handed an explicit
  // amount, and selectBestCargoShip() always hands it one.
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
    selectShip: (id, amount) => selected.push([id, amount]),
    refresh: () => {},
    fleetHelper: {
      shipsData: {
        202: { baseCargoCapacity: 5000 },
        203: { baseCargoCapacity: 25000 },
        219: { baseCargoCapacity: 250000 },
      },
    },
  };
  globalThis.fadeBox = () => {};
  return selected;
}

const CONTEXT = { page: "fleetdispatch" };

// --------------------------------------------------------------------------
// calcNeededShips
// --------------------------------------------------------------------------

test("calcNeededShips rounds up to whole ships of the configured type", () => {
  withStore();
  resourceBar();
  // 1.500.000 resources over a large cargo's 25.000 capacity.
  assert.equal(calcNeededShips(CONTEXT), 60);
  assert.equal(calcNeededShips(CONTEXT, { fret: 202 }), 300, "small cargoes carry a fifth as much");
});

test("calcNeededShips prefers an explicit resource amount over the page", () => {
  withStore();
  resourceBar();
  assert.equal(calcNeededShips(CONTEXT, { resources: 25_001 }), 2);
  assert.equal(calcNeededShips(CONTEXT, { resources: 0 }), 0, "an explicit zero is honoured, not treated as absent");
});

test("calcNeededShips adds 7 percent when more freight is asked for", () => {
  withStore();
  resourceBar();
  assert.equal(calcNeededShips(CONTEXT, { resources: 25_000, moreFret: true }), 2);
  assert.equal(calcNeededShips(CONTEXT, { resources: 25_000 }), 1);
});

// --------------------------------------------------------------------------
// selectBestCargoShip
// --------------------------------------------------------------------------

test("selectBestCargoShip picks the first cargo type that can carry the load in one go", () => {
  withStore();
  const selected = fleetDispatchPage({
    metal: 1_000_000,
    filled: { metal: "1.000.000" },
    shipsOnPlanet: [
      { id: 202, number: 10 },
      { id: 203, number: 100 },
    ],
  });

  selectBestCargoShip(CONTEXT);

  // 1.000.000 needs 200 small cargoes (only 10 available) or 40 large ones.
  assert.deepEqual(selected, [[203, 40]]);
});

test("selectBestCargoShip honours an explicitly preferred ship before the default order", () => {
  withStore();
  const selected = fleetDispatchPage({
    metal: 1_000_000,
    filled: { metal: "1.000.000" },
    shipsOnPlanet: [
      { id: 203, number: 100 },
      { id: 219, number: 100 },
    ],
  });

  selectBestCargoShip(CONTEXT, 219);

  assert.deepEqual(selected, [[219, 4]], "the pathfinder was asked for, so it wins over the large cargo");
});

test("selectBestCargoShip spreads the load over several types when no single one suffices", () => {
  withStore();
  const selected = fleetDispatchPage({
    metal: 1_000_000,
    filled: { metal: "1.000.000" },
    shipsOnPlanet: [
      { id: 202, number: 100 },
      { id: 203, number: 10 },
    ],
  });

  selectBestCargoShip(CONTEXT);

  assert.deepEqual(
    selected,
    [
      [202, 100],
      [203, 10],
    ],
    "neither type alone is enough, so it takes what it can from each"
  );
});

test("selectBestCargoShip caps a resource field at what is actually on the planet", () => {
  withStore();
  fleetDispatchPage({
    metal: 1000,
    filled: { metal: "1.000.000" },
    shipsOnPlanet: [{ id: 203, number: 100 }],
  });

  selectBestCargoShip(CONTEXT);

  // Formatted through Intl with the game language, which the harness sets to "en" -
  // note that the value was READ back with LocalizationStrings, which the harness sets
  // to the German separators. On a real page both come from the same locale.
  assert.equal(
    document.querySelector(".resourceIcon.metal+input").value,
    new Intl.NumberFormat("en").format(1000),
    "the field was corrected down to the available amount"
  );
});

test("selectBestCargoShip does nothing outside the fleet-1 step", () => {
  withStore();
  const selected = fleetDispatchPage({ metal: 1_000_000, shipsOnPlanet: [{ id: 203, number: 100 }] });
  globalThis.fleetDispatcher.currentPage = "fleet2";

  selectBestCargoShip(CONTEXT);

  assert.deepEqual(selected, []);
});

test("selectBestCargoShip does nothing when there are no ships on the planet", () => {
  withStore();
  const selected = fleetDispatchPage({ metal: 1_000_000, shipsOnPlanet: [] });

  selectBestCargoShip(CONTEXT);

  assert.deepEqual(selected, []);
});

// --------------------------------------------------------------------------
// correcting the ship count against the game's own capacity
// --------------------------------------------------------------------------

/**
 * The same page, plus the cargo total OGame itself reports.
 *
 * `realPerShip` is what one ship truly carries - the number the game knows and the
 * store's estimate does not, because `shipData.js` only applies the Hyperspace and
 * Miner bonuses. In a lifeform universe the real figure is higher still, and every
 * bonus the extension has not been taught leaves the estimate generous and the count
 * short. That is the shape of the bug this covers.
 */
function pageWithCapacity({ realPerShip, shipsOnPlanet, filled, preselected = 0 }) {
  const selected = fleetDispatchPage({
    metal: 100_000_000,
    crystal: 100_000_000,
    deuterium: 100_000_000,
    shipsOnPlanet,
    filled,
  });

  let chosen = 0;
  const inner = globalThis.fleetDispatcher.selectShip;
  globalThis.fleetDispatcher.selectShip = (id, amount) => {
    chosen = amount;
    inner(id, amount);
  };
  // `preselected` stands for cargo picked before this call - it keeps its capacity when
  // the helper selects on top of it, which is the whole point of the parameter.
  globalThis.fleetDispatcher.getCargoCapacity = () => (preselected + chosen) * realPerShip;

  return selected;
}

test("the ship count is raised when the game says the estimate does not fit", () => {
  withStore();
  // The store thinks a large cargo carries 25.000; the game says 20.000.
  const selected = pageWithCapacity({
    realPerShip: 20_000,
    shipsOnPlanet: [{ id: 203, number: 500 }],
    filled: { metal: "2.000.000", crystal: "0", deuterium: "0" },
  });

  selectBestCargoShip(CONTEXT, 203);

  // 2.000.000 / 25.000 = 80 on the estimate, but 80 ships only hold 1.600.000.
  assert.deepEqual(selected[0], [203, 80], "the estimate is selected first");
  assert.deepEqual(selected.at(-1), [203, 100], "then corrected to what actually fits");
});

test("a selection that already fits is left exactly as it was", () => {
  withStore();
  // The game is more generous than the estimate - no reason to touch anything.
  const selected = pageWithCapacity({
    realPerShip: 30_000,
    shipsOnPlanet: [{ id: 203, number: 500 }],
    filled: { metal: "2.000.000", crystal: "0", deuterium: "0" },
  });

  selectBestCargoShip(CONTEXT, 203);

  assert.equal(selected.length, 1, "selected once, never corrected");
  assert.deepEqual(selected[0], [203, 80]);
});

test("the correction never asks for more ships than the planet has", () => {
  withStore();
  const selected = pageWithCapacity({
    realPerShip: 20_000,
    shipsOnPlanet: [{ id: 203, number: 90 }],
    filled: { metal: "2.000.000", crystal: "0", deuterium: "0" },
  });

  selectBestCargoShip(CONTEXT, 203);

  // 100 would fit the cargo, but only 90 exist - and `selectShips` clamps to that.
  assert.deepEqual(selected.at(-1), [203, 90]);
});

test("cargo already selected before the call counts towards the total", () => {
  withStore();
  const selected = pageWithCapacity({
    realPerShip: 10_000,
    shipsOnPlanet: [{ id: 203, number: 500 }],
    filled: { metal: "2.000.000", crystal: "0", deuterium: "0" },
    // 20 ships were already picked, carrying 200.000 of the 2.000.000.
    preselected: 20,
  });

  selectBestCargoShip(CONTEXT, 203);

  // 1.800.000 left over 10.000 a ship = 180. Counting the 200.000 twice would ask for
  // 200 and leave the player wondering why 20 cargoes are flying empty.
  assert.deepEqual(selected.at(-1), [203, 180]);
});

test("a dispatcher without a cargo total is left to the estimate", () => {
  withStore();
  // Older dispatcher, or a page state that does not expose it. Silently doing nothing
  // is the right answer - the estimate is what the extension had before this existed.
  const selected = fleetDispatchPage({
    metal: 100_000_000,
    shipsOnPlanet: [{ id: 203, number: 500 }],
    filled: { metal: "2.000.000", crystal: "0", deuterium: "0" },
  });

  assert.doesNotThrow(() => selectBestCargoShip(CONTEXT, 203));
  assert.deepEqual(selected.at(-1), [203, 80]);
});

test("correctCargoCount refuses to shrink a selection", () => {
  withStore();
  pageWithCapacity({
    realPerShip: 100_000,
    shipsOnPlanet: [{ id: 203, number: 500 }],
    filled: { metal: "0", crystal: "0", deuterium: "0" },
    preselected: 80,
  });

  // Far more capacity than needed - the count stays where it is rather than dropping,
  // because the player may have chosen it on purpose.
  assert.equal(correctCargoCount(CONTEXT, 203, 80, 1_000_000, { 203: 500 }, 0), 80);
});
