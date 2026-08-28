import * as DOM from "../../util/dom.js";
import { createDOM, createSVG, createDOMSanitized } from "../../util/dom.js";
import { tabs } from "../../util/tabs.js";
import { toFormattedNumber, fromFormattedNumber } from "../../util/numbers.js";
import * as Numbers from "../../util/numbers.js";
import * as popupUtil from "../../util/popup.js";
import * as utilTooltip from "../../util/tooltip.js";
import * as standardUnit from "../../util/standardUnit.js";
import * as time from "../../util/time.js";
import * as wait from "../../util/wait.js";
import DateTime from "../../util/dateTime.js";
import Translator from "../../util/translate.js";
import OGIData from "../../util/OGIData.js";
import PlayerClass from "../../util/enum/playerClass.js";
import OgamePageData from "../../util/OgamePageData.js";
import dataHelper from "../../util/dataHelper.js";
import shipEnum from "../../util/enum/ship.js";
import planetType from "../../util/enum/planetType.js";
import missionType from "../../util/enum/missionType.js";
import itemType from "../../util/enum/itemType.js";
import itemImageID from "../../util/enum/itemImageID.js";
import AllianceClass from "../../util/enum/allianceClass.js";
import { fleetCost } from "../../util/fleetCost.js";
import flying from "../../util/flying.js";
import { getOption } from "../../ctxpage/conf-options.js";
import { generateMMORPGLink } from "../../util/mmorpgStats.js";
import { BUIDLING_INFO } from "../../util/enum/buildingInfo.js";
import { RESEARCH_INFO } from "../../util/enum/researchInfo.js";
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
} from "../../util/gameConstants.js";
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
} from "../../util/gameFormulas.js";

import { statsState } from "./state.js";
import { generalStats } from "./generalStats.js";
import { minesStats } from "./minesStats.js";
import { expeditionStats } from "./expeditionStats.js";
import { discoveryStats } from "./discoveryStats.js";
import { combatStats } from "./combatStats.js";
import { roiStats } from "./roiStats.js";

/**
 * The statistics popup: the six tabs behind the chart icon in the top bar.
 *
 * Lifted out of `OGInfinity` in Phase 3 of refactoring.md, then split by tab because
 * one 3.6k-line file is not an improvement on one 19k-line file. This is the entry
 * point and the tab wiring; each tab and the shared drawing helpers live next to it.
 *
 * `Chart` is a page global, injected on demand over the `ogi-chart` event.
 */
/**
 * Opens the statistics popup.
 *
 * @param {{playerClass: number, hasLifeforms: boolean, universe: string, playerBonuses: object}} context
 *   the page facts the tabs read, from `OGInfinity.statsContext()`. Stored for the
 *   lifetime of the popup rather than threaded through six tab functions.
 */
async function statistics(context) {
  statsState.context = context;

  let showStats = async () => {
    let player = await dataHelper.getPlayer(playerId);
    let tabNames = {};
    tabNames[Translator.translate(91, "text", false)] = generalStats.bind(null, player);
    tabNames[Translator.translate(85, "text", false)] = minesStats;
    tabNames[Translator.translate(41, "text", false)] = expeditionStats;
    if (statsState.context.hasLifeforms) {
      tabNames[Translator.translate(139, "text", false)] = discoveryStats;
    }
    tabNames[Translator.translate(92, "text", false)] = combatStats;
    tabNames[Translator.translate(120, "text", false)] = roiStats;

    let body = tabs(tabNames);
    popupUtil.popup(null, body);
  };
  if (typeof Chart === "undefined") {
    document.dispatchEvent(new CustomEvent("ogi-chart", {}), true, true);
    let inter = setInterval(async () => {
      if (typeof Chart !== "undefined") {
        clearInterval(inter);
        showStats();
      }
    }, 50);
  } else {
    showStats();
  }
}

export { statistics };
