/// Page Context Imports
import { initConfOptions, getOptions, getOption, setOption } from "./ctxpage/conf-options.js";
import { applyWideLayout, normalizeZoomFactor } from "./ctxpage/wide-layout.js";
import { initChatEnhancements } from "./ctxpage/chat/index.js";
import {
  ProcessProductionProgressData,
  startEmpirePrefetch,
  updateEmpireData,
  updateInfo,
  updateLifeform,
  updateProductionProgress,
} from "./ctxpage/empire/index.js";
import { overview, resourceDetail, updateresourceDetail } from "./ctxpage/empireOverview/index.js";
import { settings, welcome, probingWarning } from "./ctxpage/settings/index.js";
import { keepOnPlanetDialog } from "./ctxpage/fleetdispatch/keepOnPlanet.js";
import { keyboardActions, listenKeyboard } from "./ctxpage/keyboard/index.js";
import { eventBox } from "./ctxpage/eventbox/index.js";
import {
  addPlayerMarkerUI,
  betterHighscore,
  getPlayerStatus,
  playerSearch,
  sideStalk,
  updateStalk,
} from "./ctxpage/stalk/index.js";
import { checkPantrySync, pantrySync, showToast } from "./ctxpage/pantry/index.js";
import {
  checkDebris,
  cleanupMessages,
  navigationArrows,
  quickPlanetList,
  topBarUtilities,
  utilities,
  uvlinks,
} from "./ctxpage/pageTweaks/index.js";
import isOwnPlanet from "./util/isOwnPlanet.js";
import { ensureLZString } from "./util/lzstring.js";
import debounce from "./util/debounce.js";
import { technoDetail } from "./ctxpage/technoDetail/index.js";
import {
  addMarkerUI,
  generateHiscoreLink,
  getMarkedPlayers,
  highlightTarget,
  onGalaxyUpdate,
  refreshStalk,
  stalk,
  targetList,
} from "./ctxpage/galaxy/index.js";
import {
  activitytimers,
  flyingFleet,
  harvest,
  jumpGate,
  markLifeforms,
  minesLevel,
  updateFlyings,
  updatePlanets_FleetActivity,
  updatePlanets_IncomingHostileFleet,
  updateSpaceShipsPresence,
  updateTimer,
} from "./ctxpage/planetbar/index.js";
import {
  betterFleetDispatcher,
  calcNeededShips,
  collect,
  customMissions,
  expedition,
  initFleetDispatcher,
  neededCargo,
  openPlanetList,
  preselectShips,
  selectShips,
} from "./ctxpage/fleetdispatch/index.js";
import { getLocalStorageSize, purgeLocalStorage } from "./util/localStorageUsage.js";
import { statistics } from "./ctxpage/stats/index.js";
import { generateMMORPGLink } from "./util/mmorpgStats.js";
import ctxMessageAnalyzer from "./ctxpage/messages-analyzer/index.js";
import * as DOM from "./util/dom.js";
import { getLogger } from "./util/logger.js";
import itemType from "./util/enum/itemType.js";
import itemImageID from "./util/enum/itemImageID.js";
import * as Numbers from "./util/numbers.js";
import { pageContextInit, pageContextRequest } from "./util/service.callbackEvent.js";
import * as ptreService from "./util/service.ptre.js";
import * as time from "./util/time.js";
import VERSION from "./util/version.js";
import * as wait from "./util/wait.js";
import OGIObserver from "./util/observer.js";
import Messages from "./ctxpage/messages/index.js";
import * as stalkUtil from "./util/stalk.js";
import * as utilTooltip from "./util/tooltip.js";
import * as popupUtil from "./util/popup.js";
import markerui from "./util/markerui.js";
import highlight, { setHighlightCoords } from "./util/highlightTarget.js";
import OgamePageData from "./util/OgamePageData.js";
import OGIData from "./util/OGIData.js";
import { tooltip } from "./util/tooltip.js";
import missionType from "./util/enum/missionType.js";
import * as needsUtil from "./util/needs.js";
import flying from "./util/flying.js";
import Translator from "./util/translate.js";
import dataHelper from "./util/dataHelper.js";
import DateTime from "./util/dateTime.js";
import { fleetCost } from "./util/fleetCost.js";
import * as loadingUtil from "./util/loading.js";
import * as standardUnit from "./util/standardUnit.js";
import planetType from "./util/enum/planetType.js";
import shipEnum from "./util/enum/ship.js";
import ogiMode from "./util/enum/ogiMode.js";
import AllianceClass from "./util/enum/allianceClass.js";
import {
  building,
  consumption,
  getBestRoi,
  minesProduction,
  research,
  roiAstrophysics,
  roiLfBuilding,
  roiLfResearch,
  roiMine,
  roiPlasmatechnology,
} from "./util/gameFormulas.js";
import { BUIDLING_INFO } from "./util/enum/buildingInfo.js";
import { RESEARCH_INFO } from "./util/enum/researchInfo.js";
import {
  CRAWLER_OVERLOAD_MAX,
  CRYSTAL_GENERAL_INCOMING,
  CRYSTAL_POS_BONUS,
  ENGINEER_ENERGY_BONUS,
  FACILITIES_TECHID,
  GEOLOGIST_CRAWLER_BONUS,
  GEOLOGIST_RESOURCE_BONUS,
  IONTECHNOLOGY_BONUS,
  MAX_CRAWLERS_PER_MINE,
  METAL_GENERAL_INCOMING,
  METAL_POS_BONUS,
  OFFICER_ENERGY_BONUS,
  OFFICER_RESOURCE_BONUS,
  PLASMATECH_BONUS,
  SHIP_EXPEDITION_POINTS,
  SUPPLIES_TECHID,
  TRADER_ENERGY_BONUS,
  TRADER_RESOURCE_BONUS,
  DISCORD_INVITATION_URL,
  EXPEDITION_EXPEDITION_POINTS,
  EXPEDITION_MAX_RESOURCES,
  EXPEDITION_TOP1_POINTS,
} from "./util/gameConstants.js";
import { readPageContext, stripCoordinateBrackets } from "./util/pageContext.js";
import * as iconVisibility from "./util/iconVisibility.js";
import OverviewPage from "./ctxpage/overview/OverviewPage.js";
import TraderImportExportPage from "./ctxpage/traderOverview/TraderImportExportPage.js";
import { addTemplateSelector } from "./ctxpage/fleetdispatch/templates.js";
import RecyclingYieldCalculator from "./util/recyclingYieldCalculator.js";
import { planHarvest, CARGO_SHIP_IDS } from "./util/harvestPlanner.js";
import { planExpeditionFleets } from "./util/expeditionBalancer.js";
import { productionBreakdown, effectiveCrawlers, crawlerBonus } from "./util/productionEngine.js";
import { indexClaims, claimStatus, claimCssClass, CLAIM_FREE } from "./util/targetClaims.js";
import { watchForEmpireChanges } from "./util/stageForUpdate.js";
import Notifier from "./util/Notifier.js";
import * as perf from "./util/perf.js";
import { pageSignal, isAbortError, suppressAbortRejections } from "./util/abort.js";

//const VERSION = "__VERSION__";
const logger = getLogger();
perf.mark("ogkush.js module evaluation");
// OGame navigates on every view change, which aborts whatever the extension had
// in flight - the empire refresh above all. See util/abort.js.
suppressAbortRejections();
pageContextInit();

let redirect = localStorage.getItem("ogl-redirect");
if (redirect && redirect.indexOf("https") > -1) {
  localStorage.setItem("ogl-redirect", false);
  window.location.href = redirect;
}

/**
 * @deprecated Use {@link DOM.createDOM}
 * @type {DOM.createDOM}
 */
const createDOM = DOM.createDOM;
/**
 * @deprecated Use {@link DOM.createSVG}
 * @type {DOM.createSVG}
 */
const createSVG = DOM.createSVG;

/**
 * @deprecated Use {@link Numbers.toFormattedNumber}
 * @type {Numbers.toFormattedNumber}
 */
const toFormatedNumber = Numbers.toFormattedNumber;
/**
 * @deprecated Use {@link Numbers.fromFormattedNumber}
 * @type {Numbers.fromFormattedNumber}
 */
const fromFormatedNumber = Numbers.fromFormattedNumber;

const UNIVERSVIEW_LANGS = [
  "en",
  "cs",
  "es",
  "fr",
  "de",
  "da",
  "hr",
  "it",
  "hu",
  "nl",
  "pl",
  "pt",
  "ro",
  "ru",
  "sk",
  "sv",
  "tr",
  "el",
  "zh",
  "ko",
  "br",
];

const PLAYER_CLASS_EXPLORER = 3;
const PLAYER_CLASS_WARRIOR = 2;
const PLAYER_CLASS_MINER = 1;
const PLAYER_CLASS_NONE = 0;

/**
 * Exported for tests only.
 *
 * `test/ogkush.calculations.test.js` calls the pure calculation methods through
 * this prototype with a hand-made `this`, which is the only way to characterise
 * them where they actually live - the class is otherwise unreachable from outside
 * the module, and moving the methods out first would mean the tests verify the
 * moved copy rather than the move.
 *
 * At runtime nothing imports this file: it is injected as a top-level
 * `<script type="module">`, where an unused export is inert. Phase 3 of
 * refactoring.md removes the need for it, by giving these methods modules of
 * their own.
 */
export { OGInfinity };

class OGInfinity {
  OverviewPage = new OverviewPage();
  TraderImportExportPage = new TraderImportExportPage();

