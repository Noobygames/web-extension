/**
 * The raid list (`ctxpage/galaxy/raidList.js`): three tabs over three sources -
 * already-spied targets ranked by profit/hour, never-spied inactives from the public API
 * ranked by flight time, and the player's own pinned shortlist.
 *
 * Display only - no probe or attack action is attached to a row (AGENTS.md 1.5.1), so
 * these tests check the table content, the tabs and the pin toggle, not any dispatch
 * behaviour. One test asserts that absence directly, because a "handy" probe button is
 * exactly the change that would look like an improvement and get the tool rejected.
 *
 * Page-context module - no `chrome: true` on setupBrowser.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../../helpers/globals.js";
import planetType from "../../../src/game/planetType.js";

const browser = setupBrowser();
const OGBIData = (await import("../../../src/store/OGBIData.js")).default;
const dataHelper = (await import("../../../src/integrations/dataHelper.js")).default;
const { resetRadarTargets } = await import("../../../src/ctxpage/galaxy/radarTargets.js");
const { raidList } = await import("../../../src/ctxpage/galaxy/raidList.js");

/**
 * The radar tab reaches the content script over the bridge, which does not exist here.
 * Stubbing the facade keeps these tests about the table; `radarTargets.test.js` covers
 * the pipeline behind it.
 */
function stubRadar(targets) {
  resetRadarTargets();
  dataHelper.getInactiveTargets = () => Promise.resolve(targets);
}

/** Lets the memoized radar promise settle before the assertions look at the table. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const tabOf = (container, index) => container.querySelectorAll(".ogl-tabs .ogl-tab")[index];
const TAB_RADAR = 1;
const TAB_PINNED = 2;

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

function seed(spyReportCache, raidPins = []) {
  OGBIData.json = {
    empire: [{ coordinates: "1:1:1" }],
    options: { spyFret: 203 },
    ships: { 203: { speed: 7500, cargoCapacity: 25000, fuelConsumption: 50 } },
    universeSettingsTooltip: { galaxies: 6, systems: 499, donutGalaxy: true, donutSystem: true },
    spyReportCache,
    raidPins,
  };
}

/** A `universe.inactives` row, as the content script would hand it over. */
function radarTarget(coords, overrides = {}) {
  return { playerId: 7, name: "Sleeper", status: "i", coords, moon: false, ...overrides };
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

  const filterToggle = container.querySelector(".ogk-controls .ogl-tab");
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
  container.querySelector(".ogk-controls .ogl-tab").click();

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

test("hovering a row shows the same cached-report tooltip as the galaxy-view hover", () => {
  seed({
    "1:1:5#1": entry({ playerName: "Hovered", metal: 12345 }),
  });

  const row = raidList().querySelector("tbody tr");
  row.dispatchEvent(new Event("mouseover", { bubbles: true }));

  const tooltip = document.querySelector(".ogl-tooltip");
  assert.ok(tooltip, "a tooltip is attached to the page");
  assert.ok(tooltip.querySelector(".ogl-spyReportCacheTooltip"), "it shows the cached-report content");
  assert.ok(tooltip.textContent.includes("Hovered"));

  tooltip.remove();
});

test("no cached reports at all shows the empty state, not an empty table", () => {
  seed({});

  const container = raidList();
  const rows = container.querySelectorAll("tbody tr");

  assert.equal(rows.length, 1);
  assert.ok(rows[0].querySelector(".ogl-spyTable-empty"));
});

test("the radar tab lists never-spied inactives, nearest flight first", async () => {
  seed({});
  stubRadar([radarTarget("1:120:5", { name: "Far" }), radarTarget("1:2:5", { name: "Near" })]);

  const container = raidList();
  tabOf(container, TAB_RADAR).click();
  await settle();

  const rows = container.querySelectorAll("tbody tr");
  assert.equal(rows.length, 2);
  assert.ok(rows[0].textContent.includes("Near"), "the nearer target sorts first");
  assert.ok(rows[1].textContent.includes("Far"));
});

test("the radar tab says so when the API knows of no inactive neighbour", async () => {
  seed({});
  stubRadar([]);

  const container = raidList();
  tabOf(container, TAB_RADAR).click();
  await settle();

  const rows = container.querySelectorAll("tbody tr");
  assert.equal(rows.length, 1);
  assert.ok(rows[0].querySelector(".ogl-spyTable-empty"));
});

test("switching tabs swaps the columns, not just the rows", async () => {
  seed({ "1:1:5#1": entry() });
  stubRadar([radarTarget("1:2:5")]);

  const container = raidList();
  const spiedColumns = container.querySelectorAll("thead th").length;

  tabOf(container, TAB_RADAR).click();
  await settle();

  assert.notEqual(container.querySelectorAll("thead th").length, spiedColumns);
});

test("the 'only inactive' filter is hidden outside the spied tab, where it means nothing", async () => {
  seed({ "1:1:5#1": entry() });
  stubRadar([]);

  const container = raidList();
  const controls = container.querySelector(".ogk-controls");
  assert.notEqual(controls.style.display, "none");

  tabOf(container, TAB_RADAR).click();
  await settle();

  assert.equal(controls.style.display, "none");
});

test("pinning a radar target moves it into the pinned tab and survives a reopen", async () => {
  seed({});
  stubRadar([radarTarget("1:2:5", { name: "Keeper" })]);

  const container = raidList();
  tabOf(container, TAB_RADAR).click();
  await settle();

  container.querySelector("tbody tr .ogl-pin").click();
  assert.deepEqual(
    OGBIData.raidPins.map((pin) => pin.coords),
    ["1:2:5"]
  );

  const reopened = raidList();
  tabOf(reopened, TAB_PINNED).click();

  const rows = reopened.querySelectorAll("tbody tr");
  assert.equal(rows.length, 1);
  assert.ok(rows[0].textContent.includes("Keeper"));
});

test("unpinning from the pinned tab removes the row right away", () => {
  seed({}, [{ coords: "1:2:5", name: "Keeper", status: "i", moon: false, pinnedAt: 1 }]);

  const container = raidList();
  tabOf(container, TAB_PINNED).click();
  container.querySelector("tbody tr .ogl-pin").click();

  const rows = container.querySelectorAll("tbody tr");
  assert.equal(rows.length, 1);
  assert.ok(rows[0].querySelector(".ogl-spyTable-empty"), "the list is empty again");
});

/**
 * AGENTS.md 1.5.1: a custom target list may show coordinates, but may not carry a
 * direct-probe action. Every coordinate here has to be a plain link into galaxy view,
 * where the game's own probe icon lives.
 */
test("no row offers a way to send anything", async () => {
  seed({ "1:1:5#1": entry() }, [{ coords: "3:3:3", name: "Pinned", status: "I", moon: false, pinnedAt: 1 }]);
  stubRadar([radarTarget("1:2:5")]);

  const container = raidList();
  for (const tab of [0, TAB_RADAR, TAB_PINNED]) {
    tabOf(container, tab).click();
    await settle();

    assert.equal(container.querySelectorAll("form, button, input[type=submit]").length, 0);
    for (const link of container.querySelectorAll("tbody a")) {
      assert.match(link.getAttribute("href"), /^\?page=ingame&component=galaxy&/);
    }
  }
});
