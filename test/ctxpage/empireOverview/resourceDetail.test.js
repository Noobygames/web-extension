/**
 * `ctxpage/empireOverview/resourceDetail.js` - the resource panel that replaces
 * OGame's own numbers in the planet bar (`resourceDetail()`), and the redraw that runs
 * when a fresh empire snapshot lands (`updateresourceDetail()`). Both run from
 * `renderPlanetBar()` on every page load.
 *
 * Page context module - no `chrome: true` on setupBrowser(). tooltip.js reads
 * `OGBIData.keepTooltip` at import time, which needs `localStorage`, so the store and
 * the module under test are both loaded with a dynamic import after setupBrowser().
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../../helpers/globals.js";
import { planetList } from "../../fixtures/ogamePage.js";

const browser = setupBrowser({
  url: "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame&component=overview",
  ogameVersion: "13.0.0",
});

const OGBIData = (await import("../../../src/store/OGBIData.js")).default;
const { toFormattedNumber } = await import("../../../src/format/numbers.js");
const { standardUnit } = await import("../../../src/game/standardUnit.js");
const { resourceDetail, updateresourceDetail } = await import("../../../src/ctxpage/empireOverview/resourceDetail.js");

test.after(() => browser.cleanup());

/** The sidebar and the overview icon `resourceDetail()` activates when it draws. */
const CHROME = `<div id="rechts"></div><div class="ogl-overview-icon"></div>`;

function baseFlying(overrides = {}) {
  return { metal: 1000, crystal: 2000, deuterium: 3000, ids: [], ...overrides };
}

function planetFixture(overrides = {}) {
  return {
    metal: 0,
    crystal: 0,
    deuterium: 0,
    metalStorage: 1e6,
    crystalStorage: 1e6,
    deuteriumStorage: 1e6,
    production: { hourly: [0, 0, 0] },
    invalidate: false,
    ...overrides,
  };
}

// --------------------------------------------------------------------------
// resourceDetail - building the panel
// --------------------------------------------------------------------------

test("renders per-planet resource panels with full and near-full storage flags", () => {
  document.body.innerHTML =
    CHROME +
    planetList([
      { id: 100, coords: "1:2:3", name: "Home" },
      { id: 200, coords: "4:5:6", name: "Colony", moon: true },
    ]);
  OGBIData.json = { options: { empire: true }, flying: baseFlying() };
  OGBIData.empire = [
    planetFixture({
      id: 100,
      metal: 10000,
      crystal: 100,
      deuterium: 50,
      metalStorage: 10000,
      crystalStorage: 10000,
      deuteriumStorage: 10000,
      production: { hourly: [1000, 1000, 1000] },
    }),
    planetFixture({
      id: 200,
      metal: 800,
      crystal: 200,
      deuterium: 90,
      metalStorage: 5000,
      crystalStorage: 5000,
      deuteriumStorage: 5000,
      production: { hourly: [5, 5, 5] },
      moon: { metal: 300, crystal: 40, deuterium: 10, invalidate: true },
    }),
  ];

  resourceDetail({ isMobile: true });

  assert.ok(document.querySelector(".ogl-overview-icon").classList.contains("ogl-active"));
  assert.ok(document.querySelector("#planetList").classList.contains("moon-construction-sum"));

  // Storage is completely full (0 headroom) and headroom is under two hours of production.
  const planet100Metal = document.querySelector("#planet-100 .ogl-metal");
  assert.equal(planet100Metal.textContent, toFormattedNumber(10000, null, true));
  assert.equal(planet100Metal.className, "tooltip ogl-metal ogl-full ogl-afull");

  // Crystal has plenty of headroom on the same planet.
  const planet100Crystal = document.querySelector("#planet-100 .ogl-crystal");
  assert.equal(planet100Crystal.className, "tooltip ogl-crystal");

  assert.equal(document.querySelector("#planet-200 .ogl-res").classList.contains("ogi-invalidate"), false);
  const moonRes = document.querySelectorAll("#planet-200 .ogl-res")[1];
  assert.ok(moonRes.classList.contains("ogi-invalidate"), "the moon's own invalidate flag is tracked separately");
  assert.equal(moonRes.querySelector(".ogl-metal").textContent, toFormattedNumber(300, null, true));
});

