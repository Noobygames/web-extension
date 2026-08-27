/**
 * Content-context storage: per-universe keys in chrome.storage.local, with
 * Map/Set support layered on top through util/json.js.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser, importFresh } from "../helpers/globals.js";

async function withStorage(run) {
  const browser = setupBrowser({ chrome: true });
  try {
    const module = await importFresh("src/ctxcontent/services/universe.storage.js");
    await run(module, browser.chrome);
  } finally {
    browser.cleanup();
  }
}

test("the storage key is namespaced by universe and key", async () => {
  await withStorage(async ({ universeStorageOperator }, chrome) => {
    await universeStorageOperator("s101-en", "players")({ ok: true });

    assert.deepEqual([...chrome._store.keys()], ["s101-en-players-information"]);
  });
});

test("two universes never share a slot", async () => {
  await withStorage(async ({ universeStorageOperator, universeStorageSupplier }, chrome) => {
    await universeStorageOperator("s101-en", "players")({ from: "en" });
    await universeStorageOperator("s205-de", "players")({ from: "de" });

    assert.equal(chrome._store.size, 2);
    assert.deepEqual(await universeStorageSupplier("s101-en", "players")(), { from: "en" });
    assert.deepEqual(await universeStorageSupplier("s205-de", "players")(), { from: "de" });
  });
});

test("two keys in the same universe never share a slot", async () => {
  await withStorage(async ({ universeStorageOperator, universeStorageSupplier }, chrome) => {
    await universeStorageOperator("s101-en", "players")([1]);
    await universeStorageOperator("s101-en", "alliances")([2]);

    assert.equal(chrome._store.size, 2);
    assert.deepEqual(await universeStorageSupplier("s101-en", "players")(), [1]);
    assert.deepEqual(await universeStorageSupplier("s101-en", "alliances")(), [2]);
  });
});

test("the operator returns its input so it can sit inside a promise chain", async () => {
  await withStorage(async ({ universeStorageOperator }) => {
    const payload = { players: 3 };
    const returned = await Promise.resolve(payload).then(universeStorageOperator("s101-en", "players"));

    assert.equal(returned, payload, "must hand the same reference back to the next .then()");
  });
});

test("the supplier resolves undefined for a key that was never written", async () => {
  await withStorage(async ({ universeStorageSupplier }) => {
    assert.equal(await universeStorageSupplier("s101-en", "never-written")(), undefined);
  });
});

test("a Map survives the round-trip", async () => {
  await withStorage(async ({ universeStorageOperator, universeStorageSupplier }, chrome) => {
    const players = new Map([
      [101, { name: "Xtro" }],
      [102, { name: "bfromb" }],
    ]);

    await universeStorageOperator("s101-en", "players")(players);

    // What actually lands in chrome.storage must be a structured-clone-safe
    // plain object - a Map would be dropped by the real API.
    const raw = chrome._store.get("s101-en-players-information");
    assert.ok(!(raw instanceof Map));
    assert.equal(raw["@DT"], "map");

    const restored = await universeStorageSupplier("s101-en", "players")();
    assert.ok(restored instanceof Map);
    assert.deepEqual(restored.get(101), { name: "Xtro" });
    assert.equal(restored.size, 2);
  });
});

test("a Set survives the round-trip", async () => {
  await withStorage(async ({ universeStorageOperator, universeStorageSupplier }) => {
    await universeStorageOperator("s101-en", "scanned")(new Set(["1:2:3", "4:5:6"]));

    const restored = await universeStorageSupplier("s101-en", "scanned")();
    assert.ok(restored instanceof Set);
    assert.deepEqual([...restored], ["1:2:3", "4:5:6"]);
  });
});

test("nested Maps inside plain objects survive the round-trip", async () => {
  await withStorage(async ({ universeStorageOperator, universeStorageSupplier }) => {
    await universeStorageOperator(
      "s101-en",
      "galaxy"
    )({
      byCoord: new Map([["1:2:3", new Set([7])]]),
      timestamp: 1700000000,
    });

    const restored = await universeStorageSupplier("s101-en", "galaxy")();
    assert.ok(restored.byCoord instanceof Map);
    assert.ok(restored.byCoord.get("1:2:3") instanceof Set);
    assert.equal(restored.timestamp, 1700000000);
  });
});

test("writing the same key twice overwrites rather than accumulating", async () => {
  await withStorage(async ({ universeStorageOperator, universeStorageSupplier }, chrome) => {
    const write = universeStorageOperator("s101-en", "players");
    await write({ generation: 1 });
    await write({ generation: 2 });

    assert.equal(chrome._store.size, 1);
    assert.deepEqual(await universeStorageSupplier("s101-en", "players")(), { generation: 2 });
  });
});

test("falsy payloads are stored and read back faithfully", async () => {
  await withStorage(async ({ universeStorageOperator, universeStorageSupplier }) => {
    for (const value of [0, "", false, null]) {
      await universeStorageOperator("s101-en", "flag")(value);
      assert.deepEqual(await universeStorageSupplier("s101-en", "flag")(), value, `value ${JSON.stringify(value)}`);
    }
  });
});
