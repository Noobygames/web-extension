/**
 * The lock icons on the planet bar, and the field they used to fight over with
 * `eventBox()` (ctxpage/eventbox).
 *
 * Both modules used to write `OGBIData.json.flying`: `eventBox()` needs its own
 * write there to survive untouched from page load until its own diff runs once,
 * because that diff is how an own fleet's cargo gets credited on arrival. `display()`
 * here ran first, on every page load, and overwrote the same field with a same-page
 * snapshot before `eventBox()` ever compared - so the diff always found "no change"
 * and arrivals stopped being credited. Phase 6 of refactoring.md gave `display()`
 * its own local snapshot instead, so `OGBIData.json.flying` is only ever written by
 * `eventBox()`.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const flyingFixture = {
  ids: [],
  planets: {
    "1:2:3": {
      planet: { metal: 500, crystal: 0, deuterium: 0 },
      moon: { metal: 0, crystal: 0, deuterium: 0 },
    },
  },
};

mock.module(new URL("../../src/ogame/fleetMovements.js", import.meta.url).href, { defaultExport: () => flyingFixture });

// needs.js reads `document` at import time (it registers a MutationObserver on
// #eventboxContent immediately unless the document is still loading), and
// OGBIData reads `localStorage` in its constructor - both need a browser up
// before the static imports below run.
const bootstrap = setupBrowser({
  html: `
    <div id="eventboxLoading" style="display: none;"></div>
    <div id="eventboxContent"></div>
  `,
});
const OGBIData = (await import("../../src/store/OGBIData.js")).default;
const needsUtil = await import("../../src/ctxpage/planetbar/needs.js");
bootstrap.cleanup();

test("display() leaves OGBIData.json.flying alone", () => {
  const browser = setupBrowser({
    html: `
      <div id="eventboxLoading" style="display: none;"></div>
      <div id="eventboxContent"></div>
    `,
  });

  try {
    // Stands in for what eventBox() would have persisted from a previous
    // navigation - the exact baseline its own arrival diff depends on.
    const persistedFromLastPage = { ids: ["sentinel"], planets: {} };
    OGBIData.json.flying = persistedFromLastPage;

    needsUtil.display();

    assert.equal(OGBIData.json.flying, persistedFromLastPage, "display() must not touch the persisted field");
  } finally {
    browser.cleanup();
  }
});

test("getNeedsByCoords still nets the fresh flying cargo, just not off the persisted field", () => {
  const browser = setupBrowser({
    html: `
      <div id="eventboxLoading" style="display: none;"></div>
      <div id="eventboxContent"></div>
    `,
  });

  try {
    OGBIData.json.flying = { ids: ["stale, from before display() ran"], planets: {} };
    OGBIData.empire = [{ id: 1, coordinates: "[1:2:3]", metal: 100, crystal: 0, deuterium: 0 }];

    needsUtil.lock("1:2:3", false, { metal: 1000, crystal: 0, deuterium: 0 });
    needsUtil.display();

    const result = needsUtil.getNeedsByCoords("1:2:3", false);

    // 1000 needed, 100 already on the planet, 500 already in flight per the fixture
    // above - none of it read off the stale, untouched OGBIData.json.flying.
    assert.deepEqual(result, { metal: 400, crystal: 0, deuterium: 0 });
  } finally {
    browser.cleanup();
  }
});
