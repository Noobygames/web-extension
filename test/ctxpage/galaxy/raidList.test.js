/**
 * The raid list (`ctxpage/galaxy/raidList.js`): already-spied targets ranked by
 * profit/hour, with an "only inactive" filter. Display only - no probe or attack
 * action is attached to a row (AGENTS.md 1.5.1), so these tests check the table
 * content and the filter, not any dispatch behaviour.
 *
 * Page-context module - no `chrome: true` on setupBrowser.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../../helpers/globals.js";
import planetType from "../../../src/game/planetType.js";

const browser = setupBrowser();
const OGBIData = (await import("../../../src/store/OGBIData.js")).default;
const { raidList } = await import("../../../src/ctxpage/galaxy/raidList.js");

// `localTime` is an OGame page global (server-adjusted "now"), read by DateTime.timeSince()
// for each row's age column.
globalThis.localTime = Date.now();

test.after(() => {
  delete globalThis.localTime;
  browser.cleanup();
});

/** A cached-report shaped entry, as `spyReportCache.js` would store it. */
function entry(overrides = {}) {
  return {
    coords: "1:1:5",
    planetTargetType: planetType.planet,
    playerName: "Enemy",
    status: "",
    statusCssClass: undefined,
    timestamp: Date.now(),
    activity: 60,
    metal: 100000,
    crystal: 100000,
    deut: 100000,
    total: 300000,
    loot: 50,
    fleet: "No data",
    defense: "No data",
    productionPerHour: null,
    ...overrides,
  };
}

function seed(spyReportCache) {
  OGBIData.json = {
    empire: [{ coordinates: "1:1:1" }],
    options: { spyFret: 203 },
    ships: { 203: { speed: 7500, cargoCapacity: 25000, fuelConsumption: 50 } },
    universeSettingsTooltip: { galaxies: 6, systems: 499, donutGalaxy: true, donutSystem: true },
    spyReportCache,
  };
}

test("targets are listed best-profit-per-hour first", () => {
  seed({
    // Far and thin - low loot, long round trip.
    "6:499:15#1": entry({
      coords: "6:499:15",
      playerName: "FarThin",
      metal: 1000,
      crystal: 1000,
      deut: 1000,
      total: 3000,
    }),
    // Close and fat - high loot, short round trip.
    "1:1:5#1": entry({ coords: "1:1:5", playerName: "CloseFat" }),
  });

  const container = raidList();
  const rows = container.querySelectorAll("tbody tr");

  assert.equal(rows.length, 2);
  assert.ok(rows[0].textContent.includes("CloseFat"), "the closer, richer target sorts first");
  assert.ok(rows[1].textContent.includes("FarThin"));
});

test("a target with nothing lootable is excluded entirely", () => {
  seed({
    "1:1:5#1": entry({ metal: 0, crystal: 0, deut: 0, total: 0 }),
  });

  const container = raidList();
  const rows = container.querySelectorAll("tbody tr");

  assert.equal(rows.length, 1);
  assert.ok(rows[0].querySelector(".ogl-spyTable-empty"), "the empty-state row is shown instead");
});

test("the 'only inactive' filter hides everything else, and toggling it again shows all again", () => {
  seed({
    "1:1:5#1": entry({ playerName: "InactiveOne", statusCssClass: "status_abbr_inactive" }),
    "1:1:6#1": entry({ coords: "1:1:6", playerName: "ActiveOne", statusCssClass: undefined }),
  });

  const container = raidList();
  assert.equal(container.querySelectorAll("tbody tr").length, 2, "both targets show before filtering");

  const filterToggle = container.querySelector(".ogl-tab");
  filterToggle.click();

  let rows = container.querySelectorAll("tbody tr");
  assert.equal(rows.length, 1);
  assert.ok(rows[0].textContent.includes("InactiveOne"));
  assert.ok(filterToggle.classList.contains("ogl-active"));

  filterToggle.click();
  rows = container.querySelectorAll("tbody tr");
  assert.equal(rows.length, 2, "toggling off restores every target");
  assert.ok(!filterToggle.classList.contains("ogl-active"));
});

test("longinactive counts as inactive too", () => {
  seed({
    "1:1:5#1": entry({ playerName: "LongInactiveOne", statusCssClass: "status_abbr_longinactive" }),
  });

  const container = raidList();
  container.querySelector(".ogl-tab").click();

  const rows = container.querySelectorAll("tbody tr");
  assert.equal(rows.length, 1);
  assert.ok(rows[0].textContent.includes("LongInactiveOne"));
});

test("a moon target gets the moon icon next to its coordinates", () => {
  seed({
    "1:1:5#3": entry({ planetTargetType: planetType.moon }),
  });

  const container = raidList();
  const row = container.querySelector("tbody tr");

  assert.ok(row.querySelector("a figure.planetIcon.moon"), "the moon marker is on the coordinate link");
});

test("the gain cell is highlighted ogl-good once it clears the configured rentability limit, like the spy table", () => {
  seed({
    "1:1:5#1": entry({ playerName: "Rich", metal: 1000000, crystal: 1000000, deut: 1000000, total: 3000000 }),
  });
  OGBIData.json.options.rvalLimit = 1e6;

  const row = raidList().querySelector("tbody tr");
  const gainCell = row.children[4];

  assert.ok(gainCell.classList.contains("ogl-good"), "1.5M lootable clears a 1M limit");
});

test("the date cell's color follows the spy table's activity thresholds, not the report's age", () => {
  seed({
    "1:1:5#1": entry({ playerName: "Dangerous", activity: 5 }),
    "1:1:6#1": entry({ coords: "1:1:6", playerName: "Careful", activity: 30 }),
    "1:1:7#1": entry({ coords: "1:1:7", playerName: "Safe", activity: 60 }),
  });

  const rows = raidList().querySelectorAll("tbody tr");
  const dateCellOf = (name) => [...rows].find((r) => r.textContent.includes(name)).children[1];

  assert.ok(dateCellOf("Dangerous").classList.contains("ogl-danger"), "activity <= 15 is danger");
  assert.ok(dateCellOf("Careful").classList.contains("ogl-care"), "15 < activity < 60 is care");
  assert.ok(dateCellOf("Safe").classList.contains("ogl-good"), "activity >= 60 is good");
});

test("no cached reports at all shows the empty state, not an empty table", () => {
  seed({});

  const container = raidList();
  const rows = container.querySelectorAll("tbody tr");

  assert.equal(rows.length, 1);
  assert.ok(rows[0].querySelector(".ogl-spyTable-empty"));
});
