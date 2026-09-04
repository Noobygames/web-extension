/**
 * The upgrade plans panel: the view from the RSS moon and the per-planet lists.
 *
 * The assertion that matters most is on the fleet link. It is the one place this
 * feature touches the game at all, and AGENTS.md 1.1 draws the line exactly there: the
 * button may prefill OGame's own dispatch form and stop. So the tests below pin what
 * the link carries, and that there is one button per row and no bulk action anywhere.
 *
 * Page-context module - no `chrome: true` on setupBrowser.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

// needs.js nets cargo already in flight out of every amount shown here; without a
// stub it would read the real event box, which no fixture below has.
mock.module(new URL("../../src/ogame/fleetMovements.js", import.meta.url).href, {
  defaultExport: () => ({ ids: [], planets: {} }),
});

const bootstrap = setupBrowser({
  html: `
    <div id="eventboxLoading" style="display: none;"></div>
    <div id="eventboxContent"></div>
  `,
});
const OGBIData = (await import("../../src/store/OGBIData.js")).default;
const { initConfOptions, getOptions } = await import("../../src/ctxpage/conf-options.js");
const { addEntry, setManual, planFor, getPlans } = await import("../../src/store/upgradePlans.js");
const { syncNeeds, syncAllNeeds } = await import("../../src/ctxpage/upgradePlans/sync.js");
const { overviewTable } = await import("../../src/ctxpage/upgradePlans/overviewTable.js");
const { planetTable } = await import("../../src/ctxpage/upgradePlans/planetTable.js");
const { filterChips } = await import("../../src/ctxpage/upgradePlans/filter.js");
const { upgradePlans } = await import("../../src/ctxpage/upgradePlans/index.js");
const { addForm, technologiesFor, technologyName } = await import("../../src/ctxpage/upgradePlans/addForm.js");
const Translator = (await import("../../src/format/i18n/translate.js")).default;
const { toFormattedNumber } = await import("../../src/format/numbers.js");
const { supplySource } = await import("../../src/ctxpage/upgradePlans/source.js");
bootstrap.cleanup();

/** One planet with a moon and a supply moon elsewhere, in `OGBIData.empire` shape. */
function empire() {
  return [
    {
      1: 20,
      14: 5,
      15: 0,
      31: 10,
      id: 101,
      name: "Colony",
      coordinates: "[1:234:5]",
      position: 5,
      db_par2: 20,
      metal: 0,
      crystal: 0,
      deuterium: 0,
      moon: { planetID: 101, id: 1011, coordinates: "[1:234:5]", metal: 0, crystal: 0, deuterium: 0 },
    },
    {
      id: 202,
      name: "Home",
      coordinates: "[1:234:8]",
      position: 8,
      db_par2: 20,
      metal: 0,
      crystal: 0,
      deuterium: 0,
      moon: { planetID: 202, id: 2022, coordinates: "[1:234:8]", metal: 0, crystal: 0, deuterium: 0 },
    },
  ];
}