test("totals planet, moon and in-flight resources into the summary rows", () => {
  document.body.innerHTML =
    CHROME +
    planetList([
      { id: 100, coords: "1:2:3", name: "Home" },
      { id: 200, coords: "4:5:6", name: "Colony", moon: true },
    ]);
  OGBIData.json = { options: { empire: true }, flying: baseFlying({ metal: 1000, crystal: 2000, deuterium: 3000 }) };
  OGBIData.empire = [
    planetFixture({ id: 100, metal: 500, crystal: 100, deuterium: 50 }),
    planetFixture({
      id: 200,
      metal: 800,
      crystal: 200,
      deuterium: 90,
      moon: { metal: 300, crystal: 40, deuterium: 10 },
    }),
  ];

  resourceDetail({ isMobile: true });

  const summaries = document.querySelectorAll(".ogl-summary");
  const planetMetals = summaries[0].querySelectorAll(".ogl-metal");
  assert.equal(planetMetals[0].textContent, toFormattedNumber(1300, null, true), "planet metal total");
  assert.equal(planetMetals[1].textContent, toFormattedNumber(300, null, true), "moon metal total");

  assert.equal(summaries[1].querySelector(".ogl-metal").textContent, toFormattedNumber(1000, null, true));

  // Grand total: planets + moons + in-flight.
  assert.equal(summaries[2].querySelector(".ogl-metal").textContent, toFormattedNumber(2600, null, true));
  assert.equal(summaries[2].querySelector(".ogl-crystal").textContent, toFormattedNumber(2340, null, true));
  assert.equal(summaries[2].querySelector(".ogl-deut").textContent, toFormattedNumber(3150, null, true));

  const expectedMSU = standardUnit([2600, 2340, 3150]);
  const msuValue = document.querySelector(".ogl-sum-symbol.tooltip").nextElementSibling;
  assert.equal(msuValue.textContent, toFormattedNumber(Math.floor(expectedMSU), null, true));
});

test("keeps the standard-unit row separate and hides the moon row when nobody has a moon", () => {
  document.body.innerHTML =
    CHROME +
    planetList([
      { id: 100, coords: "1:2:3", name: "Home" },
      { id: 300, coords: "7:8:9", name: "Second" },
    ]);
  OGBIData.json = { options: { empire: true }, flying: baseFlying({ metal: 0, crystal: 0, deuterium: 0 }) };
  OGBIData.empire = [
    planetFixture({ id: 100, metal: 100, crystal: 100, deuterium: 100 }),
    planetFixture({ id: 300, metal: 100, crystal: 100, deuterium: 100 }),
  ];

  resourceDetail({ isMobile: true });

  const summaries = document.querySelectorAll(".ogl-summary");
  // The moon Σ symbol and moon totals stay in the DOM, just hidden, rather than removed.
  const moonSumSymbol = summaries[0].querySelectorAll(".ogl-sum-symbol")[1];
  assert.equal(moonSumSymbol.style.display, "none");
  assert.equal(summaries[0].querySelectorAll(".ogl-res")[1].style.display, "none");

  // The grand total and the standard-unit summary become two separate rows.
  assert.equal(summaries.length, 4);
  assert.ok(summaries[2].querySelector(".ogl-metal"), "the grand-total row still carries the resource totals");
  assert.equal(
    summaries[3].querySelector(".ogl-metal"),
    null,
    "the standard-unit row has no resource spans of its own"
  );
});

test("does nothing when the empire overview option is off or the planet count does not match the DOM", () => {
  document.body.innerHTML = CHROME + planetList([{ id: 100, coords: "1:2:3" }]);

  OGBIData.json = { options: { empire: false }, flying: baseFlying() };
  OGBIData.empire = [planetFixture({ id: 100 })];
  resourceDetail({ isMobile: true });
  assert.equal(document.querySelector(".ogl-overview-icon").classList.contains("ogl-active"), false);

  OGBIData.json = { options: { empire: true }, flying: baseFlying() };
  OGBIData.empire = [planetFixture({ id: 100 }), planetFixture({ id: 200 })]; // one more than the DOM has
  resourceDetail({ isMobile: true });
  assert.equal(document.querySelector(".ogl-overview-icon").classList.contains("ogl-active"), false);
});

