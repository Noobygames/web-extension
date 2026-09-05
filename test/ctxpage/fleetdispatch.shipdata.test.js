/**
 * Caching the fleet dispatcher's ship table.
 *
 * The bug this covers: `start()` read `fleetDispatcher.fleetHelper.shipsData` at one
 * fixed early moment, and on a real page the game puts `fleetHelper` on the dispatcher
 * after that. The guarded version stopped crashing and started warning instead - on
 * every single fleet-dispatch page load - while the store kept whatever the previous
 * visit had left behind.
 *
 * So the interesting cases are the timing ones: the table is already there, the table
 * arrives late, the table never arrives. The third must leave the cached copy alone,
 * because an empty ship table is worse than a stale one - the cargo helpers divide by
 * `cargoCapacity`.
 *
 * Page context module - no `chrome: true` on setupBrowser.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const bootstrap = setupBrowser();
const OGBIData = (await import("../../src/store/OGBIData.js")).default;
const { cacheShipData, mapShipsData } = await import("../../src/ctxpage/fleetdispatch/shipData.js");
const { cargoCapacityOf } = await import("../../src/game/shipsData.js");
bootstrap.cleanup();

/**
 * Two rows of OGame's own table, in the shape a live page actually publishes.
 *
 * Taken from the batch captured in `ctxpage/empireOverview/tables.js`: both capacity
 * fields carry the same, already-final number. 7250 and 36250 are OGame's published
 * bases (5000, 25000) times 1.45 - that account's Hyperspace Technology 9 - and the
 * untouched bases are what sits in `baseFuelCapacity` beside them.
 *
 * The fixture this replaced had `baseCargoCapacity: 25000` and no `cargoCapacity`, a
 * shape no page ever serves. That is why the double-counted bonus below went unseen.
 */
const SHIPS_DATA = Object.freeze({
  202: {
    name: "Small Cargo",
    baseCargoCapacity: 7250,
    cargoCapacity: 7250,
    baseFuelCapacity: 5000,
    speed: 5000,
    fuelConsumption: 10,
  },
  203: {
    name: "Large Cargo",
    baseCargoCapacity: 36250,
    cargoCapacity: 36250,
    baseFuelCapacity: 25000,
    speed: 7500,
    fuelConsumption: 50,
  },
});

/** What the previous visit left in the store. */
const CACHED = Object.freeze({
  shipNames: { "Kleiner Transporter": "202" },
  ships: { 202: { name: "Kleiner Transporter", cargoCapacity: 4000, speed: 5000, fuelConsumption: 10 } },
  technology: { 115: 12 },
});

async function withPage(run) {
  const browser = setupBrowser();
  try {
    return await run(browser);
  } finally {
    delete globalThis.fleetDispatcher;
    browser.cleanup();
  }
}

test("the mapping keeps the name-to-id direction the lookups depend on", () => {
  const { shipNames, ships } = mapShipsData(SHIPS_DATA);

  assert.deepEqual(shipNames, { "Small Cargo": "202", "Large Cargo": "203" });
  assert.deepEqual(ships[203], {
    name: "Large Cargo",
    cargoCapacity: 36250,
    speed: 7500,
    fuelConsumption: 50,
  });
});

/**
 * KNOWN BUG fixed: the capacity used to be multiplied by the Hyperspace Technology and
 * Miner bonuses on top of what the game reported - but the game reports them already
 * applied, so both were counted twice.
 *
 * What it cost the player: at Hyperspace 11 a large cargo went into the store at
 * 61 787 instead of 39 863, so "how many cargos for 2 000 000" answered 33 where the
 * real answer was 51, and OGame's own bar went red at -684 521.
 *
 * The tests below therefore pin the opposite of what the old ones did: the number the
 * game publishes is stored verbatim, whatever the player's technology or class.
 */
test("the capacity the game publishes is stored verbatim, bonuses included", () => {
  const { ships } = mapShipsData(SHIPS_DATA);

  assert.equal(ships[203].cargoCapacity, 36250);
  assert.equal(ships[202].cargoCapacity, 7250);
});

test("`cargoCapacity` wins over `baseCargoCapacity` - it is the field the dispatcher sums", () => {
  const { ships } = mapShipsData({
    203: { name: "Large Cargo", baseCargoCapacity: 36250, cargoCapacity: 45312, speed: 7500, fuelConsumption: 50 },
  });

  assert.equal(ships[203].cargoCapacity, 45312);
});

test("a table without `cargoCapacity` falls back to the other field rather than to zero", () => {
  const { ships } = mapShipsData({
    203: { name: "Large Cargo", baseCargoCapacity: 36250, speed: 7500, fuelConsumption: 50 },
  });

  assert.equal(ships[203].cargoCapacity, 36250);
});

