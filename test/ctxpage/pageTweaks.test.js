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

const OGBIData = (await import("../../src/util/OGBIData.js")).default;
const { checkDebris } = await import("../../src/ctxpage/pageTweaks/index.js");

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
