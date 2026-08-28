/**
 * `OGBeyondInfinity` itself.
 *
 * What is left of the class after Phase 3 of refactoring.md is the boot sequence and
 * the context objects it hands to the extracted page modules. This file covers the
 * two things that are still its own: that it can be constructed at all, and that the
 * contexts it builds carry what the modules read.
 *
 * The arithmetic moved to `test/util/gameFormulas.test.js`, the cargo helpers to
 * `test/ctxpage/fleetdispatch.test.js`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "./helpers/globals.js";
import { overviewPage } from "./fixtures/ogamePage.js";

// An excluded page: ogCore.js runs a boot IIFE at module scope, and "intro" is one of
// the three components it bails out on before it touches the DOM or the network.
const INTRO_URL = "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame&component=intro";

const browser = setupBrowser({ url: INTRO_URL });
document.documentElement.dataset.ogiCallbackEventToken = "0123456789ab";
const { OGBeyondInfinity: OGBeyondInfinity } = await import("../src/ogCore.js");

test.after(() => browser.cleanup());

function onOverviewPage(run) {
  const page = setupBrowser({
    html: overviewPage(),
    url: "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame&component=overview",
  });
  try {
    run(new OGBeyondInfinity());
  } finally {
    page.cleanup();
  }
}

test("OGBeyondInfinity can be constructed from a page fixture", () => {
  // The point of the readPageContext() seam: before it, this line threw on the very
  // first statement of the constructor and no test could get past it.
  onOverviewPage((instance) => {
    assert.equal(instance.playerId, 12345);
    assert.equal(instance.page, "overview");
    assert.equal(instance.universeName, "Quantum");
    assert.equal(instance.current.coords, "4:5:6");
    assert.deepEqual(instance.markedPlayers, []);
  });
});

/**
 * The context objects are the whole interface between the controller and the modules
 * Phase 3 pulled out. A field silently missing from one of them is a defect nothing
 * else notices: the module reads `undefined` and renders an empty panel.
 */
test("every context the page modules receive carries the fields they read", () => {
  onOverviewPage((instance) => {
    assert.deepEqual(Object.keys(instance.playerBonuses()).sort(), ["allOfficers", "geologist", "playerClass"]);

    assert.deepEqual(Object.keys(instance.dialogContext()).sort(), ["current", "hasLifeforms"]);

    assert.deepEqual(Object.keys(instance.overviewContext()).sort(), ["current", "isMobile"]);

    assert.deepEqual(Object.keys(instance.settingsContext()).sort(), [
      "commander",
      "dialogContext",
      "universe",
      "updateData",
    ]);

    assert.deepEqual(Object.keys(instance.technoContext()).sort(), [
      "allOfficers",
      "current",
      "engineer",
      "isMobile",
      "page",
      "playerBonuses",
      "playerClass",
    ]);

    assert.deepEqual(Object.keys(instance.galaxyContext()).sort(), [
      "admiral",
      "current",
      "highlighted",
      "markedPlayers",
      "page",
      "playerId",
      "rawURL",
      "universe",
    ]);

    assert.deepEqual(Object.keys(instance.planetBarContext()).sort(), [
      "current",
      "empireContext",
      "hasLifeforms",
      "overviewContext",
      "page",
      "planetList",
      "rawURL",
      "sideOptions",
    ]);

    assert.deepEqual(Object.keys(instance.empireContext()).sort(), [
      "allOfficers",
      "current",
      "flyingFleet",
      "geologist",
      "hasLifeforms",
      "isLoading",
      "mode",
      "overviewContext",
      "page",
      "playerClass",
      "setLoading",
      "universe",
      "updateSpaceShipsPresence",
    ]);

    assert.deepEqual(Object.keys(instance.fleetContext()).sort(), [
      "admiral",
      "commander",
      "current",
      "dialogContext",
      "hasLifeforms",
      "homePlanetCoords",
      "isMobile",
      "keyboardActionSkip",
      "mode",
      "page",
      "planetList",
      "playerClass",
      "rawURL",
      "universe",
    ]);
  });
});

test("a context is a snapshot of plain values, never the controller itself", () => {
  // The rule from refactoring.md Phase 3: an extracted module may not be able to reach
  // back into OGBeyondInfinity. A context that leaked the instance - or a method bound to it
  // - would make every later cut harder, and nothing would fail loudly.
  onOverviewPage((instance) => {
    const contexts = [
      instance.playerBonuses(),
      instance.dialogContext(),
      instance.overviewContext(),
      instance.settingsContext(),
      instance.empireContext(),
      instance.fleetContext(),
      instance.galaxyContext(),
      instance.planetBarContext(),
      instance.technoContext(),
    ];

    for (const context of contexts) {
      for (const [key, value] of Object.entries(context)) {
        assert.notEqual(value, instance, `${key} hands the module the controller itself`);
        assert.equal(value instanceof OGBeyondInfinity, false, `${key} hands the module an OGBeyondInfinity`);
      }
    }
  });
});

test("the loading gate the empire module is given actually reads and writes the flag", () => {
  onOverviewPage((instance) => {
    const context = instance.empireContext();

    instance.isLoading = false;
    assert.equal(context.isLoading(), false);

    context.setLoading(true);
    assert.equal(instance.isLoading, true, "the module can close the gate");
    assert.equal(context.isLoading(), true);
  });
});

test("the fleet context writes keyboardActionSkip back onto the controller", () => {
  onOverviewPage((instance) => {
    const context = instance.fleetContext();

    context.keyboardActionSkip = "https://example.invalid/next";

    assert.equal(instance.keyboardActionSkip, "https://example.invalid/next");
  });
});
