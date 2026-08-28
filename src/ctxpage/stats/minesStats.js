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

/**
 * The mines tab: every planet's mine levels, production and the next upgrades.
 *
 * By far the largest tab, and the only one that gets a file to itself.
 */
function minesStats() {
  let content = createDOM("div", { class: "ogl-prodOverview-content" });
  let table = content.appendChild(createDOM("table", { class: "ogl-fleet-table" }));
  let header = table.appendChild(createDOM("tr"));
  header.appendChild(createDOM("th"));
  let metalRow = table.appendChild(createDOM("tr"));
  let crystalRow = table.appendChild(createDOM("tr"));
  let deutRow = table.appendChild(createDOM("tr"));
  metalRow.appendChild(createDOM("td").appendChild(createDOM("div", { class: "resourceIcon metal" })).parentElement);
  crystalRow.appendChild(
    createDOM("td").appendChild(createDOM("div", { class: "resourceIcon crystal" })).parentElement
  );
  deutRow.appendChild(createDOM("td").appendChild(createDOM("div", { class: "resourceIcon deuterium" })).parentElement);
  header.appendChild(
    createDOM("th").appendChild(createDOM("div", { class: "ogl-prodOverview-icon mines" })).parentElement
  );
  header.appendChild(
    createDOM("th").appendChild(createDOM("div", { class: "ogl-prodOverview-icon plasma" })).parentElement
  );
  header.appendChild(
    createDOM("th").appendChild(createDOM("div", { class: "ogl-prodOverview-icon crawler" })).parentElement
  );
  header.appendChild(
    createDOM("th").appendChild(createDOM("div", { class: "ogl-prodOverview-icon items" })).parentElement
  );
  header.appendChild(
    createDOM("th").appendChild(createDOM("div", { class: "officers100 allOfficers prodOverview" })).parentElement
  );
  header.appendChild(
    createDOM("th").appendChild(createDOM("div", { class: "sprite characterclass medium miner prodOverview" }))
      .parentElement
  );
  header.appendChild(
    createDOM("th").appendChild(createDOM("div", { class: "sprite allianceclass medium trader prodOverview" }))
      .parentElement
  );
  if (document.querySelector(".lifeform") != null)
    header.appendChild(
      createDOM("th", { class: "menu_icon" }).appendChild(createDOM("div", { class: "ogl-prodOverview-icon lifeform" }))
        .parentElement
    );
  header.appendChild(
    createDOM("th").appendChild(createDOM("div", { class: "ogl-prodOverview-icon energy" })).parentElement
  );
  let mines = [0, 0, 0];
  let plasma = [0, 0, 0];
  let crawler = [0, 0, 0];
  let items = [0, 0, 0];
  let officers = [0, 0, 0];
  let player = [0, 0, 0];
  let alliance = [0, 0, 0];
  let energy = [0, 0, 0];
  let lifeform = statsState.context.hasLifeforms ? [0, 0, 0] : undefined;
  OGIData.empire.forEach((planet) => {
    if (!planet) return;
    for (let i = 0; i < 3; i++) {
      mines[i] +=
        planet.production.production[1][i] +
        planet.production.production[2][i] +
        planet.production.production[3][i] +
        planet.production.generalIncoming[i];
      plasma[i] += planet.production.production[122][i];
      crawler[i] += planet.production.production[217][i];
      items[i] += planet.production.production[1000][i];
      officers[i] += planet.production.production[1001][i] + planet.production.production[1003][i];
      player[i] += planet.production.production[1004][i];
      alliance[i] += planet.production.production[1005][i];
      energy[i] -= planet.production.production[12][i];
      if (planet.production.lifeformProduction) lifeform[i] += planet.production.lifeformProduction[i];
    }
  });
  header.appendChild(createDOM("th", { class: "ogl-sum-symbol" }, "Σ"));

  let td = metalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(mines[0])),
      },
      toFormattedNumber(Math.round(mines[0]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(mines[0] * 24)),
      },
      toFormattedNumber(Math.round(mines[0] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(mines[0] * 24 * 7)),
      },
      toFormattedNumber(Math.round(mines[0] * 24 * 7), null, true)
    )
  );
  td = crystalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(mines[1])),
      },
      toFormattedNumber(Math.round(mines[1]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(mines[1] * 24)),
      },
      toFormattedNumber(Math.round(mines[1] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(mines[1] * 24 * 7)),
      },
      toFormattedNumber(Math.round(mines[1] * 24 * 7), null, true)
    )
  );

  td = deutRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(mines[2])),
      },
      toFormattedNumber(Math.round(mines[2]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(mines[2] * 24)),
      },
      toFormattedNumber(Math.round(mines[2] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(mines[2] * 24 * 7)),
      },
      toFormattedNumber(Math.round(mines[2] * 24 * 7), null, true)
    )
  );
  td = metalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(plasma[0])),
      },
      toFormattedNumber(Math.round(plasma[0]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(plasma[0] * 24)),
      },
      toFormattedNumber(Math.round(plasma[0] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(plasma[0] * 24 * 7)),
      },
      toFormattedNumber(Math.round(plasma[0] * 24 * 7), null, true)
    )
  );
  td = crystalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(plasma[1])),
      },
      toFormattedNumber(Math.round(plasma[1]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(plasma[1] * 24)),
      },
      toFormattedNumber(Math.round(plasma[1] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(plasma[1] * 24 * 7)),
      },
      toFormattedNumber(Math.round(plasma[1] * 24 * 7), null, true)
    )
  );
  td = deutRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(plasma[2])),
      },
      toFormattedNumber(Math.round(plasma[2]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(plasma[2] * 24)),
      },
      toFormattedNumber(Math.round(plasma[2] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(plasma[2] * 24 * 7)),
      },
      toFormattedNumber(Math.round(plasma[2] * 24 * 7), null, true)
    )
  );
  td = metalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(crawler[0])),
      },
      toFormattedNumber(Math.round(crawler[0]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(crawler[0] * 24)),
      },
      toFormattedNumber(Math.round(crawler[0] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(crawler[0] * 24 * 7)),
      },
      toFormattedNumber(Math.round(crawler[0] * 24 * 7), null, true)
    )
  );
  td = crystalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(crawler[1])),
      },
      toFormattedNumber(Math.round(crawler[1]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(crawler[1] * 24)),
      },
      toFormattedNumber(Math.round(crawler[1] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(crawler[1] * 24 * 7)),
      },
      toFormattedNumber(Math.round(crawler[1] * 24 * 7), null, true)
    )
  );
  td = deutRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(crawler[2])),
      },
      toFormattedNumber(Math.round(crawler[2]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(crawler[2] * 24)),
      },
      toFormattedNumber(Math.round(crawler[2] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(crawler[2] * 24 * 7)),
      },
      toFormattedNumber(Math.round(crawler[2] * 24 * 7), null, true)
    )
  );
  td = metalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(items[0])),
      },
      toFormattedNumber(Math.round(items[0]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(items[0] * 24)),
      },
      toFormattedNumber(Math.round(items[0] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(items[0] * 24 * 7)),
      },
      toFormattedNumber(Math.round(items[0] * 24 * 7), null, true)
    )
  );
  td = crystalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(items[1])),
      },
      toFormattedNumber(Math.round(items[1]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(items[1] * 24)),
      },
      toFormattedNumber(Math.round(items[1] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(items[1] * 24 * 7)),
      },
      toFormattedNumber(Math.round(items[1] * 24 * 7), null, true)
    )
  );
  td = deutRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(items[2])),
      },
      toFormattedNumber(Math.round(items[2]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(items[2] * 24)),
      },
      toFormattedNumber(Math.round(items[2] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(items[2] * 24 * 7)),
      },
      toFormattedNumber(Math.round(items[2] * 24 * 7), null, true)
    )
  );
  td = metalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(officers[0])),
      },
      toFormattedNumber(Math.round(officers[0]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(officers[0] * 24)),
      },
      toFormattedNumber(Math.round(officers[0] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(officers[0] * 24 * 7)),
      },
      toFormattedNumber(Math.round(officers[0] * 24 * 7), null, true)
    )
  );
  td = crystalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(officers[1])),
      },
      toFormattedNumber(Math.round(officers[1]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(officers[1] * 24)),
      },
      toFormattedNumber(Math.round(officers[1] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(officers[1] * 24 * 7)),
      },
      toFormattedNumber(Math.round(officers[1] * 24 * 7), null, true)
    )
  );
  td = deutRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(officers[2])),
      },
      toFormattedNumber(Math.round(officers[2]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(officers[2] * 24)),
      },
      toFormattedNumber(Math.round(officers[2] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(officers[2] * 24 * 7)),
      },
      toFormattedNumber(Math.round(officers[2] * 24 * 7), null, true)
    )
  );
  td = metalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(player[0])),
      },
      toFormattedNumber(Math.round(player[0]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(player[0] * 24)),
      },
      toFormattedNumber(Math.round(player[0] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(player[0] * 24 * 7)),
      },
      toFormattedNumber(Math.round(player[0] * 24 * 7), null, true)
    )
  );
  td = crystalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(player[1])),
      },
      toFormattedNumber(Math.round(player[1]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(player[1] * 24)),
      },
      toFormattedNumber(Math.round(player[1] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(player[1])),
      },
      toFormattedNumber(Math.round(player[1] * 24 * 7), null, true)
    )
  );
  td = deutRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(player[2])),
      },
      toFormattedNumber(Math.round(player[2]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(player[2] * 24)),
      },
      toFormattedNumber(Math.round(player[2] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(player[2] * 24 * 7)),
      },
      toFormattedNumber(Math.round(player[2] * 24 * 7), null, true)
    )
  );
  td = metalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(alliance[0])),
      },
      toFormattedNumber(Math.round(alliance[0]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(alliance[0] * 24)),
      },
      toFormattedNumber(Math.round(alliance[0] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(alliance[0])),
      },
      toFormattedNumber(Math.round(alliance[0] * 24 * 7), null, true)
    )
  );
  td = crystalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(alliance[1])),
      },
      toFormattedNumber(Math.round(alliance[1]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(alliance[1] * 24)),
      },
      toFormattedNumber(Math.round(alliance[1] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(alliance[1])),
      },
      toFormattedNumber(Math.round(alliance[1] * 24 * 7), null, true)
    )
  );
  td = deutRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(alliance[2])),
      },
      toFormattedNumber(Math.round(alliance[2]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(alliance[2] * 24)),
      },
      toFormattedNumber(Math.round(alliance[2] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(alliance[2] * 24 * 7)),
      },
      toFormattedNumber(Math.round(alliance[2] * 24 * 7), null, true)
    )
  );
  if (lifeform) {
    td = metalRow.appendChild(createDOM("td"));
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-metal tooltip",
          "data-title": toFormattedNumber(Math.round(lifeform[0])),
        },
        toFormattedNumber(Math.round(lifeform[0]), null, true)
      )
    );
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-metal tooltip",
          "data-title": toFormattedNumber(Math.round(lifeform[0] * 24)),
        },
        toFormattedNumber(Math.round(lifeform[0] * 24), null, true)
      )
    );
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-metal tooltip",
          "data-title": toFormattedNumber(Math.round(lifeform[0] * 24 * 7)),
        },
        toFormattedNumber(Math.round(lifeform[0] * 24 * 7), null, true)
      )
    );
    td = crystalRow.appendChild(createDOM("td"));
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-crystal tooltip",
          "data-title": toFormattedNumber(Math.round(lifeform[1])),
        },
        toFormattedNumber(Math.round(lifeform[1]), null, true)
      )
    );
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-crystal tooltip",
          "data-title": toFormattedNumber(Math.round(lifeform[1] * 24)),
        },
        toFormattedNumber(Math.round(lifeform[1] * 24), null, true)
      )
    );
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-crystal tooltip",
          "data-title": toFormattedNumber(Math.round(lifeform[1] * 24 * 7)),
        },
        toFormattedNumber(Math.round(lifeform[1] * 24 * 7), null, true)
      )
    );
    td = deutRow.appendChild(createDOM("td"));
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-deut tooltip",
          "data-title": toFormattedNumber(Math.round(lifeform[2])),
        },
        toFormattedNumber(Math.round(lifeform[2]), null, true)
      )
    );
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-deut tooltip",
          "data-title": toFormattedNumber(Math.round(lifeform[2] * 24)),
        },
        toFormattedNumber(Math.round(lifeform[2] * 24), null, true)
      )
    );
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-deut tooltip",
          "data-title": toFormattedNumber(Math.round(lifeform[2] * 24 * 7)),
        },
        toFormattedNumber(Math.round(lifeform[2] * 24 * 7), null, true)
      )
    );
  }
  td = metalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(energy[0])),
      },
      toFormattedNumber(Math.round(energy[0]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(energy[0] * 24)),
      },
      toFormattedNumber(Math.round(energy[0] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.round(energy[0] * 24 * 7)),
      },
      toFormattedNumber(Math.round(energy[0] * 24 * 7), null, true)
    )
  );
  td = crystalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(energy[1])),
      },
      toFormattedNumber(Math.round(energy[1]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(energy[1] * 24)),
      },
      toFormattedNumber(Math.round(energy[1] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.round(energy[1])),
      },
      toFormattedNumber(Math.round(energy[1] * 24 * 7), null, true)
    )
  );
  td = deutRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(energy[2])),
      },
      toFormattedNumber(Math.round(energy[2]), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(energy[2] * 24)),
      },
      toFormattedNumber(Math.round(energy[2] * 24), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.round(energy[2] * 24 * 7)),
      },
      toFormattedNumber(Math.round(energy[2] * 24 * 7), null, true)
    )
  );
  td = metalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(
          Math.round(
            mines[0] +
              plasma[0] +
              crawler[0] +
              items[0] +
              officers[0] +
              player[0] +
              alliance[0] +
              energy[0] +
              (lifeform ? lifeform[0] : 0)
          )
        ),
      },
      toFormattedNumber(
        Math.round(
          mines[0] +
            plasma[0] +
            crawler[0] +
            items[0] +
            officers[0] +
            player[0] +
            alliance[0] +
            energy[0] +
            (lifeform ? lifeform[0] : 0)
        ),
        null,
        true
      )
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(
          Math.round(
            (mines[0] +
              plasma[0] +
              crawler[0] +
              items[0] +
              officers[0] +
              player[0] +
              alliance[0] +
              energy[0] +
              (lifeform ? lifeform[0] : 0)) *
              24
          )
        ),
      },
      toFormattedNumber(
        Math.round(
          (mines[0] +
            plasma[0] +
            crawler[0] +
            items[0] +
            officers[0] +
            player[0] +
            alliance[0] +
            energy[0] +
            (lifeform ? lifeform[0] : 0)) *
            24
        ),
        null,
        true
      )
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(
          Math.round(
            (mines[0] +
              plasma[0] +
              crawler[0] +
              items[0] +
              officers[0] +
              player[0] +
              alliance[0] +
              energy[0] +
              (lifeform ? lifeform[0] : 0)) *
              24 *
              7
          )
        ),
      },
      toFormattedNumber(
        Math.round(
          (mines[0] +
            plasma[0] +
            crawler[0] +
            items[0] +
            officers[0] +
            player[0] +
            alliance[0] +
            energy[0] +
            (lifeform ? lifeform[0] : 0)) *
            24 *
            7
        ),
        null,
        true
      )
    )
  );
  td = crystalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(
          Math.round(
            mines[1] +
              plasma[1] +
              crawler[1] +
              items[1] +
              officers[1] +
              player[1] +
              alliance[1] +
              energy[1] +
              (lifeform ? lifeform[1] : 0)
          )
        ),
      },
      toFormattedNumber(
        Math.round(
          mines[1] +
            plasma[1] +
            crawler[1] +
            items[1] +
            officers[1] +
            player[1] +
            alliance[1] +
            energy[1] +
            (lifeform ? lifeform[1] : 0)
        ),
        null,
        true
      )
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(
          Math.round(
            (mines[1] +
              plasma[1] +
              crawler[1] +
              items[1] +
              officers[1] +
              player[1] +
              alliance[1] +
              energy[1] +
              (lifeform ? lifeform[1] : 0)) *
              24
          )
        ),
      },
      toFormattedNumber(
        Math.round(
          (mines[1] +
            plasma[1] +
            crawler[1] +
            items[1] +
            officers[1] +
            player[1] +
            alliance[1] +
            energy[1] +
            (lifeform ? lifeform[1] : 0)) *
            24
        ),
        null,
        true
      )
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(
          Math.round(
            (mines[1] +
              plasma[1] +
              crawler[1] +
              items[1] +
              officers[1] +
              player[1] +
              alliance[1] +
              energy[1] +
              (lifeform ? lifeform[1] : 0)) *
              24 *
              7
          )
        ),
      },
      toFormattedNumber(
        Math.round(
          (mines[1] +
            plasma[1] +
            crawler[1] +
            items[1] +
            officers[1] +
            player[1] +
            alliance[1] +
            energy[1] +
            (lifeform ? lifeform[1] : 0)) *
            24 *
            7
        ),
        null,
        true
      )
    )
  );
  td = deutRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(
          Math.round(
            mines[2] +
              plasma[2] +
              crawler[2] +
              items[2] +
              officers[2] +
              player[2] +
              alliance[2] +
              energy[2] +
              (lifeform ? lifeform[2] : 0)
          )
        ),
      },
      toFormattedNumber(
        Math.round(
          mines[2] +
            plasma[2] +
            crawler[2] +
            items[2] +
            officers[2] +
            player[2] +
            alliance[2] +
            energy[2] +
            (lifeform ? lifeform[2] : 0)
        ),
        null,
        true
      )
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(
          Math.round(
            (mines[2] +
              plasma[2] +
              crawler[2] +
              items[2] +
              officers[2] +
              player[2] +
              alliance[2] +
              energy[2] +
              (lifeform ? lifeform[2] : 0)) *
              24
          )
        ),
      },
      toFormattedNumber(
        Math.round(
          (mines[2] +
            plasma[2] +
            crawler[2] +
            items[2] +
            officers[2] +
            player[2] +
            alliance[2] +
            energy[2] +
            (lifeform ? lifeform[2] : 0)) *
            24
        ),
        null,
        true
      )
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(
          Math.round(
            (mines[2] +
              plasma[2] +
              crawler[2] +
              items[2] +
              officers[2] +
              player[2] +
              alliance[2] +
              energy[2] +
              (lifeform ? lifeform[2] : 0)) *
              24 *
              7
          )
        ),
      },
      toFormattedNumber(
        Math.round(
          (mines[2] +
            plasma[2] +
            crawler[2] +
            items[2] +
            officers[2] +
            player[2] +
            alliance[2] +
            energy[2] +
            (lifeform ? lifeform[2] : 0)) *
            24 *
            7
        ),
        null,
        true
      )
    )
  );
  return content;
}

export { minesStats };
