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
const { setManual, addEntry, clearSide, getPlans } = await import("../../src/store/upgradePlans.js");
const { transportLink } = await import("../../src/ctxpage/upgradePlans/fleetLink.js");
const { syncNeeds, refreshPlans } = await import("../../src/ctxpage/upgradePlans/sync.js");
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

    setManual("1:2:3", false, { metal: 1000, crystal: 0, deuterium: 0 });
    syncNeeds("1:2:3", false);
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
 * The lock icons themselves: `displayLocksByCoords()` and the icon/tooltip/delete
 * machinery in `displayLocks()` / `createLockIcon()`.
 *
 * The numbers behind them come from `store/upgradePlans.js` now. `lock()`/`append()`
 * are gone: a need is either a planned upgrade (`addEntry`) or a free-hand pile
 * (`setManual`), and drawing is a separate call - the store no longer touches the DOM.
 *
 * `OGBIData.json.upgradePlans` is never reset between tests in this file, so each test
 * below uses its own planet id / coordinate pair to stay independent of every other
 * test's leftover state - the same reason `planetByCoords()` and `getNeedsByCoords()`
 * guard every lookup with a null check instead of assuming the coordinate exists.
 *
 * `#planetList` is nested inside `#norm` in every fixture below only because real
 * OGame markup nests it in that sidebar wrapper. Nothing here reads the wrapper any
 * more: the two bulk "remove all" buttons used to be appended to it from `displayLocks`
 * and now live in the upgrade-plans panel, where the list of what they delete is on
 * screen next to them (`test/ctxpage/upgradePlans.test.js`).
 */

test("a pencilled-in need adds an unfilled planet-level lock icon", () => {
  const browser = setupBrowser({
    html: `<div id="norm"><div id="planetList"><div id="planet-101"></div></div></div>`,
  });

  try {
    OGBIData.empire = [{ id: 101, coordinates: "[10:20:30]", metal: 200, crystal: 0, deuterium: 0 }];

    setManual("10:20:30", false, { metal: 1000, crystal: 0, deuterium: 0 });
    syncNeeds("10:20:30", false);

    const icon = document.querySelector("#planet-101 .ogl-sideLock");
    assert.ok(icon, "a lock icon is added to the planet row");
    assert.equal(icon.classList.contains("ogl-moonLock"), false);
    assert.equal(icon.classList.contains("ogl-sideLockFilled"), false, "800 metal is still missing");
    // 200 of 1000 is on the planet, so it is neither empty nor done.
    assert.ok(icon.classList.contains("ogl-sideLockPartial"), "20% funded reads as partial, not as untouched");
    assert.equal(document.querySelector("#norm .ogl-sideLockRemove"), null, "no bulk buttons in the planet bar");
  } finally {
    browser.cleanup();
  }
});

test("nothing saved up yet is neither partial nor filled", () => {
  const browser = setupBrowser({
    html: `<div id="norm"><div id="planetList"><div id="planet-401"></div></div></div>`,
  });

  try {
    OGBIData.empire = [{ id: 401, coordinates: "[19:29:39]", metal: 0, crystal: 0, deuterium: 0 }];

    setManual("19:29:39", false, { metal: 1000, crystal: 0, deuterium: 0 });
    syncNeeds("19:29:39", false);

    const icon = document.querySelector("#planet-401 .ogl-sideLock");
    assert.equal(icon.classList.contains("ogl-sideLockPartial"), false);
    assert.equal(icon.classList.contains("ogl-sideLockFilled"), false);
  } finally {
    browser.cleanup();
  }
});

