import * as DOM from "../../ui/dom.js";
import Translator from "../../format/i18n/translate.js";
import OGBIData from "../../store/OGBIData.js";
import AllianceClass from "../../game/allianceClass.js";
import PlayerClass from "../../game/playerClass.js";
import {
  CRAWLER_OVERLOAD_MAX,
  CRYSTAL_GENERAL_INCOMING,
  CRYSTAL_POS_BONUS,
  GEOLOGIST_RESOURCE_BONUS,
  MAX_CRAWLERS_PER_MINE,
  METAL_GENERAL_INCOMING,
  METAL_POS_BONUS,
  OFFICER_RESOURCE_BONUS,
  PLASMATECH_BONUS,
  TRADER_RESOURCE_BONUS,
  SUPPLIES_TECHID,
  FACILITIES_TECHID,
} from "../../game/gameConstants.js";
import itemImageID from "../../game/itemImageID.js";
import itemType from "../../game/itemType.js";
import { getOption } from "../conf-options.js";
import { tooltip } from "../../ui/tooltip.js";
import * as iconVisibility from "../../ui/icons.js";

/**
 * The production numbers derived from the empire snapshot, and the construction
 * progress bars on the planet bar.
 *
 * `updateEmpireProduction()` is the one marked `WIP` in refactoring.md 3.3: eight
 * known gaps, and a second, tested model in `util/productionEngine.js` that only one
 * caller uses. The gaps are recorded, not repaired - a move is not the place.
 */
