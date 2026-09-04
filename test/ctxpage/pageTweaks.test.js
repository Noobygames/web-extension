/**
 * Runtime guard for `checkDebris()`, the galaxy-view debris annotator.
 *
 * The static guard in `module-wiring.test.js` catches the shape of the defect; this one
 * runs the code. `FPSLoop` came out of `ogCore.js` still dispatching through
 * `this[callbackAsString]`, which is `undefined` in a module, so every galaxy view threw
 * "Cannot read properties of undefined (reading 'checkDebris')" one frame after the
 * annotator drew - after the visible work, which is why nothing else noticed.
 *
 * `setupBrowser()` runs before the imports because the page-context modules underneath
 * (`logger.js` -> `runContext.js`) refuse to load without a window.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const browser = setupBrowser({
  url: "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame&component=galaxy",
  ogameVersion: "13.0.0",
});

const OGBIData = (await import("../../src/store/OGBIData.js")).default;
const { checkDebris, recyclersHere, debrisHint } = await import("../../src/ctxpage/pageTweaks/index.js");
const Translator = (await import("../../src/format/i18n/translate.js")).default;

test.after(() => browser.cleanup());

/** One galaxy row with a debris field, written the way the game writes it. */
const GALAXY_DEBRIS = `
  <div class="cellDebris">
    <div class="microdebris"></div>
    <ul class="ListLinks">
      <li class="debris-content">Metal: 1.234</li>
      <li class="debris-content">Crystal: 2.345</li>
      <li class="debris-content">Deuterium: 345</li>
    </ul>
  </div>
`;

/** `rvalLimit` is the only thing `checkDebris` reads out of the store. */
function withStore(rvalLimit = 1e6) {
  OGBIData.json = { options: { rvalLimit } };
}

/**
 * `requestAnimationFrame` is absent from JSDOM unless `pretendToBeVisual` is set, and
 * the timer is what schedules the re-arm. Both are captured rather than stubbed away,
 * so the test can run the queued callback itself and see whether it throws.
 */
function captureFrameQueue() {
  const savedRaf = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
  const savedTimeout = globalThis.setTimeout;
  const queue = [];

  Object.defineProperty(globalThis, "requestAnimationFrame", {
    value: (fn) => queue.push(fn),
    writable: true,
    configurable: true,
  });
  globalThis.setTimeout = (fn) => {
    queue.push(fn);
    return 0;
  };

  return {
    get pending() {
      return queue.length;
    },
    /** Runs up to `ticks` queued callbacks, including ones those callbacks queue. */
    run(ticks) {
      for (let i = 0; i < ticks && queue.length; i++) queue.shift()();
    },
    restore() {
      globalThis.setTimeout = savedTimeout;
      if (savedRaf) Object.defineProperty(globalThis, "requestAnimationFrame", savedRaf);
      else delete globalThis.requestAnimationFrame;
    },
  };
}

test("checkDebris annotates a debris cell and re-arms itself without throwing", () => {
  document.body.innerHTML = GALAXY_DEBRIS;
  withStore();
  const frames = captureFrameQueue();

  try {
    checkDebris({ page: "galaxy" });

    // The visible half ran: the cell is marked and the three resource values are drawn.
    const debris = document.querySelector(".cellDebris .ListLinks");
    assert.ok(debris.classList.contains("ogl-debrisReady"), "the debris list was not annotated");
    assert.equal(document.querySelectorAll(".microdebris > div").length, 3);

    // The half that crashed: the queued frame callback used to dereference `this`.
    // Two ticks - the timer, then the animation frame - are one full re-arm.
    assert.equal(frames.pending, 1, "checkDebris did not schedule its re-arm");
    assert.doesNotThrow(() => frames.run(2), "the FPSLoop re-arm threw");

    // It re-armed rather than dying quietly, and the second pass left the cell alone.
    assert.equal(frames.pending, 1, "the re-armed pass did not schedule the next one");
    assert.equal(document.querySelectorAll(".microdebris > div").length, 3, "the re-arm redrew the cell");
  } finally {
    frames.restore();
  }
});

test("the re-armed pass still knows which page it is on", () => {
  document.body.innerHTML = GALAXY_DEBRIS;
  withStore();
  const frames = captureFrameQueue();

  try {
    // The string dispatch passed no context at all, so a fix that only silenced the
    // TypeError would stop at `context.page` on the second pass instead.
    checkDebris({ page: "galaxy" });
    frames.run(2);
    document.body.innerHTML = GALAXY_DEBRIS;
    frames.run(2);

    assert.equal(document.querySelectorAll(".microdebris > div").length, 3, "the poll stopped seeing the page");
  } finally {
    frames.restore();
  }
});

test("checkDebris does nothing off the galaxy page", () => {
  document.body.innerHTML = GALAXY_DEBRIS;
  withStore();
  const frames = captureFrameQueue();

  try {
    checkDebris({ page: "overview" });
    assert.equal(frames.pending, 0, "the poll must not start on a page that has no debris cells");
    assert.equal(document.querySelectorAll(".microdebris > div").length, 0);
  } finally {
    frames.restore();
  }
});

