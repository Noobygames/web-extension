/**
 * `SpyReport` (`src/ctxpage/messages/analyzer/Object/SpyReport.js`) is the data model
 * `SpyMessagesAnalyzer.js` builds one of per espionage-report message and reads from to
 * render the spy table - loot estimate, cargo-ship counts, fleet/defense danger classes.
 * `docs/testing.md` names this pair as the highest-value coverage gap in the repo, since
 * wrong output here is a wrong money decision, not just a cosmetic bug.
 *
 * Page-context class - `setupBrowser()` is called WITHOUT `chrome: true`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../../helpers/globals.js";
import { spyReportRow } from "../../fixtures/spyReport.js";

const browser = setupBrowser({ url: "https://s1-en.ogame.gameforge.com/game/index.php?page=messages" });

const { SpyReport } = await import("../../../src/ctxpage/messages/analyzer/Object/SpyReport.js");
const OGBIData = (await import("../../../src/store/OGBIData.js")).default;
const ship = (await import("../../../src/game/ship.js")).default;
const defence = (await import("../../../src/game/defence.js")).default;
const planetType = (await import("../../../src/game/planetType.js")).default;

test.after(() => {
  browser.cleanup();
});

/** A fresh, empty store for every test - OGBIData is a singleton over localStorage. */
function resetStore(overrides = {}) {
  OGBIData.json = {
    playerId: 12345,
    options: {
      rvalSelfLimitPlanet: 1e12,
      rvalSelfLimitMoon: 1e12,
    },
    ships: {
      [ship.SmallCargoShip]: { cargoCapacity: 5000, speed: 10000 },
      [ship.LargeCargoShip]: { cargoCapacity: 25000, speed: 7500 },
      [ship.EspionageProbe]: { cargoCapacity: 5, speed: 5000000 },
      [ship.Pathfinder]: { cargoCapacity: 10000, speed: 12000 },
    },
    universeSettingsTooltip: {
      debrisFactor: 0.3,
      debrisFactorDef: 0.3,
      deuteriumInDebris: false,
      repairFactor: 0.7,
      galaxies: 6,
      systems: 499,
      donutGalaxy: true,
      donutSystem: true,
    },
    empire: [],
    ...overrides,
  };
}

// --------------------------------------------------------------------------
// Core fields
// --------------------------------------------------------------------------

test("a typical enemy report parses every plain field", () => {
  resetStore();
  document.body.innerHTML = "";

  const row = spyReportRow(9001, {
    playername: "Enemy One",
    targetPlayerId: 99999,
    coords: "1:2:3",
    activity: "15",
    loot: "25%",
    metal: 100000,
    crystal: 50000,
    deuterium: 20000,
    timestamp: 1756288800,
    hashcode: "abc123hash",
    detailLink: "https://s1-en.ogame.gameforge.com/detail",
    coordsLink: "https://s1-en.ogame.gameforge.com/coords",
  });

  const report = new SpyReport(row);

  assert.equal(report.id, "9001");
  assert.equal(report.targetIsSelf, false, "the target is not the player");
  assert.equal(report.name, "Enemy One");
  assert.equal(report.coords, "1:2:3");
  assert.equal(report.tmpCoords, "001002003", "padded to 3 digits per component, for sorting");
  assert.equal(report.activity, 15);
  assert.equal(report.detailLink, "https://s1-en.ogame.gameforge.com/detail");
  assert.equal(report.coordsLink, "https://s1-en.ogame.gameforge.com/coords");
  assert.equal(report.apiKey, "abc123hash");
  assert.equal(report.planetTargetType, planetType.planet, "no data-raw-targetplanettype falls back to planet");
  assert.equal(report.cleanDate.getTime(), 1756288800 * 1000);
});

test("loot, total and renta are computed correctly from the raw resource attributes", () => {
  resetStore();
  document.body.innerHTML = "";

  const row = spyReportRow(9002, { loot: "25%", metal: 100000, crystal: 50000, deuterium: 20000 });
  const report = new SpyReport(row);

  assert.equal(report.metal, 100000);
  assert.equal(report.crystal, 50000);
  assert.equal(report.deut, 20000);
  assert.equal(report.total, 170000, "total is the plain sum of the three resources");
  // renta = round(total * loot% / 100) - this is the number the whole spy table sorts and
  // colors by, and what a player actually decides to send a fleet over.
  assert.equal(report.renta, Math.round((170000 * 25) / 100));
  assert.equal(report.renta, 42500);
});

test("resRatio is each resource's rounded percentage share of the total", () => {
  resetStore();
  document.body.innerHTML = "";

  const row = spyReportRow(9003, { metal: 100000, crystal: 50000, deuterium: 20000 });
  const report = new SpyReport(row);

  assert.deepEqual(report.resRatio, [59, 29, 12]);
});

