/**
 * Feature A - ranking spy-report targets by what they actually earn per hour.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { profitPerHour, nearestOrigin, evaluateTarget, byProfitPerHour } from "../../src/util/farmEvaluator.js";

const at = (galaxy, system, position) => ({ galaxy, system, position });

// --------------------------------------------------------------------------
// profitPerHour
// --------------------------------------------------------------------------

test("profit per hour is loot divided by the round trip", () => {
  assert.equal(profitPerHour(3600, 3600), 3600);
  assert.equal(profitPerHour(1000, 1800), 2000);
});

test("an unreachable or instant trip earns nothing rather than Infinity", () => {
  assert.equal(profitPerHour(1e6, Infinity), 0);
  assert.equal(profitPerHour(1e6, 0), 0);
  assert.equal(profitPerHour(1e6, -5), 0);
});

test("a target with no loot earns nothing", () => {
  assert.equal(profitPerHour(0, 600), 0);
  assert.equal(profitPerHour(-1, 600), 0);
});

// --------------------------------------------------------------------------
// nearestOrigin
// --------------------------------------------------------------------------

test("the closest of several origins is chosen", () => {
  const origins = [at(1, 1, 1), at(4, 250, 8), at(4, 251, 6)];
  const best = nearestOrigin(at(4, 250, 10), origins);

  assert.deepEqual(best.origin, at(4, 250, 8));
  assert.equal(best.distance, 1010);
});

test("no origins at all yields null rather than throwing", () => {
  assert.equal(nearestOrigin(at(1, 1, 1), []), null);
  assert.equal(nearestOrigin(at(1, 1, 1), undefined), null);
});

test("holes in the origin list are skipped", () => {
  const best = nearestOrigin(at(1, 1, 5), [null, undefined, at(1, 1, 4)]);

  assert.deepEqual(best.origin, at(1, 1, 4));
});

test("the donut setting is honoured when picking the nearest origin", () => {
  const universe = { systems: 499, donutSystem: true };
  const origins = [at(1, 499, 1), at(1, 250, 1)];

  // across the wrap 499 is one system from 1; 250 is 249 systems away
  assert.deepEqual(nearestOrigin(at(1, 1, 1), origins, universe).origin, at(1, 499, 1));
  assert.deepEqual(nearestOrigin(at(1, 1, 1), origins, {}).origin, at(1, 250, 1));
});

// --------------------------------------------------------------------------
// evaluateTarget
// --------------------------------------------------------------------------

test("a near target beats a far one carrying the same loot", () => {
  const origins = [at(1, 1, 1)];
  const common = { origins, loot: 1e6, shipSpeed: 7500 };

  const near = evaluateTarget({ ...common, target: at(1, 2, 1) });
  const far = evaluateTarget({ ...common, target: at(5, 2, 1) });

  assert.ok(near.profitPerHour > far.profitPerHour);
  assert.ok(near.distance < far.distance);
});

test("a far target can still win if it carries enough loot", () => {
  const origins = [at(1, 1, 1)];

  const near = evaluateTarget({ origins, target: at(1, 2, 1), loot: 1e4, shipSpeed: 7500 });
  const far = evaluateTarget({ origins, target: at(1, 60, 1), loot: 1e7, shipSpeed: 7500 });

  // this is the whole point of the feature: absolute loot alone would rank these the same way,
  // but so would a pure distance sort - only profit/hour weighs them against each other
  assert.ok(far.profitPerHour > near.profitPerHour);
});

test("the reported duration is the round trip, not the one way", () => {
  const result = evaluateTarget({ origins: [at(1, 1, 1)], target: at(1, 2, 1), loot: 1e6, shipSpeed: 7500 });

  assert.ok(result.durationSeconds > 1360 && result.durationSeconds < 1380, result.durationSeconds);
});

test("a player with no planets gets a zero score instead of a crash", () => {
  const result = evaluateTarget({ origins: [], target: at(1, 1, 1), loot: 1e6, shipSpeed: 7500 });

  assert.equal(result.origin, null);
  assert.equal(result.profitPerHour, 0);
  assert.equal(result.durationSeconds, Infinity);
});

test("an unknown ship speed scores zero rather than NaN", () => {
  const result = evaluateTarget({ origins: [at(1, 1, 1)], target: at(1, 2, 1), loot: 1e6, shipSpeed: 0 });

  assert.equal(result.profitPerHour, 0);
});

test("a faster universe makes every target more profitable", () => {
  const common = { origins: [at(1, 1, 1)], target: at(1, 2, 1), loot: 1e6, shipSpeed: 7500 };

  const slow = evaluateTarget({ ...common, fleetSpeedFactor: 1 });
  const fast = evaluateTarget({ ...common, fleetSpeedFactor: 6 });

  assert.ok(fast.profitPerHour > slow.profitPerHour);
  assert.ok(Math.abs(fast.profitPerHour - slow.profitPerHour * 6) < 1e-6);
});

// --------------------------------------------------------------------------
// sorting
// --------------------------------------------------------------------------

test("the comparator orders best first and never drops unreachable targets", () => {
  const reports = [
    { name: "far", profitPerHour: 10 },
    { name: "unreachable", profitPerHour: 0 },
    { name: "near", profitPerHour: 500 },
    { name: "missing" },
  ];

  const sorted = [...reports].sort(byProfitPerHour).map((r) => r.name);

  assert.equal(sorted[0], "near");
  assert.equal(sorted[1], "far");
  assert.equal(sorted.length, 4, "nothing may be dropped from the table");
});
