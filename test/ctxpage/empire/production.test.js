/**
 * `ctxpage/empire/production.js` - the production-progress math and the construction
 * icons drawn on the planet bar. Runs from `renderPlanetBar()` on every page load.
 *
 * `updateEmpireProduction()` is documented as `WIP` (refactoring.md 3.3, eight known
 * gaps) - these tests pin down what it does today, not what it should do.
 *
 * `ProcessProductionProgressData()` and the four `#productionbox*` blocks inside
 * `updateProductionProgress()` repeat the same shape (moon construction, lifeform
 * research, lifeform buildings, planet construction / research). Rather than one test
 * per branch per block, most tests exercise all the repeated blocks at once with a
 * `for (const store of [...])` loop - same coverage, far less duplication.
 *
 * Page context module - no `chrome: true` on setupBrowser(). tooltip.js reads
 * `OGBIData.keepTooltip` at import time, which needs `localStorage`, so the store and
 * the module under test are both loaded with a dynamic import after setupBrowser().
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../../helpers/globals.js";
import { planetList } from "../../fixtures/ogamePage.js";
import {
  METAL_POS_BONUS,
  CRYSTAL_POS_BONUS,
  METAL_GENERAL_INCOMING,
  CRYSTAL_GENERAL_INCOMING,
  GEOLOGIST_RESOURCE_BONUS,
  OFFICER_RESOURCE_BONUS,
  TRADER_RESOURCE_BONUS,
} from "../../../src/game/gameConstants.js";

const browser = setupBrowser({
  url: "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame&component=overview",
  ogameVersion: "13.0.0",
});

const OGBIData = (await import("../../../src/store/OGBIData.js")).default;
const AllianceClass = (await import("../../../src/game/allianceClass.js")).default;
const PlayerClass = (await import("../../../src/game/playerClass.js")).default;
const { updateEmpireProduction, ProcessProductionProgressData, updateProductionProgress } = await import(
  "../../../src/ctxpage/empire/production.js"
);

test.after(() => browser.cleanup());

// --------------------------------------------------------------------------
// updateEmpireProduction - the mine-output formulas
// --------------------------------------------------------------------------

/** Mirrors the exact operand order of the source formula, for bit-exact expected values. */
const metalMine = (level, posIdx, speed = 1) => Math.floor(30 * level * 1.1 ** level * speed * METAL_POS_BONUS[posIdx]);
const crystalMine = (level, posIdx, speed = 1) =>
  Math.floor(20 * level * 1.1 ** level * speed * CRYSTAL_POS_BONUS[posIdx]);
const deutMine = (level, dbPar2, speed = 1) =>
  Math.floor(10 * level * 1.1 ** level * speed * (1.36 - 0.004 * (dbPar2 + 20)));
const metalBase = (posIdx, speed = 1) => METAL_GENERAL_INCOMING * METAL_POS_BONUS[posIdx] * speed;
const crystalBase = (posIdx, speed = 1) => CRYSTAL_GENERAL_INCOMING * CRYSTAL_POS_BONUS[posIdx] * speed;

const NO_BONUS_CONTEXT = { geologist: false, allOfficers: false, playerClass: PlayerClass.NONE };

/** A planet with no items, no crawlers and level-10 metal mine; everything else idle. */
function makePlanet(overrides = {}) {
  return {
    id: 1,
    position: 1,
    db_par2: 0,
    equipment_html: "<div></div>",
    1: 10,
    2: 0,
    3: 0,
    4: 0,
    12: 0,
    113: 0,
    122: 0,
    217: 0,
    production: { hourly: [0, 0, 0], daily: [0, 0, 0], weekly: [0, 0, 0] },
    ...overrides,
  };
}

/** Every multiplier `updateEmpireProduction` reads off the store, all neutral by default. */
function baseStoreJson(overrides = {}) {
  return {
    speed: 1,
    allianceClass: AllianceClass.NONE,
    lifeformBonus: {
      classBonus: { miner: 0 },
      productionBonus: [0, 0, 0],
      crawlerBonus: { production: 0 },
    },
    minerBonusResourceProduction: 0,
    minerBonusMaxCrawler: 0,
    minerBonusAdditionalCrawler: 0,
    resourceBuggyProductionBoost: 1,
    resourceBuggyMaxProductionBoost: 1,
    lifeformPlanetBonus: { 1: { productionBonus: [0, 0, 0] } },
    ...overrides,
  };
}

