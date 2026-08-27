/**
 * Construction-time behaviour of the OGIData singleton.
 *
 * Kept in its own file on purpose: these tests need a freshly evaluated module,
 * and `importFresh()` loads it under a cache-busting URL. Node's coverage
 * reporter merges every URL for a path into one row and keeps the last one it
 * sees, so mixing fresh imports with the accessor tests in `OGIData.test.js`
 * would report that file as barely covered. Test files run in separate
 * processes, so splitting them keeps both suites and the report honest.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser, importFresh } from "../helpers/globals.js";

const STORAGE_KEY = "ogk-data";

test("an empty localStorage yields an empty object, not a crash", async () => {
  const browser = setupBrowser();
  try {
    const fresh = (await importFresh("src/util/OGIData.js")).default;

    assert.deepEqual(fresh.json, {});
    assert.equal(fresh.options, undefined);
  } finally {
    browser.cleanup();
  }
});

test("existing data is loaded on construction", async () => {
  const browser = setupBrowser();
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify({ playerId: 4711, options: { fret: 203 } }));
    const fresh = (await importFresh("src/util/OGIData.js")).default;

    assert.equal(fresh.playerId, 4711);
    assert.deepEqual(fresh.options, { fret: 203 });
  } finally {
    browser.cleanup();
  }
});

test("a fresh instance sees what a previous one persisted", async () => {
  const browser = setupBrowser();
  try {
    const first = (await importFresh("src/util/OGIData.js")).default;
    first.technology = { 1: 20, 2: 18 };

    const second = (await importFresh("src/util/OGIData.js")).default;
    assert.deepEqual(second.technology, { 1: 20, 2: 18 });
  } finally {
    browser.cleanup();
  }
});

test("KNOWN BUG: corrupt localStorage content crashes on import", async () => {
  // The constructor calls JSON.parse() without a try/catch. A truncated or
  // hand-edited ogk-data value takes the whole page context down at import
  // time, before any feature has a chance to recover.
  const browser = setupBrowser();
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, "{not json");
    await assert.rejects(() => importFresh("src/util/OGIData.js"), SyntaxError);
  } finally {
    browser.cleanup();
  }
});
