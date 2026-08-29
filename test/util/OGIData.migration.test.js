/**
 * The one-time migration from a single `ogk-data` blob to the hot/cold split
 * (refactoring-new.md Phase C).
 *
 * Kept apart from OGIData.construction.test.js: those tests all seed hot-only
 * blobs (no cold fields), so the migration branch there is always a no-op - this
 * file is what actually exercises it, including the "abort mid-write" path the
 * phase's exit criterion calls for explicitly.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser, importFresh } from "../helpers/globals.js";

const HOT_KEY = "ogk-data";
const COLD_KEY = "ogk-history";

test("a pre-split blob has its cold fields pulled into ogk-history", async () => {
  const browser = setupBrowser();
  try {
    const legacyBlob = {
      playerId: 42,
      options: { fret: 1 },
      spies: { 1: { foo: "bar" } },
      expeditions: { 1: {} },
    };
    globalThis.localStorage.setItem(HOT_KEY, JSON.stringify(legacyBlob));

    const data = (await importFresh("src/store/OGBIData.js")).default;

    // In memory, nothing about reading it changed.
    assert.equal(data.playerId, 42);
    assert.deepEqual(data.options, { fret: 1 });
    assert.deepEqual(data.spies, { 1: { foo: "bar" } });
    assert.deepEqual(data.expeditions, { 1: {} });

    // On disk, the two halves are now separate.
    assert.deepEqual(JSON.parse(globalThis.localStorage.getItem(COLD_KEY)), {
      spies: { 1: { foo: "bar" } },
      expeditions: { 1: {} },
    });
    assert.deepEqual(JSON.parse(globalThis.localStorage.getItem(HOT_KEY)), {
      playerId: 42,
      options: { fret: 1 },
    });
  } finally {
    browser.cleanup();
  }
});

test("a blob with no cold fields triggers no migration write", async () => {
  const browser = setupBrowser();
  try {
    globalThis.localStorage.setItem(HOT_KEY, JSON.stringify({ playerId: 1 }));

    (await importFresh("src/store/OGBIData.js")).default;

    assert.equal(globalThis.localStorage.getItem(COLD_KEY), null, "nothing to split, nothing written");
  } finally {
    browser.cleanup();
  }
});

test("once ogk-history exists, migration never runs again", async () => {
  const browser = setupBrowser();
  try {
    // A blob that still happens to carry a cold-named field, but ogk-history
    // already exists - the split already ran, so this must be left exactly as is
    // rather than re-migrated (e.g. re-migrating an intentionally emptied field).
    globalThis.localStorage.setItem(HOT_KEY, JSON.stringify({ playerId: 1, spies: { 1: {} } }));
    globalThis.localStorage.setItem(COLD_KEY, JSON.stringify({}));

    const data = (await importFresh("src/store/OGBIData.js")).default;

    assert.equal(data.spies, undefined, "spies lives in ogk-history now; the leftover hot copy is not read");
    assert.deepEqual(JSON.parse(globalThis.localStorage.getItem(HOT_KEY)), { playerId: 1, spies: { 1: {} } });
  } finally {
    browser.cleanup();
  }
});

test("a migration failure leaves ogk-data untouched", async () => {
  const browser = setupBrowser();
  const originalError = console.error;
  console.error = () => {};
  try {
    const legacyBlob = { playerId: 7, spies: { 1: {} } };
    const legacyRaw = JSON.stringify(legacyBlob);
    globalThis.localStorage.setItem(HOT_KEY, legacyRaw);

    // jsdom's Storage is Proxy-backed and treats `localStorage.setItem = fn` as
    // writing a storage entry literally named "setItem", not a method override -
    // the prototype is the only place a patch actually intercepts real calls.
    const proto = Object.getPrototypeOf(globalThis.localStorage);
    const originalSetItem = proto.setItem;
    proto.setItem = function (key, value) {
      if (key === HOT_KEY) throw new Error("quota exceeded (simulated)");
      return originalSetItem.call(this, key, value);
    };

    let data;
    try {
      data = (await importFresh("src/store/OGBIData.js")).default;
    } finally {
      proto.setItem = originalSetItem;
    }

    // Disk: ogk-data is exactly the blob it was before construction - the write
    // that would have trimmed it threw before completing.
    assert.equal(globalThis.localStorage.getItem(HOT_KEY), legacyRaw);

    // Memory: this session still behaves as if the split happened, so features
    // work immediately instead of waiting on a successful retry on a later load.
    assert.equal(data.playerId, 7);
    assert.deepEqual(data.spies, { 1: {} });
  } finally {
    console.error = originalError;
    browser.cleanup();
  }
});