function seed() {
  OGBIData.json = {
    empire: empire(),
    upgradePlans: {},
    needs: {},
    technology: {},
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

  initConfOptions({
    collect: { ship: 202, mission: 3, target: { galaxy: 1, system: 234, position: 8, type: 3 } },
    upgradePlanSource: { useCollectTarget: true, galaxy: 0, system: 0, position: 0, type: 3 },
    // Passed explicitly: `conf-options.js` keeps `_options` at module level and never
    // resets it, so a filter one test switched off would still be off in the next.
    upgradePlanFilter: { supplies: true, facilities: true, research: true, lfbuildings: true, lfresearch: true },
  });
  OGBIData.json.options = getOptions();

  // `needs.js` caches the resource totals in a module-level object captured at import
  // time, so replacing `OGBIData.json` does not clear them and one test's plan would
  // show up in the next one's table. Zeroing every side through the public path is
  // what actually resets it - and a zero total reads as "nothing planned".
  syncAllNeeds();
}

const noop = () => {};

/** The technology rows of a planet section: not the header, not a subtotal, not the pile. */
function entryRows(section) {
  return [...section.querySelectorAll("tr")].filter(
    (row) =>
      !row.querySelector("th") &&
      !row.classList.contains("ogl-upgradePlans-subtotal") &&
      !row.classList.contains("ogl-upgradePlans-manual")
  );
}

// --------------------------------------------------------------------------
// supplySource
// --------------------------------------------------------------------------

test("the supply moon defaults to the collect target and resolves to its moon id", () => {
  const browser = setupBrowser();

  try {
    seed();

    assert.deepEqual(supplySource(), { id: 2022, coords: "1:234:8", isMoon: true });
  } finally {
    browser.cleanup();
  }
});

test("an own source overrides the collect target", () => {
  const browser = setupBrowser();

  try {
    seed();
    OGBIData.json.options.upgradePlanSource = {
      useCollectTarget: false,
      galaxy: 1,
      system: 234,
      position: 5,
      type: 1,
    };

    assert.deepEqual(supplySource(), { id: 101, coords: "1:234:5", isMoon: false });
  } finally {
    browser.cleanup();
  }
});

test("a source that is not one of the player's planets resolves to nothing", () => {
  const browser = setupBrowser();

  try {
    seed();
    OGBIData.json.options.upgradePlanSource = {
      useCollectTarget: false,
      galaxy: 9,
      system: 9,
      position: 9,
      type: 1,
    };

    // The fleet link then carries no `cp` and the transport leaves from wherever the
    // player already is, rather than pointing at a planet they do not own.
    assert.equal(supplySource(), null);
  } finally {
    browser.cleanup();
  }
});

test("an unconfigured source resolves to nothing rather than 0:0:0", () => {
  const browser = setupBrowser();

  try {
    seed();
    OGBIData.json.options.collect = { ship: 202, mission: 3, target: { galaxy: 0, system: 0, position: 0, type: 1 } };

    assert.equal(supplySource(), null);
  } finally {
    browser.cleanup();
  }
});

// --------------------------------------------------------------------------
// overviewTable
// --------------------------------------------------------------------------

test("a planet with nothing planned is not listed", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();

    const table = overviewTable(noop);
    assert.ok(table.querySelector(".ogl-upgradePlans-empty"), "the empty state, not an empty table");
    assert.equal(table.querySelector("table"), null);
  } finally {
    browser.cleanup();
  }
});

test("a planned upgrade shows up as one row with one fleet button", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });
    syncNeeds("1:234:5", false);

    const table = overviewTable(noop);
    const rows = table.querySelectorAll("tr");

    // header + one planet + the totals row
    assert.equal(rows.length, 3);
    assert.equal(table.querySelectorAll(".ogl-upgradePlans-send").length, 1, "one row, one button");
  } finally {
    browser.cleanup();
  }
});

test("the fleet button prefills the game's own dispatch page and nothing else", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    addEntry("1:234:5", true, { technoId: 41, from: 0, to: 3 });
    syncNeeds("1:234:5", true);

    const link = overviewTable(noop).querySelector(".ogl-upgradePlans-send").getAttribute("href");
    const params = new URLSearchParams(link.slice(1));

    assert.equal(params.get("component"), "fleetdispatch", "OGame's own page");
    assert.equal(params.get("mission"), "3", "transport");
    assert.equal(params.get("cp"), "2022", "leaves from the supply moon");
    assert.equal(params.get("galaxy"), "1");
    assert.equal(params.get("system"), "234");
    assert.equal(params.get("position"), "5");
    assert.equal(params.get("type"), "3", "the moon at those coordinates");
    assert.equal(params.get("oglMode"), "2", "the prefill branch betterFleetDispatcher already has");
  } finally {
    browser.cleanup();
  }
});

test("there is no bulk send: the number of buttons never exceeds the number of rows", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });
    syncNeeds("1:234:5", false);
    setManual("1:234:8", false, { metal: 5000, crystal: 0, deuterium: 0 });
    syncNeeds("1:234:8", false);

    const table = overviewTable(noop);

    // AGENTS.md 1.1: one click, one fleet. A button that covered several rows would be
    // several game actions behind one gesture, which is the line this feature must not
    // cross - so the count is pinned rather than left to review.
    assert.equal(table.querySelectorAll(".ogl-upgradePlans-send").length, 2);
    assert.equal(table.querySelectorAll("a").length, 2, "no other link, bulk or otherwise");
  } finally {
    browser.cleanup();
  }
});

test("a need the planet already covers keeps its row but loses its button", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    setManual("1:234:5", false, { metal: 1000, crystal: 0, deuterium: 0 });
    syncNeeds("1:234:5", false);
    OGBIData.json.empire[0].metal = 5000;

    const table = overviewTable(noop);
    assert.equal(table.querySelectorAll("tr").length, 3, "the row is still there");
    assert.equal(table.querySelectorAll(".ogl-upgradePlans-send").length, 0, "nothing left to send");
  } finally {
    browser.cleanup();
  }
});