function updateEmpireProduction(context) {
  // WIP
  OGBIData.empire.forEach((planet) => {
    planet.production.productionFactor = 1; // temporary, TODO: change use in fleetDispatcher with computed factor
    planet.production.generalIncoming = {
      0: METAL_GENERAL_INCOMING * METAL_POS_BONUS[planet.position - 1] * OGBIData.json.speed,
      1: CRYSTAL_GENERAL_INCOMING * CRYSTAL_POS_BONUS[planet.position - 1] * OGBIData.json.speed,
      2: 0,
      3: 0,
    };

    planet.production.production = {
      1: {
        // metal mine
        0: Math.floor(30 * planet[1] * 1.1 ** planet[1] * OGBIData.json.speed * METAL_POS_BONUS[planet.position - 1]),
        1: 0,
        2: 0,
        3: Math.floor(10 * planet[1] * 1.1 ** planet[1]),
      },
      2: {
        // crystal mine
        0: 0,
        1: Math.floor(20 * planet[2] * 1.1 ** planet[2] * OGBIData.json.speed * CRYSTAL_POS_BONUS[planet.position - 1]),
        2: 0,
        3: Math.floor(10 * planet[2] * 1.1 ** planet[2]),
      },
      3: {
        // deuterium synthesizer
        0: 0,
        1: 0,
        2: Math.floor(10 * planet[3] * 1.1 ** planet[3] * OGBIData.json.speed * (1.36 - 0.004 * (planet.db_par2 + 20))),
        3: Math.floor(20 * planet[3] * 1.1 ** planet[3]),
      },
      4: {
        // solar plant
        0: 0,
        1: 0,
        2: 0,
        3: Math.floor(20 * planet[4] * 1.1 ** planet[4]),
      },
      12: {
        // fusion reactor
        0: 0,
        1: 0,
        2: Math.floor(10 * planet[12] * 1.1 ** planet[12] * OGBIData.json.speed),
        3: Math.floor(30 * planet[12] * (1.05 + 0.01 * planet[113]) ** planet[12]),
      },
      122: {
        // plasma
        0: 0,
        1: 0,
        2: 0,
        3: 0,
      },
      212: {
        // solar satellite
        0: 0,
        1: 0,
        2: 0,
        3: 0, // TODO: compute solar satellite energy production
      },
      217: {
        // crawlers
        0: 0,
        1: 0,
        2: 0,
        3: 0,
      },
      1000: {
        // items
        0: 0,
        1: 0,
        2: 0,
        3: 0,
      },
      1001: {
        // geologist
        0: 0,
        1: 0,
        2: 0,
        3: 0,
      },
      1002: {
        // engineer
        0: 0,
        1: 0,
        2: 0,
        3: 0, // TODO: compute engineer energy production
      },
      1003: {
        // officers
        0: 0,
        1: 0,
        2: 0,
        3: 0,
      },
      1004: {
        // playerClass
        0: 0,
        1: 0,
        2: 0,
        3: 0,
      },
      1005: {
        // allyClass
        0: 0,
        1: 0,
        2: 0,
        3: 0,
      },
    };

    planet.production.lifeformProduction = {
      0: 0,
      1: 0,
      2: 0,
      3: 0,
    };

    // parse active production items
    const activeItems = [0, 0, 0, 0];
    const html = new window.DOMParser().parseFromString(planet.equipment_html, "text/html");
    const itemDivs = html.querySelectorAll(".item_img");
    itemDivs.forEach((div) => {
      const style = div.getAttribute("style");
      const id = style.substring(style.indexOf("images/") + 7, style.indexOf(".png"));
      const item = itemImageID[id];
      if (item) {
        if (item.type === itemType.All3Resources) {
          // 3 resource item
          [itemType.Metal, itemType.Crystal, itemType.Deuterium].forEach((resource) => {
            activeItems[resource] += item.bonus;
          });
        } else if (
          item.type === itemType.Metal ||
          item.type === itemType.Crystal ||
          item.type === itemType.Deuterium ||
          item.type === itemType.Energy
        ) {
          // regular resource item
          activeItems[item.type] += item.bonus;
        }
      }
    });

    //console.log("planet: " + planet.coordinates);

    // TODO: compute energy detailed production if used
    for (let idx = 0; idx < 3; idx++) {
      //console.log("resource: " + ["metal", "crystal", "deuterium"][idx]);

      const baseProd = planet.production.generalIncoming[idx];
      const mineProd = planet.production.production[idx + 1][idx];
      const plasmaProd = mineProd * planet[122] * PLASMATECH_BONUS[idx];
      const geoProd = mineProd * (context.geologist ? GEOLOGIST_RESOURCE_BONUS : 0);
      const officerProd = mineProd * (context.allOfficers ? OFFICER_RESOURCE_BONUS : 0);
      const allyClassProd = mineProd * (OGBIData.json.allianceClass == AllianceClass.MINER ? TRADER_RESOURCE_BONUS : 0);
      const itemProd = mineProd * activeItems[idx];

      const lifeformBonus = OGBIData.json.lifeformBonus;
      const playerClassProd =
        mineProd *
        (context.playerClass == PlayerClass.MINER
          ? OGBIData.json.minerBonusResourceProduction * (1 + lifeformBonus.classBonus.miner)
          : 0);
      const lifeformProd = mineProd * lifeformBonus.productionBonus?.[idx] || 0;
      const lifeformPlanetBonus = OGBIData.json.lifeformPlanetBonus[planet.id]?.productionBonus;
      const lifeformPlanetProd = mineProd * lifeformPlanetBonus[idx] || 0;

      let totalProd = 0;
      totalProd += mineProd;
      totalProd += plasmaProd;
      totalProd += geoProd;
      totalProd += officerProd;
      totalProd += allyClassProd;
      totalProd += playerClassProd;
      totalProd += itemProd;
      totalProd += lifeformProd;
      totalProd += lifeformPlanetProd;
      // TODO: compute fusion reactor factor
      totalProd -= planet.production.production[12][idx];

      let crawlerProd = 0;
      if (planet[217] > 0) {
        const maxCrawlers = Math.floor(
          (planet[1] + planet[2] + planet[3]) *
            MAX_CRAWLERS_PER_MINE *
            (context.playerClass == PlayerClass.MINER && context.geologist
              ? 1 + OGBIData.json.minerBonusMaxCrawler * (1 + lifeformBonus.classBonus.miner)
              : 1)
        );
        crawlerProd =
          mineProd *
          Math.min(planet[217], maxCrawlers) *
          OGBIData.json.resourceBuggyProductionBoost *
          (context.playerClass == PlayerClass.MINER
            ? 1 + OGBIData.json.minerBonusAdditionalCrawler * (1 + lifeformBonus.classBonus.miner)
            : 1) *
          (1 + OGBIData.json.lifeformBonus.crawlerBonus?.production || 1);
        //let crawlerPercent = context.playerClass == PlayerClass.MINER ? 1.5 : 1;  // TODO: try to guess true value
        let crawlerPercent = 1;
        crawlerProd *= Math.min(crawlerPercent, context.playerClass == PlayerClass.MINER ? CRAWLER_OVERLOAD_MAX : 1);
        crawlerProd = Math.min(crawlerProd, mineProd * OGBIData.json.resourceBuggyMaxProductionBoost);
      }

      const crawlerFactor = context.playerClass == PlayerClass.MINER ? 1.5 : 1;

      // Pinned to 1. It used to be derived from `planet.production.hourly[idx]`,
      // but v13 does not report hourly production in a form this can trust, so
      // the derived value was overwritten by a hard `= 1` on the very next line.
      // Both the derivation and the commented-out crawler sweep above it went
      // out with v12 support - keeping dead arithmetic here only made it look
      // as if a factor were still being computed.
      // This is gap 1 of the eight in updateEmpireProduction(context), refactoring.md 3.3.
      const prodFactor = 1;

      crawlerProd = Math.min(
        crawlerProd * crawlerFactor * prodFactor,
        mineProd * prodFactor * OGBIData.json.resourceBuggyMaxProductionBoost
      );

      totalProd *= prodFactor;
      totalProd += crawlerProd;
      totalProd += baseProd;

      //console.log("crawler factor: " + crawlerFactor);
      //console.log("production factor: " + prodFactor);
      //console.log("total production (computed): " + totalProd);

      planet.production.production[idx + 1][idx] = mineProd * prodFactor;
      planet.production.production[122][idx] = plasmaProd * prodFactor;
      planet.production.production[1001][idx] = geoProd * prodFactor;
      planet.production.production[1003][idx] = officerProd * prodFactor;
      planet.production.production[1005][idx] = allyClassProd * prodFactor;
      planet.production.production[1004][idx] = playerClassProd * prodFactor;
      planet.production.production[217][idx] = crawlerProd;
      planet.production.production[1000][idx] = itemProd * prodFactor;
      planet.production.lifeformProduction[idx] = (lifeformProd + lifeformPlanetProd) * prodFactor;
      /*
      console.log("computed detailed production:");
      console.log("base: " + planet.production.generalIncoming[idx]);
      console.log("mine: " + planet.production.production[idx + 1][idx]);
      console.log("plasma: " + planet.production.production[122][idx]);
      console.log("geo: " + planet.production.production[1001][idx]);
      console.log("officer: " + planet.production.production[1003][idx]);
      console.log("ally class: " + planet.production.production[1005][idx]);
      console.log("player class: " + planet.production.production[1004][idx]);
      console.log("crawler: " + planet.production.production[217][idx]);
      console.log("item: " + planet.production.production[1000][idx]);
      console.log("lifeformTotal: " + planet.production.lifeformProduction[idx]);
      console.log("lifeformTech: " + lifeformProd * prodFactor);
      console.log("lifeformPlanet: " + lifeformPlanetProd * prodFactor);
      console.log("----------------------------------------------");
      */
      planet.production.hourly[idx] = totalProd;
      planet.production.daily[idx] = totalProd * 24;
      planet.production.weekly[idx] = totalProd * 24 * 7;
    }
    /*
    console.log("planet hourly / daily / weekly productions");
    console.log(planet.production.hourly);
    console.log(planet.production.daily);
    console.log(planet.production.weekly);
    console.log("=================================================");
    */
  });
}

