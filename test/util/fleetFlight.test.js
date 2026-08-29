/**
 * OGame's flight distance and duration formulas (Feature A of the roadmap).
 *
 * Neither module touches globals at import time, so plain static imports keep the coverage
 * report honest.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { distance, flightDuration, roundTripDuration, roundTripFuel } from "../../src/game/fleetFlight.js";

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

test("a large cargo one system away takes about 1h53m at speed 1", () => {
  const seconds = flightDuration({ distance: distance(at(1, 1, 1), at(1, 2, 1)), shipSpeed: 7500 });

  // 10 + 3500 * sqrt(2795*10/7500), not an in-game reference value - see the real-world
  // regression test below for the one actually cross-checked against the live game.
  assert.ok(seconds > 6760 && seconds < 6770, `expected ~6766s, got ${seconds}`);
});

test("matches a real Origin flight: 28502 speed, 2 systems, universe fleet speed 2x", () => {
  // Reported by a player: 2890 distance (2 systems apart, same galaxy), Small Cargo at
  // 28502 speed, universe fleet-speed setting 2x (war and peaceful both), real in-game
  // duration 0:29:27 (1767s) for both Attack and Transport missions. This is what caught
  // the 35000 -> 350000 fix above: the old constant gave 6:02 here, not 29:27.
  const seconds = flightDuration({ distance: 2890, shipSpeed: 28502, fleetSpeedFactor: 2 });

  assert.ok(Math.abs(seconds - 1767) < 1, `expected ~1767s (29:27), got ${seconds}`);
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

// --------------------------------------------------------------------------
// roundTripFuel - was missing entirely before this fix; the tool had
// fuelConsumption cached per ship (fleetdispatch/shipData.js) but never spent it,
// so profitPerHour() (farmEvaluator.js) showed pure gross loot. Formula verified
// against the reverse-engineered OGame server source (game/fleet.php):
//   outbound = shipCount * baseConsumption * distance/35000 * (speedPercent+1)^2
//   round trip = outbound * 1.5 (the trip home burns half of what the trip out did)
// --------------------------------------------------------------------------

test("round trip fuel matches the source-verified formula at 100% speed", () => {
  // outbound = 10 ships * 10 consumption * (35000/35000) * (1+1)^2 = 400; round trip = 600
  const fuel = roundTripFuel({ shipCount: 10, baseConsumption: 10, distance: 35000, speedPercent: 1 });

  assert.equal(fuel, 600);
});

test("fuel scales linearly with ship count and with distance", () => {
  const base = roundTripFuel({ shipCount: 1, baseConsumption: 10, distance: 35000, speedPercent: 1 });

  assert.equal(roundTripFuel({ shipCount: 5, baseConsumption: 10, distance: 35000, speedPercent: 1 }), base * 5);
  assert.equal(roundTripFuel({ shipCount: 1, baseConsumption: 10, distance: 70000, speedPercent: 1 }), base * 2);
});

test("slower speedPercent burns less fuel, per the (speedPercent+1)^2 term", () => {
  const full = roundTripFuel({ shipCount: 1, baseConsumption: 10, distance: 35000, speedPercent: 1 });
  const half = roundTripFuel({ shipCount: 1, baseConsumption: 10, distance: 35000, speedPercent: 0.5 });

  // (0.5+1)^2 / (1+1)^2 = 2.25/4 = 0.5625
  assert.ok(Math.abs(half - full * 0.5625) < 1e-9);
});

test("a trip with no ships, no consumption stat, or no distance costs nothing rather than NaN", () => {
  assert.equal(roundTripFuel({ shipCount: 0, baseConsumption: 10, distance: 35000 }), 0);
  assert.equal(roundTripFuel({ shipCount: 5, baseConsumption: 0, distance: 35000 }), 0);
  assert.equal(roundTripFuel({ shipCount: 5, baseConsumption: 10, distance: 0 }), 0);
  assert.equal(roundTripFuel({ shipCount: 5, baseConsumption: 10, distance: undefined }), 0);
});
