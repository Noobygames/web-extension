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

// --------------------------------------------------------------------------
// the expedition rows in the event box
// --------------------------------------------------------------------------

/**
 * `expeditionImpact()` hides the outbound half of an expedition so the event box is not
 * filled twice over. Two things must survive it, and each has cost a real player once.
 *
 * The **recall link** lives on exactly those rows and is the only way back for a fleet
 * sent by accident, so a row carrying one is never hidden - and re-ticking the box has
 * to bring back what un-ticking removed. The old version failed both: it hid by
 * selector and un-hid by guessing that the row before a *return* row is its outbound
 * half, so an expedition that had only just launched had no way back onto the screen.
 *
 * The **fleet itself** must stay represented. "Filled twice over" is a precondition,
 * not a given: the event box usually carries one row per fleet, and hiding that row
 * deletes the flight from the list rather than de-duplicating it. Reported from a live
 * account - nine expeditions up, the header counting an arrival in 8m26s, and no row
 * for it. So the hide now needs a matching return row to have been drawn as well.
 *
 * The rows below therefore carry coordinates: without them every row pairs with every
 * other and the pairing cannot be tested at all.
 */
const EVENT_BOX = `
  <table>
    <tr class="eventFleet" id="eventRow-1" data-mission-type="15" data-return-flight="false">
      <td class="coordsOrigin"><a>[1:181:6]</a></td>
      <td class="destCoords"><a>[1:181:16]</a></td>
      <td class="reversal"><a href="?page=ingame&component=movement&return=1">back</a></td>
    </tr>
    <tr class="eventFleet" id="eventRow-2" data-mission-type="15" data-return-flight="false">
      <td class="coordsOrigin"><a>[1:182:6]</a></td>
      <td class="destCoords"><a>[1:182:16]</a></td>
      <td class="reversal"></td>
    </tr>
    <tr class="eventFleet" id="eventRow-3" data-mission-type="15" data-return-flight="true">
      <td class="coordsOrigin"><a>[1:182:16]</a></td>
      <td class="destCoords"><a>[1:182:6]</a></td>
      <td class="reversal"></td>
    </tr>
    <tr class="eventFleet" id="eventRow-4" data-mission-type="3" data-return-flight="false">
      <td class="coordsOrigin"><a>[1:181:6]</a></td>
      <td class="destCoords"><a>[3:383:8]</a></td>
      <td class="reversal"><a href="?page=ingame&component=movement&return=4">back</a></td>
    </tr>
    <tr class="eventFleet" id="eventRow-5" data-mission-type="15" data-return-flight="true">
      <td class="coordsOrigin"><a>[1:181:16]</a></td>
      <td class="destCoords"><a>[1:181:6]</a></td>
      <td class="reversal"></td>
    </tr>
    <tr class="eventFleet" id="eventRow-6" data-mission-type="15" data-return-flight="false">
      <td class="coordsOrigin"><a>[1:183:6]</a></td>
      <td class="destCoords"><a>[1:183:16]</a></td>
      <td class="reversal"></td>
    </tr>
  </table>
`;

function onEventBox(run) {
  const page = setupBrowser({
    html: `${overviewPage()}${EVENT_BOX}`,
    url: "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame&component=overview",
  });

  try {
    run(new OGBeyondInfinity(), (id) => document.querySelector(`#eventRow-${id}`).style.display);
  } finally {
    page.cleanup();
  }
}

test("an expedition that can still be recalled is never hidden", () => {
  onEventBox((instance, displayOf) => {
    instance.expeditionImpact(false);

    assert.notEqual(displayOf(1), "none", "the recall link was hidden with the row");
  });
});

test("an outbound expedition with no recall left is hidden as asked", () => {
  onEventBox((instance, displayOf) => {
    instance.expeditionImpact(false);

    assert.equal(displayOf(2), "none");
  });
});

test("nothing but outbound expeditions is touched", () => {
  onEventBox((instance, displayOf) => {
    instance.expeditionImpact(false);

    assert.notEqual(displayOf(3), "none", "a returning expedition is the half worth keeping");
    assert.notEqual(displayOf(4), "none", "mission 3 is a transport, not an expedition");
  });
});

test("an outbound row with no return row of its own is the fleet's only one, so it stays", () => {
  onEventBox((instance, displayOf) => {
    instance.expeditionImpact(false);

    // 1:183:6 -> 1:183:16 has no matching return row in the box. Hiding it would not
    // remove a duplicate, it would remove the flight - which is what a player saw as
    // an arrival counted in the header with no row anywhere in the list.
    assert.notEqual(displayOf(6), "none");
  });
});

test("re-ticking the box brings back exactly what un-ticking hid", () => {
  onEventBox((instance, displayOf) => {
    instance.expeditionImpact(false);
    assert.equal(displayOf(2), "none");

    instance.expeditionImpact(true);

    assert.notEqual(displayOf(2), "none", "the toggle is one-way");
  });
});

test("a just-launched expedition survives the toggle even with no return row on screen", () => {
  // The reported case: send one by accident, and the row with the recall link on it is
  // gone. There is no return row yet, which is what the old id-arithmetic needed - and
  // is also why there is nothing here to de-duplicate, so the row is left alone in the
  // first place rather than hidden and restored.
  const page = setupBrowser({
    html: `${overviewPage()}
      <table>
        <tr class="eventFleet" id="eventRow-7" data-mission-type="15" data-return-flight="false">
          <td class="coordsOrigin"><a>[1:181:6]</a></td>
          <td class="destCoords"><a>[1:181:16]</a></td>
          <td class="reversal"></td>
        </tr>
      </table>`,
    url: "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame&component=overview",
  });

  try {
    const instance = new OGBeyondInfinity();

    instance.expeditionImpact(false);
    assert.notEqual(document.querySelector("#eventRow-7").style.display, "none");

    instance.expeditionImpact(true);
    assert.notEqual(document.querySelector("#eventRow-7").style.display, "none");
  } finally {
    page.cleanup();
  }
});