// --------------------------------------------------------------------------
// planetTable
// --------------------------------------------------------------------------

test("a side with no plan renders nothing at all", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();

    assert.equal(planetTable("1:234:5", false, noop), null);
  } finally {
    browser.cleanup();
  }
});

test("each planned upgrade is one row with its level range and its own cost", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });

    const section = planetTable("1:234:5", false, noop);
    const rows = section.querySelectorAll("tr");

    assert.equal(rows.length, 3, "header, the entry, and its category subtotal");
    assert.match(rows[1].children[1].textContent, /20\s*→\s*24/);
    assert.ok(rows[1].querySelector(".icon_wrench"), "a building carries the wrench icon");
    assert.equal(section.querySelectorAll(".ogl-upgradePlans-subtotal").length, 1, "one category is open");
  } finally {
    browser.cleanup();
  }
});

test("lifeform buildings and lifeform research get their own icons", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    addEntry("1:234:5", false, { technoId: 11101, from: 0, to: 3 });
    addEntry("1:234:5", false, { technoId: 11201, from: 0, to: 2 });

    const section = planetTable("1:234:5", false, noop);

    assert.ok(section.querySelector(".icon_wrench_lf"), "lifeform building");
    assert.ok(section.querySelector(".icon_research_lf"), "lifeform research");
  } finally {
    browser.cleanup();
  }
});

test("the free-hand pile gets a row of its own, with no level range", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    setManual("1:234:5", true, { metal: 1000, crystal: 500, deuterium: 0 });

    const section = planetTable("1:234:5", true, noop);
    const manualRow = section.querySelector(".ogl-upgradePlans-manual");

    assert.ok(manualRow, "ships and defences have no level, so they cannot be an entry");
    assert.equal(manualRow.children[1].textContent, "-");
  } finally {
    browser.cleanup();
  }
});

/** The level cell of one technology row: "20 → 24", or a bare level once paid. */
function levelOf(section, index = 0) {
  return entryRows(section)[index].querySelectorAll("td")[1].textContent;
}

test("one level less trims the row instead of dropping it", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });

    let redrawn = 0;
    const section = planetTable("1:234:5", false, () => (redrawn += 1));
    section.querySelector(".icon_minus").dispatchEvent(new Event("click", { bubbles: true }));

    assert.equal(redrawn, 1);
    assert.equal(levelOf(planetTable("1:234:5", false, noop)), "20 → 23");
  } finally {
    browser.cleanup();
  }
});

test("one level more extends the row", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });

    const section = planetTable("1:234:5", false, noop);
    section.querySelector(".icon_plus").dispatchEvent(new Event("click", { bubbles: true }));

    assert.equal(levelOf(planetTable("1:234:5", false, noop)), "20 → 25");
  } finally {
    browser.cleanup();
  }
});

test("stepping the only planned level off empties the side", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    addEntry("1:234:5", false, { technoId: 1, from: 20, to: 21 });

    planetTable("1:234:5", false, noop)
      .querySelector(".icon_minus")
      .dispatchEvent(new Event("click", { bubbles: true }));

    assert.equal(planetTable("1:234:5", false, noop), null, "nothing left to draw");
  } finally {
    browser.cleanup();
  }
});

test("a submitted order has no steppers either", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    OGBIData.json.empire[0].workInProgressTechs = [{ group: "supply", id: 1, from: 20, to: 23 }];
    OGBIData.json.productionProgress = { "1:234:5": { technoId: 1, tolvl: 21 } };

    const section = planetTable("1:234:5", false, noop);

    assert.equal(section.querySelectorAll(".icon_minus").length, 0);
    assert.equal(section.querySelectorAll(".icon_plus").length, 0);
  } finally {
    browser.cleanup();
  }
});

test("the free-hand pile has no steppers - it has no level to step", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    setManual("1:234:5", false, { metal: 1000 });

    const section = planetTable("1:234:5", false, noop);

    assert.equal(section.querySelectorAll(".ogl-upgradePlans-manual .icon_minus").length, 0);
    assert.equal(section.querySelectorAll(".ogl-upgradePlans-manual .icon_against").length, 1);
  } finally {
    browser.cleanup();
  }
});

