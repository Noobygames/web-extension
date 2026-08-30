/**
 * `spyReportCache` (`src/store/spyReportCache.js`): the local espionage-snapshot cache
 * behind the galaxy-view hover, and the metal/crystal/deuterium-per-hour estimate it
 * derives from two scans of the same spot.
 *
 * The production estimate is the part worth pinning: it is a delta between two cached
 * snapshots, not a read of the target's building levels (the compact espionage row
 * never carries those), and a negative delta - a harvest, an attack, the target
 * spending resources between the two scans - must be recognised and skipped rather
 * than turned into a nonsense rate.
 *
 * Page-context module - no `chrome: true` on setupBrowser.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const bootstrap = setupBrowser();
const OGBIData = (await import("../../src/store/OGBIData.js")).default;
const { recordSpyReport, getSpyReport, getAllSpyReports, estimateResourcesNow } = await import(
  "../../src/store/spyReportCache.js"
);
const planetType = (await import("../../src/game/planetType.js")).default;

test.after(() => bootstrap.cleanup());

/** A minimal stand-in for `SpyReport` - only the fields spyReportCache.js reads. */
function fakeReport(overrides = {}) {
  return {
    coords: "1:2:3",
    planetTargetType: planetType.planet,
    name: "Enemy One",
    status: "",
    activity: 15,
    metal: 0,
    crystal: 0,
    deut: 0,
    total: 0,
    fleet: "No data",
    defense: "No data",
    cleanDate: new Date("2026-01-01T12:00:00Z"),
    ...overrides,
  };
}

test.beforeEach(() => {
  OGBIData.json = { spyReportCache: {} };
});

test("a first report has no production estimate yet", () => {
  recordSpyReport(fakeReport({ metal: 1000, crystal: 500, deut: 200 }));

  const cached = getSpyReport("1:2:3", planetType.planet);
  assert.equal(cached.metal, 1000);
  assert.equal(cached.productionPerHour, null);
});

test("a second, later scan derives metal/crystal/deuterium per hour from the delta", () => {
  recordSpyReport(fakeReport({ metal: 1000, crystal: 500, deut: 200, cleanDate: new Date("2026-01-01T12:00:00Z") }));
  recordSpyReport(
    fakeReport({ metal: 3000, crystal: 1500, deut: 400, cleanDate: new Date("2026-01-01T14:00:00Z") }) // +2h
  );

  const cached = getSpyReport("1:2:3", planetType.planet);
  assert.deepEqual(cached.productionPerHour, { metal: 1000, crystal: 500, deut: 100 });
});

test("a drop in any resource (harvest, attack, spending) is not treated as production", () => {
  recordSpyReport(fakeReport({ metal: 1000, crystal: 500, deut: 200, cleanDate: new Date("2026-01-01T12:00:00Z") }));
  // Metal rose, but deuterium dropped - a fleet was very likely sent from here.
  recordSpyReport(fakeReport({ metal: 3000, crystal: 1500, deut: 50, cleanDate: new Date("2026-01-01T14:00:00Z") }));

  const cached = getSpyReport("1:2:3", planetType.planet);
  assert.equal(cached.productionPerHour, null, "no prior rate existed to fall back to either");
});

test("a stale rate is kept rather than discarded when the next scan's delta is unusable", () => {
  recordSpyReport(fakeReport({ metal: 1000, crystal: 500, deut: 200, cleanDate: new Date("2026-01-01T12:00:00Z") }));
  recordSpyReport(
    fakeReport({ metal: 3000, crystal: 1500, deut: 400, cleanDate: new Date("2026-01-01T14:00:00Z") }) // +2h, rate=1000/500/100 per hour
  );
  // Third scan: deuterium dropped - skip updating the rate, but do not erase the
  // still-plausible one from the previous pair.
  recordSpyReport(fakeReport({ metal: 5000, crystal: 2500, deut: 50, cleanDate: new Date("2026-01-01T16:00:00Z") }));

  const cached = getSpyReport("1:2:3", planetType.planet);
  assert.deepEqual(cached.productionPerHour, { metal: 1000, crystal: 500, deut: 100 });
});

test("planet and moon at the same coordinates are cached separately", () => {
  recordSpyReport(fakeReport({ planetTargetType: planetType.planet, metal: 111 }));
  recordSpyReport(fakeReport({ planetTargetType: planetType.moon, metal: 222 }));

  assert.equal(getSpyReport("1:2:3", planetType.planet).metal, 111);
  assert.equal(getSpyReport("1:2:3", planetType.moon).metal, 222);
});

test("an older report never overwrites a newer cached one", () => {
  recordSpyReport(fakeReport({ metal: 3000, cleanDate: new Date("2026-01-01T14:00:00Z") }));
  recordSpyReport(fakeReport({ metal: 1000, cleanDate: new Date("2026-01-01T12:00:00Z") }));

  assert.equal(getSpyReport("1:2:3", planetType.planet).metal, 3000);
});

test("a coordinate never scanned yields null, not a crash", () => {
  assert.equal(getSpyReport("9:9:9", planetType.planet), null);
});

test("getAllSpyReports returns every cached entry, for the raid list to filter and sort", () => {
  recordSpyReport(fakeReport({ coords: "1:2:3", metal: 100 }));
  recordSpyReport(fakeReport({ coords: "4:5:6", metal: 200 }));

  const all = getAllSpyReports();
  assert.equal(all.length, 2);
  assert.deepEqual(
    all.map((e) => e.metal).sort((a, b) => a - b),
    [100, 200]
  );
});

test("getAllSpyReports is empty when nothing has been cached yet", () => {
  assert.deepEqual(getAllSpyReports(), []);
});

test("estimateResourcesNow extrapolates from productionPerHour and the snapshot's age", () => {
  const report = {
    metal: 1000,
    crystal: 500,
    deut: 200,
    timestamp: Date.now() - 3600000, // one hour ago
    productionPerHour: { metal: 100, crystal: 50, deut: 10 },
  };

  const now = estimateResourcesNow(report);

  // The test itself takes a few ms, so allow slack rather than asserting exact numbers.
  assert.ok(Math.abs(now.metal - 1100) < 5, `expected ~1100, got ${now.metal}`);
  assert.ok(Math.abs(now.crystal - 550) < 5, `expected ~550, got ${now.crystal}`);
  assert.ok(Math.abs(now.deut - 210) < 5, `expected ~210, got ${now.deut}`);
});

test("estimateResourcesNow is null without a production rate to extrapolate from", () => {
  const report = { metal: 0, crystal: 0, deut: 0, timestamp: Date.now(), productionPerHour: null };

  assert.equal(estimateResourcesNow(report), null);
});
