/**
 * Construction-time behaviour of the OGBIData singleton.
 *
 * Kept in its own file on purpose: these tests need a freshly evaluated module,
 * and `importFresh()` loads it under a cache-busting URL. Node's coverage
 * reporter merges every URL for a path into one row and keeps the last one it
 * sees, so mixing fresh imports with the accessor tests in `OGBIData.test.js`
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
    const fresh = (await importFresh("src/util/OGBIData.js")).default;

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
    const fresh = (await importFresh("src/util/OGBIData.js")).default;

    assert.equal(fresh.playerId, 4711);
    assert.deepEqual(fresh.options, { fret: 203 });
  } finally {
    browser.cleanup();
  }
});

test("a fresh instance sees what a previous one persisted", async () => {
  const browser = setupBrowser();
  try {
    const first = (await importFresh("src/util/OGBIData.js")).default;
    first.technology = { 1: 20, 2: 18 };

    const second = (await importFresh("src/util/OGBIData.js")).default;
    assert.deepEqual(second.technology, { 1: 20, 2: 18 });
  } finally {
    browser.cleanup();
  }
});

test("corrupt localStorage content starts an empty store instead of crashing", async () => {
  // This used to be a KNOWN BUG: the constructor called JSON.parse() without a
  // try/catch, so one truncated write took the whole page context down at module
  // evaluation - before any feature existed to recover from it.
  // The failure is not asserted through the log: util/logger.js captures
  // `console.error` at module evaluation, so swapping it out afterwards observes
  // nothing. The backup key written in the same catch block is the durable evidence
  // that the guard ran, and it is asserted in the next test.
  const browser = setupBrowser();
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, "{not json");

    const data = (await importFresh("src/util/OGBIData.js")).default;

    assert.deepEqual(data.json, {}, "it starts empty rather than throwing");
  } finally {
    browser.cleanup();
  }
});

test("the unreadable value is moved aside, not overwritten", async () => {
  // ogk-data is the user's whole history. Starting empty costs the session; letting
  // the next setter write `{}` over the damaged blob would cost the account, so the
  // raw value is kept under its own key for recovery.
  const browser = setupBrowser();
  const originalError = console.error;
  console.error = () => {};
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, "{not json");

    const data = (await importFresh("src/util/OGBIData.js")).default;
    data.technology = { 1: 1 }; // any setter, to force a write-through

    assert.equal(globalThis.localStorage.getItem("ogk-data-corrupt"), "{not json");
    assert.equal(globalThis.localStorage.getItem(STORAGE_KEY), JSON.stringify({ technology: { 1: 1 } }));
  } finally {
    console.error = originalError;
    browser.cleanup();
  }
});

test("an empty or absent ogk-data is not treated as corrupt", async () => {
  const browser = setupBrowser();
  try {
    const data = (await importFresh("src/util/OGBIData.js")).default;

    assert.deepEqual(data.json, {});
    assert.equal(globalThis.localStorage.getItem("ogk-data-corrupt"), null, "nothing was backed up");
  } finally {
    browser.cleanup();
  }
});
