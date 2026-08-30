/**
 * The side-stalk panel: the pinned player watchlist (`side()`), its "Historic"
 * list, and the hover tooltip (`stalk()`) used elsewhere (galaxy, fleetdispatch, ...)
 * to show a player's planets.
 *
 * `player.get()` (src/ctxpage/stalk/player.js) resolves over a `ogi-players` /
 * `ogi-players-rep` window event round trip rather than a direct call, so every test
 * below that needs a player answers that event itself instead of mocking the module -
 * it is the same wiring a real page provides via ctxcontent's player-lookup service.
 *
 * `keepTooltip`, `undoSideStalkRemoval` and `undoSideStalkTimer` are module-level
 * state, so - like needs.js - later tests in this file build on whatever an earlier
 * test's OGBIData.sideStalk/OGBIData.needs left behind. Each test below uses its own
 * player id(s) to stay independent of the others.
 *
 * Page context module - no `chrome: true` on setupBrowser.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../../helpers/globals.js";

const bootstrap = setupBrowser();
const OGBIData = (await import("../../../src/store/OGBIData.js")).default;
const stalkPanel = await import("../../../src/ctxpage/stalk/stalkPanel.js");
bootstrap.cleanup();

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Answers every `ogi-players` request from a fixed id -> player map. */
function respondWithPlayers(players) {
  window.addEventListener("ogi-players", (evt) => {
    const player = players[evt.detail.id];
    window.dispatchEvent(new CustomEvent("ogi-players-rep", { detail: { player } }));
  });
}

test("update() sorts planets by coordinates", () => {
  const browser = setupBrowser();
  try {
    OGBIData.markers = {};
    const planets = {
      a: { id: "5", coords: "1:2:20", deleted: false, scanned: false, moon: null },
      b: { id: "99", coords: "1:2:1", deleted: false, scanned: false, moon: null },
    };

    const dom = stalkPanel.update(planets);

    assert.equal(dom.length, 2);
    assert.equal(dom[0].getAttribute("data-coords"), "1:2:1", "the lower coordinate sorts first");
    assert.equal(dom[1].getAttribute("data-coords"), "1:2:20");
  } finally {
    browser.cleanup();
  }
});

test("update() flags the planet with the lowest id as main, regardless of sort order", () => {
  const browser = setupBrowser();
  try {
    OGBIData.markers = {};
    const planets = {
      a: { id: "5", coords: "1:2:20", deleted: false, scanned: false, moon: null },
      b: { id: "99", coords: "1:2:1", deleted: false, scanned: false, moon: null },
    };

    const dom = stalkPanel.update(planets);
    const byCoords = Object.fromEntries(dom.map((el) => [el.getAttribute("data-coords"), el]));

    assert.ok(byCoords["1:2:20"].classList.contains("ogl-main"), "id 5 is the lowest, even though it sorts second");
    assert.equal(byCoords["1:2:1"].classList.contains("ogl-main"), false);
  } finally {
    browser.cleanup();
  }
});

test("update() flags deleted, scanned, moon and marked planets", () => {
  const browser = setupBrowser();
  try {
    OGBIData.markers = { "1:2:3": { color: "red" } };
    const planets = {
      a: { id: "1", coords: "1:2:3", deleted: false, scanned: false, moon: { id: "2" } },
      b: { id: "2", coords: "1:2:4", deleted: true, scanned: false, moon: null },
      c: { id: "3", coords: "1:2:5", deleted: false, scanned: true, moon: null },
    };

    const dom = stalkPanel.update(planets);
    const byCoords = Object.fromEntries(dom.map((a) => [a.getAttribute("data-coords"), a]));

    assert.equal(byCoords["1:2:3"].getAttribute("data-marked"), "red");
    assert.ok(byCoords["1:2:3"].classList.contains("ogl-marked"));
    assert.ok(
      byCoords["1:2:3"].querySelector(".ogl-moon-div").classList.contains("ogl-active"),
      "the moon icon is active"
    );
    assert.ok(byCoords["1:2:4"].classList.contains("ogl-deleted"));
    assert.ok(byCoords["1:2:5"].classList.contains("ogl-scan"));
  } finally {
    browser.cleanup();
  }
});

