/**
 * `store/raidPins.js` - the player's own shortlist of farms.
 *
 * The one non-obvious rule here is the OGBIData write-through: `OGBIData.raidPins` is a
 * setter, so pushing onto the array it returns persists nothing. Every mutation has to
 * reassign, and that is what these tests pin down - a missed reassignment looks fine
 * until the page reloads and the pin is gone.
 *
 * Page-context module - no `chrome: true` on setupBrowser.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const browser = setupBrowser();
const OGBIData = (await import("../../src/store/OGBIData.js")).default;
const { getPins, isPinned, pinTarget, unpinTarget, togglePin } = await import("../../src/store/raidPins.js");

test.after(() => browser.cleanup());

function seed(raidPins = []) {
  OGBIData.json = { raidPins };
}

const target = (overrides = {}) => ({ coords: "1:150:4", name: "Sleeper", status: "i", moon: false, ...overrides });

test("a pinned target is readable back", () => {
  seed();
  pinTarget(target());

  assert.equal(isPinned("1:150:4"), true);
  assert.equal(getPins().length, 1);
  assert.equal(getPins()[0].name, "Sleeper");
});

test("pinning writes through the setter, so it survives a reload of the store", () => {
  seed();
  pinTarget(target());

  // What actually landed in storage, not what the in-memory array happens to hold.
  assert.deepEqual(
    JSON.parse(globalThis.localStorage.getItem("ogk-data")).raidPins.map((pin) => pin.coords),
    ["1:150:4"]
  );
});

test("pinning the same coordinates twice refreshes the row instead of duplicating it", () => {
  seed();
  pinTarget(target({ status: "i" }));
  pinTarget(target({ status: "I", name: "Sleeper renamed" }));

  assert.equal(getPins().length, 1);
  assert.equal(getPins()[0].status, "I");
  assert.equal(getPins()[0].name, "Sleeper renamed");
});

test("a planet and another planet of the same player are separate pins", () => {
  seed();
  pinTarget(target({ coords: "1:150:4" }));
  pinTarget(target({ coords: "1:150:8" }));

  assert.equal(getPins().length, 2);
});

test("unpinning removes exactly the one coordinate", () => {
  seed();
  pinTarget(target({ coords: "1:150:4" }));
  pinTarget(target({ coords: "2:20:9" }));

  unpinTarget("1:150:4");

  assert.deepEqual(
    getPins().map((pin) => pin.coords),
    ["2:20:9"]
  );
});

test("unpinning something that was never pinned is a no-op", () => {
  seed([{ coords: "2:20:9", name: "Other", status: "i", moon: false, pinnedAt: 1 }]);

  unpinTarget("9:9:9");

  assert.equal(getPins().length, 1);
});

test("toggle reports the resulting state and flips both ways", () => {
  seed();

  assert.equal(togglePin(target()), true);
  assert.equal(isPinned("1:150:4"), true);
  assert.equal(togglePin(target()), false);
  assert.equal(isPinned("1:150:4"), false);
});

test("a target without coordinates is ignored rather than stored as an empty row", () => {
  seed();

  pinTarget({ name: "Nowhere" });

  assert.equal(getPins().length, 0);
});

test("an unseeded store reads as an empty list", () => {
  OGBIData.json = {};

  assert.deepEqual(getPins(), []);
  assert.equal(isPinned("1:1:1"), false);
});
