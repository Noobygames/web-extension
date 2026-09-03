/**
 * `store/upgradePlans.js` - the structured upgrade plans behind the resource needs.
 *
 * Two rules carry the file. The OGBIData write-through: `OGBIData.upgradePlans` is a
 * setter, so mutating the object it returns persists nothing - every change has to
 * reassign. And `reconcile()`, which is the whole point of storing entries instead of
 * a resource blob: a finished upgrade has to disappear on its own, a half-finished one
 * has to shrink. Both fail silently on a real page.
 *
 * Page-context module - no `chrome: true` on setupBrowser.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const browser = setupBrowser();
const OGBIData = (await import("../../src/store/OGBIData.js")).default;
const {
  getPlans,
  planFor,
  planetByCoords,
  addEntry,
  removeEntry,
  setManual,
  addManual,
  clearSide,
  currentLevel,
  pricedEntries,
  totalsFor,
  submittedOrders,
  reconcile,
  migrateFromNeeds,
} = await import("../../src/store/upgradePlans.js");

test.after(() => browser.cleanup());

/** One planet with a moon, in the shape `OGBIData.empire` entries have. */
function planetRow(overrides = {}) {
  return Object.assign(
    {
      1: 20,
      14: 5,
      15: 0,
      31: 10,
      11101: 6,
      id: 33627261,
      coordinates: "[1:234:5]",
      position: 8,
      db_par2: 20,
      moonID: 33627262,
      moon: { 41: 3, id: 33627262, coordinates: "[1:234:5]" },
    },
    overrides
  );
}

function seed({ empire = [planetRow()], upgradePlans = {}, needs = {}, technology = { 113: 8 } } = {}) {
  OGBIData.json = {
    empire,
    upgradePlans,
    needs,
    technology,
    speed: 1,
    researchDivisor: 1,
    lifeformBonus: {
      classBonus: { explorer: 0, miner: 0, warrior: 0 },
      technologyCostReduction: {},
      technologyTimeReduction: {},
      productionBonus: [0, 0, 0],
      crawlerBonus: {},
    },
    lifeformPlanetBonus: {},
    options: {},
  };
}

/** What actually landed in storage, not what the in-memory object happens to hold. */
function stored() {
  return JSON.parse(globalThis.localStorage.getItem("ogk-data")).upgradePlans;
}

// --------------------------------------------------------------------------
// lookup and shape
// --------------------------------------------------------------------------

test("a planet is found by its coordinates with or without brackets", () => {
  seed();

  assert.equal(planetByCoords("1:234:5")?.id, 33627261);
  assert.equal(planetByCoords("[1:234:5]")?.id, 33627261);
  assert.equal(planetByCoords("9:9:9"), null);
});

test("reading a plan for a planet that has none gives an empty side, not undefined", () => {
  seed();

  assert.deepEqual(planFor("1:234:5", false), { entries: [], manual: {} });
  assert.deepEqual(planFor("9:9:9", true), { entries: [], manual: {} });
});

// --------------------------------------------------------------------------
// addEntry / removeEntry
// --------------------------------------------------------------------------

test("a planned upgrade is readable back", () => {
  seed();
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });

  const entries = planFor("1:234:5", false).entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].technoId, 1);
  assert.equal(entries[0].from, 20);
  assert.equal(entries[0].to, 24);
});

test("planning writes through the setter, so it survives a reload of the store", () => {
  seed();
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });

  assert.equal(stored()["33627261"].planet.entries[0].technoId, 1);
});

test("mutating what the store handed back does not persist", () => {
  seed();
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });

  planFor("1:234:5", false).entries.push({ technoId: 2, from: 0, to: 5 });

  assert.equal(stored()["33627261"].planet.entries.length, 1, "the pushed row never reached storage");
});

test("re-planning the same technology replaces its range instead of stacking a row", () => {
  seed();
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 30 });

  const entries = planFor("1:234:5", false).entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].to, 30);
});

test("planet and moon are two separate lists in one bucket", () => {
  seed();
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });
  addEntry("1:234:5", true, { technoId: 41, from: 3, to: 6 });

  assert.equal(planFor("1:234:5", false).entries.length, 1);
  assert.equal(planFor("1:234:5", true).entries[0].technoId, 41);
  assert.equal(Object.keys(getPlans()).length, 1, "one bucket, keyed by the planet");
});

test("an entry that gains no level is rejected", () => {
  seed();
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 20 });
  addEntry("1:234:5", false, { technoId: 2, from: 20, to: 15 });
  addEntry("1:234:5", false, { technoId: 0, from: 0, to: 5 });

  assert.deepEqual(getPlans(), {});
});