test("shrinks the sidebar on mouseover when it would overflow the viewport, and resets on mouseout", () => {
  document.body.innerHTML = CHROME + planetList([{ id: 100, coords: "1:2:3" }]);
  OGBIData.json = { options: { empire: true }, flying: baseFlying() };
  OGBIData.empire = [planetFixture({ id: 100 })];

  const rechts = document.querySelector("#rechts");
  rechts.getBoundingClientRect = () => ({ width: 800, x: 500 });

  resourceDetail({ isMobile: false });

  rechts.dispatchEvent(new window.Event("mouseover"));
  const expectedDiff = 800 + 500 - window.innerWidth;
  assert.equal(rechts.style.right, `${expectedDiff}px`, "shrunk by exactly the viewport overflow");

  rechts.dispatchEvent(new window.Event("mouseout"));
  assert.equal(rechts.style.right, "0px");
});

test("builds the in-flight fleet tooltip when the summary icon is triggered", () => {
  document.body.innerHTML = CHROME + planetList([{ id: 100, coords: "1:2:3", name: "Home" }]);
  OGBIData.json = {
    options: { empire: true },
    flying: baseFlying({
      ids: [
        {
          resDest: true,
          metal: 5,
          crystal: 6,
          deuterium: 7,
          origin: "1:2:3P",
          dest: "9:9:9P",
          originName: "Home",
          destName: "Foreign",
          back: false,
        },
      ],
    }),
  };
  OGBIData.empire = [planetFixture({ id: 100, coordinates: "[1:2:3]" })];

  resourceDetail({ isMobile: true });

  const flyingIcon = document.querySelector(".ogl-sum-symbol .icon_movement");
  // jsdom's documentElement always carries `ontouchstart`, so the "ontouchstart" in
  // document.documentElement feature check in resourceDetail.js picks "touchstart"
  // here, not "mouseenter" (same quirk pinned in stalkPanel.test.js).
  flyingIcon.dispatchEvent(new window.Event("touchstart"));

  const rows = document.querySelectorAll(".ogl-tooltip table.flyingFleet tr");
  assert.equal(rows.length, 2, "one header row and one movement row");
  const dataCells = rows[1].querySelectorAll("td");
  assert.equal(dataCells[0].textContent, "Foreign");
  assert.equal(dataCells[0].className, "friendly", "not one of our own coordinates");
});

// --------------------------------------------------------------------------
// updateresourceDetail - redrawing the panel resourceDetail() already built
// --------------------------------------------------------------------------

test("redraws resource numbers and sums after the empire snapshot changes", () => {
  document.body.innerHTML =
    CHROME +
    planetList([
      { id: 100, coords: "1:2:3", name: "Home" },
      { id: 200, coords: "4:5:6", name: "Colony", moon: true },
    ]);
  OGBIData.json = { options: { empire: true }, flying: baseFlying({ metal: 100, crystal: 200, deuterium: 300 }) };
  OGBIData.empire = [
    planetFixture({ id: 100, metal: 500, crystal: 100, deuterium: 50 }),
    planetFixture({
      id: 200,
      metal: 800,
      crystal: 200,
      deuterium: 90,
      moon: { metal: 300, crystal: 40, deuterium: 10 },
    }),
  ];
  resourceDetail({ isMobile: true });

  OGBIData.empire[0].metal = 999;
  OGBIData.empire[0].invalidate = true;
  OGBIData.json.flying = baseFlying({ metal: 4000, crystal: 5000, deuterium: 6000 });

  updateresourceDetail({});

  const planet100Metal = document.querySelector("#planet-100 .ogl-metal");
  assert.equal(planet100Metal.textContent, toFormattedNumber(999, null, true));
  assert.ok(document.querySelector("#planet-100 .ogl-res").classList.contains("ogi-invalidate"));

  const summaries = document.querySelectorAll(".ogl-summary");
  assert.equal(
    summaries[1].querySelector(".ogl-metal").textContent,
    toFormattedNumber(4000, null, true),
    "flying sum redrawn"
  );
  // Grand total: (999 + 800) planets + 300 moon + 4000 flying.
  assert.equal(summaries[2].querySelector(".ogl-metal").textContent, toFormattedNumber(6099, null, true));
});

test("does nothing when the empire option is off or the resource panel has not been built yet", () => {
  document.body.innerHTML = CHROME + planetList([{ id: 100, coords: "1:2:3" }]);

  OGBIData.json = { options: { empire: false }, flying: baseFlying() };
  OGBIData.empire = [planetFixture({ id: 100 })];
  assert.doesNotThrow(() => updateresourceDetail({}));

  OGBIData.json = { options: { empire: true }, flying: baseFlying() };
  // resourceDetail() was never called on this DOM, so there is no ".ogl-metal" yet.
  assert.doesNotThrow(() => updateresourceDetail({}));
  assert.equal(document.querySelector(".ogl-metal"), null);
});