test("ctrl-clicking a planet link opens the galaxy view in a new tab instead of navigating", () => {
  const browser = setupBrowser();
  try {
    OGBIData.markers = {};
    const planets = { a: { id: "1", coords: "1:2:3", deleted: false, scanned: false, moon: null } };
    const [a] = stalkPanel.update(planets);
    document.body.appendChild(a);

    let openedUrl;
    const originalOpen = window.open;
    window.open = (url) => {
      openedUrl = url;
    };

    try {
      a.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
    } finally {
      window.open = originalOpen;
    }

    assert.ok(openedUrl.includes("component=galaxy"));
    assert.ok(openedUrl.includes("galaxy=1"));
  } finally {
    browser.cleanup();
  }
});

test("hovering a stalk sender renders the player's name, rank and planet list", async () => {
  const browser = setupBrowser({ html: `<div id="sender"></div>` });
  try {
    OGBIData.empire = [];
    OGBIData.sideStalk = [];
    OGBIData.playerMarkers = {};
    OGBIData.markers = {};
    OGBIData.options = {};
    globalThis.localTime = Date.now();
    globalThis.initBuddyRequestForm = () => {};

    const player = {
      id: 500,
      name: "Foo",
      status: "",
      points: { position: 3, score: 12345 },
      economy: { score: 100 },
      research: { score: 200 },
      military: { score: 300, ships: 42 },
      def: 10,
      lastUpdate: Date.now(),
      // player.planets is an array in real data (data-helper.js builds it via
      // `planets.sort(...)` on an array), unlike update()'s own object-keyed input.
      planets: [{ id: "9001", coords: "1:2:3", moon: null, deleted: false, scanned: false }],
    };
    respondWithPlayers({ 500: player });

    const sender = document.getElementById("sender");
    stalkPanel.stalk(sender, 500);
    // jsdom's documentElement always carries `ontouchstart` (even without real touch
    // support), so stalk()'s `"ontouchstart" in document.documentElement` feature
    // check picks "touchstart" here, not "mouseenter" - matching what a real touch
    // device (or many desktop browser/OS combos, where this check is famously
    // unreliable) gets too.
    sender.dispatchEvent(new Event("touchstart", { bubbles: true }));
    await tick();

    const tooltipEl = document.querySelector(".ogl-tooltip");
    assert.ok(tooltipEl);
    assert.ok(tooltipEl.querySelector("h1").textContent.includes("Foo"));
    assert.equal(tooltipEl.querySelectorAll(".ogl-stalkPlanets a").length, 1);
    assert.equal(tooltipEl.querySelector(".ogl-fullGrid").textContent, "1 planets");
  } finally {
    browser.cleanup();
    delete globalThis.localTime;
    delete globalThis.initBuddyRequestForm;
  }
});

test("side(playerId) renders the compact panel with its buttons and the player's planets", async () => {
  const browser = setupBrowser({ html: `<div id="links"></div>` });
  try {
    OGBIData.json = {
      sideStalk: [],
      options: { sideStalkVisible: true },
      playerMarkers: {},
      markers: {},
      searchHistory: [],
    };
    globalThis.localTime = Date.now();
    const player = {
      id: 700,
      name: "Bar",
      status: "",
      lastUpdate: Date.now(),
      planets: { 1: { id: "9101", coords: "3:4:5", moon: null, deleted: false, scanned: false } },
    };
    respondWithPlayers({ 700: player });

    stalkPanel.side(700);
    await tick();

    assert.deepEqual(OGBIData.sideStalk, [700]);
    const panel = document.querySelector(".ogl-sideStalk");
    assert.ok(panel);
    assert.ok(panel.querySelector(".ogi-title").textContent.includes("Bar"));
    assert.equal(panel.querySelectorAll(".ogl-stalkPlanets a").length, 1);
    assert.ok(
      Array.from(panel.querySelectorAll("a.material-icons")).find((el) => el.textContent === "history"),
      "the watchlist button is present"
    );
    assert.equal(panel.querySelector(".ogl-ptre-acti"), null, "no PTRE button without options.ptreTK");
  } finally {
    browser.cleanup();
    delete globalThis.localTime;
  }
});