  constructor() {
    // OGame renders coordinates as "[1:2:3]"; everything below and downstream wants
    // "1:2:3". This is a DOM write and has to happen before the reads, which is why
    // it is here rather than inside readPageContext().
    stripCoordinateBrackets(document);
    Object.assign(this, readPageContext(document, window.location));
    this.markedPlayers = [];
  }

  #migrations() {
    if (typeof OGIData.json.lifeformBonus.productionBonus === "undefined") {
      reportUnlessAborted(this.#updateData());
    }
  }

  /**
   * Public entry to the full re-read of server data. The settings dialog offers it
   * as a button; it is not a method the dialog may reach on its own, so it arrives
   * as a callback in `settingsContext()`.
   */
  forceUpdateData() {
    return this.#updateData();
  }

  async #updateData() {
    this.loading();
    this.updateServerSettings(true);
    this.getAllianceClass();
    Translator.InitializeLFNames(this.current, this.hasLifeforms);
    await updateEmpireData(this.empireContext(), true);
    await updateLifeform(this.empireContext());
    document.querySelector(".ogl-dialogOverlay").classList.remove("ogl-active");
  }

  init() {
    this.json = OGIData.json;
    this.json.playerId = this.playerId;
    this.json.universeId = this.universe;
    this.json.universeUrl = this.universeUrl;
    this.json.universeName = this.universeName;
    this.json.universeDomain = this.universeDomain;
    this.json.welcome = this.json.welcome !== false;
    this.json.needLifeformUpdate = this.json.needLifeformUpdate || {};
    this.json.pantrySync = this.json.pantrySync || "";
    this.json.empire = this.json.empire || [];
    this.json.jumpGate = this.json.jumpGate || {};
    this.json.searchHistory = this.json.searchHistory || [];
    this.json.watchList = this.json.watchList || {};
    this.json.expeditions = this.json.expeditions || {};
    this.json.spies = this.json.spies || {};
    this.json.combats = this.json.combats || {};
    this.json.harvests = this.json.harvests || {};
    this.json.trades = this.json.trades || {};
    this.json.evolution = this.json.evolution || {};
    this.json.playerSearch = this.json.playerSearch || "";
    this.json.currentExpes = this.json.currentExpes || [];
    this.json.combatsSums = this.json.combatsSums || {};
    this.json.tradesSums = this.json.tradesSums || {};
    this.json.expeditionSums = this.json.expeditionSums || {};
    this.json.discoveriesSums = this.json.discoveriesSums || {};
    this.json.discoveries = this.json.discoveries || {};
    this.json.spies = this.json.spies || {};
    this.json.flying = this.json.flying || {
      metal: 0,
      crystal: 0,
      deuterium: 0,
      fleet: [],
      ids: [],
    };
    this.json.coordsHistory = this.json.coordsHistory || [];
    this.json.serverSettingsTimeStamp = this.json.serverSettingsTimeStamp || 0;
    this.json.trashsimSettings = this.json.trashsimSettings || false;
    this.json.universeSettingsTooltip = this.json.universeSettingsTooltip || {};
    this.json.topScore = this.json.topScore || 0;
    this.json.shipNames = this.json.shipNames || false;
    this.json.autoHarvest = this.json.autoHarvest || ["0:0:0", 3];
    this.json.myActivities = this.json.myActivities || {};
    this.json.sideStalk = this.json.sideStalk || [];
    this.json.playerMarkers = this.json.playerMarkers || {};
    this.json.markers = this.json.markers || {};
    this.json.missing = this.json.missing || {};
    this.json.notifications = this.json.notifications || {};
    this.json.targetTabs = this.json.targetTabs || { g: 1, s: 0 };
    this.json.spyProbes = this.json.spyProbes || 5;
    this.json.openTooltip = this.json.openTooltip || false;
    this.json.technology = this.json.technology || {
      106: 0,
      108: 0,
      109: 0,
      110: 0,
      111: 0,
      113: 0,
      114: 0,
      115: 0,
      117: 0,
      118: 0,
      120: 0,
      121: 0,
      122: 0,
      123: 0,
      124: 0,
      199: 0,
    };
    this.json.ships = this.json.ships || {};
    this.json.allianceClass = this.json.allianceClass || AllianceClass.NONE;
    this.json.productionProgress = this.json.productionProgress || {};
    this.json.moonProductionProgress = this.json.moonProductionProgress || {};
    this.json.lfProductionProgress = this.json.lfProductionProgress || {};
    this.json.researchProgress = this.json.researchProgress || {};
    this.json.lfResearchProgress = this.json.lfResearchProgress || {};

    this.json.productionProgressFinished = this.json.productionProgressFinished || {};
    this.json.moonProductionProgressFinished = this.json.moonProductionProgressFinished || {};
    this.json.lfProductionProgressFinished = this.json.lfProductionProgressFinished || {};
    this.json.lfResearchProgressFinished = this.json.lfResearchProgressFinished || {};

    this.json.tchat = this.json.tchat || false;
    this.json.needSync = this.json.needSync || false;
    this.json.timezoneDiff = this.json.timezoneDiff || 0;

    initConfOptions(this.json.options);
    // set a proxy for compatibility, important for saving configuration.
    this.json.options = getOptions();

    this.json.selectedLifeforms = this.json.selectedLifeforms || {};
    this.json.lifeformBonus = this.json.lifeformBonus || {};
    this.json.lifeformPlanetBonus = this.json.lifeformPlanetBonus || {};
    this.json.reminders = this.json.reminders || {};
    this.isLoading = false;
    this.autoQueue = new AutoQueue();

    // The content script needs the PTRE team key to decide whether to build galaxyStorage,
    // but it must never read it from OGIData - that singleton belongs to the page context.
    // pageContextRequest rejects on a failed bridge call, so the rejection is handled here.
    pageContextRequest("ptre", "setTeamKey", this.json.options.ptreTK || "").catch((err) =>
      console.warn("[OGI][PTRE] setTeamKey failed", err)
    );
  }

  async start() {
    // Wide-screen layout/zoom switches: pure CSS class toggles on <html>.
    applyWideLayout();
    this.hasLifeforms = document.querySelector(".lifeform") != null;
    let forceEmpire = document.querySelectorAll("div[id*=planet-]").length != OGIData.empire.length;
    this.updateServerSettings();
    // Fire and forget on purpose - the UI renders from the cached empire and
    // updates when this lands. Unhandled, its rejection surfaced as an
    // "Uncaught (in promise)" on every page change that cut a refresh short.
    reportUnlessAborted(updateEmpireData(this.empireContext(), forceEmpire));
    if (this.json.needLifeformUpdate[this.current.id] && !this.current.isMoon) {
      reportUnlessAborted(updateLifeform(this.empireContext()));
    }

    if (UNIVERSVIEW_LANGS.includes(OgamePageData.gameLang)) {
      this.univerviewLang = OgamePageData.gameLang;
    } else {
      this.univerviewLang = "en";
    }

    try {
      if (spionageAmount != undefined) {
        this.json.spyProbes = spionageAmount;
        this.saveData();
      }
    } catch (e) {}

    if (this.page == "fleetdispatch") {
      this.json.shipNames = {};
      for (let id in fleetDispatcher.fleetHelper.shipsData) {
        this.json.shipNames[fleetDispatcher.fleetHelper.shipsData[id].name] = id;
        this.json.ships[id] = {
          name: fleetDispatcher.fleetHelper.shipsData[id].name,
          cargoCapacity: fleetDispatcher.fleetHelper.shipsData[id].baseCargoCapacity,
          speed: fleetDispatcher.fleetHelper.shipsData[id].speed,
          fuelConsumption: fleetDispatcher.fleetHelper.shipsData[id].fuelConsumption,
        };
      }
      fleetDispatcher.apiTechData.forEach((tech) => {
        this.json.technology[tech[0]] = tech[1];
      });
    }
    document.querySelectorAll(".moonlink").forEach((elem) => {
      elem.classList.add("tooltipRight");
      elem.classList.remove("tooltipLeft");
    });
    document.querySelectorAll(".planetlink").forEach((elem) => {
      elem.classList.add("tooltipLeft");
      elem.classList.remove("tooltipRight");
    });
    OGIData.empire.forEach((planet, index) => {
      if (planet && this.current.id == planet.id) this.current.index = index;
    });
    // update current place resources in empire data for methods that need more updated data
    const place = this.current.isMoon ? OGIData.empire[this.current.index].moon : OGIData.empire[this.current.index];
    if (place) {
      ["metal", "crystal", "deuterium"].forEach((res) => (place[res] = Math.floor(resourcesBar.resources[res].amount)));
    }

    document.querySelector("#pageContent").style.width = "1200px";

    // The right planet bar is drawn first, before any page-specific work. It is
    // the part of the UI the user looks at on every single page, and everything
    // below used to run ahead of most of it.
    this.renderPlanetBar();
    // Registered before the yield below: the game may re-render the bar while we
    // are off the stack, and a missed re-render leaves the bar without OGI data
    // until the next page change.
    this.observePlanetBar();

    // Hand the frame back to the browser so the planet bar actually paints.
    // start() is one long synchronous task, so *nothing* it writes to the DOM
    // became visible until its very last statement had run - the planet bar
    // included, however early it was built. Everything after this point is
    // page-specific work that is not on screen yet anyway.
    await nextPaint();

    this.#migrations();
    this.saveData();
    listenKeyboard(this.pageContext());

    wait.waitForQuerySelector("#eventContent").then(() => {
      eventBox(this.pageContext());
      flyingFleet(this.planetBarContext());
      updateFlyings(this.planetBarContext());
      updatePlanets_IncomingHostileFleet(this.planetBarContext());
      updatePlanets_FleetActivity(this.planetBarContext());
    });
    neededCargo(this.fleetContext());
    preselectShips(this.fleetContext());
    expedition(this.fleetContext());
    collect(this.fleetContext());
    customMissions(this.fleetContext());
    this.messagesAnalyzer();
    cleanupMessages(this.pageContext());
    quickPlanetList(this.pageContext());
    sideStalk(this.pageContext());
    checkDebris(this.pageContext());
    this.spyTable();
    keyboardActions(this.pageContext());
    utilities(this.pageContext());
    this.chat();
    // Chat: private-message button on alliance messages, coordinate hover menu.
    initChatEnhancements();
    uvlinks(this.pageContext());
    this.OverviewPage.MakePrettierOverview(this.page);
    this.TraderImportExportPage.RemindMeImportExport(this.page);
    betterHighscore(this.pageContext());
    this.overviewDates();
    topBarUtilities(this.pageContext());
    initFleetDispatcher(this.fleetContext());
    betterFleetDispatcher(this.fleetContext());
    technoDetail(this.technoContext());
    onGalaxyUpdate(this.galaxyContext());
    this.timeZone();
    this.checkRedirect();
    this.showStorageTimers();
    this.realProductionTooltip();
    navigationArrows(this.pageContext());
    let storage = getLocalStorageSize();
    if (storage.total > 4.5) {
      purgeLocalStorage();
    }
    if (this.json.welcome) {
      if (this.page == "fleetdispatch") {
        wait
          .waitFor(() => OGIData.empire.length)
          .then(async () => {
            this.loading();
            this.updateServerSettings(true);
            this.getAllianceClass();
            Translator.InitializeLFNames(this.current, this.hasLifeforms);
            await updateLifeform(this.empireContext());
            welcome(this.settingsContext());
          });
      } else {
        window.location.href = "?page=ingame&component=fleetdispatch";
      }
    }
    this.markedPlayers = getMarkedPlayers(this.galaxyContext(), this.json.markers);
    if (this.json.options.pantryKey) {
      checkPantrySync(this.pageContext(), this.json.options.pantryKey);
    }

    /*Fix banner styles for messages, premium and shop page*/
    if (this.page == "messages" || this.page == "premium" || this.page == "shop")
      document.querySelector("#banner_skyscraper").classList.add("fix-banner");
  }

  /**
   * Everything OGI draws into the right planet bar, in one place.
   *
   * Two reasons it is a method and not a run of calls inside `start()`:
   *  - the boot path and the planet-bar observer used to keep two hand-kept
   *    copies of this list, and they had already drifted apart;
   *  - `start()` is one long synchronous task, so nothing it writes becomes
   *    visible until the last statement has run. Half of this list used to sit
   *    behind `spyTable()`, `betterHighscore()`, `technoDetail()` and two dozen
   *    other page-specific steps. It now runs first and paints on its own.
   *
   * Everything in here has to stay renderable from the cached `OGIData.empire`
   * alone: the refresh that replaces it is still in flight at this point, and
   * `updateresourceDetail()` redraws the numbers when it lands.
   */
  renderPlanetBar() {
    this.sideOptions();
    minesLevel(this.planetBarContext());
    resourceDetail(this.overviewContext());
    harvest(this.planetBarContext());
    activitytimers(this.planetBarContext());
    needsUtil.display();
    jumpGate(this.planetBarContext());
    updateProductionProgress(this.empireContext(), false); //We haven't refreshed the empire data recently => false
    updateSpaceShipsPresence(this.planetBarContext());
    markLifeforms(this.planetBarContext());
  }

  /**
   * Re-runs the planet bar rendering after OGame rebuilds it, which it does
   * whenever something finishes without a page reload.
   */
  observePlanetBar() {
    const rightObserver = new OGIObserver();
    const ogkush = this;

    const rightId = "planetbarcomponent";
    // subtree is off on purpose: the callback only ever acted on mutations whose target IS this
    // element, so every descendant mutation was delivered just to be filtered out - on a planet-bar
    // re-render that was ~72 deliveries for the 12 that mattered.
    //
    // The refresh below also used to run once PER matching mutation, so re-rendering 12 planets ran
    // the whole ~15-method refresh 12 times. It is idempotent, so once per batch is enough.
    rightObserver(
      document.getElementById(rightId),
      (mutations) => {
        if (!mutations.some((mutation) => mutation.target.id === rightId)) return;

        ogkush.planetList = document.querySelectorAll(".smallplanet");
        ogkush.current.planet = (
          document.querySelector("#planetList .active") ?? document.querySelector("#planetList .planetlink")
        ).parentNode;
        document
          .querySelectorAll(".planet-koords")
          .forEach((elem) => (elem.textContent = elem.textContent.slice(1, -1)));
        document.querySelectorAll(".moonlink").forEach((elem) => {
          elem.classList.add("tooltipRight");
          elem.classList.remove("tooltipLeft");
        });
        document.querySelectorAll(".planetlink").forEach((elem) => {
          elem.classList.add("tooltipLeft");
          elem.classList.remove("tooltipRight");
        });
        ogkush.renderPlanetBar();
        ogkush.updateFlyings();
        ogkush.updatePlanets_IncomingHostileFleet();
        ogkush.updatePlanets_FleetActivity();
      },
      { subtree: false, childList: true }
    );
  }

  // remove when complete removal of direct probin in stalks and target list or GF start to wake up

  timeZone() {
    if (window.timeZoneDiffSeconds !== undefined) {
      this.json.timezoneDiff = timeZoneDiffSeconds;
      this.saveData();
    }
    if (this.json.options.timeZone) {
      timeDiff = timeDiff + this.json.timezoneDiff * 1e3;
    }
    let hourDiff = this.json.timezoneDiff / 60 / 60;
    hourDiff != 0 &&
      $(".ogk-ping").prepend(
        createDOM("span", { style: "color: white" }, `(${hourDiff > 0 ? "+" : ""}${toFormatedNumber(hourDiff)}h) `)
      );
  }

  overviewDates() {
    document.querySelectorAll("#productionboxBottom time[class$='Countdown']").forEach((timer) => {
      const timeLeft = time.getTimeFromISOString(timer.getAttribute("datetime")) * 1e3;
      const timeZoneChange = this.json.options.timeZone ? 0 : this.json.timezoneDiff;
      const newDate = new Date(Date.now() + timeLeft - timeZoneChange * 1e3);
      const dateTxt = getFormatedDate(newDate.getTime(), "[d].[m].[y] - [G]:[i]:[s] ");
      timer.parentNode.appendChild(DOM.createDOM("div", { class: "ogl-date" }, dateTxt));
    });
  }

  async updateServerSettings(force = false) {
    const timeSinceServerTimeStamp =
      document.querySelector("[name='ogame-timestamp']").content - this.json?.serverSettingsTimeStamp;
    if (timeSinceServerTimeStamp < 24 * 3600 && !force) return;
    let settingsUrl = `https://s${this.universe}-${OgamePageData.gameLang}.ogame.gameforge.com/api/serverData.xml`;
    return fetch(settingsUrl)
      .then((rep) => rep.text())
      .then((str) => new window.DOMParser().parseFromString(str, "text/xml"))
      .then((xml) => {
        this.json.serverSettingsTimeStamp = xml.querySelector("serverData").getAttribute("timestamp");
        this.json.universeUrl = `https://${xml.querySelector("domain").innerHTML}`;
        this.json.universeName = xml.querySelector("name").innerHTML;
        this.json.universeDomain = xml.querySelector("domain").innerHTML;
        this.json.topScore = Number(xml.querySelector("topScore").innerHTML);
        this.json.speed = Number(xml.querySelector("speed").innerHTML);
        this.json.speedResearch =
          Number(xml.querySelector("speed").innerHTML) * Number(xml.querySelector("researchDurationDivisor").innerHTML);
        this.json.speedFleetWar = Number(xml.querySelector("speedFleetWar").innerHTML);
        this.json.speedFleetPeaceful = Number(xml.querySelector("speedFleetPeaceful").innerHTML);
        this.json.speedFleetHolding = Number(xml.querySelector("speedFleetHolding").innerHTML);
        this.json.researchDivisor = Number(xml.querySelector("researchDurationDivisor").innerHTML);
        this.json.trashsimSettings = {
          speed: xml.querySelector("speedFleetWar").innerHTML,
          speed_fleet: xml.querySelector("speedFleetWar").innerHTML,
          galaxies: xml.querySelector("galaxies").innerHTML,
          systems: xml.querySelector("systems").innerHTML,
          rapid_fire: xml.querySelector("rapidFire").innerHTML,
          def_to_tF: xml.querySelector("defToTF").innerHTML,
          debris_factor: xml.querySelector("debrisFactor").innerHTML,
          repair_factor: xml.querySelector("repairFactor").innerHTML,
          donut_galaxy: xml.querySelector("donutGalaxy").innerHTML,
          donut_system: xml.querySelector("donutSystem").innerHTML,
          simulations: 25,
          characterClassesEnabled: xml.querySelector("characterClassesEnabled").innerHTML,
          minerBonusFasterTradingShips: xml.querySelector("minerBonusFasterTradingShips").innerHTML,
          minerBonusIncreasedCargoCapacityForTradingShips: xml.querySelector(
            "minerBonusIncreasedCargoCapacityForTradingShips"
          ).innerHTML,
          warriorBonusFasterCombatShips: xml.querySelector("warriorBonusFasterCombatShips").innerHTML,
          warriorBonusFasterRecyclers: xml.querySelector("warriorBonusFasterRecyclers").innerHTML,
          warriorBonusRecyclerFuelConsumption: xml.querySelector("warriorBonusRecyclerFuelConsumption").innerHTML,
          combatDebrisFieldLimit: xml.querySelector("combatDebrisFieldLimit").innerHTML,
        };
        this.json.universeSettingsTooltip = {
          galaxies: Number(xml.querySelector("galaxies").innerHTML),
          systems: Number(xml.querySelector("systems").innerHTML),
          donutGalaxy: xml.querySelector("donutGalaxy").innerHTML == 1,
          donutSystem: xml.querySelector("donutSystem").innerHTML == 1,
          bonusFields: Number(xml.querySelector("bonusFields").innerHTML),
          debrisFactor: Number(xml.querySelector("debrisFactor").innerHTML),
          debrisFactorDef: Number(xml.querySelector("debrisFactorDef").innerHTML),
          deuteriumInDebris: Boolean(xml.querySelector("deuteriumInDebris").innerHTML),
          repairFactor: Number(xml.querySelector("repairFactor").innerHTML),
          fuelConsumption: Number(xml.querySelector("globalDeuteriumSaveFactor").innerHTML),
          probeCargo: Number(xml.querySelector("probeCargo").innerHTML),
        };
        this.json.cargoHyperspaceTechMultiplier = Number(xml.querySelector("cargoHyperspaceTechMultiplier").innerHTML);
        this.json.minerBonusResourceProduction = Number(xml.querySelector("minerBonusResourceProduction").innerHTML);
        this.json.minerBonusAdditionalCrawler = Number(xml.querySelector("minerBonusAdditionalCrawler").innerHTML);
        this.json.minerBonusMaxCrawler = Number(xml.querySelector("minerBonusMaxCrawler").innerHTML);
        this.json.minerBonusEnergy = Number(xml.querySelector("minerBonusEnergy").innerHTML);
        this.json.resourceBuggyProductionBoost = Number(xml.querySelector("resourceBuggyProductionBoost").innerHTML);
        this.json.resourceBuggyMaxProductionBoost = Number(
          xml.querySelector("resourceBuggyMaxProductionBoost").innerHTML
        );
        this.json.explorerBonusIncreasedResearchSpeed = Number(
          xml.querySelector("explorerBonusIncreasedResearchSpeed").innerHTML
        );
        this.json.explorerBonusIncreasedExpeditionOutcome = Number(
          xml.querySelector("explorerBonusIncreasedExpeditionOutcome").innerHTML
        );
        this.json.lifeFormResearchSpeed = {};
        xml.querySelectorAll("generalBase").forEach((elem) => {
          let research = elem.parentNode.parentNode;
          let id = research.getAttribute("technologyId");
          this.json.lifeFormResearchSpeed[id] = {};
          research.querySelector("factors").childNodes.forEach((factor) => {
            this.json.lifeFormResearchSpeed[id][factor.nodeName] = factor.innerHTML;
          });
        });
        this.json.lifeFormCostReductionFromBuilding = {};
        this.json.lifeFormCostReductionFromResearch = {};
        xml.querySelectorAll("technologyBase").forEach((elem) => {
          if (elem.parentNode.parentNode.parentNode.nodeName == "building") {
            let bonusTo = elem.parentNode.querySelector("techId").innerHTML;
            let bonusFrom = elem.parentNode.parentNode.parentNode.getAttribute("technologyId");
            this.json.lifeFormCostReductionFromBuilding[bonusTo] =
              this.json.lifeFormCostReductionFromBuilding[bonusTo] || {};
            this.json.lifeFormCostReductionFromBuilding[bonusTo][bonusFrom] = {
              base: elem.parentNode.querySelector("technologyBase").innerHTML,
              factor: elem.parentNode.querySelector("technologyFactor").innerHTML,
              max: elem.parentNode.querySelector("technologyMax").innerHTML,
            };
          }
          if (elem.parentNode.parentNode.parentNode.nodeName == "research") {
            let bonusTo = elem.parentNode.querySelector("techId").innerHTML;
            let bonusFrom = elem.parentNode.parentNode.parentNode.getAttribute("technologyId");
            this.json.lifeFormCostReductionFromResearch[bonusTo] =
              this.json.lifeFormCostReductionFromResearch[bonusTo] || {};
            this.json.lifeFormCostReductionFromResearch[bonusTo][bonusFrom] = {
              base: elem.parentNode.querySelector("technologyBase").innerHTML,
              factor: elem.parentNode.querySelector("technologyFactor").innerHTML,
              max: elem.parentNode.querySelector("technologyMax").innerHTML,
            };
          }
        });
        this.json.lifeFormTimeReductionFromBuilding = {};
        this.json.lifeFormTimeReductionFromResearch = {};
        xml.querySelectorAll("timeTechnologyBase").forEach((elem) => {
          if (elem.parentNode.parentNode.parentNode.nodeName == "building") {
            let bonusTo = elem.parentNode.querySelector("techId").innerHTML;
            let bonusFrom = elem.parentNode.parentNode.parentNode.getAttribute("technologyId");
            this.json.lifeFormTimeReductionFromBuilding[bonusTo] =
              this.json.lifeFormTimeReductionFromBuilding[bonusTo] || {};
            this.json.lifeFormTimeReductionFromBuilding[bonusTo][bonusFrom] = {
              base: elem.parentNode.querySelector("timeTechnologyBase").innerHTML,
              factor: elem.parentNode.querySelector("timeTechnologyFactor").innerHTML,
              max: elem.parentNode.querySelector("timeTechnologyMax").innerHTML,
            };
          }
          if (elem.parentNode.parentNode.parentNode.nodeName == "research") {
            let bonusTo = elem.parentNode.querySelector("techId").innerHTML;
            let bonusFrom = elem.parentNode.parentNode.parentNode.getAttribute("technologyId");
            this.json.lifeFormTimeReductionFromResearch[bonusTo] =
              this.json.lifeFormTimeReductionFromResearch[bonusTo] || {};
            this.json.lifeFormTimeReductionFromResearch[bonusTo][bonusFrom] = {
              base: elem.parentNode.querySelector("timeTechnologyBase").innerHTML,
              factor: elem.parentNode.querySelector("timeTechnologyFactor").innerHTML,
              max: elem.parentNode.querySelector("timeTechnologyMax").innerHTML,
            };
          }
        });

        this.json.lifeFormProductionBoostFromBuildings = {};
        this.json.lifeFormProductionBoostFromResearch = {};
        xml.querySelectorAll("metalBase, crystalBase, deuteriumBase").forEach((elem) => {
          let tech = elem.parentNode.parentNode;
          let id = tech.getAttribute("technologyId");
          let boost =
            tech.nodeName == "building"
              ? this.json.lifeFormProductionBoostFromBuildings
              : this.json.lifeFormProductionBoostFromResearch;
          if (["ResourceBooster", "ProductionBooster"].includes(tech.querySelector("type").innerHTML)) {
            boost[id] = [
              tech.querySelector("metalBase") ? Number(tech.querySelector("metalBase").innerHTML) : 0,
              tech.querySelector("crystalBase") ? Number(tech.querySelector("crystalBase").innerHTML) : 0,
              tech.querySelector("deuteriumBase") ? Number(tech.querySelector("deuteriumBase").innerHTML) : 0,
            ];
          }
        });
        this.saveData();
      });
  }

  expeditionImpact(show) {
    if (show) {
      document.querySelectorAll(".eventFleet[data-mission-type='15'][data-return-flight='true']").forEach((elem) => {
        let previous = Number(elem.getAttribute("id").replace("eventRow-", "")) - 1;
        let previousNode = document.querySelector("#eventRow-" + previous);
        if (previousNode) {
          previousNode.style.display = "table-row";
        }
      });
    } else {
      document.querySelectorAll(".eventFleet[data-mission-type='15'][data-return-flight='false']").forEach((elem) => {
        elem.style.display = "none";
      });
    }
  }

  /**
   * Alliance target claims in galaxy view (roadmap Feature E).
   *
   * Colours rows a teammate has recently farmed so two members do not spend fuel on the same
   * inactive. Purely a colour and a tooltip: no probe icon, no dispatch action is attached to any
   * coordinate, so the player still goes through the game's own galaxy probe flow (AGENTS.md 1.5.1).
   *
   * Gated on the PTRE team key the player entered themselves - without a key nothing is requested,
   * so a player who has not opted into PTRE never contacts it. Fires only when the player loads or
   * changes a galaxy page: never on a timer, a loop or a refresh (AGENTS.md section 4).
   */

  chat() {
    this.json.tchat = !!document.querySelector("#chatBar");
    if (!this.json.tchat) {
      return;
    }
    let toggleChat = () => {
      this.json.tchat = !this.json.tchat;
      this.saveData();
      document.querySelector("#chatBar").style.display = this.json.tchat ? "block" : "none";
    };
    let oldfunc = ogame.chat.loadChatLogWithPlayer;
    ogame.chat.loadChatLogWithPlayer = (elem, m, cb, uu) => {
      if (!this.json.tchat) {
        toggleChat();
      }
      oldfunc(elem, m, cb, uu);
    };
    let btn = document.querySelector("body").appendChild(createDOM("div", { class: "ogk-chat icon icon_chat" }));
    if (this.json.tchat) {
      document.querySelector("#chatBar").style.display = this.json.tchat ? "block" : "none";
    }
    btn.addEventListener("click", () => {
      toggleChat();
    });
  }

  sideOptions() {
    let harvestOptions = createDOM("div", { class: "ogl-harvestOptions" });
    let container = document.querySelector("#myPlanets") || document.querySelector("#myWorlds");
    container.prepend(harvestOptions);
    let syncOption = harvestOptions.appendChild(
      createDOM("div", { class: "ogl-option ogl-syncOption tooltip", title: Translator.translate(0) })
    );
    syncOption.addEventListener("click", () => settings(this.settingsContext()));
    let targetList = harvestOptions.appendChild(
      createDOM("a", { class: "ogl-option ogl-targetIcon tooltip", title: Translator.translate(1) })
    );
    let search = harvestOptions.appendChild(
      createDOM("div", { class: "ogl-option ogl-search-icon tooltip", title: Translator.translate(2) })
    );
    let statsBtn = harvestOptions.appendChild(
      createDOM("div", { class: "ogl-option ogl-statistics-icon tooltip", title: Translator.translate(3) })
    );
    let empireBtn;
    empireBtn = harvestOptions.appendChild(
      createDOM("div", { class: "ogl-option ogl-empire-icon tooltip", title: Translator.translate(4) })
    );
    let overViewBtn = harvestOptions.appendChild(
      createDOM("div", { class: "ogl-option ogl-overview-icon tooltip", title: Translator.translate(5) })
    );
    if (this.json.options.targetList) {
      targetList.classList.add("ogl-active");
      targetList(this.galaxyContext(), true);
    }
    this.searchOpened = false;
    targetList.addEventListener("click", () => {
      if (this.searchOpened) {
        playerSearch(this.pageContext(), false);
        this.searchOpened = false;
        search.classList.remove("ogl-active");
      }
      targetList(this.galaxyContext(), !this.json.options.targetList);
      targetList.classList.toggle("ogl-active");
      this.json.options.targetList = !this.json.options.targetList;
      this.saveData();
    });
    if (this.json.playerSearch != "") {
      playerSearch(this.pageContext(), true, this.json.playerSearch);
      search.classList.add("ogl-active");
      this.searchOpened = true;
    }
    search.addEventListener("click", () => {
      if (this.json.options.targetList) {
        this.json.options.targetList = false;
        this.saveData();
        targetList.classList.remove("ogl-active");
        targetList(this.galaxyContext(), false);
      }
      search.classList.toggle("ogl-active");
      playerSearch(this.pageContext(), !this.searchOpened);
      this.searchOpened = !this.searchOpened;
    });
    empireBtn.addEventListener("click", (e) => {
      updateEmpireData(this.empireContext(), e.ctrlKey);
      this.loading();
      let inter = setInterval(() => {
        if (!this.isLoading) {
          clearInterval(inter);
          overview(this.overviewContext());
        }
      }, 20);
    });
    overViewBtn.addEventListener("click", (e) => {
      updateEmpireData(this.empireContext(), e.ctrlKey);
      let active = document.querySelector(".ogl-option.ogl-active:not(.ogl-overview-icon)");
      if (active) {
        active.click();
        return;
      }
      if (this.json.options.empire) {
        document.querySelector("#planetList").classList.remove("moon-construction-sum");
        document.querySelector(".ogl-overview-icon").classList.remove("ogl-active");
        document.querySelectorAll(".ogl-summary, .ogl-res").forEach((elem) => elem.remove());
        this.json.options.empire = false;
      } else {
        this.json.options.empire = true;
        resourceDetail(this.overviewContext());
      }
      this.saveData();
    });
    statsBtn.addEventListener("click", (e) => {
      updateEmpireData(this.empireContext(), e.ctrlKey);
      this.loading();
      let inter = setInterval(() => {
        if (!this.isLoading) {
          clearInterval(inter);
          statistics({
            playerClass: this.playerClass,
            hasLifeforms: this.hasLifeforms,
            universe: this.universe,
            playerBonuses: this.playerBonuses(),
          });
        }
      }, 20);
    });
  }

  async ptreAction(frame, player) {
    frame = frame || "week";

    let container = createDOM("div", { class: "ptreContent" });

    if (!this.json.options.ptreTK) {
      container.textContent = Translator.translate(151);
      popupUtil.popup(null, container);
      return;
    }

    let cleanPlayerName = encodeURIComponent(player.name);
    ptreService
      .getPlayerInfos(
        OgamePageData.gameLang,
        this.universe,
        this.json.options.ptreTK,
        cleanPlayerName,
        player.id,
        frame
      )
      .then((result) => {
        if (result.code == 1) {
          let arrData = result.activity_array.succes == 1 ? JSON.parse(result.activity_array.activity_array) : null;
          let checkData = result.activity_array.succes == 1 ? JSON.parse(result.activity_array.check_array) : null;

          container.appendChild(createDOM("h3", {}, Translator.translate(152)));

          const ptreBestReport = createDOM("div", { class: "ptreBestReport" });
          const fleetPointsDiv = createDOM("div");
          fleetPointsDiv.append(
            createDOM("div").appendChild(
              createDOM(
                "b",
                { class: "ogl_fleet" },
                Numbers.formatToUnits(result.top_sr_fleet_points) + " pts"
              ).insertAdjacentElement("afterbegin", createDOM("i", { class: "material-icons" }, "military_tech"))
                .parentElement
            ),
            createDOM("div").appendChild(
              createDOM("b", {}, new Date(result.top_sr_timestamp * 1000).toLocaleDateString("fr-FR"))
            ).parentElement
          );
          const buttonsDiv = createDOM("div");
          buttonsDiv.append(
            createDOM(
              "a",
              { class: "ogl_button", target: "result.top_sr_link", href: result.top_sr_link },
              Translator.translate(153)
            ),
            createDOM(
              "a",
              {
                class: "ogl_button",
                target: `https://ptre.chez.gg/?country=${OgamePageData.gameLang}&univers=${this.universe}&player_id=${player.id}`,
                href: `https://ptre.chez.gg/?country=${OgamePageData.gameLang}&univers=${this.universe}&player_id=${player.id}`,
              },
              Translator.translate(154)
            )
          );
          ptreBestReport.append(fleetPointsDiv, buttonsDiv);

          container.appendChild(ptreBestReport);
          container.appendChild(createDOM("div", { class: "splitLine" }));
          container.appendChild(createDOM("h3", {}, result.activity_array.title || ""));

          const domPtreActivities = createDOM("div", { class: "ptreActivities" });
          domPtreActivities.appendChild(createDOM("span"));
          domPtreActivities.appendChild(createDOM("div"));
          container.appendChild(domPtreActivities);

          container.appendChild(createDOM("div", { class: "splitLine" }));
          container.appendChild(createDOM("div", { class: "ptreFrames" }));

          ["last24h", "2days", "3days", "week", "2weeks", "month"].forEach((f) => {
            let btn = container.querySelector(".ptreFrames").appendChild(createDOM("div", { class: "ogl_button" }, f));
            btn.addEventListener("click", () => this.ptreAction(f, player));
          });

          if (result.activity_array.succes == 1) {
            arrData.forEach((line, index) => {
              if (!isNaN(line[1])) {
                let div = createDOM("div", { class: "tooltip" });
                div.appendChild(createDOM("div", {}, line[0]));
                let span = div.appendChild(createDOM("span", { class: "ptreDotStats" }));
                let dot = span.appendChild(
                  createDOM("div", { "data-acti": line[1], "data-check": checkData[index][1] })
                );

                let dotValue = (line[1] / result.activity_array.max_acti_per_slot) * 100 * 7;
                dotValue = Math.ceil(dotValue / 30) * 30;

                dot.style.color = `hsl(${Math.max(0, 100 - dotValue)}deg 75% 40%)`;
                dot.style.opacity = checkData[index][1] + "%";
                dot.style.padding = "7px";

                let title;
                let checkValue = Math.max(0, 100 - dotValue);

                if (checkValue === 100) title = Translator.translate(155);
                else if (checkValue >= 60) title = Translator.translate(156);
                else if (checkValue >= 40) title = Translator.translate(157);
                else title = Translator.translate(158);

                if (checkData[index][1] == 100) title += Translator.translate(159);
                else if (checkData[index][1] >= 75) title += Translator.translate(160);
                else if (checkData[index][1] >= 50) title += Translator.translate(161);
                else if (checkData[index][1] > 0) title = Translator.translate(162);
                else title = Translator.translate(163);

                div.setAttribute("title", title);

                if (checkData[index][1] === 100 && line[1] == 0) dot.classList.add("ogl_active");

                container.querySelector(".ptreActivities > div").appendChild(div);
              }
            });
          } else {
            container.querySelector(".ptreActivities > span").textContent = result.activity_array.message;
          }
        } else container.textContent = result.message;
        this.isLoading = false;
        popupUtil.popup(null, container);
      });
  }

  /**
   * It is used to analyze the messages viewed on the "messages" page.
   * @supported page=messages
   */
  messagesAnalyzer() {
    ctxMessageAnalyzer.call(this);
  }

  loading() {
    loadingUtil.loading();
  }

  /**
   * Save-flight overview: per planet, what is worth moving to the bank, how many cargos that
   * needs, and how much hold would fly empty.
   *
   * Each row links to that planet's own fleetdispatch page with the bank preselected - one click,
   * one planet, and the player still presses the game's own send button. There is deliberately no
   * "harvest everything" button: that would be one click triggering many fleet dispatches.
   */

  fetchAndConvertRC(messageId) {
    const url = `https://s${this.universe}-${OgamePageData.gameLang}.ogame.gameforge.com/game/index.php?page=messages&messageId=${messageId}&tabid=21&ajax=1`;
    return fetch(url)
      .then((rep) => rep.text())
      .then((str) => {
        const beginText = "JSON('";
        if (str.indexOf(beginText) == -1) return null;
        let begin = str.indexOf(beginText) + 6;
        let end = str.indexOf("');");
        let json = JSON.parse(str.substr(begin, end - begin));
        let combatIds = [];
        let isProbes = true;
        let isDefender = false;
        for (let i in json.attacker) {
          for (let j in json.attacker[i].shipDetails) {
            if (j != 210) {
              isProbes = false;
            }
          }
          if (json.attacker[i].ownerID == playerId) {
            combatIds.push(i);
          }
        }
        for (let i in json.defender) {
          if (json.defender[i].ownerID == playerId) {
            combatIds.push(i);
            isDefender = true;
          }
        }
        let ennemi;
        let ennemiLosses;
        if (isDefender) {
          ennemi = Object.values(json.attacker)[0].ownerID;
          ennemiLosses = json.statistic.lostUnitsAttacker;
        } else {
          ennemi = Object.values(json.defender)[0].ownerID;
          ennemiLosses = json.statistic.lostUnitsDefender;
        }
        let damages = {};
        let losses = {};
        let lastRound = json.combatRounds[json.combatRounds.length - 1];
        if (lastRound) {
          combatIds.forEach((id) => {
            for (let i in lastRound.defenderLosses) {
              if (!isDefender) {
                Object.entries(lastRound.defenderLosses[i]).forEach((ship) => {
                  let shipid = ship[0];
                  let shipcount = Number(ship[1]);
                  damages[shipid] ? (damages[shipid] += shipcount) : (damages[shipid] = shipcount);
                });
              }
              if (i == id) {
                Object.entries(lastRound.defenderLosses[i]).forEach((ship) => {
                  let shipid = ship[0];
                  let shipcount = Number(ship[1]);
                  losses[shipid] ? (losses[shipid] += shipcount) : (losses[shipid] = shipcount);
                });
              }
            }
            for (let i in lastRound.attackerLosses) {
              if (isDefender) {
                Object.entries(lastRound.attackerLosses[i]).forEach((ship) => {
                  let shipid = ship[0];
                  let shipcount = Number(ship[1]);
                  damages[shipid] ? (damages[shipid] += shipcount) : (damages[shipid] = shipcount);
                });
              }
              if (i == id) {
                Object.entries(lastRound.attackerLosses[i]).forEach((ship) => {
                  let shipid = ship[0];
                  let shipcount = Number(ship[1]);
                  losses[shipid] ? (losses[shipid] += shipcount) : (losses[shipid] = shipcount);
                });
              }
            }
          });
        }
        let cr = {
          timestamp: json.event_timestamp * 1e3,
          coordinates: json.coordinates,
          losses: losses,
          loot: json.loot,
          debris: json.debris,
          ennemi: { name: ennemi, losses: ennemiLosses },
          isProbes:
            isProbes &&
            json.loot.metal == 0 &&
            json.loot.crystal == 0 &&
            json.loot.deuterium == 0 &&
            json.debris.crystalTotal < 2e5,
          win: (json.result == "defender" && isDefender) || (json.result == "attacker" && !isDefender),
          draw: json.result == "draw",
        };
        return cr;
      });
  }

  spyTable() {
    if (this.page == "fleetdispatch" && this.mode == ogiMode.RAID) {
      let link = "https://" + window.location.host + window.location.pathname + "?page=ingame&component=messages";
      document.querySelector("#sendFleet").addEventListener("click", () => {
        localStorage.setItem("ogl-redirect", link);
      });
      let sent = false;
      document.addEventListener("keydown", (event) => {
        if (!sent && event.key === "Enter" && fleetDispatcher.currentPage == "fleet3") {
          localStorage.setItem("ogl-redirect", link);
          sent = true;
        }
      });
    }
  }

  saveData() {
    OGIData.json = this.json;
  }

  /**
   * The class and officer flags `util/gameFormulas.js` needs, as a plain object.
   *
   * The formulas are handed this rather than the instance on purpose: a module that
   * can reach back into the page controller is not actually separated from it
   * (refactoring.md Phase 3).
   */
  /**
   * The page facts the extracted dialogs read, as a plain object. Same reason as
   * {@link playerBonuses}: an extracted module must not be handed the controller.
   */
  /** The page facts the settings dialog reads. */
  settingsContext() {
    return {
      commander: this.commander,
      universe: this.universe,
      dialogContext: this.dialogContext(),
      // A callback, not a method reference: re-reading the server data is the
      // controller's job, and #updateData() is private to it.
      updateData: () => this.forceUpdateData(),
    };
  }

  /** The page facts the empire-overview module reads. */
  overviewContext() {
    return { current: this.current, isMobile: this.isMobile };
  }

  /**
   * Everything the empire module reads off the controller.
   *
   * The last three are callbacks, not values: they hand work back here. `isLoading`
   * and `setLoading` guard `updateInfo()` against re-entry, and the flag stays on the
   * controller because two unrelated places outside the empire module also poll it.
   */
  empireContext() {
    return {
      current: this.current,
      page: this.page,
      mode: this.mode,
      universe: this.universe,
      playerClass: this.playerClass,
      geologist: this.geologist,
      allOfficers: this.allOfficers,
      hasLifeforms: this.hasLifeforms,
      overviewContext: this.overviewContext(),
      flyingFleet: () => flyingFleet(this.planetBarContext()),
      updateSpaceShipsPresence: () => updateSpaceShipsPresence(this.planetBarContext()),
      isLoading: () => this.isLoading,
      setLoading: (value) => (this.isLoading = value),
    };
  }
  /** Everything the fleet-dispatch module reads off the controller. */
  fleetContext() {
    const controller = this;
    return {
      current: this.current,
      page: this.page,
      mode: this.mode,
      rawURL: this.rawURL,
      universe: this.universe,
      planetList: this.planetList,
      homePlanetCoords: this.homePlanetCoords,
      playerClass: this.playerClass,
      commander: this.commander,
      admiral: this.admiral,
      hasLifeforms: this.hasLifeforms,
      isMobile: this.isMobile,
      dialogContext: this.dialogContext(),
      // Written by the module, read by keyboardActions() here.
      set keyboardActionSkip(value) {
        controller.keyboardActionSkip = value;
      },
    };
  }

  /** Everything the planet-bar module reads off the controller. */
  planetBarContext() {
    const controller = this;
    return {
      current: this.current,
      page: this.page,
      rawURL: this.rawURL,
      planetList: this.planetList,
      hasLifeforms: this.hasLifeforms,
      overviewContext: this.overviewContext(),
      empireContext: this.empireContext(),
      // The sidebar buttons stay with the controller - they open five different
      // page modules, each with its own context.
      sideOptions: () => controller.sideOptions(),
    };
  }
  /** Everything the galaxy module reads off the controller. */
  galaxyContext() {
    const controller = this;
    return {
      current: this.current,
      page: this.page,
      universe: this.universe,
      playerId: this.playerId,
      admiral: this.admiral,
      rawURL: this.rawURL,
      // Set by util/highlightTarget.js and read back when the galaxy view redraws.
      highlighted: this.highlighted,
      // Read AND written: start() fills the list too, so it cannot be module state
      // over in the galaxy view.
      get markedPlayers() {
        return controller.markedPlayers;
      },
      set markedPlayers(value) {
        controller.markedPlayers = value;
      },
    };
  }
  /** Everything the technology-detail panel reads off the controller. */
  technoContext() {
    return {
      current: this.current,
      page: this.page,
      playerClass: this.playerClass,
      engineer: this.engineer,
      allOfficers: this.allOfficers,
      isMobile: this.isMobile,
      playerBonuses: this.playerBonuses(),
    };
  }
  /**
   * The page facts the smaller extracted modules read - keyboard shortcuts, the event
   * box, the stalk views, Pantry sync and the page tweaks.
   *
   * One object rather than five: between them they read nine plain fields and four of
   * the other contexts, and five near-identical builders would be harder to keep in
   * step than one.
   */
  pageContext() {
    const controller = this;
    return {
      current: this.current,
      page: this.page,
      mode: this.mode,
      rawURL: this.rawURL,
      universe: this.universe,
      univerviewLang: this.univerviewLang,
      planetList: this.planetList,
      playerClass: this.playerClass,
      geologist: this.geologist,
      isMobile: this.isMobile,
      hasLifeforms: this.hasLifeforms,
      expeditionImpact: this.expeditionImpact,
      overviewContext: this.overviewContext(),
      empireContext: this.empireContext(),
      galaxyContext: this.galaxyContext(),
      fleetContext: this.fleetContext(),
      set keyboardActionSkip(value) {
        controller.keyboardActionSkip = value;
      },
    };
  }
  dialogContext() {
    return { hasLifeforms: this.hasLifeforms, current: this.current };
  }

  playerBonuses() {
    return { playerClass: this.playerClass, geologist: this.geologist, allOfficers: this.allOfficers };
  }

  /**
   * @deprecated DOMPurify will be removed in the future. Avoid its use in new developments. Use the global function.
   */

  getAllianceClass() {
    fetch("/game/index.php?page=ingame&component=resourcesettings")
      .then((rep) => rep.text())
      .then((str) => {
        let htmlDocument = new window.DOMParser().parseFromString(str, "text/html");
        let allyClassIcon = htmlDocument.querySelector(".allianceclass");
        if (allyClassIcon) {
          if (allyClassIcon.classList.contains("trader")) this.json.allianceClass = AllianceClass.MINER;
          if (allyClassIcon.classList.contains("explorer")) this.json.allianceClass = AllianceClass.EXPLORER;
          if (allyClassIcon.classList.contains("warrior")) this.json.allianceClass = AllianceClass.WARRIOR;
          if (allyClassIcon.classList.contains("none")) this.json.allianceClass = AllianceClass.NONE;
          this.saveData();
        }
      });
  }

  checkRedirect() {
    let url = new URL(window.location.href);
    let technoDetails = url.searchParams.get("technoDetails");
    [202, 203, 219, 209, 212].forEach((id) => {
      if (url.searchParams.has(`techId${id}`)) {
        let needed = Number(url.searchParams.get(`techId${id}`));
        wait.waitForQuerySelector(`.hasDetails[data-technology='${id}'] span`).then(() => {
          document.querySelector(`.hasDetails[data-technology='${id}'] span`).click();
        });
        wait.waitForQuerySelector(`#technologydetails[data-technology-id='${id}']`).then(() => {
          let input = document.querySelector("#build_amount");
          input.focus();
          input.value = needed;
          input.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown" }));
        });
      }
    });
    if (technoDetails) {
      let selector = `.technology[data-technology='${technoDetails}'] span`;
      wait.waitForQuerySelector(selector).then(() => document.querySelector(selector).click());
    }
  }

  /**
   * Real production tooltip (roadmap Feature D).
   *
   * Attaches a breakdown to each resource in the bar showing where the hourly number actually
   * comes from: base mines, plasma, crawlers, lifeform research, and the class/officer bonuses.
   * Every bonus is a share of the base and is summed before being applied once - compounding them
   * is what makes other tools disagree with the game by a few percent.
   *
   * Read-only. Every input is already on the page; nothing is fetched.
   */
  realProductionTooltip() {
    if (this.page !== "overview" || this.current.isMoon) return;

    const planet = OGIData.empire[this.current.index];
    if (!planet || !planet.production) return;

    const mineLevels = [Number(planet[1]) || 0, Number(planet[2]) || 0, Number(planet[3]) || 0];
    const isCollector = this.playerClass == PLAYER_CLASS_MINER;

    const crawlers = effectiveCrawlers({
      mineLevels,
      crawlerCount: Number(planet[217]) || 0,
      geologist: this.geologist,
    });

    const crawlerShare = crawlerBonus({
      crawlers,
      overload: Number(this.json.options.crawlerPercent) || 1,
      isCollector,
      classBonus: isCollector ? Number(this.json.minerBonusAdditionalCrawler) || 0 : 0,
      lifeformBonus: Number(this.json.lifeformBonus?.crawlerBonus?.production) || 0,
    });

    const resourceSelectors = ["#resources_metal", "#resources_crystal", "#resources_deuterium"];

    resourceSelectors.forEach((selector, index) => {
      const element = document.querySelector(selector);
      if (!element) return;

      const hourly = Math.floor(planet.production.hourly[index]) || 0;
      if (hourly <= 0) return;

      // The stored hourly figure already includes every bonus, so the breakdown is derived by
      // working back to the base rather than by recomputing the mines from scratch.
      const lifeformShare =
        (Number(this.json.lifeformBonus?.productionBonus?.[index]) || 0) +
        (Number(this.json.lifeformPlanetBonus?.[this.current.id]?.productionBonus?.[index]) || 0);

      const plasmaLevel = Number(this.json.technology?.[122]) || 0;
      const parts = productionBreakdown({
        baseProduction: hourly / (1 + crawlerShare + lifeformShare + plasmaLevel * PLASMATECH_BONUS[index]),
        resourceIndex: index,
        plasmaLevel,
        crawlerBonus: crawlerShare,
        lifeformBonus: lifeformShare,
      });

      const detail = createDOM("div", { class: "ogl-production-detail" });
      detail.appendChild(createDOM("div", { class: "ogl-production-title" }, Translator.translate(243)));

      const addRow = (label, value) => {
        if (!value) return;
        const line = createDOM("div", { class: "ogl-production-row" });
        line.appendChild(createDOM("span", {}, label));
        line.appendChild(createDOM("span", {}, toFormatedNumber(value, null, true)));
        detail.appendChild(line);
      };

      addRow(Translator.translate(244), parts.base);
      addRow(Translator.translate(245), parts.plasma);
      addRow(Translator.translate(246), parts.crawler);
      addRow(Translator.translate(247), parts.lifeform);
      addRow(Translator.translate(248), parts.other);

      const total = createDOM("div", { class: "ogl-production-row ogl-production-total" });
      total.appendChild(createDOM("span", {}, "Σ"));
      total.appendChild(createDOM("span", {}, toFormatedNumber(parts.total, null, true)));
      detail.appendChild(total);

      element.classList.add("ogl-production-hint");
      element.addEventListener("mouseover", () => tooltip(element, detail, false, false, 100));
    });
  }

  showStorageTimers() {
    if (this.page == "overview" && OGIData.empire[this.current.index]) {
      let currentDate = new Date();
      let timeZoneChange = this.json.options.timeZone ? 0 : this.json.timezoneDiff;
      let metalStorage = resourcesBar.resources.metal.storage;
      let metalResources = resourcesBar.resources.metal.amount;
      let metalProduction = this.current.isMoon
        ? 0
        : Math.floor(OGIData.empire[this.current.index].production.hourly[0]);
      let metalTime = (metalStorage - metalResources) / metalProduction;
      let metalDate = new Date(currentDate.getTime() + (metalTime * 3600 - timeZoneChange) * 1e3);
      let metalFull = metalResources >= metalStorage;
      if (metalFull) metalProduction = 0;
      let crystalStorage = resourcesBar.resources.crystal.storage;
      let crystalResources = resourcesBar.resources.crystal.amount;
      let crystalProduction = this.current.isMoon
        ? 0
        : Math.floor(OGIData.empire[this.current.index].production.hourly[1]);
      let crystalTime = (crystalStorage - crystalResources) / crystalProduction;
      let crystalDate = new Date(currentDate.getTime() + (crystalTime * 3600 - timeZoneChange) * 1e3);
      let crystalFull = crystalResources >= crystalStorage;
      if (crystalFull) crystalProduction = 0;
      let deuteriumStorage = resourcesBar.resources.deuterium.storage;
      let deuteriumResources = resourcesBar.resources.deuterium.amount;
      let deuteriumProduction = this.current.isMoon
        ? 0
        : Math.floor(OGIData.empire[this.current.index].production.hourly[2]);
      let deuteriumTime = (deuteriumStorage - deuteriumResources) / deuteriumProduction;
      let deuteriumDate = new Date(currentDate.getTime() + (deuteriumTime * 3600 - timeZoneChange) * 1e3);
      let deuteriumFull = deuteriumResources >= deuteriumStorage;
      if (deuteriumFull) deuteriumProduction = 0;
      let table = document.querySelector("#planetDetails tbody");
      let metal_1 = table.insertBefore(createDOM("tr"), table.children[0]);
      metal_1.appendChild(createDOM("td", { class: "desc" }, `${Translator.translate(22, "tech")}:`));
      metal_1.appendChild(
        DOM.createDOMSanitized(
          "td",
          { class: "data" },
          `<span class="${metalProduction > 0 ? "undermark" : "overmark"}">(+${toFormatedNumber(
            metalProduction
          )})</span><span class="${
            metalResources >= metalStorage ? " overmark" : ""
          }" id="metal-storage"> ${toFormatedNumber(Math.floor(metalResources))} / ${toFormatedNumber(
            metalStorage,
            null,
            true
          )}</span>`
        )
      );
      let metal_2 = table.insertBefore(createDOM("tr"), table.children[1]);
      metal_2.appendChild(createDOM("td", { class: "desc" }, ""));
      metal_2.appendChild(
        DOM.createDOMSanitized(
          "td",
          { class: "data" },
          `<span class="${metalTime > 0 && metalTime != Infinity ? "ogl-date" : "overmark"}"> ${
            metalTime > 0 && metalTime != Infinity
              ? getFormatedDate(metalDate.getTime(), "[d].[m].[y] - [G]:[i]:[s]")
              : "-"
          }</span>`
        )
      );
      let crystal_1 = table.insertBefore(createDOM("tr"), table.children[2]);
      crystal_1.appendChild(createDOM("td", { class: "desc" }, `${Translator.translate(23, "tech")}:`));
      crystal_1.appendChild(
        DOM.createDOMSanitized(
          "td",
          { class: "data" },
          `<span class="${crystalProduction > 0 ? "undermark" : "overmark"}"> (+${toFormatedNumber(
            crystalProduction
          )})</span><span class="${
            crystalResources >= crystalStorage ? " overmark" : ""
          }" id="crystal-storage"> ${toFormatedNumber(Math.floor(crystalResources))} / ${toFormatedNumber(
            crystalStorage,
            null,
            true
          )}</span>`
        )
      );
      let crystal_2 = table.insertBefore(createDOM("tr"), table.children[3]);
      crystal_2.appendChild(createDOM("td", { class: "desc" }, ""));
      crystal_2.appendChild(
        DOM.createDOMSanitized(
          "td",
          { class: "data" },
          `<span class="${crystalTime > 0 && crystalTime != Infinity ? "ogl-date" : "overmark"}"> ${
            crystalTime > 0 && crystalTime != Infinity
              ? getFormatedDate(crystalDate.getTime(), "[d].[m].[y] - [G]:[i]:[s]")
              : "-"
          }</span></span>`
        )
      );
      let deuterium_1 = table.insertBefore(createDOM("tr"), table.children[4]);
      deuterium_1.appendChild(createDOM("td", { class: "desc" }, `${Translator.translate(24, "tech")}:`));
      deuterium_1.appendChild(
        DOM.createDOMSanitized(
          "td",
          { class: "data" },
          `<span class="${deuteriumProduction > 0 ? "undermark" : "overmark"}"> (+${toFormatedNumber(
            deuteriumProduction
          )})</span><span class="${
            deuteriumResources >= deuteriumStorage ? " overmark" : ""
          }" id = "deuterium-storage" > ${toFormatedNumber(Math.floor(deuteriumResources))} / ${toFormatedNumber(
            deuteriumStorage,
            null,
            true
          )}</span>`
        )
      );
      let deuterium_2 = table.insertBefore(createDOM("tr"), table.children[5]);
      deuterium_2.appendChild(createDOM("td", { class: "desc" }, ""));
      deuterium_2.appendChild(
        DOM.createDOMSanitized(
          "td",
          { class: "data" },
          `<span class="${deuteriumTime > 0 && deuteriumTime != Infinity ? "ogl-date" : "overmark"}"> ${
            deuteriumTime > 0 && deuteriumTime != Infinity
              ? getFormatedDate(deuteriumDate.getTime(), "[d].[m].[y] - [G]:[i]:[s]")
              : "-"
          }</span></span>`
        )
      );
      let updater = setInterval(() => {
        let updateTime = new Date().getTime();
        if (
          (updateTime > metalDate.getTime() && !metalFull) ||
          (updateTime > crystalDate.getTime() && !crystalFull) ||
          (updateTime > deuteriumDate.getTime() && !deuteriumFull)
        ) {
          clearInterval(updater);
          location.reload();
        }
        if (metalProduction + crystalProduction + deuteriumProduction > 0) {
          document.querySelector("#metal-storage").textContent = ` ${toFormatedNumber(
            Math.floor(resourcesBar.resources.metal.amount)
          )} / ${toFormatedNumber(metalStorage, null, true)}`;
          document.querySelector("#crystal-storage").textContent = ` ${toFormatedNumber(
            Math.floor(resourcesBar.resources.crystal.amount)
          )} / ${toFormatedNumber(crystalStorage, null, true)}`;
          document.querySelector("#deuterium-storage").textContent = ` ${toFormatedNumber(
            Math.floor(resourcesBar.resources.deuterium.amount)
          )} / ${toFormatedNumber(deuteriumStorage, null, true)}`;
        } else {
          clearInterval(updater);
        }
      }, 2000);
    }
  }
}