test("a fractional capacity is floored, a missing one is zero rather than NaN", () => {
  const { ships } = mapShipsData({
    210: { name: "Espionage Probe", cargoCapacity: 7.25, speed: 100000000, fuelConsumption: 1 },
    217: { name: "Crawler", speed: 0, fuelConsumption: 0 },
  });

  assert.equal(ships[210].cargoCapacity, 7);
  assert.equal(ships[217].cargoCapacity, 0);
});

test("the ship count for a pile of resources matches what OGame's own cargo bar allows", () => {
  // The screenshot case, end to end: 2 000 000 crystal, Hyperspace 11, a large cargo
  // that really holds 39 863. The old double count said 33 and overloaded the fleet.
  const { ships } = mapShipsData({
    203: { name: "Large Cargo", baseCargoCapacity: 39863, cargoCapacity: 39863, speed: 7500, fuelConsumption: 50 },
  });

  assert.equal(Math.ceil(2000000 / ships[203].cargoCapacity), 51);
});

test("cacheShipData stores the technology levels this batch carries", async () => {
  await withPage(async () => {
    OGBIData.json = { ...CACHED };
    globalThis.fleetDispatcher = {
      fleetHelper: { shipsData: SHIPS_DATA },
      apiTechData: [
        [114, 10],
        [115, 15],
      ],
    };

    await cacheShipData({ waitFor: () => Promise.resolve(true) });

    assert.equal(OGBIData.json.technology[114], 10);
    assert.equal(OGBIData.json.technology[115], 15);
    assert.equal(OGBIData.ships[203].cargoCapacity, 36250, "Hyperspace 10 must not be counted a second time");
  });
});

test("apiTechData entries that are array-like but not iterable do not crash the Hyperspace level read", async () => {
  // On a live page each entry supports tech[0]/tech[1] but has no Symbol.iterator - not
  // a real Array. Destructuring one (`[id]`) throws "object is not iterable"; this pins
  // the fix that reads by index instead.
  await withPage(async () => {
    OGBIData.json = { ...CACHED };
    globalThis.fleetDispatcher = {
      fleetHelper: { shipsData: SHIPS_DATA },
      apiTechData: [
        { 0: 114, 1: 10, length: 2 },
        { 0: 115, 1: 15, length: 2 },
      ],
    };

    await cacheShipData({ waitFor: () => Promise.resolve(true) });

    assert.equal(OGBIData.json.technology[114], 10);
  });
});

test("a dispatcher that already carries the table is read without waiting", async () => {
  await withPage(async () => {
    OGBIData.json = { ...CACHED };
    globalThis.fleetDispatcher = { fleetHelper: { shipsData: SHIPS_DATA }, apiTechData: [[115, 15]] };

    const waited = [];
    const found = await cacheShipData({
      waitFor: () => {
        waited.push("polled");
        return Promise.resolve(true);
      },
    });

    assert.equal(found, true);
    assert.deepEqual(waited, [], "the fast path must not poll");
    assert.equal(OGBIData.json.shipNames["Large Cargo"], "203");
    assert.equal(OGBIData.ships[202].cargoCapacity, 7250, "the stale entry was not replaced");
    assert.equal(OGBIData.json.technology[115], 15);
  });
});

test("a table the game publishes late is picked up once it appears", async () => {
  await withPage(async () => {
    OGBIData.json = { ...CACHED };
    // The state the warning was actually reporting: the dispatcher exists, but the
    // game has not put `fleetHelper` on it yet.
    globalThis.fleetDispatcher = { shipsOnPlanet: [{ id: 202, number: 1 }] };

    const found = await cacheShipData({
      waitFor: async (predicate) => {
        assert.equal(predicate(), false, "the table must not be there before the wait");
        globalThis.fleetDispatcher.fleetHelper = { shipsData: SHIPS_DATA };
        globalThis.fleetDispatcher.apiTechData = [[115, 15]];
        assert.equal(predicate(), true);
        return true;
      },
    });

    assert.equal(found, true);
    assert.deepEqual(OGBIData.json.shipNames, { "Small Cargo": "202", "Large Cargo": "203" });
    assert.equal(OGBIData.ships[203].cargoCapacity, 36250);
  });
});

test("a table that never appears leaves the cached one intact", async () => {
  await withPage(async () => {
    OGBIData.json = { ...CACHED };
    globalThis.fleetDispatcher = { shipsOnPlanet: [] };

    const found = await cacheShipData({
      waitFor: () => Promise.reject(new Error("Wait for timeout exception")),
    });

    assert.equal(found, false);
    assert.deepEqual(OGBIData.json.shipNames, CACHED.shipNames, "the cached names were wiped");
    assert.deepEqual(OGBIData.ships, CACHED.ships, "the cached ships were wiped");
  });
});

