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

/**
 * The lock icons themselves: `lock()`, `append()`, `displayLocksByCoords()` and the
 * icon/tooltip/delete machinery in `displayLocks()` / `createLockIcon()`.
 *
 * `needs` (the module-level cache `lock()`/`append()` write through to
 * `OGBIData.needs`) is private and never reset between tests in this file, so each
 * test below uses its own planet id / coordinate pair to stay independent of every
 * other test's leftover state - the same reason `getPlanetByCoords()` and
 * `getNeedsByCoords()` guard every lookup with a null check instead of assuming the
 * coordinate exists.
 *
 * `#planetList` is nested inside `#norm` in every fixture below because
 * `displayLocks()` looks for the bulk "remove all" buttons' anchor
 * (`div#cutty`/`div#norm`) as an ancestor of the icons it just appended to
 * `#planetList` - real OGame markup nests the planet list inside that sidebar
 * wrapper the same way.
 */

test("lock() adds an unfilled planet-level lock icon and the bulk-delete buttons", () => {
  const browser = setupBrowser({
    html: `<div id="norm"><div id="planetList"><div id="planet-101"></div></div></div>`,
  });

  try {
    OGBIData.empire = [{ id: 101, coordinates: "[10:20:30]", metal: 200, crystal: 0, deuterium: 0 }];

    needsUtil.lock("10:20:30", false, { metal: 1000, crystal: 0, deuterium: 0 });

    const icon = document.querySelector("#planet-101 .ogl-sideLock");
    assert.ok(icon, "a lock icon is added to the planet row");
    assert.equal(icon.classList.contains("ogl-moonLock"), false);
    assert.equal(icon.classList.contains("ogl-sideLockFilled"), false, "800 metal is still missing");
    assert.ok(document.querySelector("#norm .ogl-sideLockRemove"), "the bulk-delete buttons appear once a lock exists");
  } finally {
    browser.cleanup();
  }
});

test("lock() on a moon adds the moon variant of the icon, keyed by the parent planet id", () => {
  const browser = setupBrowser({
    html: `<div id="norm"><div id="planetList"><div id="planet-102"></div></div></div>`,
  });

  try {
    // OGame's own moon objects carry `planetID` pointing back at the parent planet,
    // not a distinct id of their own - that is the key append()/displayLocks() share.
    OGBIData.empire = [
      {
        id: 102,
        coordinates: "[11:21:31]",
        metal: 0,
        crystal: 0,
        deuterium: 0,
        moon: { planetID: 102, coordinates: "[11:21:31]", metal: 50, crystal: 0, deuterium: 0 },
      },
    ];

    needsUtil.lock("11:21:31", true, { metal: 300, crystal: 0, deuterium: 0 });

    const icon = document.querySelector("#planet-102 .ogl-sideLock");
    assert.ok(icon);
    assert.ok(icon.classList.contains("ogl-moonLock"));
  } finally {
    browser.cleanup();
  }
});

test("a fully met need is marked filled", () => {
  const browser = setupBrowser({
    html: `<div id="norm"><div id="planetList"><div id="planet-103"></div></div></div>`,
  });

  try {
    OGBIData.empire = [{ id: 103, coordinates: "[12:22:32]", metal: 100, crystal: 0, deuterium: 0 }];

    needsUtil.lock("12:22:32", false, { metal: 100, crystal: 0, deuterium: 0 });

    const icon = document.querySelector("#planet-103 .ogl-sideLock");
    assert.ok(icon.classList.contains("ogl-sideLockFilled"));
  } finally {
    browser.cleanup();
  }
});