test("calcNeededShips is applied per cargo type, including the 7% moreFret buffer", () => {
  resetStore();
  document.body.innerHTML = "";

  const row = spyReportRow(9004, { loot: "25%", metal: 100000, crystal: 50000, deuterium: 20000 });
  const report = new SpyReport(row);

  // resources to move = ceil(total * loot / 100) = ceil(170000 * 0.25) = 42500
  // ships needed = ceil((resources / cargoCapacity) * 1.07)
  assert.equal(report.pb, 9095, "probe: ceil((42500/5)*1.07)");
  assert.equal(report.pt, 10, "small cargo: ceil((42500/5000)*1.07)");
  assert.equal(report.gt, 2, "large cargo: ceil((42500/25000)*1.07)");
  assert.equal(report.pf, 5, "pathfinder: ceil((42500/10000)*1.07)");
});

test("a report with nothing lootable still parses without throwing", () => {
  resetStore();
  document.body.innerHTML = "";

  const row = spyReportRow(9005, { loot: "0%", metal: 0, crystal: 0, deuterium: 0 });
  const report = new SpyReport(row);

  assert.equal(report.total, 0);
  assert.equal(report.renta, 0);
  assert.equal(report.pb, 0);
});

test("a message with no resource filter attributes at all - the counter-espionage-only notice #isReport() also matches - parses as a zero-loot report instead of throwing", () => {
  // Was a bug: every resource read (`message.getAttribute(...).replace(...)`) was
  // unguarded, so a "your probe was detected, nothing revealed" notification - which
  // SpyMessagesAnalyzer's #isReport() deliberately still counts as spy-related via its
  // data-raw-counterespionagechance branch - threw on the very first missing attribute.
  // new SpyReport() never finished, so the message never became a row: out of a batch
  // of ten probes sent at once, every detected one silently vanished instead of one
  // in ten actually showing up.
  resetStore();
  document.body.innerHTML = "";

  const row = spyReportRow(9006, { targetPlayerId: 99999 });
  row.removeAttribute("data-messages-filters-loot");
  row.removeAttribute("data-messages-filters-metal");
  row.removeAttribute("data-messages-filters-crystal");
  row.removeAttribute("data-messages-filters-deuterium");

  const report = new SpyReport(row);

  assert.equal(report.metal, 0);
  assert.equal(report.crystal, 0);
  assert.equal(report.deut, 0);
  assert.equal(report.total, 0);
  assert.equal(report.renta, 0);
  assert.equal(report.coords, "1:2:3", "the report still carries its target - it just has nothing to loot");
});

test("a message with no rawMessageData block at all still parses instead of throwing", () => {
  // Every fleet/defense/timestamp/apiKey read went through message.querySelector(
  // ".rawMessageData") unguarded, repeated at each call site - a message shape missing
  // that block entirely threw on the first of them.
  resetStore();
  document.body.innerHTML = "";

  const row = spyReportRow(9007, { targetPlayerId: 99999, fleetFilter: "x", defenseFilter: "x" });
  row.querySelector(".rawMessageData").remove();

  const report = new SpyReport(row);

  assert.equal(report.fleet, "No data");
  assert.equal(report.defense, "No data");
  assert.equal(report.apiKey, undefined);
  assert.equal(report.planetTargetType, planetType.planet, "falls back to planet with no data-raw-targetplanettype");
  assert.ok(!Number.isNaN(report.cleanDate.getTime()), "the date falls back to now rather than becoming Invalid Date");
});

// --------------------------------------------------------------------------
// Fleet / defense: four independent code paths per field
// --------------------------------------------------------------------------

test("fleet and defense read as 'No data' when the filter attribute is a dash", () => {
  resetStore();
  document.body.innerHTML = "";

  const row = spyReportRow(9101, { fleetFilter: "-", defenseFilter: "-" });
  const report = new SpyReport(row);

  assert.equal(report.fleet, "No data");
  assert.equal(report.defense, "No data");
});

test("fleet and defense read as the string '0' when the filter attribute is '0'", () => {
  resetStore();
  document.body.innerHTML = "";

  const row = spyReportRow(9102, { fleetFilter: "0", defenseFilter: "0" });
  const report = new SpyReport(row);

  assert.equal(report.fleet, "0");
  assert.equal(report.defense, "0");
});

test("fleet and defense are cleaned from data-raw-fleetvalue/-defensevalue when present", () => {
  resetStore();
  document.body.innerHTML = "";

  const row = spyReportRow(9103, {
    fleetFilter: "some fleet",
    fleetValue: "654321",
    defenseFilter: "some defense",
    defenseValue: "777",
  });
  const report = new SpyReport(row);

  assert.equal(report.fleet, 654321);
  assert.equal(report.defense, 777);
});

test("fleet and defense fall back to 'No data' when neither a known filter value nor a raw value is present", () => {
  resetStore();
  document.body.innerHTML = "";

  const row = spyReportRow(9104, { fleetFilter: "some fleet", defenseFilter: "some defense" });
  const report = new SpyReport(row);

  assert.equal(report.fleet, "No data");
  assert.equal(report.defense, "No data");
});

// --------------------------------------------------------------------------
// Flags and misc fields
// --------------------------------------------------------------------------

