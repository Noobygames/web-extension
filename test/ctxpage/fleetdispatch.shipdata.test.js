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
const PlayerClass = (await import("../../src/game/playerClass.js")).default;
bootstrap.cleanup();

/** Two rows of OGame's own table, in the shape the game publishes. */
const SHIPS_DATA = Object.freeze({
  202: { name: "Small Cargo", baseCargoCapacity: 5000, speed: 5000, fuelConsumption: 10 },
  203: { name: "Large Cargo", baseCargoCapacity: 25000, speed: 7500, fuelConsumption: 50 },
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
    cargoCapacity: 25000,
    speed: 7500,
    fuelConsumption: 50,
  });
});

/**
 * The bug this section covers: `cargoCapacity` used to be stored as
 * `baseCargoCapacity` verbatim, so every cargo suggestion in the extension read low
 * for any player with Hyperspace Technology or the Miner class - which is most
 * players, not an edge case.
 *
 * `cargoHyperspaceTechMultiplier` is a percent-per-level integer on a live
 * serverData.xml (`5`, meaning 5% per level), while
 * `minerBonusIncreasedCargoCapacityForTradingShips` is already a fraction (`0.25`).
 * The two tests below pin that each is applied on its own scale, not both the same way.
 */
test("Hyperspace Technology raises cargo capacity by a percentage per level", () => {
  const { ships } = mapShipsData(SHIPS_DATA, { hyperspaceTechLevel: 10, cargoHyperspaceTechMultiplier: 5 });

  // 25000 * (1 + 10 * 5 / 100) = 37500
  assert.equal(ships[203].cargoCapacity, 37500);
  assert.equal(ships[202].cargoCapacity, 7500);
});

test("the Miner cargo bonus is a fraction applied as-is, not divided by 100", () => {
  const { ships } = mapShipsData(SHIPS_DATA, { playerClass: PlayerClass.MINER, minerCargoBonus: 0.25 });

  assert.equal(ships[203].cargoCapacity, 31250);
});

test("the Miner cargo bonus only applies to trading ships, not every ship", () => {
  const shipsData = {
    ...SHIPS_DATA,
    219: { name: "Pathfinder", baseCargoCapacity: 10000, speed: 12000, fuelConsumption: 300 },
  };
  const { ships } = mapShipsData(shipsData, { playerClass: PlayerClass.MINER, minerCargoBonus: 0.25 });

  assert.equal(ships[219].cargoCapacity, 10000);
});

test("a non-Miner class never gets the trading-ship cargo bonus", () => {
  const { ships } = mapShipsData(SHIPS_DATA, { playerClass: PlayerClass.WARRIOR, minerCargoBonus: 0.25 });

  assert.equal(ships[203].cargoCapacity, 25000);
});

test("both bonuses stack, floored once at the end", () => {
  const { ships } = mapShipsData(SHIPS_DATA, {
    hyperspaceTechLevel: 10,
    cargoHyperspaceTechMultiplier: 5,
    playerClass: PlayerClass.MINER,
    minerCargoBonus: 0.25,
  });

  // 25000 * 1.5 * 1.25 = 46875
  assert.equal(ships[203].cargoCapacity, 46875);
});

test("cacheShipData reads the Hyperspace Technology level out of this batch's apiTechData", async () => {
  await withPage(async () => {
    OGBIData.json = { ...CACHED, cargoHyperspaceTechMultiplier: 5 };
    globalThis.fleetDispatcher = {
      fleetHelper: { shipsData: SHIPS_DATA },
      apiTechData: [
        [114, 10],
        [115, 15],
      ],
    };

    await cacheShipData({ waitFor: () => Promise.resolve(true) });

    assert.equal(OGBIData.ships[203].cargoCapacity, 37500);
  });
});

test("cacheShipData applies the Miner trading-ship bonus when told the player is Miner", async () => {
  await withPage(async () => {
    OGBIData.json = {
      ...CACHED,
      trashsimSettings: { minerBonusIncreasedCargoCapacityForTradingShips: "0.25" },
    };
    globalThis.fleetDispatcher = { fleetHelper: { shipsData: SHIPS_DATA }, apiTechData: [[115, 15]] };

    await cacheShipData({ waitFor: () => Promise.resolve(true), playerClass: PlayerClass.MINER });

    assert.equal(OGBIData.ships[203].cargoCapacity, 31250);
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
    assert.equal(OGBIData.ships[202].cargoCapacity, 5000, "the stale entry was not replaced");
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
    assert.equal(OGBIData.ships[203].cargoCapacity, 25000);
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
    assert.equal(OGBIData.ships[203].cargoCapacity, 25000);
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