test("planning on a planet the empire data does not know is a no-op, not a crash", () => {
  seed();

  assert.doesNotThrow(() => addEntry("9:9:9", false, { technoId: 1, from: 0, to: 5 }));
  assert.deepEqual(getPlans(), {});
});

test("removing an entry leaves the other rows alone", () => {
  seed();
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });
  addEntry("1:234:5", false, { technoId: 2, from: 18, to: 22 });
  removeEntry("1:234:5", false, 1);

  assert.deepEqual(
    planFor("1:234:5", false).entries.map((entry) => entry.technoId),
    [2]
  );
});

// --------------------------------------------------------------------------
// manual pile
// --------------------------------------------------------------------------

test("the free-hand pile is stored per side and clamped at zero", () => {
  seed();
  setManual("1:234:5", false, { metal: 1000, crystal: -50, deuterium: 7.6 });

  assert.deepEqual(planFor("1:234:5", false).manual, { metal: 1000, crystal: 0, deuterium: 8 });
});

test("addManual adds to what is already pencilled in", () => {
  seed();
  setManual("1:234:5", true, { metal: 1000, crystal: 500, deuterium: 0 });
  addManual("1:234:5", true, { metal: 500, deuterium: 250 });

  assert.deepEqual(planFor("1:234:5", true).manual, { metal: 1500, crystal: 500, deuterium: 250 });
});

test("clearing one side leaves the other side standing", () => {
  seed();
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });
  setManual("1:234:5", true, { metal: 1000 });
  clearSide("1:234:5", false);

  assert.deepEqual(planFor("1:234:5", false).entries, []);
  assert.equal(planFor("1:234:5", true).manual.metal, 1000);
});

// --------------------------------------------------------------------------
// currentLevel / pricing
// --------------------------------------------------------------------------

test("classic research reads its level from the account, everything else from the planet", () => {
  seed();
  const planet = planetByCoords("1:234:5");

  assert.equal(currentLevel(113, planet), 8, "energy technology comes from OGBIData.json.technology");
  assert.equal(currentLevel(1, planet), 20, "the mine comes from the planet");
  assert.equal(currentLevel(11101, planet), 6, "so does a lifeform building");
  assert.equal(currentLevel(1, undefined), 0, "a missing planet is level 0, not NaN");
});

test("entries are priced against the planet they sit on", () => {
  seed();
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });

  const priced = pricedEntries("1:234:5", false);
  assert.equal(priced.length, 1);
  assert.ok(priced[0].cost[0] > 0);
  assert.ok(Number.isFinite(priced[0].time));
});

test("the total is every entry plus the free-hand pile", () => {
  seed();
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });
  const entryOnly = totalsFor("1:234:5", false);

  setManual("1:234:5", false, { metal: 1000, crystal: 2000, deuterium: 3000 });
  const withManual = totalsFor("1:234:5", false);

  assert.equal(withManual.metal, entryOnly.metal + 1000);
  assert.equal(withManual.crystal, entryOnly.crystal + 2000);
  assert.equal(withManual.deuterium, entryOnly.deuterium + 3000);
});

test("a planet with no plan totals to zero rather than NaN", () => {
  seed();

  assert.deepEqual(totalsFor("1:234:5", false), { metal: 0, crystal: 0, deuterium: 0 });
});

// --------------------------------------------------------------------------
// reconcile
// --------------------------------------------------------------------------

test("an upgrade that has been built drops out of the plan", () => {
  seed();
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });

  OGBIData.json.empire = [planetRow({ 1: 24 })];

  assert.equal(reconcile(), true);
  assert.deepEqual(getPlans(), {}, "the empty bucket goes too");
});

test("a half-built upgrade keeps its target and only costs what is left", () => {
  seed();
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });
  const before = totalsFor("1:234:5", false).metal;

  OGBIData.json.empire = [planetRow({ 1: 22 })];
  reconcile();

  const entry = planFor("1:234:5", false).entries[0];
  assert.equal(entry.from, 22);
  assert.equal(entry.to, 24);
  assert.ok(totalsFor("1:234:5", false).metal < before);
});

test("reconcile persists what it changed", () => {
  seed();
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });

  OGBIData.json.empire = [planetRow({ 1: 22 })];
  reconcile();

  assert.equal(stored()["33627261"].planet.entries[0].from, 22);
});

test("reconcile reports no change and writes nothing when everything is still open", () => {
  seed();
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });

  assert.equal(reconcile(), false);
});