// General debounce function

class Queue {
  constructor() {
    this._items = [];
  }
  enqueue(item) {
    this._items.push(item);
  }
  dequeue() {
    return this._items.shift();
  }
  get size() {
    return this._items.length;
  }
}

class AutoQueue extends Queue {
  constructor() {
    super();
    this._pendingPromise = false;
  }

  enqueue(action) {
    return new Promise((resolve, reject) => {
      super.enqueue({ action: action, resolve: resolve, reject: reject });
      this.dequeue();
    });
  }

  async dequeue() {
    if (this._pendingPromise) return false;
    let item = super.dequeue();
    if (!item) return false;
    try {
      this._pendingPromise = true;
      let payload = await item.action(this);
      this._pendingPromise = false;
      item.resolve(payload);
    } catch (e) {
      this._pendingPromise = false;
      item.reject(e);
    } finally {
      this.dequeue();
    }

    return true;
  }
}

/**
 * Attaches a terminal handler to a promise nobody awaits.
 *
 * Without one, a rejection becomes an "Uncaught (in promise)" console entry and
 * lands in the extension's error list. A navigation aborting the request is the
 * normal case here and says nothing, so it is dropped; anything else is logged
 * where it can be seen.
 *
 * @param {Promise<unknown>} promise
 */
function reportUnlessAborted(promise) {
  if (!promise || typeof promise.catch !== "function") return;
  promise.catch((error) => {
    if (!isAbortError(error)) logger.error(error);
  });
}

