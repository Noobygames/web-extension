/**
 * calcNeededShips: how many cargos are needed to move a pile of resources.
 *
 * Written to pin the existing behaviour before optimising the function, so the rewrite is
 * provably equivalent. It runs in the page context (it reads OGIData and the resource bar),
 * so the browser harness gets no `chrome`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser, importFresh, LOCALIZATION_EN } from "../helpers/globals.js";

// The import lives inside withPage() because OgamePageData reads <meta> at import time. The
// stored data is then seeded through the OGIData singleton rather than into localStorage
// directly: the singleton snapshots localStorage once when it is constructed, and production
// code likewise always goes through it.

const SHIPS = {
  202: { name: "Small Cargo", cargoCapacity: 5000 },
  203: { name: "Large Cargo", cargoCapacity: 25000 },
  219: { name: "Pathfinder", cargoCapacity: 10000 },
};

/**
 * @param {object} params
 * @param {object} [params.json]      what ogk-data holds
 * @param {number[]} [params.onPage]  metal/crystal/deuterium shown in the resource bar
 * The callback receives calcNeededShips.
 */
async function withPage({ json = {}, onPage = [0, 0, 0] }, run) {
  const browser = setupBrowser({ localization: LOCALIZATION_EN });

  const stored = { options: { fret: 203 }, ships: SHIPS, ...json };

  const [metal, crystal, deuterium] = onPage;
  globalThis.document.body.innerHTML = `
    <span id="resources_metal">${metal}</span>
    <span id="resources_crystal">${crystal}</span>
    <span id="resources_deuterium">${deuterium}</span>`;

  try {
    const { calcNeededShips } = await importFresh("src/util/calcNeededShips.js");
    const OGIData = (await import("../../src/util/OGIData.js")).default;
    OGIData.json = stored;

    await run(calcNeededShips);
  } finally {
    browser.cleanup();
  }
}

test("an explicit resource amount is divided by the ship's capacity", async () => {
  await withPage({}, (calcNeededShips) => {
    assert.equal(calcNeededShips({ fret: 203, resources: 50000 }), 2);
    assert.equal(calcNeededShips({ fret: 202, resources: 50000 }), 10);
  });
});

test("a partial ship is rounded up, because it still has to fly", async () => {
  await withPage({}, (calcNeededShips) => {
    assert.equal(calcNeededShips({ fret: 203, resources: 25001 }), 2);
    assert.equal(calcNeededShips({ fret: 203, resources: 1 }), 1);
  });
});

test("no resources needs no ships", async () => {
  await withPage({}, (calcNeededShips) => {
    assert.equal(calcNeededShips({ fret: 203, resources: 0 }), 0);
  });
});

test("without an explicit amount the resource bar is used", async () => {
  await withPage({ onPage: [30000, 15000, 5000] }, (calcNeededShips) => {
    // 50000 total over a 25000 large cargo
    assert.equal(calcNeededShips({ fret: 203 }), 2);
  });
});

test("the stored default cargo is used when no fret is given", async () => {
  await withPage({ json: { options: { fret: 202 }, ships: SHIPS } }, (calcNeededShips) => {
    assert.equal(calcNeededShips({ resources: 50000 }), 10);
  });
});

test("moreFret adds the 7% margin", async () => {
  await withPage({}, (calcNeededShips) => {
    // 50000 * 1.07 = 53500, over 25000 => 3 ships
    assert.equal(calcNeededShips({ fret: 203, resources: 50000, moreFret: true }), 3);
  });
});

test("no options at all falls back to the stored default and the resource bar", async () => {
  await withPage({ onPage: [25000, 0, 0] }, (calcNeededShips) => {
    assert.equal(calcNeededShips(), 1);
  });
});

test("formatted resource-bar values are parsed, not read as raw digits", async () => {
  await withPage({ onPage: ["1,000,000", 0, 0] }, (calcNeededShips) => {
    assert.equal(calcNeededShips({ fret: 203 }), 40);
  });
});

test("an explicit amount does not require the resource bar to exist", async () => {
  await withPage({}, (calcNeededShips) => {
    // the harvest and expedition paths always pass `resources`, and can run on pages
    // that have no resource bar at all
    globalThis.document.body.innerHTML = "";

    assert.equal(calcNeededShips({ fret: 203, resources: 50000 }), 2);
  });
});