test("computes hourly metal and crystal production from mine level, speed and position bonus, with no active bonuses", () => {
  OGBIData.json = baseStoreJson();
  const planet = makePlanet();
  OGBIData.empire = [planet];

  updateEmpireProduction(NO_BONUS_CONTEXT);

  const mineMetal = metalMine(10, 0);
  assert.equal(planet.production.production[1][0], mineMetal, "the metal mine's own output is tracked separately");
  assert.equal(planet.production.hourly[0], mineMetal + metalBase(0), "hourly total adds the general incoming");
  assert.equal(planet.production.hourly[1], crystalBase(0), "an idle crystal mine still gets the general incoming");
  assert.equal(planet.production.hourly[2], 0, "deuterium has no general incoming and an idle synthesizer");
});

test("adds the geologist bonus on top of the mine output when context.geologist is true", () => {
  OGBIData.json = baseStoreJson();
  const planet = makePlanet();
  OGBIData.empire = [planet];

  updateEmpireProduction({ ...NO_BONUS_CONTEXT, geologist: true });

  const mineMetal = metalMine(10, 0);
  assert.equal(planet.production.hourly[0], mineMetal + mineMetal * GEOLOGIST_RESOURCE_BONUS + metalBase(0));
});

test("adds the officer bonus on top of the mine output when context.allOfficers is true", () => {
  OGBIData.json = baseStoreJson();
  const planet = makePlanet();
  OGBIData.empire = [planet];

  updateEmpireProduction({ ...NO_BONUS_CONTEXT, allOfficers: true });

  const mineMetal = metalMine(10, 0);
  assert.equal(planet.production.hourly[0], mineMetal + mineMetal * OFFICER_RESOURCE_BONUS + metalBase(0));
});

test("adds the trader alliance-class bonus when the player belongs to a miner alliance", () => {
  OGBIData.json = baseStoreJson({ allianceClass: AllianceClass.MINER });
  const planet = makePlanet();
  OGBIData.empire = [planet];

  updateEmpireProduction(NO_BONUS_CONTEXT);

  const mineMetal = metalMine(10, 0);
  assert.equal(planet.production.hourly[0], mineMetal + mineMetal * TRADER_RESOURCE_BONUS + metalBase(0));
});

test("adds the miner player-class bonus, amplified by the lifeform class bonus", () => {
  OGBIData.json = baseStoreJson({
    minerBonusResourceProduction: 0.1,
    lifeformBonus: { classBonus: { miner: 0.2 }, productionBonus: [0, 0, 0], crawlerBonus: { production: 0 } },
  });
  const planet = makePlanet();
  OGBIData.empire = [planet];

  updateEmpireProduction({ ...NO_BONUS_CONTEXT, playerClass: PlayerClass.MINER });

  const mineMetal = metalMine(10, 0);
  assert.equal(planet.production.hourly[0], mineMetal + mineMetal * (0.1 * (1 + 0.2)) + metalBase(0));
});

test("tracks the lifeform tech and per-planet production bonuses separately from the resource totals", () => {
  OGBIData.json = baseStoreJson({
    lifeformBonus: { classBonus: { miner: 0 }, productionBonus: [0.05, 0, 0], crawlerBonus: { production: 0 } },
    lifeformPlanetBonus: { 1: { productionBonus: [0.02, 0, 0] } },
  });
  const planet = makePlanet();
  OGBIData.empire = [planet];

  updateEmpireProduction(NO_BONUS_CONTEXT);

  const mineMetal = metalMine(10, 0);
  const lifeformProd = mineMetal * 0.05;
  const lifeformPlanetProd = mineMetal * 0.02;
  assert.equal(planet.production.lifeformProduction[0], lifeformProd + lifeformPlanetProd);
  assert.equal(planet.production.hourly[0], mineMetal + lifeformProd + lifeformPlanetProd + metalBase(0));
});