function versionInStatusBar() {
  const siteFooterTextRight = document.querySelector("#siteFooter div.fright.textRight");
  if (!siteFooterTextRight) {
    return;
  }

  const version = createDOM("a", {
    class: "ogk-button-version",
    href: `https://github.com/ogame-infinity/web-extension/releases/tag/v${VERSION}`,
    target: "_blank",
  });
  const icon = createDOM("div", { class: "ogk-icon" });
  version.append(icon, ` ${VERSION}`);

  siteFooterTextRight.append(" | ", version);
}

/**
 * Resolves once the game's DOM is parsed.
 *
 * `ogkush.js` is injected at `document_start` so the browser can fetch, parse
 * and compile the ~70 module files in parallel with the game's own page load
 * instead of starting all of that after DOMContentLoaded. Nothing below may
 * touch the DOM before this resolves.
 *
 * @returns {Promise<void>}
 */
function domReady() {
  if (document.readyState !== "loading") return Promise.resolve();
  return new Promise((resolve) =>
    // setTimeout, not a bare resolve: the game sets up page globals such as
    // `resourcesBar` and `fleetDispatcher` in its own DOMContentLoaded
    // listeners, and resuming inside the same dispatch could land before them.
    // Yielding to the next task reproduces the old ordering, where this file
    // was only injected once the dispatch had finished.
    document.addEventListener("DOMContentLoaded", () => setTimeout(resolve, 0), { once: true })
  );
}