test("hovering the icon shows the missing amounts, and its delete button clears just that need", () => {
  const browser = setupBrowser({
    html: `<div id="norm"><div id="planetList"><div id="planet-104"></div></div></div>`,
  });

  try {
    OGBIData.empire = [{ id: 104, coordinates: "[13:23:33]", metal: 0, crystal: 0, deuterium: 0 }];
    needsUtil.lock("13:23:33", false, { metal: 500, crystal: 0, deuterium: 0 });

    const icon = document.querySelector("#planet-104 .ogl-sideLock");
    icon.dispatchEvent(new Event("mouseover", { bubbles: true }));

    const tooltipEl = document.querySelector(".ogl-tooltip");
    assert.ok(tooltipEl, "hovering the lock opens a tooltip");
    assert.ok(tooltipEl.querySelector(".ogl-metal").textContent.includes("500"));

    OGBIData.needSync = false;
    tooltipEl.querySelector(".icon_against").dispatchEvent(new Event("click", { bubbles: true }));

    assert.equal(OGBIData.needSync, true, "clearing a need marks a sync as due");
    assert.equal(
      document.querySelector("#planet-104 .ogl-sideLock"),
      null,
      "the icon is removed once its only resource type is cleared"
    );
  } finally {
    browser.cleanup();
  }
});

test("the bulk buttons remove filled or unfilled locks separately, and disappear once none are left", () => {
  const browser = setupBrowser({
    html: `<div id="norm"><div id="planetList"><div id="planet-205"></div><div id="planet-206"></div></div></div>`,
  });

  try {
    OGBIData.empire = [
      { id: 205, coordinates: "[14:24:34]", metal: 100, crystal: 0, deuterium: 0 },
      { id: 206, coordinates: "[15:25:35]", metal: 0, crystal: 0, deuterium: 0 },
    ];

    needsUtil.lock("14:24:34", false, { metal: 100, crystal: 0, deuterium: 0 }); // fully filled
    needsUtil.lock("15:25:35", false, { metal: 500, crystal: 0, deuterium: 0 }); // still missing 500

    document.querySelector("#norm .ogl-sideLockRemoveFilled").dispatchEvent(new Event("click", { bubbles: true }));

    assert.equal(document.querySelector("#planet-205 .ogl-sideLock"), null, "the filled lock was removed");
    assert.ok(document.querySelector("#planet-206 .ogl-sideLock"), "the unfilled lock is untouched");

    document
      .querySelector("#norm .ogl-sideLockRemove:not(.ogl-sideLockRemoveFilled)")
      .dispatchEvent(new Event("click", { bubbles: true }));

    assert.equal(document.querySelector("#planet-206 .ogl-sideLock"), null, "the unfilled lock was removed");
    assert.equal(
      document.querySelector("#norm .ogl-sideLockRemove"),
      null,
      "the bulk buttons themselves go away once no lock is left"
    );
  } finally {
    browser.cleanup();
  }
});

test("displayLocksByCoords() re-renders the icon for an existing need without changing it", () => {
  const browser = setupBrowser({
    html: `<div id="norm"><div id="planetList"><div id="planet-107"></div></div></div>`,
  });

  try {
    OGBIData.empire = [{ id: 107, coordinates: "[16:26:36]", metal: 0, crystal: 0, deuterium: 0 }];
    needsUtil.lock("16:26:36", false, { metal: 250, crystal: 0, deuterium: 0 });

    document.querySelector("#planet-107 .ogl-sideLock").remove();
    assert.equal(document.querySelector("#planet-107 .ogl-sideLock"), null);

    needsUtil.displayLocksByCoords("16:26:36", false);

    assert.ok(document.querySelector("#planet-107 .ogl-sideLock"), "the icon reappears from the stored need");
  } finally {
    browser.cleanup();
  }
});

test("displayLocksByCoords() on a coordinate with no matching planet is a no-op", () => {
  const browser = setupBrowser({
    html: `<div id="norm"><div id="planetList"></div></div>`,
  });

  try {
    OGBIData.empire = [];

    assert.doesNotThrow(() => needsUtil.displayLocksByCoords("99:99:99", false));
  } finally {
    browser.cleanup();
  }
});