test("a finished account-wide research drops out too", () => {
  seed();
  addEntry("1:234:5", false, { technoId: 113, from: 8, to: 10 });

  OGBIData.json.technology = { 113: 10 };

  assert.equal(reconcile(), true);
  assert.deepEqual(getPlans(), {});
});

test("a bucket whose planet is gone is left alone rather than dropped", () => {
  seed();
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });

  // A colony given up, or empire data that has not landed yet. Deleting the plan here
  // would throw away work the player did.
  OGBIData.json.empire = [];
  reconcile();

  assert.equal(getPlans()["33627261"].planet.entries.length, 1);
});

test("a plan for a moon that no longer exists survives reconcile", () => {
  seed();
  addEntry("1:234:5", true, { technoId: 41, from: 3, to: 6 });

  OGBIData.json.empire = [planetRow({ moon: undefined, moonID: undefined })];
  reconcile();

  assert.equal(getPlans()["33627261"].moon.entries.length, 1);
});

test("free-hand resources keep a bucket alive after its entries are done", () => {
  seed();
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });
  setManual("1:234:5", false, { metal: 1000 });

  OGBIData.json.empire = [planetRow({ 1: 24 })];
  reconcile();

  assert.equal(planFor("1:234:5", false).manual.metal, 1000);
  assert.deepEqual(planFor("1:234:5", false).entries, []);
});

// --------------------------------------------------------------------------
// migrateFromNeeds
// --------------------------------------------------------------------------

test("an old lock becomes a free-hand pile on the same side", () => {
  seed({
    needs: {
      33627261: {
        planetId: 33627261,
        coords: "1:234:5",
        planet: { metal: 4000, crystal: 2000, deuterium: 1000 },
        moon: {},
      },
    },
  });

  assert.equal(migrateFromNeeds(), true);
  assert.deepEqual(planFor("1:234:5", false).manual, { metal: 4000, crystal: 2000, deuterium: 1000 });
  // `needs` is the planet bar's cache now, not a second store - sync.js rewrites each
  // side from the plan behind it, so the migration leaves it exactly as it found it.
  assert.equal(OGBIData.needs["33627261"].planet.metal, 4000);
});

test("migration runs once, so a synced total is never folded back into the pile", () => {
  seed({
    needs: {
      33627261: { planetId: 33627261, coords: "1:234:5", planet: { metal: 4000 }, moon: {} },
    },
  });
  migrateFromNeeds();

  // What sync.js would have written back after pricing the plan.
  OGBIData.json.needs["33627261"].planet = { metal: 4000, crystal: 0, deuterium: 0 };

  assert.equal(migrateFromNeeds(), false, "the flag stops a second pass");
  assert.equal(planFor("1:234:5", false).manual.metal, 4000, "not 8000");
});

test("migration keeps an existing plan and adds the old lock beside it", () => {
  seed();
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });

  OGBIData.json.needs = {
    33627261: { planetId: 33627261, coords: "1:234:5", planet: {}, moon: { metal: 500 } },
  };
  migrateFromNeeds();

  assert.equal(planFor("1:234:5", false).entries.length, 1);
  assert.equal(planFor("1:234:5", true).manual.metal, 500);
});

test("an empty old lock is dropped rather than carried over as a zero row", () => {
  seed({
    needs: { 33627261: { planetId: 33627261, coords: "1:234:5", planet: {}, moon: {} } },
  });
  migrateFromNeeds();

  assert.deepEqual(getPlans(), {});
});

test("an old lock whose planet is unknown keeps its own key rather than being lost", () => {
  seed({
    empire: [],
    needs: { 999: { planetId: 999, coords: "7:7:7", planet: { metal: 123 }, moon: {} } },
  });
  migrateFromNeeds();

  assert.equal(getPlans()["999"].planet.manual.metal, 123);
  assert.equal(getPlans()["999"].coords, "7:7:7");
});

test("migration on an account that never locked anything does nothing", () => {
  seed();

  assert.equal(migrateFromNeeds(), false);
});

test("a corrupt old row does not take the migration down with it", () => {
  seed({
    needs: {
      33627261: { planetId: 33627261, coords: "1:234:5", planet: { metal: 100 }, moon: {} },
      broken: null,
    },
  });

  assert.doesNotThrow(() => migrateFromNeeds());
  assert.equal(planFor("1:234:5", false).manual.metal, 100);
});

// --------------------------------------------------------------------------
// submitted orders
// --------------------------------------------------------------------------

