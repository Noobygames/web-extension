/**
 * `ctxpage/galaxy/radarTargets.js` - the raid list's "radar" source: inactive players
 * from the public-API snapshot, ranked by how long the fleet would be in the air.
 *
 * Two things here are easy to get wrong and invisible if they are: the bridge must be
 * asked once per page load (it is memoized, and the raid list can be reopened any number
 * of times), and a bridge rejection must not take the raid list down with it - the other
 * two tabs work fine without radar data.
 *
 * Nothing in this module dispatches anything (AGENTS.md 1.5.1); these tests check the
 * data pipeline, so there is no dispatch behaviour to assert on.
 *
 * Page-context module - no `chrome: true` on setupBrowser.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../../helpers/globals.js";
import planetType from "../../../src/game/planetType.js";

const browser = setupBrowser();
const OGBIData = (await import("../../../src/store/OGBIData.js")).default;
const dataHelper = (await import("../../../src/integrations/dataHelper.js")).default;
const { loadRadarTargets, resetRadarTargets } = await import("../../../src/ctxpage/galaxy/radarTargets.js");

const realGetInactiveTargets = dataHelper.getInactiveTargets;

test.after(() => {
  dataHelper.getInactiveTargets = realGetInactiveTargets;
  browser.cleanup();
});

/**
 * Two own planets in galaxy 1, one in galaxy 4, and a farm cargo configured - enough for
 * `flightContext()` to produce real flight times rather than Infinity everywhere.
 */
function seed({ spyReportCache = {}, empire = [{ coordinates: "1:1:1" }, { coordinates: "4:1:1" }] } = {}) {
  OGBIData.json = {
    empire,
    options: { spyFret: 203 },
    ships: { 203: { speed: 7500, cargoCapacity: 25000, fuelConsumption: 50 } },
    universeSettingsTooltip: { galaxies: 6, systems: 499, donutGalaxy: true, donutSystem: true },
    spyReportCache,
  };
}

/** Replaces the bridge call and records the galaxies the module asked for. */
function stubBridge(targets) {
  const calls = [];
  dataHelper.getInactiveTargets = (galaxies) => {
    calls.push(galaxies);
    return Promise.resolve(targets);
  };
  return calls;
}

const target = (coords, overrides = {}) => ({
  playerId: 7,
  name: "Sleeper",
  status: "i",
  coords,
  moon: false,
  ...overrides,
});

test("only the galaxies the player owns a planet in are requested", async () => {
  resetRadarTargets();
  seed();
  const calls = stubBridge([]);

  await loadRadarTargets();

  assert.deepEqual(calls, [[1, 4]]);
});

test("the bridge is asked once per page load, however often the list is opened", async () => {
  resetRadarTargets();
  seed();
  const calls = stubBridge([target("1:2:1")]);

  const first = await loadRadarTargets();
  const second = await loadRadarTargets();

  assert.equal(calls.length, 1);
  assert.equal(first, second);
});

test("targets that already have a cached spy report belong to the other tab", async () => {
  resetRadarTargets();
  seed({
    spyReportCache: {
      "1:2:1#1": { coords: "1:2:1", planetTargetType: planetType.planet },
    },
  });
  stubBridge([target("1:2:1"), target("1:3:1")]);

  const rows = await loadRadarTargets();

  assert.deepEqual(
    rows.map((row) => row.target.coords),
    ["1:3:1"]
  );
});

test("the player's own planets are not offered as farms", async () => {
  resetRadarTargets();
  seed();
  stubBridge([target("1:1:1"), target("1:3:1")]);

  const rows = await loadRadarTargets();

  assert.deepEqual(
    rows.map((row) => row.target.coords),
    ["1:3:1"]
  );
});

test("the nearest target flies first", async () => {
  resetRadarTargets();
  seed();
  stubBridge([target("1:120:5"), target("1:2:5"), target("1:40:5")]);

  const rows = await loadRadarTargets();

  assert.deepEqual(
    rows.map((row) => row.target.coords),
    ["1:2:5", "1:40:5", "1:120:5"]
  );
  assert.ok(rows[0].durationSeconds < rows[2].durationSeconds);
});

test("each row carries the flight figures the table renders", async () => {
  resetRadarTargets();
  seed();
  stubBridge([target("1:2:5", { moon: true, status: "I" })]);

  const [row] = await loadRadarTargets();

  assert.equal(row.target.status, "I");
  assert.equal(row.target.moon, true);
  assert.ok(Number.isFinite(row.distance));
  assert.ok(row.durationSeconds > 0);
});

test("a failed bridge call yields an empty list rather than rejecting", async () => {
  resetRadarTargets();
  seed();
  dataHelper.getInactiveTargets = () => Promise.reject(new Error("unknown command"));

  assert.deepEqual(await loadRadarTargets(), []);
});

test("a player with no planets asks for every galaxy rather than none", async () => {
  resetRadarTargets();
  seed({ empire: [] });
  const calls = stubBridge([]);

  await loadRadarTargets();

  assert.deepEqual(calls, [[]]);
});
