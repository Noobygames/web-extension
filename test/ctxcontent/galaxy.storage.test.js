/**
 * Galaxy storage (PR #533): a coordinate-indexed snapshot of the universe kept
 * in its own `ogi-galaxy-<UNIVERSE>` key, so the hot writes never drag the big
 * `[UNIVERSE]` blob along.
 *
 * DataHelper runs in the content context, so `setupBrowser({ chrome: true })`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser, importFresh } from "../helpers/globals.js";

/** Minimal stand-in for what update() caches on `_galaxySnapshot`. */
function snapshot(timestamp, planets) {
  return { timestamp, planetList: planets };
}

async function withHelper(run) {
  const browser = setupBrowser({ chrome: true });
  // data-helper.js measures the rebuild with performance.now()
  if (typeof globalThis.performance === "undefined") {
    globalThis.performance = { now: () => 0 };
  }
  try {
    const { DataHelper } = await importFresh("src/ctxcontent/data-helper.js");
    const helper = new DataHelper("s101-en");
    helper.galaxyStorage = {};
    helper.lastGalaxyUpdateTS = -1;
    await run(helper, browser.chrome);
  } finally {
    browser.cleanup();
  }
}

test("the rebuild indexes planets by galaxy > system > position", async () => {
  await withHelper(async (helper) => {
    helper._galaxySnapshot = snapshot(1700000000, [
      { id: 33701001, player: 101, coords: "1:2:3", moon: 33801001 },
      { id: 33701002, player: 102, coords: "1:2:5", moon: 0 },
    ]);

    helper.rebuildGalaxyStorage("a-ptre-key");

    // No per-slot `ts`: the whole snapshot shares one timestamp, kept in
    // lastGalaxyUpdateTS. scan() diffs slots by value, not by age (PR #531).
    assert.deepEqual(helper.galaxyStorage["1"]["2"]["3"], {
      playerId: 101,
      planetId: 33701001,
      moonId: 33801001,
    });
    assert.equal(helper.galaxyStorage["1"]["2"]["5"].playerId, 102);
    assert.equal(helper.galaxyStorage["1"]["2"]["5"].moonId, -1, "a planet without a moon stores -1");
  });
});

test("every one of the 15 slots of a touched system is materialised", async () => {
  await withHelper(async (helper) => {
    helper._galaxySnapshot = snapshot(1700000000, [{ id: 1, player: 101, coords: "1:2:3", moon: 0 }]);

    helper.rebuildGalaxyStorage("a-ptre-key");

    const system = helper.galaxyStorage["1"]["2"];
    assert.deepEqual(Object.keys(system).sort((a, b) => a - b).length, 15);
    // -1 rather than a missing key: slot presence is what makes "this position
    // is empty" distinguishable from "this position was never scanned"
    assert.deepEqual(system["4"], { playerId: -1, planetId: -1, moonId: -1 });
  });
});

test("a system nobody occupies is not materialised at all", async () => {
  await withHelper(async (helper) => {
    helper._galaxySnapshot = snapshot(1700000000, [{ id: 1, player: 101, coords: "1:2:3", moon: 0 }]);

    helper.rebuildGalaxyStorage("a-ptre-key");

    assert.equal(helper.galaxyStorage["1"]["3"], undefined);
  });
});

test("the rebuild is skipped without a PTRE key", async () => {
  await withHelper(async (helper) => {
    helper._galaxySnapshot = snapshot(1700000000, [{ id: 1, player: 101, coords: "1:2:3", moon: 0 }]);

    helper.rebuildGalaxyStorage("");

    assert.deepEqual(helper.galaxyStorage, {});
    assert.equal(helper.lastGalaxyUpdateTS, -1);
  });
});

test("the rebuild is skipped when no snapshot has been cached", async () => {
  await withHelper(async (helper) => {
    helper._galaxySnapshot = null;

    helper.rebuildGalaxyStorage("a-ptre-key");

    assert.deepEqual(helper.galaxyStorage, {});
  });
});

test("a snapshot no newer than the persisted state does not rebuild", async () => {
  await withHelper(async (helper) => {
    helper.lastGalaxyUpdateTS = 1700000000;
    helper.galaxyStorage = { kept: true };
    helper._galaxySnapshot = snapshot(1700000000, [{ id: 1, player: 101, coords: "1:2:3", moon: 0 }]);

    helper.rebuildGalaxyStorage("a-ptre-key");

    assert.deepEqual(helper.galaxyStorage, { kept: true }, "an equal timestamp must not trigger a rebuild");
  });
});

test("a malformed coordinate is dropped instead of poisoning the index", async () => {
  await withHelper(async (helper) => {
    helper._galaxySnapshot = snapshot(1700000000, [
      { id: 1, player: 101, coords: "1:2", moon: 0 },
      { id: 2, player: 101, coords: undefined, moon: 0 },
      { id: 3, player: 101, coords: "1:2:3", moon: 0 },
    ]);

    helper.rebuildGalaxyStorage("a-ptre-key");

    assert.deepEqual(Object.keys(helper.galaxyStorage), ["1"]);
    assert.equal(helper.galaxyStorage["1"]["2"]["3"].planetId, 3);
  });
});

test("the rebuild flushes into its own key, not into the universe blob", async () => {
  await withHelper(async (helper, chrome) => {
    helper._galaxySnapshot = snapshot(1700000000, [{ id: 1, player: 101, coords: "1:2:3", moon: 0 }]);

    helper.rebuildGalaxyStorage("a-ptre-key");

    assert.deepEqual([...chrome._store.keys()], ["ogi-galaxy-s101-en"]);
    const persisted = JSON.parse(chrome._store.get("ogi-galaxy-s101-en"));
    assert.equal(persisted.lastGalaxyUpdateTS, 1700000000);
    assert.equal(persisted.galaxyStorage["1"]["2"]["3"].planetId, 1);
  });
});

test("a debounced flush collapses repeated calls into a single write", async () => {
  await withHelper(async (helper, chrome) => {
    helper.galaxyStorage = { 1: { 2: {} } };
    helper.lastGalaxyUpdateTS = 5;

    helper.scheduleGalaxyStorageFlush(5);
    helper.scheduleGalaxyStorageFlush(5);
    helper.scheduleGalaxyStorageFlush(5);

    assert.equal(chrome._store.size, 0, "nothing is written before the delay elapses");

    await new Promise((resolve) => setTimeout(resolve, 30));

    assert.equal(chrome._store.size, 1);
    assert.equal(helper._galaxyFlushTimer, null, "the timer id must be cleared so it never gets persisted");
  });
});

test("an immediate flush cancels a pending debounced one", async () => {
  await withHelper(async (helper) => {
    helper.scheduleGalaxyStorageFlush(1000);
    assert.ok(helper._galaxyFlushTimer);

    helper.flushGalaxyStorage();

    assert.equal(helper._galaxyFlushTimer, null);
  });
});
