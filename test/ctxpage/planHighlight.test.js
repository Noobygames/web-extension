/**
 * The planned-upgrade marks: the left-menu entries and the tiles on a build page.
 *
 * Two things are worth pinning beyond "it draws". The first is the split: the gate in
 * `plans.js` has to stay entry-cheap, so it must not reach `store/upgradePlans.js` and
 * the ~93 KB of cost tables behind it - `test/bundle.test.js` caps the entry and
 * `test/architecture.test.js` would not notice this particular import. The second is
 * `buildPageOf()`, which sorts ids by range where `categoryOf()` uses the cost tables;
 * the two agreeing is asserted in `test/util/upgradeCost.test.js`, and here we only
 * check the marks land on the page they belong to.
 *
 * Page-context modules - no `chrome: true` on setupBrowser.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { setupBrowser } from "../helpers/globals.js";

const bootstrap = setupBrowser();
const OGBIData = (await import("../../src/store/OGBIData.js")).default;
const { planHighlight } = await import("../../src/ctxpage/planHighlight/index.js");
const { currentSide, plannedEntriesFor, hasPlansOnCurrentSide } = await import(
  "../../src/ctxpage/planHighlight/plans.js"
);
bootstrap.cleanup();

const srcRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

/** The planet bar plus the left menu, in the shape the module reads them. */
function shell(extra = "") {
  return `
    <div id="planetList">
      <div class="smallplanet">
        <a class="planetlink active"></a>
        <span class="planet-koords">1:234:5</span>
        <a class="moonlink"></a>
      </div>
    </div>
    <div id="links">
      <ul class="leftmenu">
        <li><a href="/game/index.php?page=ingame&component=supplies">Supplies</a></li>
        <li><a href="/game/index.php?page=ingame&component=facilities">Facilities</a></li>
        <li><a href="/game/index.php?page=ingame&component=research">Research</a></li>
        <li><a href="/game/index.php?page=ingame&component=lfbuildings">Lifeform</a></li>
        <li><a href="/game/index.php?page=ingame&component=shipyard">Shipyard</a></li>
        <li><a href="/game/index.php?page=ingame&component=defenses">Defence</a></li>
      </ul>
    </div>
    ${extra}`;
}

/** `entries` for the planet at 1:234:5, in the plan store's own shape. */
function seedPlans(entries, moonEntries = []) {
  OGBIData.json = {
    ...OGBIData.json,
    upgradePlans: {
      101: {
        planetId: 101,
        coords: "1:234:5",
        planet: { entries, manual: {} },
        moon: { entries: moonEntries, manual: {} },
      },
    },
  };
}

test("the current side is read off the planet bar", () => {
  const browser = setupBrowser({ html: shell() });

  try {
    assert.deepEqual(currentSide(), { coords: "1:234:5", isMoon: false });
  } finally {
    browser.cleanup();
  }
});

test("an active moon link makes the moon the current side", () => {
  const browser = setupBrowser({
    html: shell().replace('<a class="moonlink"></a>', '<a class="moonlink active"></a>'),
  });

  try {
    assert.deepEqual(currentSide(), { coords: "1:234:5", isMoon: true });
  } finally {
    browser.cleanup();
  }
});

test("an entry with nothing left to build is not counted", () => {
  const browser = setupBrowser({ html: shell() });

  try {
    seedPlans([
      { technoId: 1, from: 20, to: 24 },
      // Already built: reconcile() leaves these behind for a moment, and a menu entry
      // lit for an upgrade that is finished is worse than no mark at all.
      { technoId: 2, from: 18, to: 18 },
    ]);

    assert.equal(plannedEntriesFor("1:234:5", false).length, 1);
    assert.equal(hasPlansOnCurrentSide(), true);
  } finally {
    browser.cleanup();
  }
});

test("no plans on this side means the drawing chunk is never fetched", () => {
  const browser = setupBrowser({ html: shell() });

  try {
    seedPlans([], [{ technoId: 1, from: 1, to: 5 }]);

    // The moon has a plan; the planet, which is the active side, does not.
    assert.equal(hasPlansOnCurrentSide(), false);
  } finally {
    browser.cleanup();
  }
});

test("each planned technology lights up the menu entry for its own build page", () => {
  const browser = setupBrowser({ html: shell() });

  try {
    seedPlans([
      { technoId: 1, from: 20, to: 24 }, // metal mine -> supplies
      { technoId: 3, from: 18, to: 19 }, // deuterium synthesizer -> supplies
      { technoId: 14, from: 10, to: 12 }, // robotics factory -> facilities
      { technoId: 113, from: 8, to: 9 }, // energy technology -> research
      { technoId: 11101, from: 1, to: 4 }, // human residential sector -> lfbuildings
    ]);

    planHighlight();

    const marked = (component) => document.querySelector(`#links a[href*="component=${component}"]`);

    assert.equal(marked("supplies").getAttribute("data-ogl-planned"), "2");
    assert.equal(marked("facilities").getAttribute("data-ogl-planned"), "1");
    assert.equal(marked("research").getAttribute("data-ogl-planned"), "1");
    assert.equal(marked("lfbuildings").getAttribute("data-ogl-planned"), "1");
    assert.ok(marked("supplies").classList.contains("ogl-planned-menu"));

    // A ship has no level, so it can never be a plan entry - these two never light up.
    assert.equal(marked("shipyard").classList.contains("ogl-planned-menu"), false);
    assert.equal(marked("defenses").classList.contains("ogl-planned-menu"), false);
  } finally {
    browser.cleanup();
  }
});

