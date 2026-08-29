/**
 * `readPageContext()` is the seam that was cut out of `OGBeyondInfinity`'s constructor.
 *
 * These are characterisation tests: they record what the constructor reads today,
 * including the places where it throws instead of coping. Phase 3 of refactoring.md
 * moves large parts of `ogCore.js` out; this file is what says whether the move
 * changed what the class sees.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";
import { readPageContext, stripCoordinateBrackets } from "../../src/util/pageContext.js";
import planetType from "../../src/util/enum/planetType.js";
import PlayerClass from "../../src/util/enum/playerClass.js";
import { overviewPage, planetList, metaTags, officers, characterClass } from "../fixtures/ogamePage.js";

const OVERVIEW_URL = "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame&component=overview";

/**
 * Runs `run` against a live jsdom page. Brackets are stripped first, exactly as the
 * constructor does it, because every coordinate assertion below depends on it.
 */
function withPage(html, run, { url = OVERVIEW_URL } = {}) {
  const browser = setupBrowser({ html, url });
  try {
    stripCoordinateBrackets(document);
    run(() => readPageContext(document, window.location));
  } finally {
    browser.cleanup();
  }
}

// --------------------------------------------------------------------------
// stripCoordinateBrackets
// --------------------------------------------------------------------------

test("stripCoordinateBrackets turns the game's [1:2:3] into 1:2:3", () => {
  const browser = setupBrowser({ html: planetList([{ id: 1, coords: "1:2:3", active: true }]) });
  try {
    assert.equal(document.querySelector(".planet-koords").textContent, "[1:2:3]");
    stripCoordinateBrackets(document);
    assert.equal(document.querySelector(".planet-koords").textContent, "1:2:3");
  } finally {
    browser.cleanup();
  }
});

test("TRAP: stripCoordinateBrackets is not idempotent", () => {
  // It slices one character off each end unconditionally. Calling it twice eats
  // into the coordinates themselves. It runs exactly once, from the constructor -
  // anything that re-runs the constructor's DOM setup has to know this.
  const browser = setupBrowser({ html: planetList([{ id: 1, coords: "1:2:3", active: true }]) });
  try {
    stripCoordinateBrackets(document);
    stripCoordinateBrackets(document);
    assert.equal(document.querySelector(".planet-koords").textContent, ":2:");
  } finally {
    browser.cleanup();
  }
});

// --------------------------------------------------------------------------
// readPageContext - the happy path
// --------------------------------------------------------------------------

test("readPageContext reads identity, universe and page from the meta tags and URL", () => {
  withPage(overviewPage(), (read) => {
    const context = read();

    assert.equal(context.playerId, 12345);
    assert.equal(context.universe, "1", "digits of the host, not the meta");
    assert.equal(context.universeDomain, "s1-en.ogame.gameforge.com");
    assert.equal(context.universeUrl, "https://s1-en.ogame.gameforge.com");
    assert.equal(context.universeName, "Quantum");
    assert.equal(context.page, "overview", "component wins over page");
  });
});

test("readPageContext falls back to the page parameter when there is no component", () => {
  withPage(overviewPage(), (read) => assert.equal(read().page, "messages"), {
    url: "https://s1-en.ogame.gameforge.com/game/index.php?page=messages",
  });
});

test("readPageContext defaults the mode and picks up oglMode from the URL", () => {
  withPage(overviewPage(), (read) => assert.equal(read().mode, 0));
  withPage(overviewPage(), (read) => assert.equal(read().mode, "3"), {
    url: OVERVIEW_URL + "&oglMode=3",
  });
});

test("readPageContext maps the character-class badge onto the PlayerClass enum", () => {
  const cases = [
    [null, PlayerClass.NONE],
    ["explorer", PlayerClass.EXPLORER],
    ["warrior", PlayerClass.WARRIOR],
    ["miner", PlayerClass.MINER],
  ];
  for (const [badge, expected] of cases) {
    withPage(overviewPage({ playerClassName: badge }), (read) =>
      assert.equal(read().playerClass, expected, `badge ${badge}`)
    );
  }
});

