/**
 * The Pantry backup upload.
 *
 * `pantrySync(…, "post")` is the half that leaves the machine, so what it puts in
 * the basket is worth pinning down. It used to read the store as `this?.json?.x`
 * from inside a module-level function: `this` is `undefined` in a strict-mode ES
 * module, the optional chaining swallowed it, and every field of the uploaded
 * object came out `undefined` - which `JSON.stringify` then dropped. The basket
 * held nothing but its own timestamp, and the failure was completely silent: the
 * request succeeded, the toast said "synchronisation complete", and the next
 * device to merge from that basket got nothing.
 *
 * Phase 4 of refactoring.md replaced the alias with `OGBIData.json`. These tests
 * are the behavioural half of that guard; the static half is in
 * `test/util/store-access.test.js`.
 *
 * Page context module - no `chrome: true` on setupBrowser.
 *
 * Compliance note (AGENTS.md 1.9): the upload is player-configured and
 * player-triggered; nothing here makes it automatic.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../../helpers/globals.js";

const bootstrap = setupBrowser();
const OGBIData = (await import("../../../src/util/OGBIData.js")).default;
const { pantrySync } = await import("../../../src/ctxpage/pantry/index.js");
bootstrap.cleanup();

/**
 * The two LZString calls the module makes. The real library is vendored and
 * injected into the page on demand; a round-trippable stand-in is enough here and
 * keeps the assertion about the payload rather than about the compression.
 */
const LZStringStub = {
  compressToUTF16: (input) => `lz:${input}`,
  decompressFromUTF16: (input) => input.replace(/^lz:/, ""),
};

/** The store the upload is supposed to read. */
const SEED = Object.freeze({
  options: { fret: 202, pantryKey: "key" },
  searchHistory: [{ id: 1 }],
  sideStalk: [7],
  myActivities: { "1:2:3": 5 },
  needs: { 1: [0, 0, 0] },
  playerMarkers: { 42: "red" },
  markers: { "1:2:3": { color: "green" } },
  targetTabs: { g: 1, s: 0 },
  missing: { 1: 2 },
  flying: { metal: 10, crystal: 20, deuterium: 30, ids: [] },
  productionProgress: { 1: 3 },
  lfProductionProgress: { 1: 4 },
  researchProgress: { 113: 5 },
  lfResearchProgress: { 1: 6 },
  reminders: { 1: "note" },
  expeditions: { 100: { result: "Metal" } },
  expeditionSums: { "01.01.2026": { found: [1, 2, 3] } },
  combats: { 200: { win: true } },
  combatsSums: { "01.01.2026": { wins: 1 } },
  discoveries: { 300: { result: "artefacts" } },
  discoveriesSums: { "01.01.2026": { count: 1 } },
  harvests: { 400: { coords: "1:2:16" } },
  spies: { 500: { coords: "1:2:3" } },
  notifications: [{ id: "n1" }],
});

/**
 * Runs `pantrySync` in "post" mode against a stubbed network and returns the
 * object that was actually handed to Pantry.
 */
async function uploadedBasket(seed) {
  const browser = setupBrowser({ html: '<div id="links"></div>' });
  const savedFetch = globalThis.fetch;
  let body;
  try {
    OGBIData.json = seed;
    globalThis.LZString = LZStringStub;
    globalThis.fetch = async (_url, init) => {
      body = init.body;
      return { ok: true, status: 200, text: async () => "" };
    };

    await pantrySync({ universe: "1" }, "key", null, "post");
    // The response handler runs in a `.then`, one microtask after the fetch.
    await new Promise((resolve) => setTimeout(resolve, 0));

    return JSON.parse(LZStringStub.decompressFromUTF16(JSON.parse(body).data));
  } finally {
    globalThis.fetch = savedFetch;
    delete globalThis.LZString;
    browser.cleanup();
  }
}

test("the uploaded basket carries the store, not a bag of undefined", async () => {
  const basket = await uploadedBasket({ ...SEED });

  for (const key of ["options", "searchHistory", "markers", "expeditions", "combats", "spies"]) {
    assert.deepEqual(basket[key], SEED[key], `${key} was not uploaded`);
  }
  // Nothing but the timestamp is what the broken version produced.
  assert.ok(Object.keys(basket).length > 1, "basket held only its own timestamp");
});

test("every field the basket declares is filled from the store", async () => {
  const basket = await uploadedBasket({ ...SEED });

  // `sideStargetTabstalk` is a typo in the field name, kept because a rename here
  // would break restores from every basket written so far.
  assert.deepEqual(basket.sideStargetTabstalk, SEED.targetTabs);
  assert.deepEqual(basket.flying, SEED.flying);
  assert.deepEqual(basket.reminders, SEED.reminders);
  assert.deepEqual(basket.notifications, SEED.notifications);
  assert.equal(typeof basket.pantrySync, "number");
});

test("a successful upload records its own timestamp in the store", async () => {
  const browser = setupBrowser({ html: '<div id="links"></div>' });
  const savedFetch = globalThis.fetch;
  try {
    OGBIData.json = { ...SEED, pantrySync: "" };
    globalThis.LZString = LZStringStub;
    let body;
    globalThis.fetch = async (_url, init) => {
      body = init.body;
      return { ok: true, status: 200, text: async () => "" };
    };

    await pantrySync({ universe: "1" }, "key", null, "post");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const sent = JSON.parse(LZStringStub.decompressFromUTF16(JSON.parse(body).data));
    assert.equal(OGBIData.json.pantrySync, sent.pantrySync);
  } finally {
    globalThis.fetch = savedFetch;
    delete globalThis.LZString;
    browser.cleanup();
  }
});