// --------------------------------------------------------------------------
// the panel's own delete-everything button
// --------------------------------------------------------------------------

/** Opens the panel with `confirm()` answering `answer`, and hands back what it drew. */
function openPanel(answer) {
  globalThis.confirm = () => answer;
  upgradePlans({ coords: "1:234:5", isMoon: false });

  return document.querySelector(".ogl-dialogContent");
}

test("the trash button clears every plan once it is confirmed", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });
    addEntry("1:234:8", true, { technoId: 41, from: 3, to: 5 });

    const panel = openPanel(true);
    panel.querySelector(".icon_trash").dispatchEvent(new Event("click", { bubbles: true }));

    assert.deepEqual(getPlans(), {});
    assert.equal(panel.querySelectorAll(".ogl-upgradePlans-planet").length, 0, "the panel redrew empty");
  } finally {
    delete globalThis.confirm;
    browser.cleanup();
  }
});

test("cancelling the trash button leaves every plan standing", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });

    const panel = openPanel(false);
    panel.querySelector(".icon_trash").dispatchEvent(new Event("click", { bubbles: true }));

    assert.equal(planFor("1:234:5", false).entries.length, 1);
  } finally {
    delete globalThis.confirm;
    browser.cleanup();
  }
});

test("removing a row drops it from the plan and redraws", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    addEntry("1:234:5", false, { technoId: 1, from: 20, to: 24 });
    addEntry("1:234:5", false, { technoId: 2, from: 18, to: 20 });

    let redrawn = 0;
    const section = planetTable("1:234:5", false, () => (redrawn += 1));
    section.querySelectorAll(".icon_against")[0].dispatchEvent(new Event("click", { bubbles: true }));

    assert.equal(redrawn, 1);
    assert.equal(entryRows(planetTable("1:234:5", false, noop)).length, 1, "one entry left");
  } finally {
    browser.cleanup();
  }
});

// --------------------------------------------------------------------------
// submitted orders and the category filter
// --------------------------------------------------------------------------

test("an order already submitted in game shows up without being planned", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    OGBIData.json.empire[0].workInProgressTechs = [{ group: "supply", id: 1, from: 20, to: 23 }];
    OGBIData.json.productionProgress = { "1:234:5": { technoId: 1, tolvl: 21 } };

    const section = planetTable("1:234:5", false, noop);
    const rows = entryRows(section);

    assert.equal(rows.length, 1, "nothing was planned by hand, this comes from the game");
    assert.ok(rows[0].classList.contains("ogl-upgradePlans-submitted"));
  } finally {
    browser.cleanup();
  }
});

test("a submitted order cannot be deleted from the panel", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    OGBIData.json.empire[0].workInProgressTechs = [{ group: "supply", id: 1, from: 20, to: 23 }];
    OGBIData.json.productionProgress = { "1:234:5": { technoId: 1, tolvl: 21 } };

    // It lives in the game, not in the plan - cancelling it is OGame's own button.
    assert.equal(planetTable("1:234:5", false, noop).querySelectorAll(".icon_against").length, 0);
  } finally {
    browser.cleanup();
  }
});

test("each category gets its own subtotal, and empty ones are left out", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    addEntry("1:234:5", false, { technoId: 1, from: 20, to: 22 }); // supplies
    addEntry("1:234:5", false, { technoId: 14, from: 5, to: 6 }); // facilities
    addEntry("1:234:5", false, { technoId: 11101, from: 0, to: 2 }); // lifeform buildings

    const labels = [...planetTable("1:234:5", false, noop).querySelectorAll(".ogl-upgradePlans-subtotal")].map(
      (row) => row.children[0].textContent
    );

    assert.equal(labels.length, 3);
    assert.equal(new Set(labels).size, 3, "one row per category, no duplicates");
  } finally {
    browser.cleanup();
  }
});

test("turning a category off hides its rows and its subtotal", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    addEntry("1:234:5", false, { technoId: 1, from: 20, to: 22 });
    addEntry("1:234:5", false, { technoId: 11101, from: 0, to: 2 });

    assert.equal(entryRows(planetTable("1:234:5", false, noop)).length, 2);

    OGBIData.json.options.upgradePlanFilter = { ...OGBIData.json.options.upgradePlanFilter, lfbuildings: false };

    const filtered = planetTable("1:234:5", false, noop);
    assert.equal(entryRows(filtered).length, 1);
    assert.equal(filtered.querySelectorAll(".ogl-upgradePlans-subtotal").length, 1);
    assert.equal(filtered.querySelector(".icon_wrench_lf"), null);
  } finally {
    browser.cleanup();
  }
});