/**
 * OGame charges a build order when it *starts*, and only the one at the front of the
 * list has started. The four that can sit behind it are submitted but unpaid, so they
 * are a real need. Everything below turns on that distinction.
 *
 * `workInProgressTechs` is what `getEmpireInfo()` reads off the empire page; the
 * running order is what the production box on the overview page recorded.
 */
function withOrders({ wip = [], productionProgress = {}, researchProgress = {}, lfResearchProgress = {} } = {}) {
  seed();
  OGBIData.json.empire = [Object.assign(planetRow(), { workInProgressTechs: wip })];
  OGBIData.json.productionProgress = productionProgress;
  OGBIData.json.researchProgress = researchProgress;
  OGBIData.json.lfResearchProgress = lfResearchProgress;
}

test("the order that is building is listed but costs nothing - it is already paid", () => {
  withOrders({
    wip: [{ group: "supply", id: 1, from: 20, to: 21 }],
    productionProgress: { "1:234:5": { technoId: 1, tolvl: 21 } },
  });

  const rows = pricedEntries("1:234:5", false);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].submitted, true);
  assert.equal(rows[0].paid, true);
  assert.deepEqual(rows[0].cost.slice(0, 3), [0, 0, 0]);
  assert.deepEqual(totalsFor("1:234:5", false), { metal: 0, crystal: 0, deuterium: 0 });
});

test("the levels queued behind the running one are a real need", () => {
  withOrders({
    // Level 21 building, 22 and 23 waiting behind it.
    wip: [{ group: "supply", id: 1, from: 20, to: 23 }],
    productionProgress: { "1:234:5": { technoId: 1, tolvl: 21 } },
  });

  const row = pricedEntries("1:234:5", false)[0];
  assert.equal(row.from, 21, "starts above the level that is paid for");
  assert.equal(row.to, 23);
  assert.equal(row.paid, false);
  assert.ok(totalsFor("1:234:5", false).metal > 0);
});

test("a queued order for a technology that is not the one building is unpaid in full", () => {
  withOrders({
    wip: [
      { group: "supply", id: 1, from: 20, to: 21 },
      { group: "supply", id: 2, from: 14, to: 15 },
    ],
    productionProgress: { "1:234:5": { technoId: 1, tolvl: 21 } },
  });

  const crystal = pricedEntries("1:234:5", false).find((row) => row.technoId === 2);
  assert.equal(crystal.from, 14, "nothing about it has been charged");
  assert.equal(crystal.paid, false);
});

test("a planned range starts where the submitted orders end, so no level is counted twice", () => {
  withOrders({
    wip: [{ group: "supply", id: 1, from: 20, to: 23 }],
    productionProgress: { "1:234:5": { technoId: 1, tolvl: 21 } },
  });
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });

  const rows = pricedEntries("1:234:5", false);
  const planned = rows.find((row) => !row.submitted);

  assert.equal(planned.from, 23, "the queue already covers everything up to 23");
  assert.equal(planned.to, 24);
});

test("a plan fully covered by what is already submitted drops out of the list", () => {
  withOrders({
    wip: [{ group: "supply", id: 1, from: 20, to: 24 }],
    productionProgress: { "1:234:5": { technoId: 1, tolvl: 21 } },
  });
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });

  assert.equal(pricedEntries("1:234:5", false).filter((row) => !row.submitted).length, 0);
});

test("research counts against the planet doing it, and only that planet", () => {
  withOrders({
    wip: [{ group: "research", id: 113, from: 8, to: 9 }],
    researchProgress: { technoId: 113, tolvl: 9, coords: "1:234:5" },
  });

  const row = pricedEntries("1:234:5", false)[0];
  assert.equal(row.paid, true, "the running research is charged like any other order");
});

test("a research running elsewhere is not treated as paid here", () => {
  withOrders({
    wip: [{ group: "research", id: 113, from: 8, to: 9 }],
    researchProgress: { technoId: 113, tolvl: 9, coords: "9:9:9" },
  });

  const row = pricedEntries("1:234:5", false)[0];
  assert.equal(row.paid, false);

  // Energy technology costs no metal at all, so the sum is what says "this counts".
  const total = totalsFor("1:234:5", false);
  assert.ok(total.metal + total.crystal + total.deuterium > 0);
});

