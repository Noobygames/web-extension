import test from "node:test";
import assert from "node:assert/strict";

import {
  COORDINATE_PLANET,
  COORDINATE_DERBIS,
  COORDINATE_MOON,
  toNumber,
  toString,
  fromString,
  toArray,
  comparePosition,
  equals,
} from "../../src/ogame/coordinates.js";

test("type constants are distinct and stable", () => {
  // Persisted into chrome.storage as part of coordinate numbers - changing
  // these values silently invalidates stored data.
  assert.equal(COORDINATE_PLANET, 1);
  assert.equal(COORDINATE_DERBIS, 2);
  assert.equal(COORDINATE_MOON, 3);
});

test("toNumber encodes an OGame coordinate string with a type suffix", () => {
  assert.equal(toNumber("1:2:3"), 10020030);
  assert.equal(toNumber("1:2:3", COORDINATE_PLANET), 10020031);
  assert.equal(toNumber("1:2:3", COORDINATE_MOON), 10020033);
  assert.equal(toNumber("4:250:8", COORDINATE_MOON), 42500083);
  assert.equal(toNumber("9:499:15"), 94990150);
});

test("toNumber zero-pads system and position so ordering is numeric", () => {
  // The whole point of the encoding: string sorting of "1:10:3" vs "1:2:3"
  // is wrong, numeric sorting of the encoded form is right.
  const sorted = ["1:10:3", "1:2:3", "1:100:1"].map((c) => toNumber(c, COORDINATE_PLANET)).sort((a, b) => a - b);

  assert.deepEqual(
    sorted.map((n) => toString(n)),
    ["1:2:3", "1:10:3", "1:100:1"]
  );
});

test("toNumber accepts an OGameCoordinate instance", () => {
  // Trailing digit is the instance's own type (COORDINATE_PLANET = 1) since the
  // Phase A.5 fix below - the type argument now defaults to the instance's type
  // instead of unconditionally 0.
  assert.equal(toNumber(fromString("4:250:8", COORDINATE_PLANET)), 42500081);
});

test("toString decodes a coordinate number", () => {
  assert.equal(toString(10020030), "1:2:3");
  assert.equal(toString(42500083), "4:250:8");
  assert.equal(toString(10020031, true), "[1:2:3]");
});

test("toString accepts an OGameCoordinate instance", () => {
  assert.equal(toString(fromString("2:35:9", COORDINATE_MOON)), "2:35:9");
});

test("string -> number -> string round-trips for every coordinate type", () => {
  for (const type of [0, COORDINATE_PLANET, COORDINATE_DERBIS, COORDINATE_MOON]) {
    for (const coords of ["1:1:1", "1:2:3", "4:250:8", "9:499:15", "7:1:16"]) {
      assert.equal(toString(toNumber(coords, type)), coords, `${coords} @ type ${type}`);
    }
  }
});

test("fromString builds a sealed instance carrying its type", () => {
  const moon = fromString("4:250:8", COORDINATE_MOON);

  assert.equal(moon.galaxy, 4);
  assert.equal(moon.system, 250);
  assert.equal(moon.position, 8);
  assert.equal(moon.type, COORDINATE_MOON);
  assert.ok(Object.isSealed(moon));
});

test("instance type predicates are mutually exclusive", () => {
  const planet = fromString("1:2:3", COORDINATE_PLANET);
  const moon = fromString("1:2:3", COORDINATE_MOON);
  const debris = fromString("1:2:3", COORDINATE_DERBIS);

  assert.deepEqual([planet.isPlanet, planet.isMoon, planet.isDerbis], [true, false, false]);
  assert.deepEqual([moon.isPlanet, moon.isMoon, moon.isDerbis], [false, true, false]);
  assert.deepEqual([debris.isPlanet, debris.isMoon, debris.isDerbis], [false, false, true]);
});

test("a missing type defaults to 0", () => {
  assert.equal(fromString("1:2:3", undefined).type, 0);
});

test("toArray and instance.toArray return [galaxy, system, position]", () => {
  const coordinate = fromString("4:250:8", COORDINATE_MOON);
  assert.deepEqual(toArray(coordinate), [4, 250, 8]);
  assert.deepEqual(coordinate.toArray(), [4, 250, 8]);
});

test("comparePosition orders by galaxy, then system, then position", () => {
  const make = (c) => fromString(c, COORDINATE_PLANET);

  assert.ok(comparePosition(make("1:2:3"), make("1:2:4")) < 0);
  assert.ok(comparePosition(make("1:10:1"), make("1:2:1")) > 0);
  assert.ok(comparePosition(make("2:1:1"), make("1:499:15")) > 0);
  assert.equal(comparePosition(make("1:2:3"), make("1:2:3")), 0);
});

test("compareTo delegates to comparePosition", () => {
  const a = fromString("1:2:3", COORDINATE_PLANET);
  const b = fromString("1:2:4", COORDINATE_PLANET);
  assert.equal(a.compareTo(b), comparePosition(a, b));
});

test("equals compares the full encoded value, type included", () => {
  const planet = fromString("1:2:3", COORDINATE_PLANET);
  const samePlanet = fromString("1:2:3", COORDINATE_PLANET);
  const moon = fromString("1:2:3", COORDINATE_MOON);

  assert.equal(equals(planet, samePlanet), true);
  assert.equal(planet.equalsTo(samePlanet), true);
  assert.equal(equals(planet, moon), false, "a moon must not equal the planet it orbits");
});

// ---------------------------------------------------------------------------
// Fixed defects (refactoring-new.md Phase A.5). Each of these used to be pinned
// as a KNOWN BUG: - see docs/testing.md - asserting the wrong behaviour so a fix
// would register as deliberate rather than silent.
// ---------------------------------------------------------------------------

test("invalid input throws the named InvalidCoordinateArgument, not a bare TypeError", () => {
  // `throw InvalidCoordinateArgument(...)` was missing `new`. Invoking a class
  // without `new` is itself a TypeError, so the intended error type and message
  // never reached the caller.
  for (const call of [() => toNumber("nonsense"), () => toNumber(12345), () => toString(12)]) {
    assert.throws(call, (error) => {
      assert.equal(error.constructor.name, "InvalidCoordinateArgument");
      assert.ok(!(error instanceof TypeError), "must not be the bare TypeError 'new' produces");
      return true;
    });
  }
});

test("toNumber(instance) keeps the instance type, same as instance.toNumber()", () => {
  const moon = fromString("4:250:8", COORDINATE_MOON);

  assert.equal(moon.toNumber(), 42500083, "the method keeps the type");
  assert.equal(toNumber(moon), 42500083, "the free function now defaults to the instance's own type");
  assert.equal(toNumber(moon), moon.toNumber(), "both encodings of the same coordinate must agree");

  // An explicit type argument still overrides the instance's own - the default only
  // applies when the caller does not pass one.
  assert.equal(toNumber(moon, COORDINATE_PLANET), 42500081);
});

test("toString throws on an unsupported argument instead of silently returning undefined", () => {
  // The guard `if (text === undefined) {}` in toString() was empty.
  assert.throws(
    () => toString({}),
    (error) => error.constructor.name === "InvalidCoordinateArgument"
  );
  assert.throws(
    () => toString({}, true),
    (error) => error.constructor.name === "InvalidCoordinateArgument"
  );
});
