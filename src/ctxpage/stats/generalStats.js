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
import { APIStringToClipboard } from "./boxes.js";
import { repartitionGraph } from "./graphs.js";

/** The overview tab: points, fleet, research and the player's own record. */
function generalStats(player) {
  let content = createDOM("div", { class: "ogk-stats" });
  let globalInfo = content.appendChild(createDOM("div", { class: "ogk-global" }));
  let honorRank = document.querySelector("#playerName .honorRank");
  if (honorRank) {
    honorRank = honorRank.cloneNode(true);
  } else {
    honorRank = createDOM("span");
  }
  let playerDiv = globalInfo.appendChild(createDOM("h1"));
  playerDiv.appendChild(honorRank);
  playerDiv.appendChild(createDOM("p", {}, playerName));
  playerDiv.appendChild(
    createDOM("p", { class: honorScore > 0 ? "undermark" : "overmark" }, "(" + toFormattedNumber(honorScore) + ")")
  );
  let playerClassName;
  switch (statsState.context.playerClass) {
    case PlayerClass.MINER:
      playerClassName = "miner";
      break;
    case PlayerClass.WARRIOR:
      playerClassName = "warrior";
      break;
    case PlayerClass.EXPLORER:
      playerClassName = "explorer";
      break;
    default:
      playerClassName = "";
  }
  let allianceClassName;
  switch (OGIData.json.allianceClass) {
    case AllianceClass.MINER:
      allianceClassName = "trader";
      break;
    case AllianceClass.WARRIOR:
      allianceClassName = "warrior";
      break;
    case AllianceClass.EXPLORER:
      allianceClassName = "explorer";
      break;
    default:
      allianceClassName = "";
  }
  playerDiv.appendChild(
    createDOM("div", {
      class: "characterclass small sprite " + playerClassName,
      style: "margin-top: -2px;margin-left: 10px;",
    })
  );
  playerDiv.appendChild(
    createDOM("div", {
      class: "alliance_class small " + allianceClassName,
      style: "margin-top: 1px;margin-left: 30px;",
    })
  );
  let stats = playerDiv.appendChild(
    createDOM("a", {
      class: "ogl-mmorpgstats",
      href: generateMMORPGLink(statsState.context.universe, player.id),
      target: generateMMORPGLink(statsState.context.universe, player.id),
    })
  );
  if (!player.id) {
    player.points = { score: 0 };
    player.economy = { score: 0 };
    player.research = { score: 0 };
    player.military = { score: 0 };
    if (statsState.context.hasLifeforms) player.lifeform = { score: 0 };
  }
  globalInfo.appendChild(
    repartitionGraph(
      player.economy.score,
      player.research.score,
      player.military.score,
      player.def,
      statsState.context.hasLifeforms ? player.lifeform.score : null
    )
  );
  globalInfo.appendChild(createDOM("h2", {}, toFormattedNumber(parseInt(player.points.position))));
  globalInfo.appendChild(
    createDOM("h3", {}, toFormattedNumber(parseInt(player.points.score))).appendChild(createDOM("small", {}, " pts"))
      .parentElement
  );
  let detailRank = globalInfo.appendChild(createDOM("div", { class: "ogl-detailRank" }));
  const detailRankDiv1 = createDOM("div");
  detailRankDiv1.replaceChildren(
    createDOM("div", { class: "ogl-ecoIcon" }),
    document.createTextNode(`${toFormattedNumber(parseInt(player.economy.score))} `),
    createDOM("small", {}, "pts"),
    createDOM("span", { class: "ogl-ranking" }, `#${parseInt(player.economy.position)} `)
  );
  const detailRankDiv2 = createDOM("div");
  detailRankDiv2.replaceChildren(
    createDOM("div", { class: "ogl-techIcon" }),
    document.createTextNode(`${toFormattedNumber(parseInt(player.research.score))} `),
    createDOM("small", {}, "pts"),
    createDOM("span", { class: "ogl-ranking" }, `#${parseInt(player.research.position)} `)
  );
  const detailRankDiv3 = createDOM("div");
  detailRankDiv3.replaceChildren(
    createDOM("div", { class: "ogl-fleetIcon" }),
    document.createTextNode(`${toFormattedNumber(parseInt(player.military.score))} `),
    createDOM("small", {}, "pts"),
    createDOM("span", { class: "ogl-ranking" }, `#${toFormattedNumber(parseInt(player.military.position))} `)
  );
  const detailRankDiv4 = createDOM("div");
  detailRankDiv4.replaceChildren(
    createDOM("div", { class: "ogl-fleetIcon grey" }),
    document.createTextNode(`${toFormattedNumber(parseInt(player.def))} `),
    createDOM("small", {}, "pts")
  );
  const detailRankDiv5 = createDOM("div");
  if (statsState.context.hasLifeforms) {
    detailRankDiv5.replaceChildren(
      createDOM("div", { class: "ogl-lfIcon" }),
      document.createTextNode(`${toFormattedNumber(parseInt(player.lifeform.score))} `),
      createDOM("small", {}, "pts"),
      createDOM("span", { class: "ogl-ranking" }, `#${toFormattedNumber(parseInt(player.lifeform.position))} `)
    );
  }
  detailRank.replaceChildren(detailRankDiv1, detailRankDiv2, detailRankDiv3, detailRankDiv4, detailRankDiv5);
  let details = content.appendChild(createDOM("div", { class: "ogk-details" }));
  let ecoDetail = details.appendChild(createDOM("div", { class: "ogk-box" }));
  let techDetail = details.appendChild(createDOM("div", { class: "ogk-box ogk-technos" }));
  let div = techDetail.appendChild(createDOM("div", { class: "ogk-tech" }));
  div.appendChild(createDOM("span", {}, Translator.translate(95)));
  div.appendChild(createDOM("a", { class: "ogl-option ogl-fleet-ship ogl-tech-" + 114 }));
  div.appendChild(
    createDOM("span").appendChild(createDOM("strong", {}, `${toFormattedNumber(OGIData.json.technology[114])}`))
      .parentElement
  );
  div.appendChild(createDOM("span", {}, Translator.translate(94)));
  div.appendChild(createDOM("a", { class: "ogl-option ogl-fleet-ship ogl-tech-" + 108 }));
  div.appendChild(
    createDOM("span").appendChild(createDOM("strong", {}, `${toFormattedNumber(OGIData.json.technology[108] || 0)}`))
      .parentElement
  );
  let fleetTech = techDetail.appendChild(createDOM("div", { class: "ogk-tech" }));
  [115, 117, 118, 109, 110, 111].forEach((id) => {
    if (id == 115) fleetTech.appendChild(createDOM("div", {}, Translator.translate(87)));
    if (id == 109) fleetTech.appendChild(createDOM("div", {}, Translator.translate(86)));
    fleetTech.appendChild(createDOM("a", { class: "ogl-option ogl-fleet-ship ogl-tech-" + id }));
    fleetTech.appendChild(
      createDOM("span").appendChild(createDOM("strong", {}, `${toFormattedNumber(OGIData.json.technology[id])}`))
        .parentElement
    );
  });
  let mlvl = 0,
    clvl = 0,
    dlvl = 0,
    mprodh = 0,
    mprodd = 0,
    mprodw = 0,
    cprodh = 0,
    cprodd = 0,
    cprodw = 0,
    dprodh = 0,
    dprodd = 0,
    dprodw = 0;
  let sum = OGIData.empire.length;
  sum &&
    OGIData.empire.forEach((planet) => {
      mlvl += Number(planet[1]);
      mprodh += Number(planet.production.hourly[0] || 0);
      mprodd += Number(planet.production.daily[0] || 0);
      mprodw += Number(planet.production.weekly[0] || 0);
      clvl += Number(planet[2]);
      cprodh += Number(planet.production.hourly[1] || 0);
      cprodd += Number(planet.production.daily[1] || 0);
      cprodw += Number(planet.production.weekly[1] || 0);
      dlvl += Number(planet[3]);
      dprodh += Number(planet.production.hourly[2] || 0);
      dprodd += Number(planet.production.daily[2] || 0);
      dprodw += Number(planet.production.weekly[2] || 0);
    });
  let mStorage = Math.ceil((Math.log(Math.ceil(mprodd / 5000)) * 33) / 22);
  let cStorage = Math.ceil((Math.log(Math.ceil(cprodd / 5000)) * 33) / 22);
  let dStorage = Math.ceil((Math.log(Math.ceil(dprodd / 5000)) * 33) / 22);
  mlvl = mlvl / sum;
  clvl = clvl / sum;
  dlvl = dlvl / sum;
  let prod = ecoDetail.appendChild(createDOM("div", { class: "ogk-mines" }));
  prod.appendChild(createDOM("span"));
  prod.appendChild(
    createDOM("span", { class: "ogk-title ogl-metal" })
      .appendChild(createDOM("a", { class: "resourceIcon metal ogl-option" }))
      .parentElement.appendChild(document.createTextNode(`${toFormattedNumber(mlvl, 1)}`)).parentElement
  );
  prod.appendChild(
    createDOM("span", { class: "ogk-title ogl-crystal" })
      .appendChild(createDOM("a", { class: "resourceIcon crystal ogl-option" }))
      .parentElement.appendChild(document.createTextNode(`${toFormattedNumber(clvl, 1)}`)).parentElement
  );
  prod.appendChild(
    createDOM("span", { class: "ogk-title ogl-deut" })
      .appendChild(createDOM("a", { class: "resourceIcon deuterium ogl-option" }))
      .parentElement.appendChild(document.createTextNode(`${toFormattedNumber(dlvl, 1)}`)).parentElement
  );
  prod.appendChild(createDOM("p").appendChild(createDOM("strong", {}, `${Translator.translate(59)}`)).parentElement);
  prod.appendChild(
    createDOM("span", { class: "ogl-metal" }).appendChild(
      createDOM("strong", {}, `${toFormattedNumber(mprodh / dprodh, 2)}`)
    ).parentElement
  );
  prod.appendChild(
    createDOM("span", { class: "ogl-crystal" }).appendChild(
      createDOM("strong", {}, `${toFormattedNumber(cprodh / dprodh, 2)}`)
    ).parentElement
  );
  prod.appendChild(
    createDOM("span", { class: "ogl-deut" }).appendChild(createDOM("strong", {}, `${toFormattedNumber(1)}`))
      .parentElement
  );
  prod.appendChild(createDOM("p", {}, Translator.translate(60)));
  prod.appendChild(createDOM("span", { class: "ogl-metal" }, `${toFormattedNumber(Math.floor(mprodh))}`));
  prod.appendChild(createDOM("span", { class: "ogl-crystal" }, `${toFormattedNumber(Math.floor(cprodh))}`));
  prod.appendChild(createDOM("span", { class: "ogl-deut" }, `${toFormattedNumber(Math.floor(dprodh))}`));
  prod.appendChild(createDOM("p", {}, Translator.translate(61)));
  prod.appendChild(
    createDOM(
      "span",
      {
        class: "ogl-metal tooltip",
        "data-title": `${Translator.translate(22, "tech")} ${mStorage}`,
      },
      `${toFormattedNumber(Math.floor(mprodd))}`
    )
  );
  prod.appendChild(
    createDOM(
      "span",
      {
        class: "ogl-crystal tooltip",
        "data-title": `${Translator.translate(23, "tech")} ${cStorage}`,
      },
      `${toFormattedNumber(Math.floor(cprodd))}`
    )
  );
  prod.appendChild(
    createDOM(
      "span",
      {
        class: "ogl-deut tooltip",
        "data-title": `${Translator.translate(24, "tech")} ${dStorage}`,
      },
      `${toFormattedNumber(Math.floor(dprodd))}`
    )
  );
  prod.appendChild(createDOM("p", {}, Translator.translate(62)));
  prod.appendChild(createDOM("span", { class: "ogl-metal" }, `${toFormattedNumber(Math.floor(mprodw))}`));
  prod.appendChild(createDOM("span", { class: "ogl-crystal" }, `${toFormattedNumber(Math.floor(cprodw))}`));
  prod.appendChild(createDOM("span", { class: "ogl-deut" }, `${toFormattedNumber(Math.floor(dprodw))}`));
  prod.appendChild(createDOM("span"));
  let innerAstro = prod.appendChild(
    createDOM("span", { style: "display: flex; align-items: center; margin-left: auto; margin-top: 10px;" })
  );
  innerAstro.appendChild(createDOM("span", {}, Translator.translate(93)));
  innerAstro.appendChild(
    createDOM("a", { class: "ogl-option ogl-fleet-ship ogl-tech-124", style: "margin-left: 5px; margin-right: 5px;" })
  );
  innerAstro.appendChild(
    createDOM("span").appendChild(
      createDOM("strong", {}, `${toFormattedNumber(OGIData.json.technology[124]) || toFormattedNumber(0)}`)
    ).parentElement
  );
  let innerEnergy = prod.appendChild(
    createDOM("span", { style: "display: flex; align-items: center; margin-left: auto; margin-top: 10px;" })
  );
  innerEnergy.appendChild(createDOM("span", {}, Translator.translate(4, "res")));
  innerEnergy.appendChild(
    createDOM("a", { class: "ogl-option ogl-fleet-ship ogl-tech-113", style: "margin-left: 5px; margin-right: 5px;" })
  );
  innerEnergy.appendChild(
    createDOM("span").appendChild(
      createDOM("strong", {}, `${toFormattedNumber(OGIData.json.technology[113]) || toFormattedNumber(0)}`)
    ).parentElement
  );
  let innerPlasma = prod.appendChild(
    createDOM("span", { style: "display: flex; align-items: center; margin-left: auto; margin-top: 10px;" })
  );
  innerPlasma.appendChild(createDOM("span", {}, Translator.translate(96)));
  innerPlasma.appendChild(
    createDOM("a", { class: "ogl-option ogl-fleet-ship ogl-tech-122", style: "margin-left: 5px; margin-right: 5px;" })
  );
  innerPlasma.appendChild(
    createDOM("span").appendChild(
      createDOM("strong", {}, `${toFormattedNumber(OGIData.json.technology[122]) || toFormattedNumber(0)}`)
    ).parentElement
  );
  let fleetDetail = details.appendChild(createDOM("div", { class: "ogk-box" }));
  let fleet = fleetDetail.appendChild(createDOM("div", { class: "ogk-fleet" }));
  let flying = flying();
  let totalFleet = {};
  let cyclos = 0;
  let totalSum = 0;
  let transport = 0;
  Object.values(shipEnum)
    .filter((id) => id !== shipEnum.SolarSatellite && id !== shipEnum.Crawler)
    .forEach((id) => {
      let flyingCount = flying.fleet[id];
      let sum = 0;
      if (flyingCount) sum = flyingCount;
      OGIData.empire.forEach((planet) => {
        if (planet) sum += Number(planet[id]);
        if (planet.moon) sum += Number(planet.moon[id]);
      });
      transport += sum * OGIData.json.ships[id].cargoCapacity;
      totalSum += sum;
      let shipDiv = fleet.appendChild(createDOM("div"));
      shipDiv.appendChild(createDOM("a", { class: "ogl-option ogl-fleet-ship ogl-fleet-" + id }));
      if (id == shipEnum.Recycler) {
        cyclos = sum;
      }
      shipDiv.appendChild(createDOM("span", {}, toFormattedNumber(sum)));
      totalFleet[id] = sum;
    });
  let fleetInfo = fleetDetail.appendChild(createDOM("div", { class: "ogk-fleet-info" }));
  let apiBtn = fleetInfo.appendChild(createDOM("span", { class: "show_fleet_apikey" }));
  apiBtn.addEventListener("click", () => {
    APIStringToClipboard(totalFleet);
  });
  fleetInfo.appendChild(
    DOM.createDOMSanitized(
      "span",
      { class: "tooltip", "data-title": toFormattedNumber(totalSum) },
      `${Translator.translate(63)}: <strong>${toFormattedNumber(
        totalSum,
        null,
        totalSum >= 1e6
      )}</strong><small> ${Translator.translate(64)}</small>`
    )
  );
  fleetInfo.appendChild(
    DOM.createDOMSanitized(
      "span",
      { class: "tooltip", "data-title": toFormattedNumber(transport) },
      `${Translator.translate(47)}: <strong>${toFormattedNumber(transport, null, transport >= 1e6)}</strong>`
    )
  );
  const rcpower = OGIData.json.ships[shipEnum.Recycler].cargoCapacity * cyclos;
  fleetInfo.appendChild(
    DOM.createDOMSanitized(
      "span",
      { class: "tooltip", "data-title": toFormattedNumber(rcpower) },
      `${Translator.translate(65)}: <strong>${toFormattedNumber(rcpower, null, rcpower >= 1e6)}</strong>`
    )
  );
  return content;
}

export { generalStats };