test("reads active items off the equipment HTML and applies their bonus per resource", () => {
  OGBIData.json = baseStoreJson();
  const planet = makePlanet({
    2: 8,
    3: 6,
    // In order: a metal-only booster, an all-3-resources booster, an energy booster
    // (irrelevant to mine output) and an id the item table does not know at all.
    equipment_html: `
      <div class="item_img" style="background-image:url(images/39c6827b2b8ee1b2d3125981be2bb48a969f4839.png)"></div>
      <div class="item_img" style="background-image:url(images/1c633f2c013527fe03545840701f9a2673537d74.png)"></div>
      <div class="item_img" style="background-image:url(images/7628ab89fc79a83c031182e49c090abd1cac6ee1.png)"></div>
      <div class="item_img" style="background-image:url(images/0000000000000000000000000000000000000000.png)"></div>
    `,
  });
  OGBIData.empire = [planet];

  updateEmpireProduction(NO_BONUS_CONTEXT);

  const mineMetal = metalMine(10, 0);
  const mineCrystal = crystalMine(8, 0);
  const mineDeut = deutMine(6, 0);
  // Metal gets both boosters; crystal and deuterium only get the all-3-resources one.
  const metalBoost = 0.1 + 0.15;
  const crystalBoost = 0.15;
  const deutBoost = 0.15;

  assert.equal(planet.production.hourly[0], mineMetal + mineMetal * metalBoost + metalBase(0));
  assert.equal(planet.production.hourly[1], mineCrystal + mineCrystal * crystalBoost + crystalBase(0));
  assert.equal(planet.production.hourly[2], mineDeut + mineDeut * deutBoost);
});

test("caps crawler production at the resource-buggy max boost after selecting the usable crawler count", () => {
  OGBIData.json = baseStoreJson({
    resourceBuggyProductionBoost: 10,
    resourceBuggyMaxProductionBoost: 0.5,
  });
  // Far more crawlers than the mines can usefully hold, so the max-boost cap binds.
  const planet = makePlanet({ 217: 100 });
  OGBIData.empire = [planet];

  updateEmpireProduction(NO_BONUS_CONTEXT);

  const mineMetal = metalMine(10, 0);
  const cappedCrawlerProd = mineMetal * 0.5;
  assert.equal(planet.production.production[217][0], cappedCrawlerProd, "crawler production is tracked separately");
  assert.equal(planet.production.hourly[0], mineMetal + cappedCrawlerProd + metalBase(0));
});

// --------------------------------------------------------------------------
// ProcessProductionProgressData - moon construction, lifeform research, lifeform
// buildings and planet construction, tracked in four separate but identically
// shaped dictionaries keyed by the planet's bracketed coordinates.
// --------------------------------------------------------------------------

const PROGRESS_STORES = ["moonProductionProgress", "lfResearchProgress", "lfProductionProgress", "productionProgress"];

function emptyProgressStores() {
  const json = {};
  for (const store of PROGRESS_STORES) {
    json[store] = {};
    json[`${store}Finished`] = {};
  }
  return json;
}

test("starts tracking new construction, lifeform research and lifeform buildings reported by the empire", () => {
  document.body.innerHTML = planetList([{ id: 1, coords: "1:2:3" }]);
  OGBIData.json = emptyProgressStores();
  OGBIData.empire = [
    {
      id: 1,
      moon: { workInProgressTechs: [{ group: "station", id: 15, to: 4 }] },
      workInProgressTechs: [
        { group: "supply", id: 1, to: 3 },
        { group: "lifeformresearch", id: 11101, to: 2 },
        { group: "lifeformbuildings", id: 11001, to: 5 },
      ],
    },
  ];

  ProcessProductionProgressData({}, true);

  const key = "[1:2:3]";
  assert.deepEqual(OGBIData.json.moonProductionProgress[key], { technoId: 15, tolvl: 4 });
  assert.deepEqual(OGBIData.json.lfResearchProgress[key], { technoId: 11101, tolvl: 2 });
  assert.deepEqual(OGBIData.json.lfProductionProgress[key], { technoId: 11001, tolvl: 5 });
  assert.deepEqual(OGBIData.json.productionProgress[key], { technoId: 1, tolvl: 3 });
});

