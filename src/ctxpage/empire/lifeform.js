import * as DOM from "../../util/dom.js";
import { createDOM, createSVG, createDOMSanitized } from "../../util/dom.js";
import { toFormattedNumber, fromFormattedNumber } from "../../util/numbers.js";
import * as Numbers from "../../util/numbers.js";
import * as utilTooltip from "../../util/tooltip.js";
import * as wait from "../../util/wait.js";
import Translator from "../../util/translate.js";
import OGIData from "../../util/OGIData.js";
import OgamePageData from "../../util/OgamePageData.js";
import AllianceClass from "../../util/enum/allianceClass.js";
import PlayerClass from "../../util/enum/playerClass.js";
import shipEnum from "../../util/enum/ship.js";
import planetType from "../../util/enum/planetType.js";
import { pageSignal } from "../../util/abort.js";
import { updateresourceDetail } from "../empireOverview/index.js";
import { BUIDLING_INFO } from "../../util/enum/buildingInfo.js";
import { RESEARCH_INFO } from "../../util/enum/researchInfo.js";
import {
  CRAWLER_OVERLOAD_MAX,
  CRYSTAL_GENERAL_INCOMING,
  CRYSTAL_POS_BONUS,
  ENGINEER_ENERGY_BONUS,
  GEOLOGIST_CRAWLER_BONUS,
  GEOLOGIST_RESOURCE_BONUS,
  IONTECHNOLOGY_BONUS,
  MAX_CRAWLERS_PER_MINE,
  METAL_GENERAL_INCOMING,
  METAL_POS_BONUS,
  OFFICER_ENERGY_BONUS,
  OFFICER_RESOURCE_BONUS,
  PLASMATECH_BONUS,
  TRADER_ENERGY_BONUS,
  TRADER_RESOURCE_BONUS,
  SUPPLIES_TECHID,
  FACILITIES_TECHID,
} from "../../util/gameConstants.js";
import { building, consumption, minesProduction, research } from "../../util/gameFormulas.js";
import ogiMode from "../../util/enum/ogiMode.js";

import { updateEmpireProduction } from "./production.js";

/** The lifeform bonuses: what each planet's chosen lifeform adds, per technology. */
async function updateLifeform(context) {
  // WIP
  if (!context.hasLifeforms) return;
  OGIData.json.lifeformBonus = await getLifeformBonus(context);
  // temporary hack until code reworked to work with unique needLifeformUpdate
  // TODO: implement unique needLifeformUpdate
  OGIData.empire.forEach((planet) => {
    OGIData.json.needLifeformUpdate[planet.id] = false;
  });
  updateEmpireProduction(context);
  OGIData.Save();
}

