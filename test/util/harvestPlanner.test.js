/**
 * Feature B - save-flight harvest planning, including the capacity-waste warning.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  transportableResources,
  selectCargos,
  planPlanetHarvest,
  planHarvest,
  CARGO_SHIP_IDS,
} from "../../src/game/harvestPlanner.js";

const CAPACITIES = { 202: 5000, 203: 25000, 219: 10000 };

// --------------------------------------------------------------------------
// transportableResources
// --------------------------------------------------------------------------

test("everything is transportable when nothing is kept back", () => {
  const result = transportableResources({ metal: 1000, crystal: 500, deuterium: 250 });

  assert.deepEqual(result, { metal: 1000, crystal: 500, deuterium: 250, total: 1750 });
});

test("the kept reserve is subtracted per resource, not from the total", () => {
  const result = transportableResources(
    { metal: 1000, crystal: 500, deuterium: 250 },
    { metal: 400, crystal: 0, deuterium: 250 }
  );

  assert.equal(result.metal, 600);
  assert.equal(result.crystal, 500);
  assert.equal(result.deuterium, 0);
  assert.equal(result.total, 1100);
});

test("keeping more than a planet holds never produces a negative amount", () => {
  const result = transportableResources({ metal: 100, crystal: 0, deuterium: 0 }, { metal: 5000 });

  assert.equal(result.metal, 0);
  assert.equal(result.total, 0);
});

test("missing or malformed resource values are treated as zero", () => {
  assert.equal(transportableResources({}).total, 0);
  assert.equal(transportableResources(undefined).total, 0);
  assert.equal(transportableResources({ metal: "not a number", crystal: NaN, deuterium: -5 }).total, 0);
});

test("fractional resources are floored - half a unit cannot be loaded", () => {
  assert.equal(transportableResources({ metal: 10.9, crystal: 0, deuterium: 0 }).metal, 10);
});

// --------------------------------------------------------------------------
// selectCargos
// --------------------------------------------------------------------------

test("the roomiest cargo is filled first", () => {
  const result = selectCargos(50000, { 202: 100, 203: 100, 219: 100 }, CAPACITIES);

  assert.deepEqual(result.ships, { 203: 2 });
  assert.equal(result.capacity, 50000);
  assert.equal(result.shortfall, 0);
});

test("the last cargo is rounded up, because a partial ship still has to fly", () => {
  const result = selectCargos(26000, { 203: 100 }, CAPACITIES);

  assert.deepEqual(result.ships, { 203: 2 });
  assert.equal(result.capacity, 50000);
});

test("smaller cargos top up what the large ones cannot cover", () => {
  const result = selectCargos(30000, { 202: 100, 203: 1, 219: 0 }, CAPACITIES);

  assert.equal(result.ships[203], 1);
  assert.equal(result.ships[202], 1);
  assert.equal(result.capacity, 30000);
  assert.equal(result.shortfall, 0);
});

test("a planet without enough cargo reports the shortfall instead of inventing ships", () => {
  const result = selectCargos(100000, { 203: 2 }, CAPACITIES);

  assert.deepEqual(result.ships, { 203: 2 });
  assert.equal(result.capacity, 50000);
  assert.equal(result.shortfall, 50000);
});

test("a planet with no cargo at all selects nothing", () => {
  const result = selectCargos(10000, {}, CAPACITIES);

  assert.deepEqual(result.ships, {});
  assert.equal(result.shortfall, 10000);
});

test("nothing to move selects no ships", () => {
  assert.deepEqual(selectCargos(0, { 203: 50 }, CAPACITIES).ships, {});
});

test("ship types with an unknown capacity are skipped rather than counted as free", () => {
  const result = selectCargos(10000, { 203: 5 }, { 203: 0 });

  assert.deepEqual(result.ships, {});
  assert.equal(result.shortfall, 10000);
});

test("large cargo is preferred over pathfinder, which is preferred over small cargo", () => {
  assert.deepEqual(CARGO_SHIP_IDS, [203, 219, 202]);
});

// --------------------------------------------------------------------------
// planPlanetHarvest
// --------------------------------------------------------------------------

test("a planet with enough cargo is feasible and reports its wasted hold", () => {
  const plan = planPlanetHarvest({
    resources: { metal: 12000, crystal: 0, deuterium: 0 },
    availableShips: { 203: 40 },
    capacities: CAPACITIES,
  });

  assert.equal(plan.feasible, true);
  assert.deepEqual(plan.ships, { 203: 1 });
  assert.equal(plan.usedCapacity, 12000);
  // one large cargo holds 25000; more than half the hold flies empty
  assert.equal(plan.wastedCapacity, 13000);
});

test("waste is measured against the ships actually sent, not the whole planet's fleet", () => {
  const plan = planPlanetHarvest({
    resources: { metal: 50000, crystal: 0, deuterium: 0 },
    availableShips: { 203: 100 },
    capacities: CAPACITIES,
  });

  assert.deepEqual(plan.ships, { 203: 2 });
  assert.equal(plan.wastedCapacity, 0, "a perfectly filled fleet wastes nothing");
});

test("a planet short of cargo is not feasible but still reports a plan", () => {
  const plan = planPlanetHarvest({
    resources: { metal: 200000, crystal: 0, deuterium: 0 },
    availableShips: { 203: 1 },
    capacities: CAPACITIES,
  });

  assert.equal(plan.feasible, false);
  assert.equal(plan.shortfall, 175000);
  assert.deepEqual(plan.ships, { 203: 1 }, "the player can still send what they have");
});

test("an empty planet is neither feasible nor worthwhile", () => {
  const plan = planPlanetHarvest({
    resources: { metal: 0, crystal: 0, deuterium: 0 },
    availableShips: { 203: 10 },
    capacities: CAPACITIES,
  });

  assert.equal(plan.feasible, false);
  assert.equal(plan.worthwhile, false);
  assert.equal(plan.shipCount, 0);
});

test("a planet below the minimum is planned but not worth flying", () => {
  const plan = planPlanetHarvest({
    resources: { metal: 900, crystal: 0, deuterium: 0 },
    availableShips: { 203: 10 },
    capacities: CAPACITIES,
    minimumTotal: 100000,
  });

  assert.equal(plan.worthwhile, false);
  assert.equal(plan.send.total, 900, "the amount is still reported");
});

// --------------------------------------------------------------------------
// planHarvest
// --------------------------------------------------------------------------

const planetAt = (coordinates, metal, ships) => ({
  id: coordinates,
  name: coordinates,
  coordinates,
  resources: { metal, crystal: 0, deuterium: 0 },
  ships,
});

test("the bank never ships to itself", () => {
  const { plans } = planHarvest({
    planets: [planetAt("[1:1:1]", 50000, { 203: 10 }), planetAt("[1:2:3]", 50000, { 203: 10 })],
    bankCoordinates: "[1:1:1]",
    capacities: CAPACITIES,
  });

  assert.equal(plans.length, 1);
  assert.equal(plans[0].planet.coordinates, "[1:2:3]");
});

test("planets with nothing worth moving drop out of the plan", () => {
  const { plans } = planHarvest({
    planets: [planetAt("[1:2:3]", 0, { 203: 10 }), planetAt("[1:2:4]", 50000, { 203: 10 })],
    bankCoordinates: "[1:1:1]",
    capacities: CAPACITIES,
  });

  assert.equal(plans.length, 1);
  assert.equal(plans[0].planet.coordinates, "[1:2:4]");
});

test("the totals add up across every planned flight", () => {
  const { totals } = planHarvest({
    planets: [planetAt("[1:2:3]", 50000, { 203: 10 }), planetAt("[1:2:4]", 12000, { 203: 10 })],
    bankCoordinates: "[1:1:1]",
    capacities: CAPACITIES,
  });

  assert.equal(totals.resources, 62000);
  assert.equal(totals.ships, 3);
  assert.equal(totals.flights, 2, "one flight per planet - never one action for all of them");
  assert.equal(totals.wastedCapacity, 13000);
});

test("a shortfall on one planet does not hide the others", () => {
  const { plans, totals } = planHarvest({
    planets: [planetAt("[1:2:3]", 500000, { 203: 1 }), planetAt("[1:2:4]", 25000, { 203: 10 })],
    bankCoordinates: "[1:1:1]",
    capacities: CAPACITIES,
  });

  assert.equal(plans.length, 2);
  assert.equal(plans.filter((p) => p.feasible).length, 1);
  assert.equal(totals.shortfall, 475000);
});

test("an empty or missing planet list yields an empty plan rather than throwing", () => {
  assert.deepEqual(planHarvest({ planets: [], bankCoordinates: "[1:1:1]", capacities: CAPACITIES }).plans, []);
  assert.deepEqual(planHarvest({ bankCoordinates: "[1:1:1]", capacities: CAPACITIES }).plans, []);
  assert.deepEqual(planHarvest({ planets: [null], bankCoordinates: "[1:1:1]", capacities: CAPACITIES }).plans, []);
});
