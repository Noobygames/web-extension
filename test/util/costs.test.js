import test from "node:test";
import assert from "node:assert/strict";

import { fleetCost } from "../../src/game/fleetCost.js";
import { defenceCost } from "../../src/game/defenceCost.js";
import shipCosts from "../../src/game/shipCosts.js";
import defenceCosts from "../../src/game/defenceCosts.js";
import ship from "../../src/game/ship.js";
import defence from "../../src/game/defence.js";
import recyclingYieldCalculator from "../../src/game/recyclingYieldCalculator.js";

test("ship ids match the OGame technology ids", () => {
  // These leak into stored data and into DOM selectors; a typo here is silent.
  assert.equal(ship.SmallCargoShip, 202);
  assert.equal(ship.LargeCargoShip, 203);
  assert.equal(ship.EspionageProbe, 210);
  assert.equal(ship.DeathStar, 214);
  assert.equal(ship.Crawler, 217);
  assert.equal(ship.Pathfinder, 219);
  assert.equal(new Set(Object.values(ship)).size, Object.keys(ship).length, "ship ids must be unique");
});

test("every ship has a cost entry and every cost entry a ship", () => {
  const shipIds = Object.values(ship).map(String).sort();
  const costIds = Object.keys(shipCosts).sort();
  assert.deepEqual(costIds, shipIds);
});

test("every defence has a cost entry and every cost entry a defence", () => {
  const defenceIds = Object.values(defence).map(String).sort();
  const costIds = Object.keys(defenceCosts).sort();
  assert.deepEqual(costIds, defenceIds);
});

test("cost tables hold exactly three non-negative resources", () => {
  for (const [id, cost] of [...Object.entries(shipCosts), ...Object.entries(defenceCosts)]) {
    assert.equal(cost.length, 3, `entry ${id} must be [metal, crystal, deuterium]`);
    for (const value of cost) {
      assert.equal(typeof value, "number");
      assert.ok(value >= 0, `entry ${id} has a negative cost`);
    }
  }
});

test("fleetCost sums a single ship type", () => {
  // Large cargo: 6000 metal / 6000 crystal / 0 deuterium
  assert.deepEqual(fleetCost({ [ship.LargeCargoShip]: 10 }), [60000, 60000, 0]);
});

test("fleetCost sums across ship types including deuterium", () => {
  const cost = fleetCost({
    [ship.LargeCargoShip]: 1, // 6000 / 6000 / 0
    [ship.Cruiser]: 2, // 40000 / 14000 / 4000
    [ship.EspionageProbe]: 5, // 0 / 5000 / 0
  });

  assert.deepEqual(cost, [46000, 25000, 4000]);
});

test("fleetCost accepts a sparse array indexed by ship id", () => {
  // This is how callers actually build it (see recyclingYieldCalculator).
  const fleet = [];
  fleet[ship.Battleship] = 3; // 45000 / 15000 / 0
  assert.deepEqual(fleetCost(fleet), [135000, 45000, 0]);
});

test("fleetCost ignores unknown ids and zero counts", () => {
  assert.deepEqual(fleetCost({ 999: 100, [ship.Cruiser]: 0 }), [0, 0, 0]);
});

test("fleetCost tolerates a missing fleet", () => {
  assert.deepEqual(fleetCost(undefined), [0, 0, 0]);
  assert.deepEqual(fleetCost(null), [0, 0, 0]);
  assert.deepEqual(fleetCost({}), [0, 0, 0]);
});

test("defenceCost sums defence structures", () => {
  const cost = defenceCost({
    [defence.RocketLauncher]: 100, // 200000 / 0 / 0
    [defence.PlasmaTurret]: 2, // 100000 / 100000 / 60000
  });

  assert.deepEqual(cost, [300000, 100000, 60000]);
});

test("defenceCost tolerates a missing defence set", () => {
  assert.deepEqual(defenceCost(undefined), [0, 0, 0]);
});

test("recycling yield applies the debris rate to fleet cost", () => {
  // 10 large cargo = 60000 / 60000 / 0, at a 30% debris factor
  const yieldResult = recyclingYieldCalculator.CalculateRecyclingYieldFleet({ [ship.LargeCargoShip]: 10 }, 0.3, false);

  assert.equal(yieldResult.metal, 18000);
  assert.equal(yieldResult.crystal, 18000);
  assert.equal(yieldResult.deut, 0);
});

test("recycling yield only reports deuterium when includeDeut is set", () => {
  const fleet = { [ship.Cruiser]: 10 }; // 200000 / 70000 / 20000

  const without = recyclingYieldCalculator.CalculateRecyclingYieldFleet(fleet, 0.5, false);
  const with_ = recyclingYieldCalculator.CalculateRecyclingYieldFleet(fleet, 0.5, true);

  assert.equal(without.deut, 0);
  assert.equal(with_.deut, 10000);
  assert.equal(without.metal, with_.metal);
});

test("recycling yield is zero for a zero or negative rate", () => {
  for (const rate of [0, -1]) {
    const result = recyclingYieldCalculator.CalculateRecyclingYieldFleet({ [ship.Cruiser]: 10 }, rate, true);
    assert.deepEqual(result, { metal: 0, crystal: 0, deut: 0 });
  }
});

test("recycling yield handles a missing fleet or defence", () => {
  assert.deepEqual(recyclingYieldCalculator.CalculateRecyclingYieldFleet(null, 0.3, true), {
    metal: 0,
    crystal: 0,
    deut: 0,
  });
  assert.deepEqual(recyclingYieldCalculator.CalculateRecyclingYieldDefence(null, 0.3, true), {
    metal: 0,
    crystal: 0,
    deut: 0,
  });
});

test("recycling yield for defence uses the defence cost table", () => {
  const result = recyclingYieldCalculator.CalculateRecyclingYieldDefence(
    { [defence.RocketLauncher]: 1000 }, // 2 000 000 metal
    0.25,
    false
  );

  assert.equal(result.metal, 500000);
  assert.equal(result.crystal, 0);
});

test("empire helper splits planet and moon fleets", () => {
  const planetFromEmpire = {
    [ship.LargeCargoShip]: 10, // 60000 / 60000 / 0
    moon: { [ship.Cruiser]: 1 }, // 20000 /  7000 / 2000
  };

  const { planetFleetRecyclingYield, moonFleetRecyclingYield } =
    recyclingYieldCalculator.CalculateRecyclingYieldFleetFromEmpireData(planetFromEmpire, 0.5, true);

  assert.deepEqual(planetFleetRecyclingYield, { metal: 30000, crystal: 30000, deut: 0 });
  assert.deepEqual(moonFleetRecyclingYield, { metal: 10000, crystal: 3500, deut: 1000 });
});

test("empire helper reports an empty moon fleet when the planet has no moon", () => {
  const { moonFleetRecyclingYield } = recyclingYieldCalculator.CalculateRecyclingYieldFleetFromEmpireData(
    { [ship.LargeCargoShip]: 10 },
    0.5,
    true
  );

  assert.deepEqual(moonFleetRecyclingYield, { metal: 0, crystal: 0, deut: 0 });
});
