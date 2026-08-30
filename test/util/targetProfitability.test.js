/**
 * `targetProfitability` (`src/game/targetProfitability.js`): the flight-context and
 * profit/hour formula shared by the spy-table "Profit/h" column
 * (`SpyMessagesAnalyzer.js`) and the raid list (`ctxpage/galaxy/raidList.js`).
 *
 * Split out of `SpyMessagesAnalyzer.js` so both consumers use one copy instead of two
 * that can quietly drift apart - the same duplication pattern that caused the
 * cargo-capacity bug fixed earlier in `ctxpage/fleetdispatch/shipData.js`. These tests
 * pin the extraction behaves exactly like the code it replaced.
 *
 * Page-context module - no `chrome: true` on setupBrowser.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const browser = setupBrowser();
const OGBIData = (await import("../../src/store/OGBIData.js")).default;
const { parseCoords, flightContext, estimateTarget } = await import("../../src/game/targetProfitability.js");

test.after(() => browser.cleanup());

test("parseCoords accepts plain and bracketed coordinates", () => {
  assert.deepEqual(parseCoords("1:2:3"), { galaxy: 1, system: 2, position: 3 });
  assert.deepEqual(parseCoords("[1:2:3]"), { galaxy: 1, system: 2, position: 3 });
});

test("parseCoords rejects anything malformed instead of throwing", () => {
  assert.equal(parseCoords(""), null);
  assert.equal(parseCoords("1:2"), null);
  assert.equal(parseCoords("a:b:c"), null);
  assert.equal(parseCoords(undefined), null);
});

test("flightContext reads the player's own planets, farm ship and universe settings from OGBIData", () => {
  OGBIData.json = {
    empire: [{ coordinates: "1:2:3" }, { coordinates: "4:5:6" }],
    options: { spyFret: 203 },
    ships: { 203: { speed: 7500, cargoCapacity: 25000, fuelConsumption: 50 } },
    speedFleetWar: 2,
    universeSettingsTooltip: { galaxies: 6, systems: 499, donutGalaxy: true, donutSystem: true },
  };

  const context = flightContext();

  assert.deepEqual(context.origins, [
    { galaxy: 1, system: 2, position: 3 },
    { galaxy: 4, system: 5, position: 6 },
  ]);
  assert.equal(context.shipSpeed, 7500);
  assert.equal(context.cargoCapacity, 25000);
  assert.equal(context.fuelConsumption, 50);
  assert.equal(context.fleetSpeedFactor, 2);
  assert.deepEqual(context.universe, { galaxies: 6, systems: 499, donutGalaxy: true, donutSystem: true });
});

test("flightContext tolerates a planet with unparseable coordinates", () => {
  OGBIData.json = {
    empire: [{ coordinates: "1:2:3" }, { coordinates: "garbage" }],
    options: { spyFret: 202 },
    ships: { 202: { speed: 5000, cargoCapacity: 5000, fuelConsumption: 10 } },
  };

  const context = flightContext();

  assert.deepEqual(context.origins, [{ galaxy: 1, system: 2, position: 3 }]);
});

test("estimateTarget evaluates a reachable target against the given loot", () => {
  OGBIData.json = {
    empire: [{ coordinates: "1:1:1" }],
    options: { spyFret: 203 },
    ships: { 203: { speed: 7500, cargoCapacity: 25000, fuelConsumption: 50 } },
    universeSettingsTooltip: { galaxies: 6, systems: 499, donutGalaxy: true, donutSystem: true },
  };

  const result = estimateTarget("1:1:5", 100000, flightContext());

  assert.ok(result.profitPerHour > 0, "a nearby, well-stocked target should be profitable");
  assert.equal(result.origin.galaxy, 1);
});

test("estimateTarget earns nothing for coordinates it cannot parse", () => {
  const result = estimateTarget("not-coords", 100000, flightContext());

  assert.equal(result.profitPerHour, 0);
  assert.equal(result.origin, null);
});

test("estimateTarget builds its own flightContext when none is passed", () => {
  OGBIData.json = {
    empire: [{ coordinates: "1:1:1" }],
    options: { spyFret: 203 },
    ships: { 203: { speed: 7500, cargoCapacity: 25000, fuelConsumption: 50 } },
    universeSettingsTooltip: { galaxies: 6, systems: 499, donutGalaxy: true, donutSystem: true },
  };

  const result = estimateTarget("1:1:5", 100000);

  assert.ok(result.profitPerHour > 0);
});