test("isNew, isFavorited and attacked reflect the message's own markup", () => {
  resetStore();
  document.body.innerHTML = "";

  const plain = new SpyReport(spyReportRow(9201));
  assert.equal(plain.isNew, false);
  assert.equal(!!plain.isFavorited, false);
  assert.equal(!!plain.attacked, false);

  const flagged = new SpyReport(spyReportRow(9202, { isNew: true, favorited: true, attacked: true }));
  assert.equal(flagged.isNew, true);
  assert.ok(flagged.isFavorited);
  assert.ok(flagged.attacked);
});

test("planetTargetType reads the raw attribute when the target is a moon", () => {
  resetStore();
  document.body.innerHTML = "";

  const row = spyReportRow(9203, { planetTargetTypeAttr: String(planetType.moon) });
  const report = new SpyReport(row);

  assert.equal(report.planetTargetType, planetType.moon);
});

test("a player with no status badge gets an empty status and no status css class", () => {
  resetStore();
  document.body.innerHTML = "";

  const row = spyReportRow(9204); // default fixture: a single class-less span
  const report = new SpyReport(row);

  assert.equal(report.status, "");
  assert.equal(report.statusCssClass, undefined);
});

test("a player with a status badge (two matching spans) gets the status text and its css class", () => {
  resetStore();
  document.body.innerHTML = "";

  const row = spyReportRow(9205, {
    statusSpans: [{ class: "status_abbr_inactive" }, { class: "status_abbr_inactive", text: "I" }],
  });
  const report = new SpyReport(row);

  assert.equal(report.statusCssClass, "status_abbr_inactive");
  assert.equal(report.status, "I");
});

// --------------------------------------------------------------------------
// targetIsSelf: the player's own report about their own planet/moon
// --------------------------------------------------------------------------

test("a report whose target is the player's own planet is flagged targetIsSelf and decorated", () => {
  resetStore();
  document.body.innerHTML = "";

  const row = spyReportRow(9301, {
    targetPlayerId: 12345, // matches OGBIData.playerId set in resetStore()
    planetTargetTypeAttr: "1",
  });

  const report = new SpyReport(row);

  assert.equal(report.targetIsSelf, true);
  assert.ok(row.classList.contains("ogl-spyReportTargetIsSelf"));
  // The "see report" button is unconditional once the target is self, regardless of
  // whether the fleet/defense total crosses the warning threshold.
  assert.ok(row.querySelector(".seeReportButton"), "the see-report button was added");
});

test("a self-report above the standard-unit threshold gets a warning label on both the title and the header cells", () => {
  resetStore({ options: { rvalSelfLimitPlanet: 1e6, rvalSelfLimitMoon: 1e6 } });
  document.body.innerHTML = "";

  const row = spyReportRow(9302, {
    targetPlayerId: 12345,
    planetTargetTypeAttr: "1",
    // Cruiser 20000/7000/2000 * 1000, PlasmaTurret 50000/50000/30000 * 100 - both well
    // above a 1e6 standard-unit limit once debris factor 0.3 is applied.
    rawFleet: { [ship.Cruiser]: 1000 },
    rawDefense: { [defence.PlasmaTurret]: 100 },
  });

  new SpyReport(row);

  const titleWarning = row.querySelector(".msgHeadItem .msgTitle .ogi-warning");
  assert.ok(titleWarning, "a warning label was appended to the message title");

  const fleetCell = row.querySelector(".msgFilteredHeaderCell_fleetValue");
  const defenseCell = row.querySelector(".msgFilteredHeaderCell_defenseValue");
  assert.ok(fleetCell.querySelector(".ogi-warning"), "the fleet header cell was replaced with a warning label");
  assert.ok(defenseCell.querySelector(".ogi-warning"), "the defense header cell was replaced with a warning label");
});

test("a self-report below the standard-unit threshold gets no warning label at all", () => {
  resetStore({ options: { rvalSelfLimitPlanet: 1e9, rvalSelfLimitMoon: 1e9 } });
  document.body.innerHTML = "";

  const row = spyReportRow(9303, {
    targetPlayerId: 12345,
    planetTargetTypeAttr: "1",
    rawFleet: { [ship.Cruiser]: 1000 },
    rawDefense: { [defence.PlasmaTurret]: 100 },
  });

  new SpyReport(row);

  assert.equal(row.querySelector(".msgHeadItem .msgTitle .ogi-warning"), null);
  const fleetCell = row.querySelector(".msgFilteredHeaderCell_fleetValue");
  assert.equal(fleetCell.querySelector(".ogi-warning"), null, "the original header cell content is untouched");
  assert.equal(fleetCell.textContent, "-");
});

test("a report about someone else's planet is not decorated at all", () => {
  resetStore({ options: { rvalSelfLimitPlanet: 1, rvalSelfLimitMoon: 1 } }); // would trigger if targetIsSelf were true
  document.body.innerHTML = "";

  const row = spyReportRow(9304, {
    targetPlayerId: 99999,
    rawFleet: { [ship.Cruiser]: 1000 },
    rawDefense: { [defence.PlasmaTurret]: 100 },
  });

  const report = new SpyReport(row);

  assert.equal(report.targetIsSelf, false);
  assert.equal(row.classList.contains("ogl-spyReportTargetIsSelf"), false);
  assert.equal(row.querySelector(".seeReportButton"), null);
});