test("a page with no dispatcher at all does not throw", async () => {
  await withPage(async () => {
    OGBIData.json = { ...CACHED };

    const found = await cacheShipData({
      waitFor: () => Promise.reject(new Error("Wait for timeout exception")),
    });

    assert.equal(found, false);
    assert.deepEqual(OGBIData.ships, CACHED.ships);
  });
});

test("the store is written once, not once per ship", async () => {
  await withPage(async () => {
    OGBIData.json = { ...CACHED };
    globalThis.fleetDispatcher = { fleetHelper: { shipsData: SHIPS_DATA }, apiTechData: [[115, 15]] };

    let writes = 0;
    const real = globalThis.localStorage;
    // Counting through a stand-in rather than patching the jsdom Storage instance:
    // Storage is exotic, and assigning over its methods does not reliably take.
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key) => real.getItem(key),
        removeItem: (key) => real.removeItem(key),
        setItem: (key, value) => {
          if (key === "ogk-data") writes++;
          real.setItem(key, value);
        },
      },
    });

    await cacheShipData({ waitFor: () => Promise.resolve(true) });

    assert.equal(writes, 1, "the ship table must cost one blob write, not one per row");
  });
});

test("an empty table is treated as not there yet, not as an answer", async () => {
  await withPage(async () => {
    OGBIData.json = { ...CACHED };
    // The game builds `fleetHelper` before it fills the table in, and `{}` is truthy.
    // Storing it would wipe the cached ships through the success path.
    globalThis.fleetDispatcher = { fleetHelper: { shipsData: {} } };

    let polled = false;
    const found = await cacheShipData({
      waitFor: async (predicate) => {
        polled = true;
        assert.equal(predicate(), false, "an empty table must not satisfy the wait");
        globalThis.fleetDispatcher.fleetHelper.shipsData = SHIPS_DATA;
        return true;
      },
    });

    assert.equal(polled, true, "the fast path accepted an empty table");
    assert.equal(found, true);
    assert.equal(OGBIData.ships[203].cargoCapacity, 36250);
  });
});

test("a table that stays empty leaves the cached one intact", async () => {
  await withPage(async () => {
    OGBIData.json = { ...CACHED };
    globalThis.fleetDispatcher = { fleetHelper: { shipsData: {} } };

    const found = await cacheShipData({
      waitFor: () => Promise.reject(new Error("Wait for timeout exception")),
    });

    assert.equal(found, false);
    assert.deepEqual(OGBIData.ships, CACHED.ships);
  });
});

test("an unexpected apiTechData shape is caught and logged instead of leaking an uncaught rejection", async () => {
  // cacheShipData() is fired from ogCore.js without await or .catch() on purpose -
  // nothing on the boot path needs the table in the same task. Before this, any throw
  // inside storeShipData (a shape this file has not seen yet) turned into an "Uncaught
  // (in promise)" on every single fleet-dispatch page load instead of a logged warning.
  await withPage(async () => {
    OGBIData.json = { ...CACHED };
    globalThis.fleetDispatcher = {
      fleetHelper: { shipsData: SHIPS_DATA },
      // Not a real Array - .find() does not exist on a plain object, so storeShipData throws.
      apiTechData: { 0: [115, 15] },
    };

    const found = await cacheShipData({ waitFor: () => Promise.resolve(true) });

    assert.equal(found, false, "a throw inside storeShipData must not look like success");
    assert.deepEqual(OGBIData.ships, CACHED.ships, "the previous visit's table is kept, not wiped");
  });
});

/**
 * Reading the cached table from a page that never fills it in.
 *
 * `OGBIData.ships` is written here and nowhere else, and this module only runs on the
 * fleet-dispatch page - so on every other page it is whatever the last visit left, and
 * `{}` until there has been one. Three analyzers read
 * `OGBIData.ships[ship.EspionageProbe].cargoCapacity` straight to find out whether
 * probes carry cargo, which is a TypeError on `{}`; the whole spy table stopped
 * rendering on the messages page of a fresh install.
 */
test("an unknown ship reports no capacity instead of throwing", async () => {
  await withPage(async () => {
    OGBIData.json = { ships: {} };

    assert.equal(cargoCapacityOf(210), 0, "an empty table - a page that has never seen a dispatcher");

    OGBIData.json = { ships: { 210: { name: "Espionage Probe" } } };
    assert.equal(cargoCapacityOf(210), 0, "a row with no capacity field at all");

    OGBIData.json = { ships: { 210: { name: "Espionage Probe", cargoCapacity: 5 } } };
    assert.equal(cargoCapacityOf(210), 5, "and the real number when there is one");
  });
});