/**
 * Yields until the browser has had a chance to paint what has been written to
 * the DOM so far.
 *
 * `start()` is one long synchronous task: the browser cannot paint anything it
 * builds until the whole task ends, so the order of the calls inside it made no
 * visible difference on its own. One yield after the right planet bar is drawn
 * is what actually puts it on screen ahead of the page-specific work.
 *
 * `requestAnimationFrame` runs just before the next paint, the `setTimeout`
 * inside it resumes just after it - so the work that follows never lands in the
 * same frame as the bar.
 *
 * @returns {Promise<void>}
 */
function nextPaint() {
  if (typeof requestAnimationFrame !== "function") return new Promise((resolve) => setTimeout(resolve, 0));
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

(async () => {
  logger.info("Reveal Ogame Beyond Infinity");

  try {
    // Both of these are answered from the URL alone, so they happen at
    // document_start rather than after the game page has finished loading: the
    // excluded pages bail out without waiting, and on every other page the
    // empire refresh spends the whole page load in flight instead of starting
    // after it.
    const rawURL = new URL(window.location.href);
    const page = rawURL.searchParams.get("component") || rawURL.searchParams.get("page");
    if (["intro", "empire", "combatsim"].includes(page)) {
      logger.info("Excluded page: " + page);
      return;
    }
    perf.time("startEmpirePrefetch()", () => startEmpirePrefetch(rawURL));

    await domReady();
    perf.mark("DOM ready");

    // OGI targets OGame 13 and later. The v12 selector branches were removed, so on
    // an older server the extension does not misbehave subtly - it simply finds
    // nothing. Say so once instead of leaving the user with a silently empty UI.
    if (!OgamePageData.isAtLeast_13_0_0) {
      logger.error(
        `OGame ${OgamePageData.version} is older than 13.0.0. OGI dropped v12 support and will not work here.`
      );
    }

    if (page === "messages") {
      const obs = new OGIObserver();
      // Observe tab change
      obs(document.querySelector(".tabs_wrap.js_tabs"), (elements) => {
        elements.forEach((element) => {
          // We want only if nodes has been added
          if (!element.addedNodes) return;

          if (!element.target.classList.contains("ui-tabs-panel")) return;

          // Message list
          console.log(element.target.querySelectorAll("ul.tab_inner > li.msg"));
        });
      });
    }

    const ogKush = perf.time("new OGInfinity()", () => new OGInfinity());
    perf.time("OGInfinity.init()", () => ogKush.init());
    perf.time("versionInStatusBar()", () => versionInStatusBar());

    perf.time("new Messages()", () => new Messages());

    // workaround for "DOMPurify not defined" issue
    await perf.timeAsync("wait for DOMPurify", () => wait.waitForDefinition(window, "DOMPurify"));

    Element.prototype.html = function (html) {
      this.innerHTML = DOMPurify.sanitize(html);
    };

    // No-op unless profiling is on (localStorage["ogi-perf"] = "1").
    perf.instrumentMethods(ogKush, "start > ");
    // start() yields once, after the planet bar is drawn, so it has to be awaited
    // for perf.report() to see the steps that run after that yield.
    await perf.timeAsync("OGInfinity.start()", () => ogKush.start());
    perf.report();
  } catch (ex) {
    logger.error(ex);
  }
})();