test("moves an entry to the finished bucket once its end date has passed, then restarts or clears it", () => {
  document.body.innerHTML = planetList([
    { id: 1, coords: "1:2:3" }, // still has work queued in the fresh empire snapshot
    { id: 2, coords: "4:5:6" }, // nothing queued anymore
  ]);
  const past = new Date(Date.now() - 60000).toISOString();
  const oldElem = (id) => ({ technoId: id, tolvl: 1, endDate: past });

  const json = emptyProgressStores();
  for (const store of PROGRESS_STORES) {
    json[store] = { "[1:2:3]": oldElem(9), "[4:5:6]": oldElem(9) };
  }
  OGBIData.json = json;
  OGBIData.empire = [
    {
      id: 1,
      moon: { workInProgressTechs: [{ group: "station", id: 9, to: 6 }] },
      workInProgressTechs: [
        { group: "supply", id: 9, to: 6 },
        { group: "lifeformresearch", id: 9, to: 6 },
        { group: "lifeformbuildings", id: 9, to: 6 },
      ],
    },
    { id: 2, moon: {}, workInProgressTechs: [] },
  ];

  ProcessProductionProgressData({}, true);

  for (const store of PROGRESS_STORES) {
    assert.ok(OGBIData.json[`${store}Finished`]["[1:2:3]"], `${store}: old entry moved to finished`);
    assert.ok(OGBIData.json[`${store}Finished`]["[4:5:6]"], `${store}: old entry moved to finished`);
    assert.equal(OGBIData.json[store]["[1:2:3]"].technoId, 9, `${store}: restarted with the empire's new work`);
    assert.equal(OGBIData.json[store]["[4:5:6]"], undefined, `${store}: cleared, nothing queued anymore`);
  }
});

test("replaces an active entry with no end date when the level changes, leaves it alone when it does not", () => {
  document.body.innerHTML = planetList([
    { id: 1, coords: "1:2:3" }, // the empire now reports a different level
    { id: 2, coords: "4:5:6" }, // unchanged
  ]);
  const active = (id, tolvl) => ({ technoId: id, tolvl });

  const json = emptyProgressStores();
  for (const store of PROGRESS_STORES) {
    json[store] = { "[1:2:3]": active(9, 5), "[4:5:6]": active(9, 6) };
  }
  OGBIData.json = json;
  const empireTechs = [
    { group: "supply", id: 9, to: 6 },
    { group: "lifeformresearch", id: 9, to: 6 },
    { group: "lifeformbuildings", id: 9, to: 6 },
  ];
  OGBIData.empire = [
    { id: 1, moon: { workInProgressTechs: [{ group: "station", id: 9, to: 6 }] }, workInProgressTechs: empireTechs },
    { id: 2, moon: { workInProgressTechs: [{ group: "station", id: 9, to: 6 }] }, workInProgressTechs: empireTechs },
  ];

  ProcessProductionProgressData({}, true);

  for (const store of PROGRESS_STORES) {
    assert.deepEqual(
      OGBIData.json[`${store}Finished`]["[1:2:3]"],
      active(9, 5),
      `${store}: old level moved to finished`
    );
    assert.deepEqual(OGBIData.json[store]["[1:2:3]"], { technoId: 9, tolvl: 6 }, `${store}: replaced with new level`);
    assert.equal(OGBIData.json[`${store}Finished`]["[4:5:6]"], undefined, `${store}: unchanged entry left alone`);
    assert.deepEqual(OGBIData.json[store]["[4:5:6]"], active(9, 6), `${store}: unchanged entry unmodified`);
  }
});

