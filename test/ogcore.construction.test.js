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
const OGBIData = (await import("../src/store/OGBIData.js")).default;

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

// --------------------------------------------------------------------------
// the chat bar toggle
// --------------------------------------------------------------------------

/**
 * `chat()` on an overview page that has a chat bar and the game's chat API.
 *
 * The three bugs below were all reported as "the chat keeps playing up", and none of
 * them shows up anywhere but on a live page: the flag was read as "shown" while it
 * defaults to false, the load path could only ever un-hide, and the game's own opener
 * was re-invoked without its receiver.
 */
function onPageWithChatBar(run, { tchat = false } = {}) {
  const page = setupBrowser({
    html: `${overviewPage()}<div id="chatBar"></div>`,
    url: "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame&component=overview",
  });

  const calls = [];
  const chatApi = {
    loadChatLogWithPlayer(playerId) {
      calls.push({ playerId, receiver: this });
      return "jqXHR";
    },
  };
  window.ogame = { chat: chatApi };
  globalThis.ogame = window.ogame;

  try {
    OGBIData.json = { ...OGBIData.json, tchat };
    const instance = new OGBeyondInfinity();
    instance.chat();

    run({
      instance,
      calls,
      chatApi,
      bar: () => document.querySelector("#chatBar"),
      button: () => document.querySelector(".ogk-chat"),
    });
  } finally {
    delete globalThis.ogame;
    page.cleanup();
  }
}

test("a chat bar the player hid stays hidden across a page load", () => {
  // The report: OGame navigates on every view change, and the bar was back each time.
  onPageWithChatBar(
    ({ bar }) => {
      assert.equal(bar().style.display, "none");
    },
    { tchat: true }
  );
});

test("the first click on the toggle actually hides the bar", () => {
  // It used to go false -> true and set `display: block` on a bar already showing,
  // so the button looked broken until it was clicked a second time.
  onPageWithChatBar(({ bar, button }) => {
    assert.equal(bar().style.display, "block");

    button().dispatchEvent(new Event("click", { bubbles: true }));

    assert.equal(bar().style.display, "none");
    assert.equal(OGBIData.tchat, true, "and the choice is persisted");
  });
});

test("clicking the toggle twice puts the bar back", () => {
  onPageWithChatBar(({ bar, button }) => {
    button().dispatchEvent(new Event("click", { bubbles: true }));
    button().dispatchEvent(new Event("click", { bubbles: true }));

    assert.equal(bar().style.display, "block");
    assert.equal(OGBIData.tchat, false);
  });
});

test("the game's own chat opener keeps its receiver and its return value", () => {
  onPageWithChatBar(({ chatApi, calls }) => {
    const result = chatApi.loadChatLogWithPlayer(12345);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].playerId, 12345);
    // Called bare, `this` arrived as undefined inside the game's own code.
    assert.equal(calls[0].receiver, chatApi, "the wrapper must not drop `ogame.chat`");
    // OGame wires the send button off this value; swallowing it left the panel dead.
    assert.equal(result, "jqXHR");
  });
});

test("opening a conversation while the bar is hidden brings it back", () => {
  onPageWithChatBar(
    ({ chatApi, bar }) => {
      assert.equal(bar().style.display, "none");

      chatApi.loadChatLogWithPlayer(12345);

      assert.equal(bar().style.display, "block");
      assert.equal(OGBIData.tchat, false);
    },
    { tchat: true }
  );
});

test("a page whose game has no chat API still gets a working toggle", () => {
  // An unguarded `ogame.chat.loadChatLogWithPlayer` read threw out of start() and
  // cancelled every boot step after it - the chat enhancements included.
  const page = setupBrowser({
    html: `${overviewPage()}<div id="chatBar"></div>`,
    url: "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame&component=overview",
  });

  try {
    OGBIData.json = { ...OGBIData.json, tchat: false };
    const instance = new OGBeyondInfinity();

    assert.doesNotThrow(() => instance.chat());

    document.querySelector(".ogk-chat").dispatchEvent(new Event("click", { bubbles: true }));
    assert.equal(document.querySelector("#chatBar").style.display, "none");
  } finally {
    page.cleanup();
  }
});