test("a redraw clears the marks a previous one left", () => {
  const browser = setupBrowser({ html: shell() });

  try {
    seedPlans([{ technoId: 1, from: 20, to: 24 }]);
    planHighlight();
    assert.ok(document.querySelector(".ogl-planned-menu"));

    seedPlans([]);
    planHighlight();

    assert.equal(document.querySelector(".ogl-planned-menu"), null, "the mark goes when the plan does");
  } finally {
    browser.cleanup();
  }
});

test("the moon's plans drive the marks when the moon is the active side", () => {
  const browser = setupBrowser({
    html: shell().replace('<a class="moonlink"></a>', '<a class="moonlink active"></a>'),
  });

  try {
    // A lunar base is a facility; the planet's own plan is a mine. Reading the wrong
    // side would light "supplies" here, which is the bug the shared planet-id key in
    // the plan store makes easy to write.
    seedPlans([{ technoId: 1, from: 20, to: 24 }], [{ technoId: 41, from: 4, to: 6 }]);

    planHighlight();

    assert.ok(document.querySelector('#links a[href*="component=facilities"]').classList.contains("ogl-planned-menu"));
    assert.equal(
      document.querySelector('#links a[href*="component=supplies"]').classList.contains("ogl-planned-menu"),
      false
    );
  } finally {
    browser.cleanup();
  }
});

// --------------------------------------------------------------------------
// the tiles on the build page itself
// --------------------------------------------------------------------------

const TILES = `
  <div id="technologies">
    <li class="technology" data-technology="1"></li>
    <li class="technology" data-technology="2"></li>
    <li class="technology" data-technology="14"></li>
  </div>`;

/** setupBrowser with the URL of a build page, so `planHighlight()` frames its tiles. */
function buildPage(component = "supplies") {
  return setupBrowser({
    html: shell(TILES),
    url: `https://s283-de.ogame.gameforge.com/game/index.php?page=ingame&component=${component}`,
  });
}

test("a planned technology gets a frame on its own build page", () => {
  const browser = buildPage();

  try {
    seedPlans([
      { technoId: 1, from: 20, to: 24 },
      { technoId: 14, from: 10, to: 11 }, // a facility - not this page
    ]);

    planHighlight();

    assert.ok(document.querySelector('[data-technology="1"]').classList.contains("ogl-planned-tile"));
    assert.equal(
      document.querySelector('[data-technology="14"]').classList.contains("ogl-planned-tile"),
      false,
      "the robotics factory is planned, but not here"
    );
    assert.equal(document.querySelector('[data-technology="2"]').classList.contains("ogl-planned-tile"), false);
  } finally {
    browser.cleanup();
  }
});

test("more than one level ahead gets the target level, one level does not", () => {
  const browser = buildPage();

  try {
    seedPlans([
      { technoId: 1, from: 20, to: 24 },
      { technoId: 2, from: 18, to: 19 },
    ]);

    planHighlight();

    const badge = document.querySelector('[data-technology="1"] .ogl-planned-target');
    assert.ok(badge, "four levels planned, so the target is worth showing");
    assert.match(badge.textContent, /24/);

    assert.equal(
      document.querySelector('[data-technology="2"] .ogl-planned-target'),
      null,
      "OGame's own tile already names the next level"
    );
  } finally {
    browser.cleanup();
  }
});

test("a redraw does not stack a second badge on the same tile", () => {
  const browser = buildPage();

  try {
    seedPlans([{ technoId: 1, from: 20, to: 24 }]);

    planHighlight();
    planHighlight();

    assert.equal(document.querySelectorAll(".ogl-planned-target").length, 1);
  } finally {
    browser.cleanup();
  }
});

test("a page that is not a build page gets menu marks and no tile marks", () => {
  const browser = setupBrowser({
    html: shell(TILES),
    url: "https://s283-de.ogame.gameforge.com/game/index.php?page=ingame&component=overview",
  });

  try {
    seedPlans([{ technoId: 1, from: 20, to: 24 }]);

    planHighlight();

    assert.ok(document.querySelector(".ogl-planned-menu"));
    assert.equal(document.querySelector(".ogl-planned-tile"), null);
  } finally {
    browser.cleanup();
  }
});

/**
 * The reason `plans.js` exists as its own file. It is imported by `ogCore.js`, so
 * anything it reaches is in the page entry - and `store/upgradePlans.js` drags
 * `gameFormulas.js` plus both cost tables in behind it. The entry has under 10 KB of
 * headroom, so this is the kind of import that fails a build days later, in a file
 * nobody touched.
 */
test("the entry-side half reaches no cost tables", () => {
  const source = fs.readFileSync(path.join(srcRoot, "ctxpage", "planHighlight", "plans.js"), "utf8");

  for (const forbidden of ["upgradePlans.js", "upgradeCost.js", "gameFormulas.js", "buildingInfo.js"]) {
    assert.equal(
      source.includes(`import`) && source.includes(`/${forbidden}"`),
      false,
      `plans.js imports ${forbidden}`
    );
  }

  assert.match(source, /from "\.\.\/\.\.\/store\/OGBIData\.js"/, "the store singleton is all it needs");
});