test("readPageContext reads each officer independently", () => {
  withPage(overviewPage(), (read) => {
    const context = read();
    assert.deepEqual(
      {
        commander: context.commander,
        admiral: context.admiral,
        engineer: context.engineer,
        geologist: context.geologist,
        technocrat: context.technocrat,
        allOfficers: context.allOfficers,
      },
      { commander: false, admiral: false, engineer: false, geologist: false, technocrat: false, allOfficers: false }
    );
  });

  withPage(overviewPage({ officerState: { commander: true, geologist: true, all: true } }), (read) => {
    const context = read();
    assert.equal(context.commander, true);
    assert.equal(context.geologist, true);
    assert.equal(context.admiral, false);
    assert.equal(context.allOfficers, true);
  });
});

test("readPageContext takes the home planet to be the one with the lowest id", () => {
  const planets = [
    { id: 33790, coords: "4:5:6" },
    { id: 33621, coords: "1:2:3" },
    { id: 40000, coords: "7:8:9", active: true },
  ];
  withPage([metaTags(), characterClass(), officers(), planetList(planets)].join("\n"), (read) => {
    assert.deepEqual(read().homePlanetCoords, {
      galaxy: 1,
      system: 2,
      position: 3,
      type: planetType.planet,
    });
  });
});

test("readPageContext resolves the current planet from the active planetlink", () => {
  withPage(overviewPage(), (read) => {
    const context = read();
    assert.equal(context.current.id, 33790);
    assert.equal(context.current.coords, "4:5:6");
    assert.equal(context.current.hasMoon, false);
    assert.equal(context.current.isMoon, false);
    assert.equal(context.current.planet.id, "planet-33790");
  });
});

test("readPageContext distinguishes having a moon from standing on it", () => {
  const withMoon = (moonActive) =>
    [
      metaTags(),
      characterClass(),
      officers(),
      planetList([{ id: 33621, coords: "1:2:3", active: !moonActive, moon: true, moonActive }]),
    ].join("\n");

  withPage(withMoon(false), (read) => {
    const context = read();
    assert.equal(context.current.hasMoon, true);
    assert.equal(context.current.isMoon, false);
  });

  withPage(withMoon(true), (read) => {
    const context = read();
    assert.equal(context.current.hasMoon, true);
    assert.equal(context.current.isMoon, true, "standing on the moon of that planet");
  });
});

test("readPageContext falls back to the first planetlink when nothing is active", () => {
  const planets = [
    { id: 33621, coords: "1:2:3" },
    { id: 33790, coords: "4:5:6" },
  ];
  withPage([metaTags(), characterClass(), officers(), planetList(planets)].join("\n"), (read) => {
    assert.equal(read().current.id, 33621);
  });
});

test("readPageContext exposes the raw planet list as a live NodeList", () => {
  withPage(overviewPage(), (read) => {
    const context = read();
    assert.equal(context.planetList.length, 2);
    assert.equal(context.planetList[0].id, "planet-33621");
  });
});

// --------------------------------------------------------------------------
// The parts that throw. Still throw - construction cannot meaningfully continue
// without a player id, a home planet or a universe - but the message now says
// which precondition was missing instead of surfacing as a bare null dereference.
// Fixed in refactoring-new.md Phase A.2 #6.
// --------------------------------------------------------------------------

test("a page without the player-id meta throws a descriptive error, not a TypeError", () => {
  // Every OGame page carries this tag, so in practice it is unreachable - but it was
  // the first thing the constructor touched, which is why `new OGBeyondInfinity()`
  // could not be tested at all before this seam existed.
  const html = [characterClass(), officers(), planetList([{ id: 1, coords: "1:2:3", active: true }])].join("\n");
  withPage(html, (read) => assert.throws(read, { message: /ogame-player-id/ }));
});

test("an empty planet list throws a descriptive error, not a TypeError one line later", () => {
  // Before the fix, `Math.min()` of nothing was Infinity, `indexOf(Infinity)` was
  // -1, and `planetList[-1]` was undefined - so the failure surfaced one line later
  // as a null dereference, with no hint that the planet list was the problem.
  const html = [metaTags(), characterClass(), officers(), planetList([])].join("\n");
  withPage(html, (read) => assert.throws(read, { message: /planet list/ }));
});

test("a missing universe meta throws a descriptive error after the planet reads succeed", () => {
  const html = [
    '<meta name="ogame-player-id" content="7">',
    characterClass(),
    officers(),
    planetList([{ id: 1, coords: "1:2:3", active: true }]),
  ].join("\n");
  withPage(html, (read) => assert.throws(read, { message: /ogame-universe/ }));
});