test("the planet's inert probe icon shows the compliance notice instead of doing nothing", async () => {
  const browser = setupBrowser({ html: `<div id="links"></div>` });
  try {
    OGBIData.json = {
      sideStalk: [],
      options: { sideStalkVisible: true },
      playerMarkers: {},
      markers: {},
      searchHistory: [],
    };
    globalThis.localTime = Date.now();
    respondWithPlayers({
      700: {
        id: 700,
        name: "Bar",
        status: "",
        lastUpdate: Date.now(),
        planets: { 1: { id: "9101", coords: "3:4:5", moon: null, deleted: false, scanned: false } },
      },
    });

    stalkPanel.side(700);
    await tick();

    // AGENTS.md 1.5.1: direct probing outside the galaxy view/inbox is forbidden, so this
    // icon must never send a probe - clicking it has to explain that instead of doing
    // nothing at all, which is how it silently regressed before (dead commented-out listener).
    document.querySelector(".ogl-stalkPlanets .icon_eye").dispatchEvent(new window.Event("click", { bubbles: true }));

    const dialog = document.querySelector(".ogl-dialog");
    assert.ok(dialog, "clicking the probe icon opens the compliance notice popup");
    assert.match(dialog.textContent, /direct probing/i);
  } finally {
    browser.cleanup();
    delete globalThis.localTime;
  }
});

test("side() on a hidden panel starts collapsed and expands on click", async () => {
  const browser = setupBrowser({ html: `<div id="links"></div>` });
  try {
    OGBIData.json = {
      sideStalk: [],
      options: { sideStalkVisible: false },
      playerMarkers: {},
      markers: {},
      searchHistory: [],
    };
    globalThis.localTime = Date.now();
    const player = { id: 702, name: "Hidden", status: "", lastUpdate: Date.now(), planets: {} };
    respondWithPlayers({ 702: player });

    stalkPanel.side(702);
    await tick();

    const panel = document.querySelector(".ogl-sideStalk");
    assert.ok(panel.classList.contains("ogi-hidden"), "hiding is a CSS class, not conditional DOM construction");
    assert.ok(panel.querySelector(".ogi-title"), "the detail content is still built while hidden");

    panel.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    await tick();

    assert.equal(OGBIData.options.sideStalkVisible, true);
    assert.ok(document.querySelector(".ogl-sideStalk .ogi-title"), "clicking expands the panel");
  } finally {
    browser.cleanup();
    delete globalThis.localTime;
  }
});

test("removing the panel's player shows an undo row and the undo button restores them", async () => {
  const browser = setupBrowser({ html: `<div id="links"></div>` });
  try {
    OGBIData.json = {
      sideStalk: [],
      options: { sideStalkVisible: true },
      playerMarkers: {},
      markers: {},
      searchHistory: [],
    };
    globalThis.localTime = Date.now();
    const player = {
      id: 701,
      name: "Baz",
      status: "",
      points: { position: 1 },
      lastUpdate: Date.now(),
      planets: {},
    };
    respondWithPlayers({ 701: player });

    stalkPanel.side(701);
    await tick();

    document
      .querySelector(".ogi-sideStalkRemoveDetail")
      .dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));

    assert.deepEqual(OGBIData.sideStalk, []);
    const undo = document.querySelector(".ogi-sideStalkUndo");
    assert.ok(undo, "an undo row appears");
    assert.ok(undo.querySelector(".ogi-sideStalkUndoMessage").textContent.includes("Baz"));

    undo
      .querySelector(".ogi-sideStalkUndoButton")
      .dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    // the undo handler re-renders the historic list, which re-resolves player.get()
    // asynchronously - await it here so nothing leaks into the next test.
    await tick();

    assert.deepEqual(OGBIData.sideStalk, [701], "the undo button restores the player");
  } finally {
    browser.cleanup();
    delete globalThis.localTime;
  }
});

test("the watchlist button shows the historic list, and clicking an older entry moves it to the front", async () => {
  const browser = setupBrowser({ html: `<div id="links"></div>` });
  try {
    OGBIData.json = {
      sideStalk: [],
      options: { sideStalkVisible: true },
      playerMarkers: {},
      markers: {},
      searchHistory: [],
    };
    globalThis.localTime = Date.now();
    respondWithPlayers({
      710: { id: 710, name: "Older", status: "", points: { position: 1 }, lastUpdate: Date.now(), planets: {} },
      711: { id: 711, name: "Newer", status: "", points: { position: 2 }, lastUpdate: Date.now(), planets: {} },
    });

    stalkPanel.side(710);
    await tick();
    stalkPanel.side(711);
    await tick();

    assert.deepEqual(OGBIData.sideStalk, [710, 711]);

    // Selects on the Material Icons ligature text (always "history", unlike the
    // now-localized title) rather than a hardcoded English title.
    Array.from(document.querySelectorAll("a.material-icons"))
      .find((el) => el.textContent === "history")
      .dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    await tick(); // each row's name/rank fills in asynchronously via player.get(id).then(...)

    const title = document.querySelector(".ogl-sideStalk .title");
    assert.ok(title.textContent.startsWith("Historic 2/20"));

    const rows = document.querySelectorAll(".ogi-sideStalkList > .ogl-player");
    assert.equal(rows.length, 2);
    assert.ok(rows[0].textContent.includes("Newer"), "the most recently stalked player is listed first");
    assert.ok(rows[1].textContent.includes("Older"));

    rows[1].dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    await tick();

    assert.deepEqual(OGBIData.sideStalk, [711, 710], "selecting an older entry moves it to the front of the list");
    assert.ok(
      document.querySelector(".ogi-title").textContent.includes("Older"),
      "the panel returns to the detail view"
    );
  } finally {
    browser.cleanup();
    delete globalThis.localTime;
  }
});

