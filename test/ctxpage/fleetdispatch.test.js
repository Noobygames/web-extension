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

const OGBIData = (await import("../../src/util/OGBIData.js")).default;
const { calcNeededShips, selectBestCargoShip } = await import("../../src/ctxpage/fleetdispatch/index.js");

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
