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
import { adjustBox, resourceBox, shipsBox } from "./boxes.js";
import { profitGraph, winGraph } from "./graphs.js";

/** The combat tab: losses, loot and the top fights per day. */
function combatStats() {
  let ressources = ["Metal", "Crystal", "Deuterium", "AM"];
  let content = createDOM("div", { class: "ogk-stats-content" });
  let renderDetails = (sums, onchange) => {
    let content = createDOM("div", { class: "ogk-stats" });
    let globalDiv = content.appendChild(createDOM("div", { class: "ogk-global" }));
    globalDiv.appendChild(winGraph(sums.wins, sums.draws, sums.count));
    globalDiv.appendChild(createDOM("span", { class: "ogk-center" }, sums.count));
    globalDiv.appendChild(createDOM("h1", { class: "ogk-top-title" }, Translator.translate(72)));
    let topDiv = globalDiv.appendChild(createDOM("div", { class: "ogk-top" }));
    topDiv.appendChild(createDOM("p", { style: "margin-bottom: 5px" }, Translator.translate(73)));
    topDiv.appendChild(createDOM("div", { class: "ogk-head" }, Translator.translate(74)));
    topDiv.appendChild(createDOM("div", { class: "ogk-head" }, Translator.translate(75)));
    topDiv.appendChild(createDOM("div", { class: "ogk-head" }, Translator.translate(76)));
    sums.topCombats.forEach(async (top) => {
      if (!top.loot) top.loot = 0;
      let player = await dataHelper.getPlayer(top.ennemi);
      topDiv.appendChild(createDOM("p", {}, player.name));
      topDiv.appendChild(
        createDOM(
          "div",
          {
            class: top.loot > 0 ? "undermark tooltip" : "overmark tooltip",
            "data-title": toFormattedNumber(top.loot, 0),
          },
          toFormattedNumber(top.loot, null, true)
        )
      );
      topDiv.appendChild(
        createDOM(
          "div",
          {
            class: "overmark tooltip",
            "data-title": toFormattedNumber(top.losses, 0),
          },
          "-" + toFormattedNumber(top.losses, null, true)
        )
      );
      topDiv.appendChild(
        createDOM(
          "div",
          {
            class: "debris tooltip",
            "data-title": toFormattedNumber(top.debris, 0),
          },
          toFormattedNumber(top.debris, null, true)
        )
      );
    });
    let details = content.appendChild(createDOM("div", { class: "ogk-details" }));
    let losses = fleetCost(sums.losses);
    let box = resourceBox(
      [
        {
          title: Translator.translate(74),
          metal: sums.loot[0],
          crystal: sums.loot[1],
          deuterium: sums.loot[2],
        },
        {
          title: Translator.translate(69),
          metal: sums.harvest[0],
          crystal: sums.harvest[1],
          deuterium: sums?.harvest[2] || 0,
        },
        {
          title: Translator.translate(68),
          metal: -losses[0],
          crystal: -losses[1],
          deuterium: -losses[2],
        },
        {
          title: Translator.translate(70),
          metal: 0,
          crystal: 0,
          deuterium: sums.fuel,
        },
        {
          title: Translator.translate(77),
          metal: sums.adjust[0],
          crystal: sums.adjust[1],
          deuterium: sums.adjust[2],
          edit: !!onchange,
        },
      ],
      false,
      () => {
        globalDiv.replaceChildren();
        globalDiv.appendChild(
          adjustBox(sums.adjust, (adjust) => {
            let date = document.querySelector(".ogk-date strong").textContent;
            if (!OGIData.json.combatsSums[date]) {
              OGIData.json.combatsSums[date] = {
                loot: [0, 0, 0],
                losses: {},
                harvest: [0, 0, 0],
                adjust: [0, 0, 0],
                fuel: 0,
                topCombats: [],
                count: 0,
                wins: 0,
                draws: 0,
              };
            }
            OGIData.json.combatsSums[date].adjust = adjust;
            OGIData.Save();
            onchange();
          })
        );
      }
    );
    details.appendChild(box);
    details.appendChild(shipsBox(sums.losses, true));
    let harvestSums = [0, 0, 0];
    Object.entries(OGIData.json.harvests).forEach((harvest) => {
      harvest = harvest[1];
      if (harvest.coords.split(":")[2] == 16) {
        harvestSums[0] += harvest.metal;
        harvestSums[1] += harvest.crystal;
        harvestSums[2] += harvest.deuterium;
      }
    });
    return content;
  };
  let computeRangeSums = (sums, start, stop) => {
    let weekSums = {
      loot: [0, 0, 0],
      harvest: [0, 0, 0],
      losses: {
        202: 0,
        203: 0,
        210: 0,
        204: 0,
        205: 0,
        206: 0,
        219: 0,
        207: 0,
        215: 0,
        211: 0,
        213: 0,
        218: 0,
      },
      fuel: 0,
      adjust: [0, 0, 0],
      topCombats: [],
      count: 0,
      wins: 0,
      draws: 0,
    };
    for (var d = new Date(start); d >= new Date(stop); d.setDate(d.getDate() - 1)) {
      let dateStr = getFormatedDate(new Date(d).getTime(), "[d].[m].[y]");
      if (sums[dateStr]) {
        weekSums.fuel += sums[dateStr].fuel;
        [202, 203, 210, 208, 209, 204, 205, 206, 219, 207, 215, 211, 213, 218, 214].forEach((id) => {
          weekSums.losses[id] += sums[dateStr].losses[id] || 0;
        });
        sums[dateStr].loot.forEach((value, index) => {
          weekSums.loot[index] += sums[dateStr].loot[index];
        });
        sums[dateStr].harvest.forEach((value, index) => {
          weekSums.harvest[index] += sums[dateStr].harvest[index];
        });
        sums[dateStr].adjust.forEach((value, index) => {
          weekSums.adjust[index] += sums[dateStr].adjust[index];
        });
        sums[dateStr].topCombats.forEach((top) => {
          weekSums.topCombats.push(top);
        });
        weekSums.count += sums[dateStr].count;
        weekSums.wins += sums[dateStr].wins;
        weekSums.draws += sums[dateStr].draws;
      }
    }
    weekSums.topCombats.sort((a, b) => {
      if (a.loot) {
        return b.debris + Math.abs(b.loot) - (a.debris + Math.abs(a.loot));
      }
      return b.debris - a.debris;
    });
    weekSums.topCombats = weekSums.topCombats.slice(0, 3);
    return weekSums;
  };
  let getTotal = (sums) => {
    let total = 0;
    let losses = fleetCost(sums.losses);
    total -= standardUnit.standardUnit(losses);
    total += standardUnit.standardUnit(sums.harvest);
    total += standardUnit.standardUnit(sums.loot);
    total += standardUnit.standardUnit(sums.adjust);
    total += standardUnit.standardUnit([0, 0, sums.fuel]);
    return total;
  };
  let refresh = (index) => {
    if (index) {
      statsState.initialRange = index;
    }
    document.querySelector(".ogk-stats-content .ogl-tab.ogl-active").click();
  };
  let tabNames = {};
  tabNames[LocalizationStrings.timeunits.short.day] = () => {
    let date = new Date();
    let sum = {
      loot: [0, 0, 0],
      harvest: [0, 0, 0],
      losses: {
        202: 0,
        203: 0,
        210: 0,
        204: 0,
        205: 0,
        206: 0,
        219: 0,
        207: 0,
        215: 0,
        211: 0,
        213: 0,
        218: 0,
      },
      adjust: [0, 0, 0],
      fuel: 0,
      topCombats: [],
      count: 0,
      wins: 0,
      draws: 0,
    };
    let profits = [];
    let max = 0;
    for (let i = 0; i < 12; i++) {
      let dateStr = getFormatedDate(date.getTime(), "[d].[m].[y]");
      let sums = OGIData.json.combatsSums[dateStr] || sum;
      let profit = sums ? getTotal(sums) : 0;
      if (Math.abs(profit) > max) max = profit;
      profits.push({
        date: new Date(date.getTime()),
        range: sums,
        profit: profit,
      });
      date.setDate(date.getDate() - 1);
    }
    let div = createDOM("div");
    let details = renderDetails(computeRangeSums(OGIData.json.combatsSums, new Date(), new Date()), () => {
      refresh();
    });
    div.appendChild(
      profitGraph(profits, max, true, (range, index) => {
        details.remove();
        details = renderDetails(range, () => {
          refresh(index);
        });
        div.appendChild(details);
      })
    );
    div.appendChild(details);
    return div;
  };
  tabNames[LocalizationStrings.timeunits.short.week] = () => {
    let renderHeader = () => {};
    let weeks = [];
    let totals = [];
    let start = new Date();
    var prevMonday = new Date();
    let max = -Infinity;
    prevMonday.setDate(prevMonday.getDate() - ((prevMonday.getDay() + 6) % 7));
    for (let i = 0; i < 12; i++) {
      let range = computeRangeSums(OGIData.json.combatsSums, start, prevMonday);
      weeks.push(range);
      let total = getTotal(range);
      totals.push({
        profit: total,
        range: range,
        date: prevMonday,
        start: start,
      });
      if (total > max) max = total;
      start = new Date(prevMonday);
      start.setDate(start.getDate() - 1);
      prevMonday = new Date(start);
      prevMonday.setDate(prevMonday.getDate() - ((prevMonday.getDay() + 6) % 7));
    }
    let div = createDOM("div");
    let details = renderDetails(weeks[0]);
    div.appendChild(
      profitGraph(totals, max, true, (range, index) => {
        details.remove();
        details = renderDetails(range);
        div.appendChild(details);
      })
    );
    div.appendChild(details);
    return div;
  };
  tabNames[LocalizationStrings.timeunits.short.month] = () => {
    var lastDay = new Date();
    var firstDay = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1);
    let max = -Infinity;
    let months = [];
    let totals = [];
    for (let i = 0; i < 12; i++) {
      let range = computeRangeSums(OGIData.json.combatsSums, lastDay, firstDay);
      months.push(range);
      let total = getTotal(range);
      totals.push({
        profit: total,
        range: range,
        date: firstDay,
        start: lastDay,
      });
      if (total > max) max = total;
      lastDay = new Date(lastDay.getFullYear(), lastDay.getMonth(), 0);
      firstDay = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1);
    }
    let div = createDOM("div");
    let details = renderDetails(months[0]);
    div.appendChild(
      profitGraph(totals, max, true, (range, index) => {
        details.remove();
        details = renderDetails(range);
        div.appendChild(details);
      })
    );
    div.appendChild(details);
    return div;
  };
  tabNames["∞"] = () => {
    let keys = Object.keys(OGIData.json.combatsSums).sort(
      (a, b) => DateTime.dateStrToDate(a) - DateTime.dateStrToDate(b)
    );
    let minDate = keys[0];
    let maxDate = keys[keys.length - 1];
    let range = computeRangeSums(
      OGIData.json.combatsSums,
      DateTime.dateStrToDate(maxDate),
      DateTime.dateStrToDate(minDate)
    );
    let total = getTotal(range);
    let content = createDOM("div", { class: "ogk-profit" });
    let title = content.appendChild(createDOM("div", { class: "ogk-date" }));
    content.appendChild(createDOM("div", { class: "ogk-scroll-wrapper" }));
    title.replaceChildren(
      createDOM("strong", {}, `${getFormatedDate(DateTime.dateStrToDate(minDate).getTime(), "[d].[m].[y]")}`),
      createDOM(
        "span",
        {
          class: `tooltip ${total >= 0 ? "undermark" : "overmark"}`,
          title: `${standardUnit.unitType(true)} : ${toFormattedNumber(Math.abs(total), 0)}`,
        },
        `${total >= 0 ? " + " : " - "}${toFormattedNumber(Math.abs(total), 2, true)} ${standardUnit.unitType()}`
      ),
      createDOM("strong", {}, `${getFormatedDate(DateTime.dateStrToDate(maxDate).getTime(), "[d].[m].[y]")}`)
    );
    let div = createDOM("div");
    div.appendChild(content);
    div.appendChild(renderDetails(range));
    return div;
  };
  content.appendChild(tabs(tabNames));
  return content;
}

export { combatStats };