test("removing one entry from the historic list replaces just that row, leaving the other untouched", async (t) => {
  const browser = setupBrowser({ html: `<div id="links"></div>` });
  try {
    OGBIData.json = {
      sideStalk: [],
      options: { sideStalkVisible: true },
      playerMarkers: {},
      markers: {},
      searchHistory: [],
    };
    globalThis.localTime = Date.now();
    respondWithPlayers({
      720: { id: 720, name: "First", status: "", points: { position: 1 }, lastUpdate: Date.now(), planets: {} },
      721: { id: 721, name: "Second", status: "", points: { position: 2 }, lastUpdate: Date.now(), planets: {} },
    });

    stalkPanel.side(720);
    await tick();
    stalkPanel.side(721);
    await tick();

    // Selects on the Material Icons ligature text (always "history", unlike the
    // now-localized title) rather than a hardcoded English title.
    Array.from(document.querySelectorAll("a.material-icons"))
      .find((el) => el.textContent === "history")
      .dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    await tick(); // each row's name/rank fills in asynchronously via player.get(id).then(...)

    const rows = document.querySelectorAll(".ogi-sideStalkList > .ogl-player");
    const secondRow = Array.from(rows).find((row) => row.textContent.includes("Second"));

    // showSideStalkUndo() always schedules a real 6s fade-out setTimeout; mock it here
    // so it never fires for real after this test (and its browser globals) is gone.
    t.mock.timers.enable({ apis: ["setTimeout"] });
    try {
      secondRow
        .querySelector(".ogi-sideStalkRemove")
        .dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));

      assert.deepEqual(OGBIData.sideStalk, [720]);
      // the undo row also carries .ogl-player (createSideStalkUndoRow), so "untouched"
      // means one real row plus the undo row, not one row total.
      assert.equal(
        document.querySelectorAll(".ogi-sideStalkList > .ogl-player:not(.ogi-sideStalkUndo)").length,
        1,
        "the other row is untouched"
      );
      assert.ok(
        document.querySelector(".ogi-sideStalkList .ogi-sideStalkUndo"),
        "the removed row is replaced with an undo message"
      );
    } finally {
      t.mock.timers.reset();
    }
  } finally {
    browser.cleanup();
    delete globalThis.localTime;
  }
});

test("an undo row fades out on its own and leaves the empty-state message behind", async (t) => {
  const browser = setupBrowser({ html: `<div id="links"></div>` });
  try {
    OGBIData.json = {
      sideStalk: [],
      options: { sideStalkVisible: true },
      playerMarkers: {},
      markers: {},
      searchHistory: [],
    };
    globalThis.localTime = Date.now();
    respondWithPlayers({ 730: { id: 730, name: "Solo", status: "", lastUpdate: Date.now(), planets: {} } });

    stalkPanel.side(730);
    await tick();

    t.mock.timers.enable({ apis: ["setTimeout"] });
    try {
      document
        .querySelector(".ogi-sideStalkRemoveDetail")
        .dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));

      assert.ok(document.querySelector(".ogi-sideStalkUndo"));

      t.mock.timers.tick(6000);
      assert.ok(document.querySelector(".ogi-sideStalkUndo.ogi-removing"), "the row starts fading after 6s");

      t.mock.timers.tick(300);
      assert.equal(document.querySelector(".ogi-sideStalkUndo"), null, "the row is gone after the fade");
      assert.ok(document.querySelector(".ogi-sideStalkEmpty"), "an empty-state message takes its place");
    } finally {
      t.mock.timers.reset();
    }
  } finally {
    browser.cleanup();
    delete globalThis.localTime;
  }
});