test("the filter does not touch what the overview says has to be sent", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    addEntry("1:234:5", false, { technoId: 11101, from: 0, to: 2 });
    syncNeeds("1:234:5", false);

    const before = overviewTable(noop).querySelectorAll("tr").length;

    OGBIData.json.options.upgradePlanFilter = { ...OGBIData.json.options.upgradePlanFilter, lfbuildings: false };

    // A view filter that also shrank the amount shown here would under-supply the
    // planet: the fleet button sends the full need either way.
    assert.equal(overviewTable(noop).querySelectorAll("tr").length, before);
    assert.equal(overviewTable(noop).querySelectorAll(".ogl-upgradePlans-send").length, 1);
  } finally {
    browser.cleanup();
  }
});

test("the chips toggle a category and persist the choice", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    let redrawn = 0;
    const chips = filterChips(() => (redrawn += 1));

    assert.equal(chips.querySelectorAll(".ogl-upgradePlans-chip").length, 5);
    assert.equal(chips.querySelectorAll(".ogl-active").length, 5, "everything on by default");

    chips.querySelectorAll(".ogl-upgradePlans-chip")[3].dispatchEvent(new Event("click", { bubbles: true }));

    assert.equal(redrawn, 1);
    assert.equal(OGBIData.json.options.upgradePlanFilter.lfbuildings, false);
    assert.equal(
      JSON.parse(globalThis.localStorage.getItem("ogk-data")).options.upgradePlanFilter.lfbuildings,
      false,
      "and it survives a reload"
    );
  } finally {
    browser.cleanup();
  }
});

// --------------------------------------------------------------------------
// planning from the panel, and saying which number is which
// --------------------------------------------------------------------------

test("the form plans an upgrade from the level the planet owns to the one typed", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    let redrawn = 0;
    const form = addForm(() => (redrawn += 1), { coords: "1:234:5", isMoon: false });

    const [target, category, technology] = form.querySelectorAll("select");
    assert.equal(target.value, "1:234:5P", "opens on the planet the player is standing on");

    category.value = "supplies";
    category.dispatchEvent(new Event("change", { bubbles: true }));
    technology.value = "1";
    technology.dispatchEvent(new Event("change", { bubbles: true }));

    // The level field starts one above what is owned - the usual next step.
    assert.equal(form.querySelector(".ogl-upgradePlans-level").value, "21");

    form.querySelector(".ogl-upgradePlans-level").value = "24";
    form.querySelector(".ogl-upgradePlans-addBtn").dispatchEvent(new Event("click", { bubbles: true }));

    assert.equal(redrawn, 1);
    const entry = planFor("1:234:5", false).entries[0];
    assert.equal(entry.technoId, 1);
    assert.equal(entry.from, 20, "from is what the planet owns, not what the field showed");
    assert.equal(entry.to, 24);
  } finally {
    browser.cleanup();
  }
});

test("the form offers only what the chosen side can actually build", () => {
  const browser = setupBrowser();

  try {
    seed();
    const planet = OGBIData.empire[0];

    // Supplies and classic research exist on a planet only.
    assert.ok(technologiesFor("supplies", planet, false).includes(1));
    assert.deepEqual(technologiesFor("supplies", planet, true), [], "a moon has no mines");
    assert.deepEqual(technologiesFor("research", planet, true), [], "and no research lab");

    // The moon's facilities are its own three plus robotics and shipyard.
    const moonFacilities = technologiesFor("facilities", planet.moon, true);
    assert.ok(moonFacilities.includes(41), "lunar base");
    assert.equal(moonFacilities.includes(31), false, "no research lab on a moon");
  } finally {
    browser.cleanup();
  }
});

test("lifeform technologies are offered only where the planet carries them", () => {
  const browser = setupBrowser();

  try {
    seed();
    const bare = OGBIData.empire[1];
    assert.deepEqual(technologiesFor("lfbuildings", bare, false), [], "no lifeform keys, nothing to offer");

    // A planet the empire data has lifeform levels for offers exactly those.
    const settled = { ...bare, 11101: 6, 11102: 0 };
    assert.deepEqual(technologiesFor("lfbuildings", settled, false), [11101, 11102]);
  } finally {
    browser.cleanup();
  }
});