test("marks a tracked entry finished once the empire snapshot no longer shows it queued", () => {
  document.body.innerHTML = planetList([{ id: 1, coords: "1:2:3" }]);
  const active = (id) => ({ technoId: id, tolvl: 1 });

  const json = emptyProgressStores();
  for (const [index, store] of PROGRESS_STORES.entries()) {
    json[store] = { "[1:2:3]": active(index + 1) };
  }
  OGBIData.json = json;
  OGBIData.empire = [{ id: 1, moon: {}, workInProgressTechs: [] }];

  ProcessProductionProgressData({}, true);

  for (const store of PROGRESS_STORES) {
    assert.equal(OGBIData.json[store]["[1:2:3]"], undefined, `${store}: active entry removed`);
    assert.ok(OGBIData.json[`${store}Finished`]["[1:2:3]"], `${store}: moved to finished`);
  }
});

test("does nothing when the caller has not refreshed the empire snapshot (canCheckFromEmpire = false)", () => {
  document.body.innerHTML = planetList([{ id: 1, coords: "1:2:3" }]);
  const active = (id) => ({ technoId: id, tolvl: 1 });

  const json = emptyProgressStores();
  const ids = {};
  for (const [index, store] of PROGRESS_STORES.entries()) {
    ids[store] = index + 1;
    json[store] = { "[1:2:3]": active(ids[store]) };
  }
  OGBIData.json = json;
  OGBIData.empire = [
    {
      id: 1,
      moon: { workInProgressTechs: [{ group: "station", id: 42, to: 9 }] },
      workInProgressTechs: [{ group: "supply", id: 42, to: 9 }],
    },
  ];

  ProcessProductionProgressData({}, false);

  for (const store of PROGRESS_STORES) {
    assert.deepEqual(OGBIData.json[store]["[1:2:3]"], active(ids[store]), `${store}: left untouched`);
    assert.deepEqual(OGBIData.json[`${store}Finished`], {}, `${store}: no finished entry created`);
  }
});

// --------------------------------------------------------------------------
// updateProductionProgress - icons on the planet bar, driven by the same stores
// --------------------------------------------------------------------------

test("draws work-in-progress icons and finished markers, then clears them once nothing is left queued", () => {
  document.body.innerHTML = planetList([
    { id: 10, coords: "1:2:3" },
    { id: 20, coords: "4:5:6", moon: true },
  ]);
  const json = emptyProgressStores();
  json.options = { showProgressIndicators: true };
  json.lfProductionProgress = { "[1:2:3]": { technoId: 11001, tolvl: 3 } };
  json.lfProductionProgressFinished = { "[1:2:3]": { technoId: 999, tolvl: 1 } };
  json.productionProgress = { "[1:2:3]": { technoId: 1, tolvl: 5 } };
  json.productionProgressFinished = { "[1:2:3]": { technoId: 998, tolvl: 1 } };
  json.needLifeformUpdate = {};
  OGBIData.json = json;
  OGBIData.empire = [
    {
      id: 10,
      moon: undefined,
      workInProgressTechs: [
        { group: "supply", id: 1, to: 5 },
        { group: "lifeformresearch", id: 11101, to: 2 },
        { group: "lifeformbuildings", id: 11001, to: 3 },
      ],
    },
    {
      id: 20,
      moon: { workInProgressTechs: [{ group: "station", id: 14, to: 2 }] },
      workInProgressTechs: [],
    },
  ];

  const context = { current: { coords: "[9:9:9]", isMoon: false, id: 999 } };
  updateProductionProgress(context, true);

  const planetLink = document.querySelector("#planet-10 .planetlink");
  assert.ok(planetLink.classList.contains("finished"), "the finished planet construction adds the class");
  assert.ok(planetLink.classList.contains("finishedLf"), "the finished lifeform building adds the class");
  assert.equal(OGBIData.json.needLifeformUpdate["10"], true);

  const icons10 = document.querySelectorAll(
    "#planet-10 .constructionIcons:not(.moonConstructionIcons) .constructionIcon"
  );
  assert.equal(icons10.length, 3, "planet construction + lifeform research + lifeform building icons");
  assert.ok(document.querySelector("#planet-10 .icon_wrench"), "regular construction icon");
  assert.ok(document.querySelector("#planet-10 .icon_research_lf"), "lifeform research icon");
  assert.ok(document.querySelector("#planet-10 .icon_wrench_lf"), "lifeform building icon");

  const moonIcons = document.querySelectorAll("#planet-20 .constructionIcons.moonConstructionIcons .constructionIcon");
  assert.equal(moonIcons.length, 1, "moon construction icon, created fresh by ProcessProductionProgressData");
  const regularIcons20 = document.querySelectorAll(
    "#planet-20 .constructionIcons:not(.moonConstructionIcons) .constructionIcon"
  );
  assert.equal(regularIcons20.length, 0, "nothing queued at the planet/lifeform level for planet 20");

  // The tooltip mouseover handler is wired but only runs on the event - trigger it to
  // make sure it does not throw.
  const wrenchIcon = document.querySelector("#planet-10 .icon_wrench").closest("a.constructionIcon");
  assert.doesNotThrow(() => wrenchIcon.dispatchEvent(new window.Event("mouseover")));

  // Second pass: nothing left in progress anywhere - icons and finished markers clear.
  OGBIData.json.lfProductionProgress = {};
  OGBIData.json.lfProductionProgressFinished = {};
  OGBIData.json.productionProgress = {};
  OGBIData.json.productionProgressFinished = {};
  OGBIData.empire[0].workInProgressTechs = [];
  OGBIData.empire[1].moon.workInProgressTechs = [];

  updateProductionProgress(context, true);

  assert.equal(document.querySelector("#planet-10 .planetlink").classList.contains("finished"), false);
  assert.equal(document.querySelector("#planet-10 .planetlink").classList.contains("finishedLf"), false);
  assert.equal(document.querySelectorAll("#planet-10 .constructionIcons .constructionIcon").length, 0);
  assert.equal(document.querySelectorAll("#planet-20 .constructionIcons .constructionIcon").length, 0);
});

