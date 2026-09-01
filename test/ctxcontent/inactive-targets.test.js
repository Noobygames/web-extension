/**
 * `buildInactiveTargets()` - the `universe.inactives` bridge command's filter over the
 * cached universe database.
 *
 * The status attribute in `players.xml` is a bag of flags, not an enum: a player can be
 * inactive AND on vacation ("vi"), and "i" (7 days) and "I" (28 days) are two distinct
 * case-sensitive letters. Getting that wrong shows the player farms they cannot attack,
 * which is exactly the kind of failure no other test here would notice - the list still
 * renders, it is just wrong.
 *
 * Content-context module, so `setupBrowser({chrome: true})`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const browser = setupBrowser({ chrome: true });
const { buildInactiveTargets, isRaidableInactive } = await import("../../src/ctxcontent/callbacks/inactive-targets.js");

test.after(() => browser.cleanup());

/** A DataHelper-shaped stand-in: only `players` is read. */
function helper(players) {
  return { players };
}

function player(overrides = {}) {
  return {
    name: "Sleeper",
    status: "i",
    planets: [{ id: 1, player: 7, name: "Homeworld", coords: "1:150:4", moon: 0 }],
    ...overrides,
  };
}

test("status flags decide who counts as a raidable inactive", () => {
  const cases = [
    ["", false, "active player"],
    ["i", true, "inactive 7 days"],
    ["I", true, "inactive 28 days"],
    ["iI", true, "both inactivity flags"],
    ["vi", false, "inactive but on vacation"],
    ["iv", false, "flag order does not matter"],
    ["ib", false, "inactive but banned"],
    ["ia", false, "inactive admin"],
    ["o", false, "outlaw but active"],
    ["oi", true, "outlaw and inactive is still a farm"],
    ["v", false, "vacation only"],
  ];

  for (const [status, expected, label] of cases) {
    assert.equal(isRaidableInactive(status), expected, `${label} ("${status}")`);
  }
});

test("a missing status is treated as active, not as inactive", () => {
  assert.equal(isRaidableInactive(undefined), false);
  assert.equal(isRaidableInactive(null), false);
});

test("only planets in the requested galaxies come back", () => {
  const targets = buildInactiveTargets(
    helper({
      7: player({
        planets: [{ coords: "1:150:4" }, { coords: "3:20:9" }, { coords: "4:1:1" }],
      }),
    }),
    [1, 4]
  );

  assert.deepEqual(
    targets.map((target) => target.coords),
    ["1:150:4", "4:1:1"]
  );
});

test("an empty galaxy list means every galaxy", () => {
  const targets = buildInactiveTargets(
    helper({ 7: player({ planets: [{ coords: "1:150:4" }, { coords: "3:20:9" }] }) }),
    []
  );

  assert.equal(targets.length, 2);
});

test("active players contribute nothing, however many planets they own", () => {
  const targets = buildInactiveTargets(
    helper({
      7: player({ status: "", planets: [{ coords: "1:1:1" }, { coords: "1:2:2" }] }),
      8: player({ status: "I", planets: [{ coords: "1:3:3" }] }),
    }),
    [1]
  );

  assert.deepEqual(
    targets.map((target) => target.coords),
    ["1:3:3"]
  );
});

test("a planet the galaxy scan marked as gone is not a target", () => {
  const targets = buildInactiveTargets(
    helper({ 7: player({ planets: [{ coords: "1:1:1", deleted: true }, { coords: "1:2:2" }] }) }),
    [1]
  );

  assert.deepEqual(
    targets.map((target) => target.coords),
    ["1:2:2"]
  );
});

test("a player without planets is skipped rather than throwing", () => {
  assert.deepEqual(buildInactiveTargets(helper({ 7: player({ planets: undefined }) }), [1]), []);
});

test("a missing dataHelper yields an empty list", () => {
  assert.deepEqual(buildInactiveTargets(undefined, [1]), []);
  assert.deepEqual(buildInactiveTargets({}, [1]), []);
});

test("the moon flag is a boolean, and the player id a number", () => {
  const [withMoon, withoutMoon] = buildInactiveTargets(
    helper({
      7: player({
        planets: [
          { coords: "1:1:1", moon: 33445 },
          { coords: "1:2:2", moon: 0 },
        ],
      }),
    }),
    [1]
  );

  assert.equal(withMoon.moon, true);
  assert.equal(withoutMoon.moon, false);
  assert.equal(withMoon.playerId, 7);
});

/**
 * The result crosses the content/page bridge, which structured-clones it: a Map, a
 * Document or a class instance would not survive. Asserting the shape here is cheaper
 * than debugging a silent bridge rejection at runtime.
 */
test("every field is a bridge-cloneable primitive", () => {
  const targets = buildInactiveTargets(helper({ 7: player() }), [1]);

  assert.equal(targets.length, 1);
  for (const value of Object.values(targets[0])) {
    assert.ok(["string", "number", "boolean"].includes(typeof value), `${value} is not a primitive`);
  }
});