test("a technology with no scraped name still shows something readable", () => {
  const browser = setupBrowser();

  try {
    seed();
    // `Translator` answers out of the names scraped off the empire page; before that
    // scrape has run the table's own name is what the player sees.
    assert.equal(technologyName(1), "Metal Mine");
    assert.equal(technologyName(999999), "999999", "never blank");
  } finally {
    browser.cleanup();
  }
});

test("the overview column says it is what still has to be sent, not what is there", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    setManual("1:234:5", false, { metal: 5000, crystal: 0, deuterium: 0 });
    syncNeeds("1:234:5", false);
    OGBIData.json.empire[0].metal = 2000;

    const table = overviewTable(noop);
    const headers = [...table.querySelectorAll("th")].map((th) => th.textContent);

    assert.equal(headers[1], Translator.translate(401), "the header names the quantity");
    assert.ok(headers[1] !== "M", "not a bare resource letter");

    // 5000 wanted, 2000 on the planet -> 3000 still to send.
    const metalCell = table.querySelectorAll("tr")[1].children[1];
    assert.ok(metalCell.classList.contains("tooltip"));
    assert.ok(metalCell.getAttribute("title").includes(toFormattedNumber(3000)));
  } finally {
    browser.cleanup();
  }
});

test("each overview figure carries the arithmetic behind it", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    setManual("1:234:5", false, { metal: 5000, crystal: 0, deuterium: 0 });
    syncNeeds("1:234:5", false);
    OGBIData.json.empire[0].metal = 2000;

    const title = overviewTable(noop).querySelectorAll("tr")[1].children[1].getAttribute("title");

    assert.ok(title.includes(toFormattedNumber(5000)), "the cost");
    assert.ok(title.includes(toFormattedNumber(2000)), "what the planet already has");
    assert.ok(title.includes(toFormattedNumber(3000)), "what is left");
  } finally {
    browser.cleanup();
  }
});

test("a covered row keeps its place and says so instead of offering a fleet", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    setManual("1:234:5", false, { metal: 1000, crystal: 0, deuterium: 0 });
    syncNeeds("1:234:5", false);
    OGBIData.json.empire[0].metal = 5000;

    const table = overviewTable(noop);

    assert.ok(table.querySelector(".ogl-upgradePlans-covered"), "the row is still listed");
    assert.ok(table.querySelector(".ogl-upgradePlans-coveredMark"), "and marked as covered");
    assert.equal(table.querySelectorAll(".ogl-upgradePlans-send").length, 0);
  } finally {
    browser.cleanup();
  }
});

test("the planet tables call their numbers costs, and spell each one out on hover", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    addEntry("1:234:5", false, { technoId: 1, from: 20, to: 21 });

    const section = planetTable("1:234:5", false, noop);
    const headers = [...section.querySelectorAll("th")].map((th) => th.textContent);

    assert.equal(headers[2], Translator.translate(397), "cost, not shortfall");

    // Abbreviated in the cell, exact in the tooltip: "1,2M" is not an amount to ship.
    const cell = entryRows(section)[0].children[2];
    assert.ok(cell.classList.contains("tooltip"));
    assert.match(cell.getAttribute("title"), /^[0-9.,]+$/);
  } finally {
    browser.cleanup();
  }
});

test("the buttons all carry a tooltip", () => {
  const browser = setupBrowser({ html: `<div id="norm"><div id="planetList"></div></div>` });

  try {
    seed();
    addEntry("1:234:5", false, { technoId: 1, from: 20, to: 21 });
    syncNeeds("1:234:5", false);

    for (const button of [
      overviewTable(noop).querySelector(".ogl-upgradePlans-send"),
      planetTable("1:234:5", false, noop).querySelector(".icon_against"),
      planetTable("1:234:5", false, noop).querySelector(".icon_minus"),
      planetTable("1:234:5", false, noop).querySelector(".icon_plus"),
      filterChips(noop).querySelector(".ogl-upgradePlans-chip"),
      addForm(noop).querySelector(".ogl-upgradePlans-addBtn"),
    ]) {
      assert.ok(button, "the control exists");
      assert.ok(button.classList.contains("tooltip"), "every control names itself on hover");
      assert.ok(button.getAttribute("title"), "and the title is not empty");
    }
  } finally {
    browser.cleanup();
  }
});