// --------------------------------------------------------------------------
// updateProductionProgress - the four #productionbox* components on the current page
// --------------------------------------------------------------------------

test("reads the four production-box components on the current page into their progress stores", () => {
  document.body.innerHTML = `
    <div id="productionboxbuildingcomponent">
      <img class="queuePic" alt="something_15">
      <span class="level">Level 3</span>
      <div class="ogl-date">21.06.24 - 12:30:45</div>
    </div>
    <div id="productionboxlfbuildingcomponent">
      <div class="queuePic abc lifeformTech1103"></div>
      <span class="level">Level 2</span>
      <div class="ogl-date">22.06.24 - 08:15:00</div>
    </div>
    <div id="productionboxresearchcomponent">
      <img class="queuePic" alt="something_113">
      <span class="level">Level 7</span>
      <a class="tooltip" onclick="foo([1,2,3])"></a>
      <div class="ogl-date">23.06.24 - 09:00:00</div>
    </div>
    <div id="productionboxlfresearchcomponent">
      <div class="queuePic xyz lifeformTech11101"></div>
      <span class="level">Level 1</span>
      <div class="ogl-date">24.06.24 - 10:00:00</div>
    </div>
  `;
  const json = emptyProgressStores();
  json.productionProgressFinished = { "[1:2:3]": { technoId: 0, tolvl: 0 } };
  json.lfProductionProgressFinished = { "[1:2:3]": { technoId: 0, tolvl: 0 } };
  json.researchProgress = {};
  OGBIData.json = json;
  OGBIData.empire = [];

  updateProductionProgress({ current: { coords: "[1:2:3]", isMoon: false, id: 42 } }, false);

  assert.deepEqual(OGBIData.json.productionProgress["[1:2:3]"], {
    technoId: "15",
    tolvl: "3",
    endDate: new Date(2024, 5, 21, 12, 30, 45).toGMTString(),
  });
  assert.equal(OGBIData.json.productionProgressFinished["[1:2:3]"], undefined, "cleared for the planet being viewed");

  assert.deepEqual(OGBIData.json.lfProductionProgress["[1:2:3]"], {
    technoId: "1103",
    tolvl: "2",
    endDate: new Date(2024, 5, 22, 8, 15, 0).toGMTString(),
  });
  assert.equal(OGBIData.json.lfProductionProgressFinished["[1:2:3]"], undefined);

  assert.deepEqual(OGBIData.json.researchProgress, {
    technoId: "113",
    coords: "1,2,3",
    tolvl: "7",
    planetId: 42,
    endDate: new Date(2024, 5, 23, 9, 0, 0).toGMTString(),
  });

  assert.deepEqual(OGBIData.json.lfResearchProgress["[1:2:3]"], {
    technoId: "11101",
    tolvl: "1",
    endDate: new Date(2024, 5, 24, 10, 0, 0).toGMTString(),
  });
});