async function getLifeformBonus(context) {
  return fetch(
    `https://s${context.universe}-${OgamePageData.gameLang}.ogame.gameforge.com/game/index.php?page=ingame&component=lfbonuses`,
    { signal: pageSignal() }
  )
    .then((rep) => rep.text())
    .then((str) => {
      const htmlDocument = new window.DOMParser().parseFromString(str, "text/html");

      // update selectedLifeforms & their levels
      htmlDocument.querySelectorAll(".smallplanet a.planetlink").forEach((elem) => {
        const name = elem.getAttribute("title").split("<br/>")[1].split(":")[1].trim();
        OGIData.json.selectedLifeforms[elem.href.split("cp=")[1]] = Translator.GetClassFromLifeformName(name);
      });
      const lifeformLevel = {};
      htmlDocument.querySelectorAll("lifeform-level-bonuses div.lifeform-item-icon").forEach((iconDiv) => {
        const lifeform = iconDiv.classList[1];
        const level = parseInt(iconDiv.parentElement.parentElement.parentElement.querySelector("strong").textContent);
        lifeformLevel[lifeform] = level;
      });

      const parseBonus = (text) => fromFormattedNumber(text.split("%")[0], false, true) / 100 || 0;

      // production bonus
      const metalDiv = htmlDocument.querySelector("inner-bonus-item-heading[data-toggable='metal'] .subCategoryBonus");
      const crystalDiv = htmlDocument.querySelector(
        "inner-bonus-item-heading[data-toggable='crystal'] .subCategoryBonus"
      );
      const deuteriumDiv = htmlDocument.querySelector(
        "inner-bonus-item-heading[data-toggable='deuterium'] .subCategoryBonus"
      );

      const energyDiv = htmlDocument.querySelector(
        "inner-bonus-item-heading[data-toggable='energy'] .subCategoryBonus"
      );
      const productionBonus = [
        metalDiv ? parseBonus(metalDiv.textContent) : 0,
        crystalDiv ? parseBonus(crystalDiv.textContent) : 0,
        deuteriumDiv ? parseBonus(deuteriumDiv.textContent) : 0,
        energyDiv ? parseBonus(energyDiv.textContent) : 0,
      ];

      // expedition bonus
      const expeditionDiv = htmlDocument.querySelector(
        "inner-bonus-item-heading[data-toggable='ResultBooster'] .subCategoryBonus"
      );
      const expeditionBonus = expeditionDiv ? parseBonus(expeditionDiv.textContent) : 0;

      // cost & time reduction bonus
      const technologyCostReduction = {};
      const technologyTimeReduction = {};
      htmlDocument
        .querySelectorAll(
          "bonus-item-content[data-toggable-target^='costreduction'] bonus-item-content-holder > inner-bonus-item-heading"
        )
        .forEach((category) => {
          let techId = category.getAttribute("data-toggable");
          if (techId == -200) techId = "LfResearch";

          const bonus = category.querySelectorAll("bonus-item");
          technologyCostReduction[techId] = parseBonus(bonus[0].textContent);
          technologyTimeReduction[techId] = parseBonus(bonus[1].textContent);
        });

      // class bonus
      const classBonus = {};
      const collectorDiv = htmlDocument.querySelector(
        "inner-bonus-item-heading[data-toggable='601'] .subCategoryBonus"
      );
      const generalDiv = htmlDocument.querySelector("inner-bonus-item-heading[data-toggable='602'] .subCategoryBonus");
      const discovererDiv = htmlDocument.querySelector(
        "inner-bonus-item-heading[data-toggable='603'] .subCategoryBonus"
      );
      classBonus.miner = collectorDiv ? parseBonus(collectorDiv.textContent.match(/[\d].*/)[0]) : 0;
      classBonus.warrior = generalDiv ? parseBonus(generalDiv.textContent.match(/[\d].*/)[0]) : 0;
      classBonus.explorer = discovererDiv ? parseBonus(discovererDiv.textContent.match(/[\d].*/)[0]) : 0;

      // crawler bonus
      const crawlerDiv = htmlDocument.querySelectorAll(
        "inner-bonus-item-heading[data-toggable='buggyBonus'] bonus-item"
      );
      const crawlerConsumptionBonus = crawlerDiv.length ? parseBonus(crawlerDiv[0].textContent) : 0;
      const crawlerProductionBonus = crawlerDiv.length ? parseBonus(crawlerDiv[1].textContent) : 0;

      return {
        lifeformLevel: lifeformLevel,
        productionBonus: productionBonus,
        expeditionBonus: expeditionBonus,
        technologyCostReduction: technologyCostReduction,
        technologyTimeReduction: technologyTimeReduction,
        classBonus: classBonus,
        crawlerBonus: { production: crawlerProductionBonus, consumption: crawlerConsumptionBonus },
      };
    });
}

async function updateLifeformPlanetBonus(context) {
  const lifeformPlanetBonus = {};
  OGIData.empire.forEach((planet) => {
    const lifeform = OGIData.json.selectedLifeforms[planet.id];

    // research cost & time reduction bonus
    const lfLabBuildingId = Number("1" + lifeform?.slice(-1) + "103");
    const technologyCostReduction = 0.0025 * (planet[lfLabBuildingId] > 1 ? planet[lfLabBuildingId] : 0);
    const technologyTimeReduction = 0.02 * (planet[lfLabBuildingId] > 1 ? planet[lfLabBuildingId] : 0);

    // building cost & time reduction bonus
    const buildingCostReduction = {};
    const buildingTimeReduction = {};
    if (lifeform == "lifeform2") {
      const lfCostReduction = 0.01 * planet[12108];
      const lfTimeReduction = 0.01 * planet[12108];
      if (lfCostReduction) {
        Array.from(new Array(12), (x, i) => i + 12101).forEach((id) => {
          buildingCostReduction[id] = lfCostReduction;
          buildingTimeReduction[id] = lfTimeReduction;
        });
      }
      const prodCostReduction = 0.005 * planet[12111];
      if (prodCostReduction) {
        [1, 2, 3, 4, 12].forEach((id) => (buildingCostReduction[id] = prodCostReduction));
        [12101, 12102].forEach((id) => (buildingCostReduction[id] += prodCostReduction));
      }
    }

    // production bonus
    const productionBonus = [0, 0, 0, 0];
    switch (lifeform) {
      case "lifeform1":
        productionBonus[0] = 0.015 * planet[11106];
        productionBonus[1] = 0.015 * planet[11108];
        productionBonus[2] = 0.01 * planet[11108];
        break;
      case "lifeform2":
        productionBonus[0] = 0.02 * planet[12106];
        productionBonus[1] = 0.02 * planet[12109];
        productionBonus[2] = 0.02 * planet[12110];
        productionBonus[3] = 0.015 * planet[12107];
        break;
      case "lifeform3":
        productionBonus[2] = 0.02 * planet[13110];
        productionBonus[3] = 0.01 * planet[13107];
    }

    lifeformPlanetBonus[planet.id] = {
      buildingCostReduction: buildingCostReduction,
      buildingTimeReduction: buildingTimeReduction,
      productionBonus: productionBonus,
      technologyCostReduction: technologyCostReduction,
      technologyTimeReduction: technologyTimeReduction,
    };
  });
  OGIData.json.lifeformPlanetBonus = lifeformPlanetBonus;
}

export { updateLifeform, getLifeformBonus, updateLifeformPlanetBonus };