test("a moon need adds the moon variant of the icon, keyed by the parent planet id", () => {
  const browser = setupBrowser({
    html: `<div id="norm"><div id="planetList"><div id="planet-102"></div></div></div>`,
  });

  try {
    // The shape `getEmpireInfo()` really builds: the moon comes out of the empire
    // endpoint's own moon list and carries its own `id`, with nothing pointing back at
    // the parent. `displayLocks()` used to derive the id from the object it was handed,
    // so a moon resolved to 1021 - `#planet-1021` matched nothing and `needs[1021]` was
    // undefined, because the cache is keyed by the planet. Moon locks never appeared.
    OGBIData.empire = [
      {
        id: 102,
        coordinates: "[11:21:31]",
        metal: 0,
        crystal: 0,
        deuterium: 0,
        moon: { id: 1021, coordinates: "[11:21:31]", metal: 50, crystal: 0, deuterium: 0 },
      },
    ];

    setManual("11:21:31", true, { metal: 300, crystal: 0, deuterium: 0 });
    syncNeeds("11:21:31", true);

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

    setManual("12:22:32", false, { metal: 100, crystal: 0, deuterium: 0 });
    syncNeeds("12:22:32", false);

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
    setManual("13:23:33", false, { metal: 500, crystal: 0, deuterium: 0 });
    syncNeeds("13:23:33", false);

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

/**
 * The planet bar draws one icon per side and nothing else.
 *
 * It used to also append two unlabelled 16px sprites to the sidebar wrapper - "delete
 * every unfunded goal" and "delete every funded one" - with nothing next to them saying
 * what they would take away. They are buttons in the upgrade-plans panel now, where the
 * list of goals is on screen; the behaviour is pinned in
 * `test/ctxpage/upgradePlans.test.js`.
 */
test("the planet bar no longer grows bulk-delete buttons of its own", () => {
  const browser = setupBrowser({
    html: `<div id="norm"><div id="planetList"><div id="planet-205"></div><div id="planet-206"></div></div></div>`,
  });

  try {
    OGBIData.empire = [
      { id: 205, coordinates: "[14:24:34]", metal: 100, crystal: 0, deuterium: 0 },
      { id: 206, coordinates: "[15:25:35]", metal: 0, crystal: 0, deuterium: 0 },
    ];

    setManual("14:24:34", false, { metal: 100, crystal: 0, deuterium: 0 }); // fully filled
    syncNeeds("14:24:34", false);
    setManual("15:25:35", false, { metal: 500, crystal: 0, deuterium: 0 }); // still missing 500
    syncNeeds("15:25:35", false);

    assert.ok(document.querySelector("#planet-205 .ogl-sideLockFilled"), "the covered goal is green");
    assert.equal(
      document.querySelector("#planet-206 .ogl-sideLock").classList.contains("ogl-sideLockFilled"),
      false,
      "the uncovered one is not"
    );
    assert.equal(document.querySelectorAll("#norm button:not(.ogl-sideLock)").length, 0);
  } finally {
    clearSide("14:24:34", false);
    clearSide("15:25:35", false);
    browser.cleanup();
  }
});

test("displayLocksByCoords() re-renders the icon for an existing need without changing it", () => {
  const browser = setupBrowser({
    html: `<div id="norm"><div id="planetList"><div id="planet-107"></div></div></div>`,
  });

  try {
    OGBIData.empire = [{ id: 107, coordinates: "[16:26:36]", metal: 0, crystal: 0, deuterium: 0 }];
    setManual("16:26:36", false, { metal: 250, crystal: 0, deuterium: 0 });
    syncNeeds("16:26:36", false);

    document.querySelector("#planet-107 .ogl-sideLock").remove();
    assert.equal(document.querySelector("#planet-107 .ogl-sideLock"), null);

    syncNeeds("16:26:36", false);

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

/**
 * The path that did not exist before: an icon whose amount comes from a planned
 * upgrade rather than from a stored resource blob. The cost is priced on the fly, so a
 * plan made today still shows today's cost after a lifeform bonus changes.
 */

test("a planned upgrade drives the lock icon on its own", () => {
  const browser = setupBrowser({
    html: `<div id="norm"><div id="planetList"><div id="planet-108"></div></div></div>`,
  });

  try {
    OGBIData.json = {
      empire: [{ id: 108, 1: 20, coordinates: "[17:27:37]", metal: 0, crystal: 0, deuterium: 0 }],
      upgradePlans: {},
      technology: {},
      speed: 1,
      researchDivisor: 1,
      lifeformBonus: {
        classBonus: { explorer: 0, miner: 0, warrior: 0 },
        technologyCostReduction: {},
        technologyTimeReduction: {},
        productionBonus: [0, 0, 0],
        crawlerBonus: {},
      },
      lifeformPlanetBonus: {},
      options: {},
    };

    addEntry("17:27:37", false, { technoId: 1, from: 20, to: 24 });
    syncNeeds("17:27:37", false);

    const icon = document.querySelector("#planet-108 .ogl-sideLock");
    assert.ok(icon, "the icon appears with no manual amount stored at all");
    assert.equal(icon.classList.contains("ogl-sideLockFilled"), false);

    const missing = needsUtil.getNeedsByCoords("17:27:37", false);
    assert.ok(missing.metal > 0, "the metal comes from pricing the four planned levels");
  } finally {
    browser.cleanup();
  }
});

test("clearing the plan removes the icon", () => {
  const browser = setupBrowser({
    html: `<div id="norm"><div id="planetList"><div id="planet-108"></div></div></div>`,
  });

  try {
    syncNeeds("17:27:37", false);
    assert.ok(document.querySelector("#planet-108 .ogl-sideLock"), "still planned from the previous test");

    clearSide("17:27:37", false);
    syncNeeds("17:27:37", false);

    assert.equal(document.querySelector("#planet-108 .ogl-sideLock"), null);
  } finally {
    browser.cleanup();
  }
});

test("the fleet link asks for a transport, not an attack", () => {
  // The link used to carry mission=1, OGame's attack - not a mission you can fly to
  // your own planet, so the dispatcher just fell back to its own default.
  const params = new URLSearchParams(transportLink("18:28:38", false).slice(1));

  assert.equal(params.get("mission"), "3", "transport");
  assert.equal(params.get("component"), "fleetdispatch");
  assert.equal(params.get("oglMode"), "2", "the prefill branch betterFleetDispatcher already has");
  assert.equal(params.get("galaxy"), "18");
  assert.equal(params.get("system"), "28");
  assert.equal(params.get("position"), "38");
  assert.equal(params.get("type"), "1", "a planet");
});

test("the fleet link targets a moon when the need is on one", () => {
  const params = new URLSearchParams(transportLink("18:28:38", true).slice(1));

  assert.equal(params.get("type"), "3", "a moon");
});

test("the planet-bar link leaves the origin alone; a source is opt-in", () => {
  // Clicking a lock in the planet bar has always meant "send from where I am".
  assert.equal(new URLSearchParams(transportLink("18:28:38", false).slice(1)).has("cp"), false);

  // The overview panel passes one, so the fleet leaves from the RSS moon. A planet
  // switch inside a link the player clicked, never inside a background request.
  assert.equal(new URLSearchParams(transportLink("18:28:38", false, 33627262).slice(1)).get("cp"), "33627262");
});

/**
 * A plan that has been built resets itself: the entry goes, the resource cache goes,
 * and with it the lock icon in the planet bar.
 *
 * Every step of that runs somewhere else - `reconcile()` drops the entry, `syncNeeds()`
 * recomputes the total, `setNeeds()` redraws - so nothing short of walking the whole
 * chain catches it if one link stops calling the next.
 */

test("building the planned level clears the plan, the cache and the icon", () => {
  const browser = setupBrowser({
    html: `<div id="norm"><div id="planetList"><div id="planet-301"></div></div></div>`,
  });

  try {
    OGBIData.json = {
      empire: [{ id: 301, 1: 20, coordinates: "[20:30:40]", metal: 0, crystal: 0, deuterium: 0 }],
      upgradePlans: {},
      needs: {},
      technology: {},
      speed: 1,
      researchDivisor: 1,
      lifeformBonus: {
        classBonus: { explorer: 0, miner: 0, warrior: 0 },
        technologyCostReduction: {},
        technologyTimeReduction: {},
        productionBonus: [0, 0, 0],
        crawlerBonus: {},
      },
      lifeformPlanetBonus: {},
      options: {},
      upgradePlansMigrated: true,
    };

    addEntry("20:30:40", false, { technoId: 1, from: 20, to: 21 });
    syncNeeds("20:30:40", false);

    assert.ok(document.querySelector("#planet-301 .ogl-sideLock"), "planned, so the icon is up");

    // The mine is now level 21 - the plan's target is reached.
    OGBIData.json.empire = [{ id: 301, 1: 21, coordinates: "[20:30:40]", metal: 0, crystal: 0, deuterium: 0 }];
    refreshPlans();

    assert.deepEqual(getPlans(), {}, "the entry is gone, and its bucket with it");
    assert.equal(OGBIData.needs["301"], undefined, "no zero row left behind in the cache");
    assert.equal(needsUtil.getNeedsByCoords("20:30:40", false), undefined);
    assert.equal(document.querySelector("#planet-301 .ogl-sideLock"), null, "and the icon is gone");
  } finally {
    browser.cleanup();
  }
});

test("building one level of several leaves the plan standing, with less to send", () => {
  const browser = setupBrowser({
    html: `<div id="norm"><div id="planetList"><div id="planet-302"></div></div></div>`,
  });

  try {
    OGBIData.json = {
      empire: [{ id: 302, 1: 20, coordinates: "[21:31:41]", metal: 0, crystal: 0, deuterium: 0 }],
      upgradePlans: {},
      needs: {},
      technology: {},
      speed: 1,
      researchDivisor: 1,
      lifeformBonus: {
        classBonus: { explorer: 0, miner: 0, warrior: 0 },
        technologyCostReduction: {},
        technologyTimeReduction: {},
        productionBonus: [0, 0, 0],
        crawlerBonus: {},
      },
      lifeformPlanetBonus: {},
      options: {},
      upgradePlansMigrated: true,
    };

    addEntry("21:31:41", false, { technoId: 1, from: 20, to: 23 });
    syncNeeds("21:31:41", false);
    const before = needsUtil.getNeedsByCoords("21:31:41", false).metal;

    OGBIData.json.empire = [{ id: 302, 1: 21, coordinates: "[21:31:41]", metal: 0, crystal: 0, deuterium: 0 }];
    refreshPlans();

    const after = needsUtil.getNeedsByCoords("21:31:41", false).metal;
    assert.ok(after > 0, "22 and 23 are still to build");
    assert.ok(after < before, "but level 21 is no longer being asked for");
    assert.ok(document.querySelector("#planet-302 .ogl-sideLock"), "so the icon stays");
  } finally {
    browser.cleanup();
  }
});

test("a side that asks for nothing leaves no row in the cache", () => {
  const browser = setupBrowser({
    html: `<div id="norm"><div id="planetList"><div id="planet-303"></div></div></div>`,
  });

  try {
    OGBIData.empire = [{ id: 303, coordinates: "[22:32:42]", metal: 0, crystal: 0, deuterium: 0 }];

    setManual("22:32:42", false, { metal: 500, crystal: 0, deuterium: 0 });
    syncNeeds("22:32:42", false);
    assert.ok(OGBIData.needs["303"], "recorded while there is something to send");

    setManual("22:32:42", false, {});
    syncNeeds("22:32:42", false);

    // A zero row is not "nothing": it survives every reload and would leave one entry
    // per planet the player ever planned on.
    assert.equal(OGBIData.needs["303"], undefined);
  } finally {
    browser.cleanup();
  }
});

test("a moon still asking for something keeps the planet's bucket alive", () => {
  const browser = setupBrowser({
    html: `<div id="norm"><div id="planetList"><div id="planet-304"></div></div></div>`,
  });

  try {
    OGBIData.empire = [
      {
        id: 304,
        coordinates: "[23:33:43]",
        metal: 0,
        crystal: 0,
        deuterium: 0,
        moon: { planetID: 304, coordinates: "[23:33:43]", metal: 0, crystal: 0, deuterium: 0 },
      },
    ];

    setManual("23:33:43", false, { metal: 500 });
    syncNeeds("23:33:43", false);
    setManual("23:33:43", true, { metal: 700 });
    syncNeeds("23:33:43", true);

    setManual("23:33:43", false, {});
    syncNeeds("23:33:43", false);

    assert.ok(OGBIData.needs["304"], "the moon still needs something");
    assert.equal(OGBIData.needs["304"].moon.metal, 700);
    assert.equal(needsUtil.getNeedsByCoords("23:33:43", false), undefined, "the planet side is clear");
  } finally {
    browser.cleanup();
  }
});