test("stores the queued construction against the moon and skips the lifeform-building box while on a moon", () => {
  document.body.innerHTML = `
    <div id="productionboxbuildingcomponent">
      <img class="queuePic" alt="something_20">
      <span class="level">Level 4</span>
      <div class="ogl-date">01.01.25 - 00:00:00</div>
    </div>
    <div id="productionboxlfbuildingcomponent">
      <div class="queuePic abc lifeformTech1103"></div>
      <span class="level">Level 9</span>
      <div class="ogl-date">01.01.25 - 00:00:00</div>
    </div>
  `;
  const json = emptyProgressStores();
  json.moonProductionProgressFinished = { "[1:2:3]": { technoId: 0, tolvl: 0 } };
  json.lfProductionProgressFinished = { "[1:2:3]": { technoId: 77, tolvl: 1 } };
  OGBIData.json = json;
  OGBIData.empire = [];

  updateProductionProgress({ current: { coords: "[1:2:3]", isMoon: true, id: 7 } }, false);

  assert.deepEqual(OGBIData.json.moonProductionProgress["[1:2:3]"], {
    technoId: "20",
    tolvl: "4",
    endDate: new Date(2025, 0, 1, 0, 0, 0).toGMTString(),
  });
  assert.equal(OGBIData.json.moonProductionProgressFinished["[1:2:3]"], undefined, "cleared for the moon being viewed");
  assert.equal(OGBIData.json.productionProgress["[1:2:3]"], undefined, "the planet store is untouched on a moon");

  // The lifeform-building box is gated on !isMoon, so it never runs here.
  assert.deepEqual(OGBIData.json.lfProductionProgressFinished["[1:2:3]"], { technoId: 77, tolvl: 1 });
  assert.deepEqual(OGBIData.json.lfProductionProgress, {});
});

test("clears the progress entry for each component when nothing is actually queued", () => {
  document.body.innerHTML = `
    <div id="productionboxbuildingcomponent"></div>
    <div id="productionboxlfbuildingcomponent"></div>
    <div id="productionboxresearchcomponent"></div>
    <div id="productionboxlfresearchcomponent"></div>
  `;
  const json = emptyProgressStores();
  json.productionProgress = { "[1:2:3]": { technoId: 1, tolvl: 1 } };
  json.lfProductionProgress = { "[1:2:3]": { technoId: 2, tolvl: 1 } };
  json.researchProgress = { technoId: 3, tolvl: 1 };
  json.lfResearchProgress = { "[1:2:3]": { technoId: 4, tolvl: 1 } };
  OGBIData.json = json;
  OGBIData.empire = [];

  updateProductionProgress({ current: { coords: "[1:2:3]", isMoon: false, id: 1 } }, false);

  assert.equal(OGBIData.json.productionProgress["[1:2:3]"], undefined);
  assert.deepEqual(OGBIData.json.researchProgress, {});
  assert.equal(OGBIData.json.lfProductionProgress["[1:2:3]"], undefined);
  assert.equal(OGBIData.json.lfResearchProgress["[1:2:3]"], undefined);
});

test("leaves the progress entry alone when the production box has no visible end date yet", () => {
  document.body.innerHTML = `
    <div id="productionboxbuildingcomponent">
      <img class="queuePic" alt="something_15">
      <span class="level">Level 3</span>
    </div>
  `;
  const json = emptyProgressStores();
  json.productionProgress = { "[1:2:3]": { technoId: "old", tolvl: "1" } };
  OGBIData.json = json;
  OGBIData.empire = [];

  updateProductionProgress({ current: { coords: "[1:2:3]", isMoon: false, id: 1 } }, false);

  assert.deepEqual(OGBIData.json.productionProgress["[1:2:3]"], { technoId: "old", tolvl: "1" });
});