// --------------------------------------------------------------------------
// "no recycler here" in the debris tooltip
// --------------------------------------------------------------------------

/**
 * OGame's harvest link in a debris tooltip is dead when the planet the player is
 * standing on has no recycler, and the game says nothing about why - it reads as a
 * broken link. These pin the line that explains it, and the two cases where saying
 * anything would be wrong.
 */

/** `OGBIData.empire` with a known recycler count on planet and moon. */
function withEmpire({ planetRecyclers = 0, moonRecyclers = 0, moon = true } = {}) {
  OGBIData.json = {
    options: { rvalLimit: 1e6 },
    empire: [
      {
        id: 101,
        name: "Colony",
        coordinates: "[1:234:5]",
        209: planetRecyclers,
        moon: moon ? { id: 1011, 209: moonRecyclers } : null,
      },
    ],
  };
}

const galaxyContext = (current) => ({ page: "galaxy", current });

function hintIn(document_) {
  return document_.querySelector(".cellDebris .ListLinks .ogl-debrisHint");
}

test("a planet with no recycler says so in the debris tooltip", () => {
  document.body.innerHTML = GALAXY_DEBRIS;
  withEmpire({ planetRecyclers: 0 });
  const frames = captureFrameQueue();

  try {
    checkDebris(galaxyContext({ index: 0, isMoon: false }));

    const hint = hintIn(document);
    assert.ok(hint, "the tooltip does not explain the dead harvest link");
    assert.equal(hint.textContent, Translator.translate(415));
    // In the tooltip body, not in the cell: the cell shows the three resource figures.
    assert.equal(document.querySelectorAll(".microdebris > div").length, 3);
  } finally {
    frames.restore();
  }
});

test("a planet that has recyclers gets no hint - there is nothing to explain", () => {
  document.body.innerHTML = GALAXY_DEBRIS;
  withEmpire({ planetRecyclers: 12 });
  const frames = captureFrameQueue();

  try {
    checkDebris(galaxyContext({ index: 0, isMoon: false }));

    assert.equal(hintIn(document), null);
  } finally {
    frames.restore();
  }
});

test("standing on the moon reads the moon's recyclers, not the planet's", () => {
  document.body.innerHTML = GALAXY_DEBRIS;
  withEmpire({ planetRecyclers: 40, moonRecyclers: 0 });
  const frames = captureFrameQueue();

  try {
    checkDebris(galaxyContext({ index: 0, isMoon: true }));

    assert.ok(hintIn(document), "a full planet does not help a moon that has none");
  } finally {
    frames.restore();
  }
});

test("an empire the extension cannot read says nothing rather than something wrong", () => {
  // NaN, not 0: "we do not know" must never be reported as "you have none".
  document.body.innerHTML = GALAXY_DEBRIS;
  withStore();
  const frames = captureFrameQueue();

  try {
    assert.ok(Number.isNaN(recyclersHere(galaxyContext({ index: 0, isMoon: false }))));
    assert.equal(debrisHint(galaxyContext({ index: 0, isMoon: false })), null);
    assert.equal(debrisHint(galaxyContext(undefined)), null);

    checkDebris(galaxyContext({ index: 0, isMoon: false }));
    assert.equal(hintIn(document), null);
  } finally {
    frames.restore();
  }
});

test("the 20-per-second poll does not stack a second hint onto the same cell", () => {
  document.body.innerHTML = GALAXY_DEBRIS;
  withEmpire({ planetRecyclers: 0 });
  const frames = captureFrameQueue();

  try {
    checkDebris(galaxyContext({ index: 0, isMoon: false }));
    frames.run(6);

    assert.equal(document.querySelectorAll(".ogl-debrisHint").length, 1);
  } finally {
    frames.restore();
  }
});

test("the expedition debris box keeps its links when the compact figures replace it", () => {
  // It used to be a bare `replaceChildren(div)`, which drops everything inside
  // `#expeditionDebris` - the harvest link with it, if the game puts it there.
  document.body.innerHTML = `
    <div class="expeditionDebrisSlotBox">
      <div id="expeditionDebris">
        <ul class="ListLinks">
          <li class="debris-content">Metal: 1.000</li>
          <li class="debris-content">Crystal: 2.000</li>
        </ul>
        <a href="?page=ingame&component=fleetdispatch" class="harvest">Harvest</a>
      </div>
    </div>
  `;
  withStore();
  const frames = captureFrameQueue();

  try {
    checkDebris(galaxyContext({ index: 0, isMoon: false }));

    const box = document.querySelector("#expeditionDebris");
    assert.ok(box.querySelector("a.harvest"), "the harvest link was thrown away");
    assert.equal(box.querySelectorAll(".microdebris > div").length, 2, "and the figures are still drawn");
  } finally {
    frames.restore();
  }
});