test("a moon's own building queue is read off the moon, not the planet", () => {
  seed();
  OGBIData.json.empire = [
    Object.assign(planetRow(), {
      workInProgressTechs: [],
      moon: {
        41: 3,
        id: 33627262,
        coordinates: "[1:234:5]",
        workInProgressTechs: [{ group: "supply", id: 41, from: 3, to: 5 }],
      },
    }),
  ];
  OGBIData.json.moonProductionProgress = { "1:234:5": { technoId: 41, tolvl: 4 } };

  const rows = pricedEntries("1:234:5", true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].from, 4, "level 4 is building and paid; 5 is not");
  assert.equal(pricedEntries("1:234:5", false).length, 0, "the planet has nothing submitted");
});

test("a planet with no empire work-in-progress data reports no submitted orders", () => {
  seed();

  assert.deepEqual(submittedOrders("1:234:5", false), []);
  assert.deepEqual(submittedOrders("9:9:9", false), []);
});

test("the queue behind the running order is unpaid and counts", () => {
  withOrders({
    wip: [{ group: "supply", id: 1, from: 20, to: 21 }],
    productionProgress: { "1:234:5": { technoId: 1, tolvl: 21 } },
  });
  // Levels 22 and 23 sitting in the Commander's build list behind the running 21.
  OGBIData.json.buildQueue = {
    "1:234:5P": {
      building: [
        { technoId: 1, tolvl: 22 },
        { technoId: 1, tolvl: 23 },
      ],
    },
  };

  const rows = pricedEntries("1:234:5", false);
  const unpaid = rows.filter((row) => !row.paid);

  assert.equal(rows.length, 3, "the running one plus the two queued");
  assert.deepEqual(
    unpaid.map((row) => [row.from, row.to]),
    [
      [21, 22],
      [22, 23],
    ],
    "one level each, in the order the build list holds them"
  );
  assert.ok(totalsFor("1:234:5", false).metal > 0);
});

test("a queued entry is exactly one level, never a range back to the planet's level", () => {
  withOrders({ wip: [] });
  OGBIData.json.buildQueue = { "1:234:5P": { building: [{ technoId: 1, tolvl: 22 }] } };

  // The build list holds one row per level, so a row that says 22 is level 22 and
  // nothing else. Deriving `from` from the planet instead would price 21 levels here
  // for any technology the empire entry happens not to carry.
  const row = pricedEntries("1:234:5", false)[0];
  assert.equal(row.from, 21);
  assert.equal(row.to, 22);
  assert.equal(row.paid, false);
});

test("consecutive levels of one technology stay separate rows", () => {
  withOrders({ wip: [] });
  // Exactly the shape the live box shows: lifeformTech11204 at 6, then again at 7.
  OGBIData.json.buildQueue = {
    "1:234:5P": {
      lfresearch: [
        { technoId: 11204, tolvl: 6 },
        { technoId: 11204, tolvl: 7 },
      ],
    },
  };

  assert.deepEqual(
    pricedEntries("1:234:5", false).map((row) => [row.from, row.to]),
    [
      [5, 6],
      [6, 7],
    ]
  );
});

test("a queue entry already covered by the running order is dropped", () => {
  withOrders({
    wip: [{ group: "supply", id: 1, from: 20, to: 23 }],
    productionProgress: { "1:234:5": { technoId: 1, tolvl: 21 } },
  });
  // The empire data already reported the range up to 23; the box repeating 22 must not
  // add a second copy of that level.
  OGBIData.json.buildQueue = { "1:234:5P": { building: [{ technoId: 1, tolvl: 22 }] } };

  assert.equal(pricedEntries("1:234:5", false).length, 1);
});

test("a planned range starts above the queue as well as above the running order", () => {
  withOrders({
    wip: [{ group: "supply", id: 1, from: 20, to: 21 }],
    productionProgress: { "1:234:5": { technoId: 1, tolvl: 21 } },
  });
  OGBIData.json.buildQueue = { "1:234:5P": { building: [{ technoId: 1, tolvl: 23 }] } };
  addEntry("1:234:5", false, { technoId: 1, from: 20, to: 25 });

  const planned = pricedEntries("1:234:5", false).find((row) => !row.submitted);
  assert.equal(planned.from, 23, "levels 21 to 23 are already accounted for");
  assert.equal(planned.to, 25);
});

test("the moon's queue is keyed separately from the planet's", () => {
  withOrders({ wip: [] });
  OGBIData.json.buildQueue = { "1:234:5M": { building: [{ technoId: 41, tolvl: 5 }] } };

  assert.equal(pricedEntries("1:234:5", false).length, 0);
  assert.equal(pricedEntries("1:234:5", true).length, 1);
});

test("no recorded queue is simply no queue", () => {
  withOrders({ wip: [] });
  OGBIData.json.buildQueue = {};

  assert.deepEqual(submittedOrders("1:234:5", false), []);
});
