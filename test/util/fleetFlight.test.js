/**
 * OGame's flight distance and duration formulas (Feature A of the roadmap).
 *
 * Neither module touches globals at import time, so plain static imports keep the coverage
 * report honest.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { distance, flightDuration, roundTripDuration } from "../../src/game/fleetFlight.js";

const at = (galaxy, system, position) => ({ galaxy, system, position });

// --------------------------------------------------------------------------
// distance
// --------------------------------------------------------------------------

test("a different galaxy costs 20000 per galaxy of separation", () => {
  assert.equal(distance(at(1, 1, 1), at(2, 1, 1)), 20000);
  assert.equal(distance(at(1, 1, 1), at(3, 1, 1)), 40000);
  // and the galaxy term wins outright - system and position no longer matter
  assert.equal(distance(at(1, 1, 1), at(2, 499, 15)), 20000);
});

test("a different system costs 2700 plus 95 per system", () => {
  assert.equal(distance(at(1, 1, 1), at(1, 2, 1)), 2795);
  assert.equal(distance(at(1, 100, 1), at(1, 110, 1)), 2700 + 950);
});

test("a different position costs 1000 plus 5 per slot", () => {
  assert.equal(distance(at(1, 1, 1), at(1, 1, 2)), 1005);
  assert.equal(distance(at(1, 1, 4), at(1, 1, 15)), 1000 + 55);
});

test("the same slot costs 5 - planet to its own moon or debris field", () => {
  assert.equal(distance(at(4, 250, 8), at(4, 250, 8)), 5);
});

test("distance is symmetric", () => {
  assert.equal(distance(at(1, 1, 1), at(2, 40, 9)), distance(at(2, 40, 9), at(1, 1, 1)));
  assert.equal(distance(at(1, 10, 3), at(1, 400, 3)), distance(at(1, 400, 3), at(1, 10, 3)));
});

// --------------------------------------------------------------------------
// donut universes
// --------------------------------------------------------------------------

test("a donut system wraps around, so the short way round is used", () => {
  const universe = { systems: 499, donutSystem: true };

  // 1 -> 499 is 498 the direct way, but only 1 system across the wrap
  assert.equal(distance(at(1, 1, 1), at(1, 499, 1), universe), 2700 + 95);
  // without the donut setting the long way is the only way
  assert.equal(distance(at(1, 1, 1), at(1, 499, 1), { systems: 499 }), 2700 + 95 * 498);
});

test("a donut galaxy wraps around too", () => {
  const universe = { galaxies: 9, donutGalaxy: true };

  assert.equal(distance(at(1, 1, 1), at(9, 1, 1), universe), 20000);
  assert.equal(distance(at(1, 1, 1), at(9, 1, 1), { galaxies: 9 }), 20000 * 8);
});

test("wrapping never makes a distance longer than going direct", () => {
  const universe = { systems: 499, donutSystem: true };

  // 1 -> 200 is 199 direct, 300 the other way; direct must win
  assert.equal(distance(at(1, 1, 1), at(1, 200, 1), universe), 2700 + 95 * 199);
});

test("a missing universe size disables wrapping rather than producing NaN", () => {
  const result = distance(at(1, 1, 1), at(1, 499, 1), { donutSystem: true });

  assert.equal(Number.isFinite(result), true);
  assert.equal(result, 2700 + 95 * 498);
});

// --------------------------------------------------------------------------
// flightDuration
// --------------------------------------------------------------------------

test("a large cargo one system away takes about 11 minutes at speed 1", () => {
  const seconds = flightDuration({ distance: distance(at(1, 1, 1), at(1, 2, 1)), shipSpeed: 7500 });

  // in-game reference value for this trip
  assert.ok(seconds > 680 && seconds < 690, `expected ~686s, got ${seconds}`);
});

test("the universe fleet speed divides the duration", () => {
  const params = { distance: 2795, shipSpeed: 7500 };

  assert.equal(
    flightDuration({ ...params, fleetSpeedFactor: 4 }),
    flightDuration({ ...params, fleetSpeedFactor: 1 }) / 4
  );
});

test("halving the speed slider does not simply double the duration", () => {
  const params = { distance: 2795, shipSpeed: 7500 };
  const full = flightDuration({ ...params, speedPercent: 1 });
  const half = flightDuration({ ...params, speedPercent: 0.5 });

  // the constant +10s offset means it is close to, but never exactly, double
  assert.ok(half > full * 1.9 && half < full * 2, `${half} vs ${full}`);
});

test("a faster ship arrives sooner", () => {
  const params = { distance: 2795 };

  assert.ok(flightDuration({ ...params, shipSpeed: 12000 }) < flightDuration({ ...params, shipSpeed: 7500 }));
});

test("an unusable fleet reports Infinity rather than NaN or a negative time", () => {
  assert.equal(flightDuration({ distance: 2795, shipSpeed: 0 }), Infinity);
  assert.equal(flightDuration({ distance: 2795, shipSpeed: undefined }), Infinity);
  assert.equal(flightDuration({ distance: 2795, shipSpeed: 7500, speedPercent: 0 }), Infinity);
  assert.equal(flightDuration({ distance: 2795, shipSpeed: 7500, fleetSpeedFactor: 0 }), Infinity);
});

test("a round trip is exactly twice the one-way flight", () => {
  const params = { distance: 2795, shipSpeed: 7500 };

  assert.equal(roundTripDuration(params), flightDuration(params) * 2);
});