function ProcessProductionProgressData(context, canCheckFromEmpire = false) {
  let now = new Date();
  const lastMinute = new Date(Date.now() - 60000);
  const regularBuildingsGroups = ["supply", "station"];
  const lifeformBuildingsGroup = "lifeformbuildings";
  const lifeformResearchGroup = "lifeformresearch";

  document.querySelectorAll(".planet-koords").forEach((planet) => {
    const smallplanet = planet.parentElement.parentElement;
    const planetId = planet.parentElement.href.match(/=(\d+)/)[1];
    const planetFromEmpire = OGBIData.empire.find((p) => p.id === parseInt(planetId));
    const moonFromEmpire = planetFromEmpire.moon;
    const planetCoords = planet.textContent.trim();

    /* MOON CONSTRUCTIION */
    let elemFromEmpire =
      canCheckFromEmpire && moonFromEmpire?.workInProgressTechs
        ? moonFromEmpire.workInProgressTechs.find((x) => regularBuildingsGroups.includes(x.group))
        : null; //elemFromEmpire is set only if canCheckFromEmpire is true
    let elem = OGBIData.json.moonProductionProgress[planetCoords];
    if (elem && elem.endDate) {
      //if an element exists and have an end date, we must check if it is finished
      const endDate = new Date(elem.endDate);
      if (endDate < now) {
        //if an element is finished, then copy it to the finished progress
        OGBIData.json.moonProductionProgressFinished[planetCoords] = elem;
        if (elemFromEmpire) {
          //if elemFromEmpire exists, then we need to update the active progress
          OGBIData.json.moonProductionProgress[planetCoords] = {
            technoId: elemFromEmpire.id,
            tolvl: elemFromEmpire.to,
          };
        } else {
          //if elemFromEmpire does not exist, then we can consider that there is no construction in progress
          delete OGBIData.json.moonProductionProgress[planetCoords];
        }
      } else if (elemFromEmpire) {
        //if both exist, but elem is not finished, then it means that the construction could have changed, and we need to compare techId and level
        if (elem.technoId != elemFromEmpire.id || elem.tolvl != elemFromEmpire.to) {
          //techId or level has changed, so the element has finished and we must copy it to the finished progress and update the active progress
          OGBIData.json.moonProductionProgressFinished[planetCoords] = elem;
          OGBIData.json.moonProductionProgress[planetCoords] = {
            technoId: elemFromEmpire.id,
            tolvl: elemFromEmpire.to,
          };
        }
      }
    } else if (elem && elemFromEmpire) {
      //if both exist, but elem has no end date, then it means that the construction could have changed, and we need to compare techId and level
      if (elem.technoId != elemFromEmpire.id || elem.tolvl != elemFromEmpire.to) {
        //techId or level has changed, so the element has finished and we must copy it to the finished progress and update the active progress
        OGBIData.json.moonProductionProgressFinished[planetCoords] = elem;
        OGBIData.json.moonProductionProgress[planetCoords] = {
          technoId: elemFromEmpire.id,
          tolvl: elemFromEmpire.to,
        };
      }
    } else if (elem && canCheckFromEmpire) {
      //if only elem exists, and we have checked from empire, but no constructions are in progress, we can consider it finished
      OGBIData.json.moonProductionProgressFinished[planetCoords] = elem;
      delete OGBIData.json.moonProductionProgress[planetCoords];
    } else if (elemFromEmpire) {
      //if only elemFromEmpire exists, then it means that a new construction has started
      OGBIData.json.moonProductionProgress[planetCoords] = {
        technoId: elemFromEmpire.id,
        tolvl: elemFromEmpire.to,
      };
    }

    /* PLANET LIFEFORM RESEARCH */
    elemFromEmpire =
      canCheckFromEmpire && planetFromEmpire?.workInProgressTechs
        ? planetFromEmpire.workInProgressTechs.find((x) => x.group == lifeformResearchGroup)
        : null; //elemFromEmpire is set only if canCheckFromEmpire is true
    elem = OGBIData.json.lfResearchProgress[planetCoords];
    if (elem && elem.endDate) {
      //if an element exists and have an end date, we must check if it is finished
      const endDate = new Date(elem.endDate);
      if (endDate < now) {
        //if an element is finished, then copy it to the finished progress
        OGBIData.json.lfResearchProgressFinished[planetCoords] = elem;
        if (elemFromEmpire) {
          //if elemFromEmpire exists, then we need to update the active progress
          OGBIData.json.lfResearchProgress[planetCoords] = {
            technoId: elemFromEmpire.id,
            tolvl: elemFromEmpire.to,
          };
        } else {
          //if elemFromEmpire does not exist, then we can consider that there is no construction in progress
          delete OGBIData.json.lfResearchProgress[planetCoords];
        }
      } else if (elemFromEmpire) {
        //if both exist, but elem is not finished, then it means that the construction could have changed, and we need to compare techId and level
        if (elem.technoId != elemFromEmpire.id || elem.tolvl != elemFromEmpire.to) {
          //techId or level has changed, so the element has finished and we must copy it to the finished progress and update the active progress
          OGBIData.json.lfResearchProgressFinished[planetCoords] = elem;
          OGBIData.json.lfResearchProgress[planetCoords] = {
            technoId: elemFromEmpire.id,
            tolvl: elemFromEmpire.to,
          };
        }
      }
    } else if (elem && elemFromEmpire) {
      //if both exist, but elem has no end date, then it means that the construction could have changed, and we need to compare techId and level
      if (elem.technoId != elemFromEmpire.id || elem.tolvl != elemFromEmpire.to) {
        //techId or level has changed, so the element has finished and we must copy it to the finished progress and update the active progress
        OGBIData.json.lfResearchProgressFinished[planetCoords] = elem;
        OGBIData.json.lfResearchProgress[planetCoords] = {
          technoId: elemFromEmpire.id,
          tolvl: elemFromEmpire.to,
        };
      }
    } else if (elem && canCheckFromEmpire) {
      //if only elem exists, and we have checked from empire, but no constructions are in progress, we can consider it finished
      OGBIData.json.lfResearchProgressFinished[planetCoords] = elem;
      delete OGBIData.json.lfResearchProgress[planetCoords];
    } else if (elemFromEmpire) {
      //if only elemFromEmpire exists, then it means that a new construction has started
      OGBIData.json.lfResearchProgress[planetCoords] = {
        technoId: elemFromEmpire.id,
        tolvl: elemFromEmpire.to,
      };
    }

    /* PLANET LIFEFORM BUILDINGS */
    elemFromEmpire =
      canCheckFromEmpire && planetFromEmpire?.workInProgressTechs
        ? planetFromEmpire.workInProgressTechs.find((x) => x.group == lifeformBuildingsGroup)
        : null; //elemFromEmpire is set only if canCheckFromEmpire is true
    elem = OGBIData.json.lfProductionProgress[planetCoords];
    if (elem && elem.endDate) {
      //if an element exists and have an end date, we must check if it is finished
      const endDate = new Date(elem.endDate);
      if (endDate < now) {
        //if an element is finished, then copy it to the finished progress
        OGBIData.json.lfProductionProgressFinished[planetCoords] = elem;
        if (elemFromEmpire) {
          //if elemFromEmpire exists, then we need to update the active progress
          OGBIData.json.lfProductionProgress[planetCoords] = {
            technoId: elemFromEmpire.id,
            tolvl: elemFromEmpire.to,
          };
        } else {
          //if elemFromEmpire does not exist, then we can consider that there is no construction in progress
          delete OGBIData.json.lfProductionProgress[planetCoords];
        }
      } else if (elemFromEmpire) {
        //if both exist, but elem is not finished, then it means that the construction could have changed, and we need to compare techId and level
        if (elem.technoId != elemFromEmpire.id || elem.tolvl != elemFromEmpire.to) {
          //techId or level has changed, so the element has finished and we must copy it to the finished progress and update the active progress
          OGBIData.json.lfProductionProgressFinished[planetCoords] = elem;
          OGBIData.json.lfProductionProgress[planetCoords] = {
            technoId: elemFromEmpire.id,
            tolvl: elemFromEmpire.to,
          };
        }
      }
    } else if (elem && elemFromEmpire) {
      //if both exist, but elem has no end date, then it means that the construction could have changed, and we need to compare techId and level
      if (elem.technoId != elemFromEmpire.id || elem.tolvl != elemFromEmpire.to) {
        //techId or level has changed, so the element has finished and we must copy it to the finished progress and update the active progress
        OGBIData.json.lfProductionProgressFinished[planetCoords] = elem;
        OGBIData.json.lfProductionProgress[planetCoords] = {
          technoId: elemFromEmpire.id,
          tolvl: elemFromEmpire.to,
        };
      }
    } else if (elem && canCheckFromEmpire) {
      //if only elem exists, and we have checked from empire, but no constructions are in progress, we can consider it finished
      OGBIData.json.lfProductionProgressFinished[planetCoords] = elem;
      delete OGBIData.json.lfProductionProgress[planetCoords];
    } else if (elemFromEmpire) {
      //if only elemFromEmpire exists, then it means that a new construction has started
      OGBIData.json.lfProductionProgress[planetCoords] = {
        technoId: elemFromEmpire.id,
        tolvl: elemFromEmpire.to,
      };
    }

    /* PLANET CONSTRUCTIION */
    elemFromEmpire =
      canCheckFromEmpire && planetFromEmpire?.workInProgressTechs
        ? planetFromEmpire.workInProgressTechs.find((x) => regularBuildingsGroups.includes(x.group))
        : null; //elemFromEmpire is set only if canCheckFromEmpire is true
    elem = OGBIData.json.productionProgress[planetCoords];
    if (elem && elem.endDate) {
      //if an element exists and have an end date, we must check if it is finished
      const endDate = new Date(elem.endDate);
      if (endDate < now) {
        //if an element is finished, then copy it to the finished progress
        OGBIData.json.productionProgressFinished[planetCoords] = elem;
        if (elemFromEmpire) {
          //if elemFromEmpire exists, then we need to update the active progress
          OGBIData.json.productionProgress[planetCoords] = {
            technoId: elemFromEmpire.id,
            tolvl: elemFromEmpire.to,
          };
        } else {
          //if elemFromEmpire does not exist, then we can consider that there is no construction in progress
          delete OGBIData.json.productionProgress[planetCoords];
        }
      } else if (elemFromEmpire) {
        //if both exist, but elem is not finished, then it means that the construction could have changed, and we need to compare techId and level
        if (elem.technoId != elemFromEmpire.id || elem.tolvl != elemFromEmpire.to) {
          //techId or level has changed, so the element has finished and we must copy it to the finished progress and update the active progress
          OGBIData.json.productionProgressFinished[planetCoords] = elem;
          OGBIData.json.productionProgress[planetCoords] = {
            technoId: elemFromEmpire.id,
            tolvl: elemFromEmpire.to,
          };
        }
      }
    } else if (elem && elemFromEmpire) {
      //if both exist, but elem has no end date, then it means that the construction could have changed, and we need to compare techId and level
      if (elem.technoId != elemFromEmpire.id || elem.tolvl != elemFromEmpire.to) {
        //techId or level has changed, so the element has finished and we must copy it to the finished progress and update the active progress
        OGBIData.json.productionProgressFinished[planetCoords] = elem;
        OGBIData.json.productionProgress[planetCoords] = {
          technoId: elemFromEmpire.id,
          tolvl: elemFromEmpire.to,
        };
      }
    } else if (elem && canCheckFromEmpire) {
      //if only elem exists, and we have checked from empire, but no constructions are in progress, we can consider it finished
      OGBIData.json.productionProgressFinished[planetCoords] = elem;
      delete OGBIData.json.productionProgress[planetCoords];
    } else if (elemFromEmpire) {
      //if only elemFromEmpire exists, then it means that a new construction has started
      OGBIData.json.productionProgress[planetCoords] = {
        technoId: elemFromEmpire.id,
        tolvl: elemFromEmpire.to,
      };
    }
  });
}

