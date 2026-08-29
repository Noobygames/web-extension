/**
 * OGBIData is the page-context singleton over `localStorage["ogk-data"]`.
 *
 * Its contract is easy to get wrong and is the source of a whole class of
 * "my change did not stick" bugs, so it is pinned down here explicitly.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const STORAGE_KEY = "ogk-data";

// A single shared instance, like the real page has, reset between tests through
// the `json` setter. Construction-time behaviour lives in
// OGBIData.construction.test.js - see the header there for why it is separate.
const bootstrap = setupBrowser();
const OGBIData = (await import("../../src/store/OGBIData.js")).default;
bootstrap.cleanup();

async function withOGBIData(seed, run) {
  const browser = setupBrowser();
  try {
    OGBIData.json = seed ?? {};
    globalThis.localStorage.removeItem(STORAGE_KEY);
    if (seed !== undefined) globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    await run(OGBIData, browser);
  } finally {
    browser.cleanup();
  }
}

/** Reads the blob straight out of localStorage, bypassing the singleton. */
function stored() {
  const raw = globalThis.localStorage.getItem(STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

test("assigning through a setter writes to localStorage immediately", async () => {
  await withOGBIData({}, (OGBIData) => {
    OGBIData.options = { fret: 202, rvalLimit: 1e6 };

    assert.deepEqual(stored().options, { fret: 202, rvalLimit: 1e6 });
  });
});

test("each setter persists only its own key and leaves the rest intact", async () => {
  await withOGBIData({ playerId: 1, options: { fret: 202 } }, (OGBIData) => {
    OGBIData.markers = { "1:2:3": "red" };

    const blob = stored();
    assert.deepEqual(blob.markers, { "1:2:3": "red" });
    assert.equal(blob.playerId, 1, "unrelated keys must survive");
    assert.deepEqual(blob.options, { fret: 202 });
  });
});

test("the json setter replaces the whole blob and persists it", async () => {
  await withOGBIData({ playerId: 1 }, (OGBIData) => {
    OGBIData.json = { playerId: 2, empire: [] };

    assert.deepEqual(stored(), { playerId: 2, empire: [] });
    assert.equal(OGBIData.playerId, 2);
  });
});

test("Save() persists in-place mutations of the json object", async () => {
  await withOGBIData({}, (OGBIData) => {
    OGBIData.json.translations = { lfTypeNames: { Kaelesh: "lifeform4" } };
    assert.equal(stored().translations, undefined, "nothing is written until Save() is called");

    OGBIData.Save();
    assert.deepEqual(stored().translations, { lfTypeNames: { Kaelesh: "lifeform4" } });
  });
});

test("playerId and universeUrl are read-only", async () => {
  await withOGBIData({ playerId: 1, universeUrl: "s1-en.ogame.gameforge.com" }, (OGBIData) => {
    // No setter is declared for either, so assignment throws in strict mode
    // (ES modules are always strict).
    assert.throws(() => {
      OGBIData.playerId = 2;
    }, TypeError);
    assert.equal(OGBIData.playerId, 1);
    assert.equal(OGBIData.universeUrl, "s1-en.ogame.gameforge.com");
  });
});

test("the sideStalk setter normalises ids to unique integers", async () => {
  await withOGBIData({}, (OGBIData) => {
    OGBIData.sideStalk = ["101", 101, "202", 303, "303"];

    assert.deepEqual(OGBIData.sideStalk, [101, 202, 303]);
    assert.deepEqual(stored().sideStalk, [101, 202, 303]);
  });
});

test("the sideStalk setter preserves insertion order", async () => {
  await withOGBIData({}, (OGBIData) => {
    OGBIData.sideStalk = [303, 101, 202];
    assert.deepEqual(OGBIData.sideStalk, [303, 101, 202]);
  });
});

test("the sideStalk remove/restore round-trip persists (PR #546)", async () => {
  await withOGBIData({}, (OGBIData) => {
    OGBIData.sideStalk = [101, 202, 303];

    // Exactly the shape stalk.js uses: copy -> splice -> reassign. A direct
    // OGBIData.sideStalk.splice() would mutate the getter's result and never save.
    const afterRemoval = OGBIData.sideStalk.slice();
    const index = afterRemoval.indexOf(202);
    afterRemoval.splice(index, 1);
    OGBIData.sideStalk = afterRemoval;

    assert.deepEqual(stored().sideStalk, [101, 303], "the removal must reach localStorage immediately");

    // Undo puts the player back at its old position, not at the end
    const afterUndo = OGBIData.sideStalk.slice();
    afterUndo.splice(index, 0, 202);
    OGBIData.sideStalk = afterUndo;

    assert.deepEqual(stored().sideStalk, [101, 202, 303]);
  });
});

test("TRAP: splicing the sideStalk getter result does NOT remove the player", async () => {
  await withOGBIData({}, (OGBIData) => {
    OGBIData.sideStalk = [101, 202, 303];

    OGBIData.sideStalk.splice(1, 1);

    // The getter hands back the live array, so the in-memory list does change -
    // but nothing is written, and the next reload brings the player back.
    assert.deepEqual(stored().sideStalk, [101, 202, 303]);
  });
});

test("EVERY write-through accessor persists to localStorage", async () => {
  // OGBIData is ~28 near-identical getter/setter pairs. A single missing
  // #save() in one of them is invisible by inspection, so the contract is
  // asserted generically - new accessors are picked up automatically.
  const descriptors = Object.getOwnPropertyDescriptors(Object.getPrototypeOf(OGBIData));

  const writable = Object.entries(descriptors).filter(([name, d]) => d.get && d.set && name !== "json");

  assert.ok(writable.length >= 25, `expected the full accessor set, found ${writable.length}`);

  await withOGBIData({}, (data) => {
    for (const [name] of writable) {
      // sideStalk normalises its input, so feed every accessor a list of ids -
      // it is a valid payload for the generic ones too.
      const value = [11, 22];
      data[name] = value;

      assert.deepEqual(data[name], value, `getter ${name} must read back what was set`);
      assert.deepEqual(stored()[name], value, `setter ${name} must persist (missing #save()?)`);
    }
  });
});

test("read-only accessors are exactly playerId and universeUrl", async () => {
  const descriptors = Object.getOwnPropertyDescriptors(Object.getPrototypeOf(OGBIData));
  const readOnly = Object.entries(descriptors)
    .filter(([, d]) => d.get && !d.set)
    .map(([name]) => name)
    .sort();

  assert.deepEqual(readOnly, ["playerId", "universeUrl"]);
});

test("stored values survive a round-trip through JSON", async () => {
  await withOGBIData({}, (OGBIData) => {
    const empire = [{ id: "33654321", coordinates: "[1:2:3]", metal: 12345, moon: { id: "33654322" } }];
    OGBIData.empire = empire;

    assert.deepEqual(stored().empire, empire);
    assert.deepEqual(OGBIData.empire, empire);
  });
});

// ---------------------------------------------------------------------------
// Contract traps. Not bugs in OGBIData itself, but the failure mode is silent
// and has already been flagged in review (see docs/github/pr-analysis.md, #546).
// ---------------------------------------------------------------------------

test("TRAP: mutating the object returned by a getter does NOT persist", async () => {
  await withOGBIData({ markers: { "1:2:3": "red" } }, (OGBIData) => {
    OGBIData.markers["4:5:6"] = "blue"; // no setter runs -> no #save()
    delete OGBIData.markers["1:2:3"];

    // The in-memory blob changed...
    assert.deepEqual(OGBIData.markers, { "4:5:6": "blue" });
    // ...but localStorage still holds the old value.
    assert.deepEqual(stored(), { markers: { "1:2:3": "red" } });

    // Reassignment (or Save()) is what makes it stick. The self-assignment is
    // the point: it is a no-op for the value but runs the setter, and therefore
    // #save(). This is the idiom the codebase needs after mutating in place.
    // eslint-disable-next-line no-self-assign
    OGBIData.markers = OGBIData.markers;
    assert.deepEqual(stored().markers, { "4:5:6": "blue" });
  });
});

test("TRAP: array mutation via push does NOT persist either", async () => {
  await withOGBIData({ empire: [{ id: 1 }] }, (OGBIData) => {
    OGBIData.empire.push({ id: 2 });

    assert.equal(OGBIData.empire.length, 2);
    assert.equal(stored().empire.length, 1);
  });
});