function updateProductionProgress(context, canCheckFromEmpire = false) {
  ProcessProductionProgressData(context, canCheckFromEmpire); //Update production progress data
  const oneYear = 1000 * 60 * 60 * 24 * 365;
  let now = new Date();
  let needLifeformUpdateForResearch = false;

  const updateProgressIndicators = () => {
    const regularConstructionsIconsDisplayMode = getOption("regularConstructionsIconsDisplayMode");
    const lifeformConstructionsIconsDisplayMode = getOption("lifeformConstructionsIconsDisplayMode");
    const lifeformResearchsIconsDisplayMode = getOption("lifeformResearchsIconsDisplayMode");

    const createConstructionIcon = (elem, planetOrMoonId, techName, iconClass, component, addToolTip, redirect) => {
      const constructionIcon = DOM.createDOM("a", {
        class: "constructionIcon planet tooltip js_hideTipOnMobile",
        href: `/game/index.php?page=ingame&component=${redirect ? component : context.page}&cp=${planetOrMoonId}`,
      });

      if (addToolTip) {
        const tooltipDiv = DOM.createDOM("div", { class: "constructionIconTooltip" });
        tooltipDiv.appendChild(DOM.createDOM("span", { class: "techName" }, `${techName} (${elem.tolvl})`));

        constructionIcon.addEventListener("mouseover", () =>
          tooltip(constructionIcon, tooltipDiv, true, { auto: true }, 50, false)
        );
      }

      constructionIcon.appendChild(DOM.createDOM("span", { class: `icon12px ${iconClass}` }));

      return constructionIcon;
    };

    document.querySelectorAll(".planet-koords").forEach((planet) => {
      const smallplanet = planet.parentElement.parentElement;
      const planetId = planet.parentElement.href.match(/=(\d+)/)[1];
      const planetFromEmpire = OGBIData.empire.find((p) => p.id === parseInt(planetId));
      const planetCoords = planet.textContent.trim();
      // remove old constructions icons
      smallplanet.querySelector(".constructionIcons:not(.moonConstructionIcons)")?.remove();
      smallplanet.querySelector(".constructionIcons.moonConstructionIcons")?.remove();

      const constructionIconsDiv = DOM.createDOM("div", { class: "constructionIcons" });
      const constructionIconLink = smallplanet.querySelector(".constructionIcon:not(.moon)");
      if (constructionIconLink) smallplanet.removeChild(constructionIconLink);
      const moonConstructionIconLink = smallplanet.querySelector(".constructionIcon.moon");
      if (moonConstructionIconLink) smallplanet.removeChild(moonConstructionIconLink);

      let elem;
      let finishedElem;

      /* MOON CONSTRUCTION */
      const moon = smallplanet.querySelector(".moonlink");
      if (moon) {
        const moonId = moon.href.match(/=(\d+)/)[1];
        elem = OGBIData.json.moonProductionProgress[planetCoords];
        finishedElem = OGBIData.json.moonProductionProgressFinished[planetCoords];

        /* FINISHED */
        if (finishedElem) {
          if (OGBIData.json.options.showProgressIndicators) {
            //if an element is finished, we need to add the finished class, if it doesn't already have it
            if (!moon.classList.contains("finished")) moon.classList.add("finished");
          }
        } else {
          //if there is no finished element, we need to remove the finished class, if it has it
          if (moon.classList.contains("finished")) moon.classList.remove("finished");
        }

        /* WORK IN PROGRESS */
        if (elem) {
          //if there is a work in progress element, we need to add an icon
          if (iconVisibility.shouldDisplayIcon(regularConstructionsIconsDisplayMode)) {
            const moonConstructionIconsDiv = DOM.createDOM("div", {
              class: "constructionIcons moonConstructionIcons",
            });

            const techName = Translator.translate(elem.technoId, "tech");
            moonConstructionIconsDiv.appendChild(
              createConstructionIcon(
                elem,
                moonId,
                techName,
                "icon_wrench",
                SUPPLIES_TECHID.includes(Number(elem.technoId))
                  ? "supplies"
                  : FACILITIES_TECHID.includes(Number(elem.technoId))
                  ? "facilities"
                  : "overview",
                iconVisibility.shouldAddIconTooltip(regularConstructionsIconsDisplayMode),
                iconVisibility.shouldAddIconRedirection(regularConstructionsIconsDisplayMode)
              )
            );

            smallplanet.appendChild(moonConstructionIconsDiv);
          }
        }
      }

      /* PLANET LIFEFORM RESEARCH */
      elem = OGBIData.json.lfResearchProgress[planetCoords];
      //there is no finished indicator for lifeform research

      /* WORK IN PROGRESS */
      if (elem) {
        //if there is a work in progress element, we need to add an icon
        if (iconVisibility.shouldDisplayIcon(lifeformResearchsIconsDisplayMode)) {
          // lifeform research work is in progress, so show the icon
          const techName = Translator.translate(elem.technoId, "tech");
          constructionIconsDiv.appendChild(
            createConstructionIcon(
              elem,
              planetId,
              techName,
              "icon_research_lf",
              "lfresearch",
              iconVisibility.shouldAddIconTooltip(lifeformResearchsIconsDisplayMode),
              iconVisibility.shouldAddIconRedirection(lifeformResearchsIconsDisplayMode)
            )
          );
        }
      }

      /* PLANET LIFEFORM CONSTRUCTION */
      elem = OGBIData.json.lfProductionProgress[planetCoords];
      finishedElem = OGBIData.json.lfProductionProgressFinished[planetCoords];

      /* FINISHED */
      if (finishedElem) {
        // lifeform production work is finished, so we need to update the lifeform
        OGBIData.json.needLifeformUpdate[planet.parentElement.href.match(/=(\d+)/)[1]] = true;
        if (OGBIData.json.options.showProgressIndicators) {
          //if an element is finished, we need to add the finished class, if it doesn't already have it
          if (!planet.parentElement.classList.contains("finishedLf")) planet.parentElement.classList.add("finishedLf");
        }
      } else {
        //if there is no finished element, we need to remove the finished class, if it has it
        if (planet.parentElement.classList.contains("finishedLf")) planet.parentElement.classList.remove("finishedLf");
      }

      /* WORK IN PROGRESS */
      if (elem) {
        //if there is a work in progress element, we need to add an icon
        if (iconVisibility.shouldDisplayIcon(lifeformConstructionsIconsDisplayMode)) {
          // lifeform construction work is still in progress, so show the icon
          const techName = Translator.translate(elem.technoId, "tech");
          constructionIconsDiv.appendChild(
            createConstructionIcon(
              elem,
              planetId,
              techName,
              "icon_wrench_lf",
              "lfbuildings",
              iconVisibility.shouldAddIconTooltip(lifeformConstructionsIconsDisplayMode),
              iconVisibility.shouldAddIconRedirection(lifeformConstructionsIconsDisplayMode)
            )
          );
        }
      }

      /* PLANET CONSTRUCTION */
      elem = OGBIData.json.productionProgress[planetCoords];
      finishedElem = OGBIData.json.productionProgressFinished[planetCoords];

      /* FINISHED */
      if (finishedElem) {
        // lifeform production work is finished, so we need to update the lifeform
        OGBIData.json.needLifeformUpdate[planet.parentElement.href.match(/=(\d+)/)[1]] = true;
        if (OGBIData.json.options.showProgressIndicators) {
          //if an element is finished, we need to add the finished class, if it doesn't already have it
          if (!planet.parentElement.classList.contains("finished")) planet.parentElement.classList.add("finished");
        }
      } else {
        //if there is no finished element, we need to remove the finished class, if it has it
        if (planet.parentElement.classList.contains("finished")) planet.parentElement.classList.remove("finished");
      }

      /* WORK IN PROGRESS */
      if (elem) {
        //if there is a work in progress element, we need to add an icon
        if (iconVisibility.shouldDisplayIcon(regularConstructionsIconsDisplayMode)) {
          const techName = Translator.translate(elem.technoId, "tech");
          // regular construction work is still in progress, so show the icon
          constructionIconsDiv.appendChild(
            createConstructionIcon(
              elem,
              planetId,
              techName,
              "icon_wrench",
              SUPPLIES_TECHID.includes(Number(elem.technoId))
                ? "supplies"
                : FACILITIES_TECHID.includes(Number(elem.technoId))
                ? "facilities"
                : "overview",
              iconVisibility.shouldAddIconTooltip(regularConstructionsIconsDisplayMode),
              iconVisibility.shouldAddIconRedirection(regularConstructionsIconsDisplayMode)
            )
          );
        }
      }

      //add the construction icons to the planet
      smallplanet.appendChild(constructionIconsDiv);
    });
  };

  if (needLifeformUpdateForResearch) {
    document.querySelectorAll(".planet-koords").forEach((planet) => {
      OGBIData.json.needLifeformUpdate[planet.parentElement.href.match(/=(\d+)/)[1]] = true;
    });
  }

  if (document.querySelector("#productionboxbuildingcomponent")) {
    const coords = context.current.coords;
    const building = document.querySelector("#productionboxbuildingcomponent .queuePic");

    // remove the finished production progress (we are on <coords>, so we don't need it anymore)
    if (context.current.isMoon) {
      delete OGBIData.json.moonProductionProgressFinished[coords];
    } else {
      delete OGBIData.json.productionProgressFinished[coords];
    }

    if (building) {
      const technoId =
        building.getAttribute("alt").split("_")[1] ||
        building.parentElement.getAttribute("onclick").split("(")[1].split(", ")[0];
      const tolvl = document
        .querySelector("#productionboxbuildingcomponent .level")
        .textContent.trim()
        .replace(/[^0-9]/g, "");
      const dateElement = document.querySelector("#productionboxbuildingcomponent .ogl-date");
      if (dateElement) {
        const datestring = dateElement.textContent.trim();
        const date = datestring.split(" - ")[0].split(".");
        const time = datestring.split(" - ")[1].split(":");
        const endDate = new Date(
          2000 + parseInt(date[2]),
          parseInt(date[1]) - 1,
          parseInt(date[0]),
          time[0],
          time[1],
          time[2]
        );
        const elem = {
          technoId: technoId,
          tolvl: tolvl,
          endDate: endDate.toGMTString(),
        };
        if (context.current.isMoon) {
          OGBIData.json.moonProductionProgress[coords] = elem;
        } else {
          OGBIData.json.productionProgress[coords] = elem;
        }
      }
    } else {
      if (context.current.isMoon) {
        delete OGBIData.json.moonProductionProgress[coords];
      } else {
        delete OGBIData.json.productionProgress[coords];
      }
    }
  }

  if (document.querySelector("#productionboxlfbuildingcomponent") && !context.current.isMoon) {
    const coords = context.current.coords;
    const lfbuilding = document.querySelector("#productionboxlfbuildingcomponent .queuePic");

    // remove the finished production progress (we are on <coords>, so we don't need it anymore)
    delete OGBIData.json.lfProductionProgressFinished[coords];

    if (lfbuilding) {
      const technoId = lfbuilding.classList[2].replace("lifeformTech", "");
      const tolvl = document
        .querySelector("#productionboxlfbuildingcomponent .level")
        .textContent.trim()
        .replace(/[^0-9]/g, "");
      const dateElement = document.querySelector("#productionboxlfbuildingcomponent .ogl-date");
      if (dateElement) {
        const datestring = document.querySelector("#productionboxlfbuildingcomponent .ogl-date").textContent.trim();
        const date = datestring.split(" - ")[0].split(".");
        const time = datestring.split(" - ")[1].split(":");
        const endDate = new Date(
          2000 + parseInt(date[2]),
          parseInt(date[1]) - 1,
          parseInt(date[0]),
          time[0],
          time[1],
          time[2]
        );
        OGBIData.json.lfProductionProgress[coords] = {
          technoId: technoId,
          tolvl: tolvl,
          endDate: endDate.toGMTString(),
        };
      }
    } else {
      delete OGBIData.json.lfProductionProgress[coords];
    }
  }

  if (document.querySelector("#productionboxresearchcomponent")) {
    const research = document.querySelector("#productionboxresearchcomponent .queuePic");
    if (research) {
      const technoId =
        research.getAttribute("alt").split("_")[1] ||
        research.parentElement.getAttribute("onclick").split("(")[1].split(", ")[0];
      const tolvl = document
        .querySelector("#productionboxresearchcomponent .level")
        .textContent.trim()
        .replace(/[^0-9]/g, "");
      const coords = document
        .querySelector("#productionboxresearchcomponent .tooltip")
        .getAttribute("onclick")
        .split("[")[1]
        .split("]")[0];
      const dateElement = document.querySelector("#productionboxresearchcomponent .ogl-date");
      if (dateElement) {
        const datestring = document.querySelector("#productionboxresearchcomponent .ogl-date").textContent.trim();
        const date = datestring.split(" - ")[0].split(".");
        const time = datestring.split(" - ")[1].split(":");
        const endDate = new Date(
          2000 + parseInt(date[2]),
          parseInt(date[1]) - 1,
          parseInt(date[0]),
          time[0],
          time[1],
          time[2]
        );
        OGBIData.json.researchProgress = {
          technoId: technoId,
          coords: coords,
          tolvl: tolvl,
          planetId: context.current.id,
          endDate: endDate.toGMTString(),
        };
      }
    } else {
      OGBIData.json.researchProgress = {};
    }
  }

  if (document.querySelector("#productionboxlfresearchcomponent")) {
    const coords = context.current.coords;
    const lfresearch = document.querySelector("#productionboxlfresearchcomponent .queuePic");

    // remove the finished production progress (we are on <coords>, so we don't need it anymore)
    delete OGBIData.json.lfResearchProgress[coords];

    if (lfresearch) {
      const technoId = lfresearch.classList[2].replace("lifeformTech", "");
      const tolvl = document
        .querySelector("#productionboxlfresearchcomponent .level")
        .textContent.trim()
        .replace(/[^0-9]/g, "");
      const dateElement = document.querySelector("#productionboxlfresearchcomponent .ogl-date");
      if (dateElement) {
        const datestring = dateElement.textContent.trim();
        const date = datestring.split(" - ")[0].split(".");
        const time = datestring.split(" - ")[1].split(":");
        const endDate = new Date(
          2000 + parseInt(date[2]),
          parseInt(date[1]) - 1,
          parseInt(date[0]),
          time[0],
          time[1],
          time[2]
        );
        OGBIData.json.lfResearchProgress[coords] = {
          technoId: technoId,
          tolvl: tolvl,
          endDate: endDate.toGMTString(),
        };
      }
    } else {
      delete OGBIData.json.lfResearchProgress[coords];
    }
  }

  updateProgressIndicators();

  OGBIData.Save();
}

export { updateEmpireProduction, ProcessProductionProgressData, updateProductionProgress };
