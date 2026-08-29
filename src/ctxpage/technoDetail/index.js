import * as DOM from "../../ui/dom.js";
import { createDOM } from "../../ui/dom.js";
import { toFormattedNumber, fromFormattedNumber } from "../../format/numbers.js";
import * as wait from "../../platform/wait.js";
import { getLogger } from "../../platform/logger.js";
import Translator from "../../format/i18n/translate.js";
import OGBIData from "../../store/OGBIData.js";
import AllianceClass from "../../game/allianceClass.js";
import PlayerClass from "../../game/playerClass.js";
import shipEnum from "../../game/ship.js";
import * as needsUtil from "../planetbar/needs.js";
import * as time from "../../format/time.js";
import {
  ENGINEER_ENERGY_BONUS,
  IONTECHNOLOGY_BONUS,
  OFFICER_ENERGY_BONUS,
  TRADER_ENERGY_BONUS,
} from "../../game/gameConstants.js";
import {
  building,
  consumption,
  minesProduction,
  research,
  roiAstrophysics,
  roiLfBuilding,
  roiLfResearch,
  roiMine,
  roiPlasmatechnology,
} from "../../game/gameFormulas.js";
import { isBuildPage, isLeveledBuildingPage, isResearchPage } from "../../ogame/pages.js";

const logger = getLogger("technoDetail");

/**
 * The detail panel OGame opens for a building or a technology, with OGI's additions:
 * what the next levels cost, what they produce, and how long each pays for itself.
 *
 * Lifted out of `OGBeyondInfinity` in Phase 3 of refactoring.md. Not in that plan's module
 * table - at 879 lines it was the largest thing left in the class after the eight
 * listed modules had gone, and the plan's own exit criterion cannot be met without it.
 */

function technoDetail(context) {
  // Kept even though `ogCore.js` checks the same list before loading this chunk:
  // the guard is what makes the function safe to call from anywhere, and both
  // sides read `BUILD_PAGES` so they cannot disagree.
  if (isBuildPage(context.page)) {
    let lock;
    let lockListener;
    let currentEnergy = resourcesBar.resources.energy.amount;
    let currentRes = [
      resourcesBar.resources.metal.amount,
      resourcesBar.resources.crystal.amount,
      resourcesBar.resources.deuterium.amount,
    ];
    let technocrat = document.querySelector(".technocrat.on") ? true : false;
    let acceleration = document.querySelector(".acceleration")
      ? document.querySelector(".acceleration").getAttribute("data-value") == 25
      : false;
    let that = this;
    let xhrAbortSignal = null;
    let updateResearchDetails = (technoId, baselvl, tolvl) => {
      let object = context.current.isMoon
        ? OGBIData.json.empire[context.current.index].moon
        : OGBIData.json.empire[context.current.index];
      let durationDiv = document.querySelector(".build_duration");
      let timeDiv = document.querySelector(".build_duration time");
      let timeSumDiv =
        durationDiv.querySelector(".build_duration .ogk-sum") ||
        durationDiv.appendChild(createDOM("time", { class: "ogk-sum" }));
      let resSum = [0, 0, 0, 0];
      let timeSum = 0;
      let techno;
      for (let i = baselvl; i < tolvl; i++) {
        if (isResearchPage(context.page)) {
          techno = research(technoId, i, technocrat, context.playerClass == PlayerClass.EXPLORER, acceleration, object);
        } else if (isLeveledBuildingPage(context.page)) {
          techno = building(technoId, i, object);
        }
        resSum[0] += techno.cost[0];
        resSum[1] += techno.cost[1];
        resSum[2] += techno.cost[2];
        resSum[3] = techno.cost[3];
        timeSum += techno.time;
      }
      if (isResearchPage(context.page)) {
        if ((technoId == 124 || technoId == 122) && baselvl <= tolvl) {
          let roi =
            technoId == 124 ? roiAstrophysics(baselvl, tolvl, context.playerBonuses) : roiPlasmatechnology(tolvl);
          let roiDiv =
            durationDiv.parentNode.querySelector(".roi_duration") ||
            durationDiv.parentNode.insertBefore(
              createDOM("li", { class: "roi_duration" }),
              durationDiv.parentNode.children[1]
            );
          roiDiv.replaceChildren(createDOM("strong", {}, `${Translator.translate(50)}:`));
          let roiTimeDiv =
            roiDiv.querySelector(".roi_duration time") ||
            roiDiv.appendChild(
              createDOM("time", {
                class: "value tooltip",
                "data-title":
                  roi === Infinity
                    ? Translator.translate(118)
                    : `${Translator.translate(119)}: ${toFormattedNumber(
                        OGBIData.json.options.tradeRate[0]
                      )}:${toFormattedNumber(OGBIData.json.options.tradeRate[1])}:${toFormattedNumber(
                        OGBIData.json.options.tradeRate[2]
                      )}`,
              })
            );
          roiTimeDiv.textContent = roi === Infinity ? "∞" : formatTimeWrapper(roi, 2, true, " ", false, "");
        } else if (OGBIData.json.lifeFormProductionBoostFromResearch[technoId]) {
          let roi = roiLfResearch(technoId, baselvl, tolvl, object);
          let roiDiv =
            durationDiv.parentNode.querySelector(".roi_duration") ||
            durationDiv.parentNode.insertBefore(
              createDOM("li", { class: "roi_duration" }),
              durationDiv.parentNode.children[1]
            );
          roiDiv.replaceChildren(createDOM("strong", {}, `${Translator.translate(50)}:`));
          let roiTimeDiv =
            roiDiv.querySelector(".roi_duration time") ||
            roiDiv.appendChild(
              createDOM("time", {
                class: "value tooltip",
                "data-title": `${Translator.translate(119)}: ${toFormattedNumber(
                  OGBIData.json.options.tradeRate[0]
                )}:${toFormattedNumber(OGBIData.json.options.tradeRate[1])}:${toFormattedNumber(
                  OGBIData.json.options.tradeRate[2]
                )}`,
              })
            );
          roiTimeDiv.textContent = formatTimeWrapper(roi, 2, true, " ", false, "");
        } else {
          if (durationDiv.parentNode.querySelector(".roi_duration"))
            durationDiv.parentNode.querySelector(".roi_duration").replaceChildren();
        }
        techno = research(
          technoId,
          tolvl,
          technocrat,
          context.playerClass == PlayerClass.EXPLORER,
          acceleration,
          object
        );
      } else if (isLeveledBuildingPage(context.page)) {
        techno = building(technoId, tolvl, object);
      }
      resSum[0] += techno.cost[0];
      resSum[1] += techno.cost[1];
      resSum[2] += techno.cost[2];
      resSum[3] = techno.cost[3];
      timeSum += techno.time;
      if (context.page == "lfbuildings") {
        if (OGBIData.json.lifeFormProductionBoostFromBuildings[technoId] && baselvl <= tolvl) {
          let roi = roiLfBuilding(technoId, baselvl, tolvl, object);
          let roiDiv =
            durationDiv.parentNode.querySelector(".roi_duration") ||
            durationDiv.parentNode.insertBefore(
              createDOM("li", { class: "roi_duration" }),
              durationDiv.parentNode.children[1]
            );
          roiDiv.replaceChildren(createDOM("strong", {}, `${Translator.translate(50)}:`));
          let roiTimeDiv =
            roiDiv.querySelector(".roi_duration time") ||
            roiDiv.appendChild(
              createDOM("time", {
                class: "value tooltip",
                "data-title": `${Translator.translate(119)}: ${toFormattedNumber(
                  OGBIData.json.options.tradeRate[0]
                )}:${toFormattedNumber(OGBIData.json.options.tradeRate[1])}:${toFormattedNumber(
                  OGBIData.json.options.tradeRate[2]
                )}`,
              })
            );
          roiTimeDiv.textContent = formatTimeWrapper(roi, 2, true, " ", false, "");
        } else if (durationDiv.parentNode.querySelector(".roi_duration")) {
          durationDiv.parentNode.querySelector(".roi_duration").replaceChildren();
        }
        let consDiv = document.querySelector(".additional_energy_consumption span");
        if (consDiv && OGBIData.json.empire[context.current.index]) {
          let temp = OGBIData.json.empire[context.current.index].db_par2 + 40;
          let baseCons = consumption(technoId, baselvl - 1);
          let currentCons = consumption(technoId, tolvl);
          let diff = currentEnergy - (currentCons - baseCons);
          consDiv.replaceChildren(
            createDOM("span", {}, `${toFormattedNumber(currentCons - baseCons)}`).appendChild(
              createDOM("span", { class: `${diff < 0 ? "overmark" : "undermark"}` }, ` (${toFormattedNumber(diff)})`)
            ).parentElement
          );
          if (diff < 0) {
            let energyBonus =
              (context.engineer ? ENGINEER_ENERGY_BONUS : 0) +
              (context.playerClass == PlayerClass.MINER ? OGBIData.json.minerBonusEnergy : 0) +
              (context.allOfficers ? OFFICER_ENERGY_BONUS : 0) +
              (OGBIData.json.allianceClass == AllianceClass.MINER ? TRADER_ENERGY_BONUS : 0) +
              (OGBIData.json.lifeformBonus.productionBonus?.[3] || 0) +
              (OGBIData.json.lifeformPlanetBonus[context.current.id]?.productionBonus[3] || 0);
            let satsNeeded = Math.ceil(-diff / (1 + energyBonus) / Math.floor((temp + 140) / 6));
            let link =
              "https://" +
              window.location.host +
              window.location.pathname +
              `?page=ingame&component=supplies&cp=${context.current.id}&techId212=${satsNeeded}`;
            let satsSpan = createDOM("span");
            satsSpan.replaceChildren(
              createDOM("a", { href: `${link}`, "tech-id": "212", class: "ogl-option ogl-solar-satellite" }),
              createDOM("span", {}, `+${toFormattedNumber(satsNeeded)}`)
            );
            consDiv.appendChild(satsSpan);
          }
        }
      }
      if (context.page == "supplies") {
        let consDiv = document.querySelector(".additional_energy_consumption span");
        let prodDiv =
          (document.querySelector(".narrow") && document.querySelector(".ogk-production")) ||
          document.querySelector(".narrow").appendChild(createDOM("li", { class: "ogk-production" }));
        let energyDiv = document.querySelector(".energy_production span");
        if (consDiv && OGBIData.json.empire[context.current.index]) {
          let temp = OGBIData.json.empire[context.current.index].db_par2 + 40;
          let pos = context.current.coords.split(":")[2];
          let currentProd = minesProduction(technoId, baselvl - 1, pos, temp);
          let baseProd = minesProduction(technoId, tolvl, pos, temp);
          let baseCons = consumption(technoId, baselvl - 1);
          let currentCons = consumption(technoId, tolvl);
          let diff = currentEnergy - (currentCons - baseCons);
          consDiv.replaceChildren(
            createDOM("span", {}, `${toFormattedNumber(currentCons - baseCons)}`).appendChild(
              createDOM("span", { class: `${diff < 0 ? "overmark" : "undermark"}` }, ` (${toFormattedNumber(diff)})`)
            ).parentElement
          );

          if (diff < 0) {
            let energyBonus =
              (context.engineer ? ENGINEER_ENERGY_BONUS : 0) +
              (context.playerClass == PlayerClass.MINER ? OGBIData.json.minerBonusEnergy : 0) +
              (context.allOfficers ? OFFICER_ENERGY_BONUS : 0) +
              (OGBIData.json.allianceClass == AllianceClass.MINER ? TRADER_ENERGY_BONUS : 0) +
              (OGBIData.json.lifeformBonus.productionBonus?.[3] || 0) +
              (OGBIData.json.lifeformPlanetBonus[context.current.id]?.productionBonus[3] || 0);
            let satsNeeded = Math.ceil(Math.floor(-diff / (1 + energyBonus)) / Math.floor((temp + 140) / 6));
            let satsSpan = createDOM("span");
            satsSpan.replaceChildren(
              createDOM("a", { "tech-id": "212", class: "ogl-option ogl-solar-satellite" }),
              createDOM("span", {}, `+${toFormattedNumber(satsNeeded)}`)
            );
            consDiv.appendChild(satsSpan);
            satsSpan.addEventListener("click", () => {
              document.querySelector(".solarSatellite.hasDetails span").click();
              wait
                .waitForQuerySelector("#technologydetails[data-technology-id='212']", 10, 2000)
                .then(() => {
                  let satsInput = document.querySelector("#build_amount");
                  satsInput.value = satsNeeded;
                  satsInput.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown" }));
                })
                .catch(() => logger.warn("solar satellite panel did not open in time"));
            });
          }
          prodDiv.html(
            `<strong>${Translator.translate(85)}:</strong><span class="value">${toFormattedNumber(
              parseInt(baseProd)
            )} <span class="bonus ${parseInt(baseProd - currentProd) < 0 ? "overmark" : "undermark"}"> (${
              parseInt(baseProd - currentProd) < 0 ? "" : "+"
            }${toFormattedNumber(parseInt(baseProd - currentProd))})</span></span>`
          );
        }
        if (energyDiv && OGBIData.json.empire[context.current.index]) {
          let temp = OGBIData.json.empire[context.current.index].db_par2 + 40;
          let pos = context.current.coords.split(":")[2];
          let currentProd = minesProduction(technoId, baselvl - 1, pos, temp);
          let baseProd = minesProduction(technoId, tolvl, pos, temp);
          energyDiv.replaceChildren(
            createDOM("span", { class: "value" }, `${toFormattedNumber(parseInt(baseProd))} `).appendChild(
              createDOM(
                "span",
                { class: `bonus ${parseInt(baseProd - currentProd) < 0 ? "overmark" : "undermark"}` },
                ` (${parseInt(baseProd - currentProd) < 0 ? "" : "+"}${toFormattedNumber(
                  parseInt(baseProd - currentProd)
                )})`
              )
            ).parentElement
          );
        }
        if ([22, 23, 24].includes(technoId)) {
          let production =
            technoId == 22
              ? resourcesBar.resources.metal.production
              : technoId == 23
              ? resourcesBar.resources.crystal.production
              : resourcesBar.resources.deuterium.production;
          let storageDiv =
            durationDiv.parentNode.querySelector(".narrow .storage_size") ||
            durationDiv.parentNode.insertBefore(
              createDOM("li", { class: "storage_size" }),
              durationDiv.parentNode.children[1]
            );
          let oldStorage = 5000 * Math.floor(2.5 * Math.exp((20 / 33) * (baselvl - 1)));
          let newStorage = 5000 * Math.floor(2.5 * Math.exp((20 / 33) * tolvl));
          storageDiv.replaceChildren(createDOM("strong", {}, `${Translator.translate(131)}:`));
          let storageSizeDiv =
            storageDiv.querySelector(".storage_size size") ||
            storageDiv.appendChild(
              createDOM("size", {
                class: "value tooltip",
                "data-title": `${Translator.translate(132)}: ${formatTimeWrapper(
                  newStorage / production,
                  2,
                  true,
                  " ",
                  false,
                  ""
                )}`,
              })
            );
          storageSizeDiv.replaceChildren(
            createDOM("span", { class: "value" }, `${toFormattedNumber(newStorage)} `).appendChild(
              createDOM(
                "span",
                { class: `bonus ${newStorage - oldStorage < 0 ? "overmark" : "undermark"}` },
                ` (${newStorage - oldStorage < 0 ? "" : "+"}${toFormattedNumber(newStorage - oldStorage)})`
              )
            ).parentElement
          );
        }
        if (technoId <= 3) {
          let roiDiv =
            durationDiv.parentNode.querySelector(".narrow .roi_duration") ||
            durationDiv.parentNode.insertBefore(
              createDOM("li", { class: "roi_duration" }),
              durationDiv.parentNode.children[1]
            );

          if (baselvl <= tolvl) {
            let roi = roiMine(technoId, tolvl, OGBIData.json.empire[context.current.index], context.playerBonuses);
            roiDiv.replaceChildren(createDOM("strong", {}, `${Translator.translate(50)}:`));
            let roiTimeDiv =
              roiDiv.querySelector(".roi_duration time") ||
              roiDiv.appendChild(
                createDOM("time", {
                  class: "value tooltip",
                  "data-title": `${Translator.translate(119)}: ${toFormattedNumber(
                    OGBIData.json.options.tradeRate[0]
                  )}:${toFormattedNumber(OGBIData.json.options.tradeRate[1])}:${toFormattedNumber(
                    OGBIData.json.options.tradeRate[2]
                  )}`,
                })
              );

            roiTimeDiv.textContent = formatTimeWrapper(roi, 2, true, " ", false, "");
          } else {
            roiDiv.replaceChildren();
          }
        }
      }
      timeDiv.textContent = formatTimeWrapper(techno.time, 2, true, " ", false, "");
      let currentDate = new Date();
      let timeZoneChange = OGBIData.json.options.timeZone ? 0 : OGBIData.json.timezoneDiff;
      let finishDate = new Date(currentDate.getTime() + (techno.time - timeZoneChange) * 1e3);
      if (baselvl <= tolvl) {
        const dateTxt = getFormatedDate(finishDate.getTime(), "[d].[m] - [G]:[i]:[s]");
        timeDiv.appendChild(createDOM("div", { class: "ogl-date" }, dateTxt));
      }
      if (baselvl < tolvl) {
        timeSumDiv.textContent = formatTimeWrapper(timeSum, 2, true, " ", false, "");
        finishDate = new Date(currentDate.getTime() + (timeSum - timeZoneChange) * 1e3);
        const dateTxt = getFormatedDate(finishDate.getTime(), "[d].[m] - [G]:[i]:[s]");
        timeSumDiv.appendChild(createDOM("div", { class: "ogl-date" }, dateTxt));
      } else {
        timeSumDiv.replaceChildren();
      }
      let missing = [];
      let demolish = [];
      if (baselvl - 1 > tolvl) {
        demolish = techno.cost.map((x) => Math.floor(x * (1 - IONTECHNOLOGY_BONUS * OGBIData.json.technology[121])));
      }
      if (techno.cost[0] != 0) {
        let metal = document.querySelector(".costs .metal");
        metal.textContent = tolvl != 0 ? toFormattedNumber(techno.cost[0], null, true) : "";
        if (tolvl != 0) metal.setAttribute("data-title", toFormattedNumber(parseInt(techno.cost[0])));
        if (baselvl != tolvl && baselvl - 1 != tolvl && !(baselvl > tolvl && isResearchPage(context.page))) {
          metal.appendChild(
            createDOM(
              "li",
              {
                class: "ogk-sum tooltip",
                "data-title": toFormattedNumber(parseInt(baselvl - 1 > tolvl ? demolish[0] : resSum[0])),
              },
              toFormattedNumber(baselvl - 1 > tolvl ? demolish[0] : resSum[0], null, true)
            )
          );
        }
        missing[0] = Math.min(0, currentRes[0] - (baselvl - 1 > tolvl ? demolish[0] : resSum[0]));
        if (baselvl - 1 != tolvl && !(baselvl > tolvl && isResearchPage(context.page)))
          metal.appendChild(
            createDOM(
              "li",
              {
                class: missing[0] != 0 ? "overmark tooltip" : "tooltip",
                "data-title": toFormattedNumber(parseInt(missing[0])),
              },
              toFormattedNumber(missing[0], null, true)
            )
          );
      }
      if (techno.cost[1] != 0) {
        let crystal = document.querySelector(".costs .crystal");
        crystal.textContent = tolvl != 0 ? toFormattedNumber(techno.cost[1], null, true) : "";
        if (tolvl != 0) crystal.setAttribute("data-title", toFormattedNumber(parseInt(techno.cost[1])));
        if (baselvl != tolvl && baselvl - 1 != tolvl && !(baselvl > tolvl && isResearchPage(context.page))) {
          crystal.appendChild(
            createDOM(
              "li",
              {
                class: "ogk-sum tooltip",
                "data-title": toFormattedNumber(parseInt(baselvl - 1 > tolvl ? demolish[1] : resSum[1])),
              },
              toFormattedNumber(baselvl - 1 > tolvl ? demolish[1] : resSum[1], null, true)
            )
          );
        }
        missing[1] = Math.min(0, currentRes[1] - (baselvl - 1 > tolvl ? demolish[1] : resSum[1]));
        if (baselvl - 1 != tolvl && !(baselvl > tolvl && isResearchPage(context.page)))
          crystal.appendChild(
            createDOM(
              "li",
              {
                class: missing[1] != 0 ? "overmark tooltip" : "tooltip",
                "data-title": toFormattedNumber(parseInt(missing[1])),
              },
              toFormattedNumber(missing[1], null, true)
            )
          );
      }
      if (techno.cost[2] != 0) {
        let deuterium = document.querySelector(".costs .deuterium");
        deuterium.textContent = tolvl != 0 ? toFormattedNumber(techno.cost[2], null, true) : "";
        if (tolvl != 0) deuterium.setAttribute("data-title", toFormattedNumber(parseInt(techno.cost[2])));
        if (baselvl != tolvl && baselvl - 1 != tolvl && !(baselvl > tolvl && isResearchPage(context.page))) {
          deuterium.appendChild(
            createDOM(
              "li",
              {
                class: "ogk-sum tooltip",
                "data-title": toFormattedNumber(parseInt(baselvl - 1 > tolvl ? demolish[2] : resSum[2])),
              },
              toFormattedNumber(baselvl - 1 > tolvl ? demolish[2] : resSum[2], null, true)
            )
          );
        }
        missing[2] = Math.min(0, currentRes[2] - (baselvl - 1 > tolvl ? demolish[2] : resSum[2]));
        if (baselvl - 1 != tolvl && !(baselvl > tolvl && isResearchPage(context.page)))
          deuterium.appendChild(
            createDOM(
              "li",
              {
                class: missing[2] != 0 ? "overmark tooltip" : "tooltip",
                "data-title": toFormattedNumber(parseInt(missing[2])),
              },
              toFormattedNumber(missing[2], null, true)
            )
          );
      }
      if (techno.cost[3] != 0) {
        let energy = document.querySelector(".costs .energy");
        if (energy) {
          energy.textContent = tolvl != 0 ? toFormattedNumber(techno.cost[3], null, true) : "";
          if (tolvl != 0) energy.setAttribute("data-title", toFormattedNumber(parseInt(techno.cost[3])));
          if (baselvl != tolvl && baselvl - 1 != tolvl && !(baselvl > tolvl && isResearchPage(context.page))) {
            energy.appendChild(
              createDOM(
                "li",
                {
                  class: "ogk-sum tooltip",
                  "data-title": toFormattedNumber(parseInt(baselvl - 1 > tolvl ? demolish[3] : resSum[3])),
                },
                toFormattedNumber(baselvl - 1 > tolvl ? demolish[3] : resSum[3], null, true)
              )
            );
          }
          let tooltip =
            document.querySelector("#energy_box").getAttribute("title") ||
            document.querySelector("#energy_box").getAttribute("data-title") ||
            document.querySelector("#energy_box").getAttribute("data-tooltip-title");
          let div = createDOM("div");
          div.html(tooltip);
          let prod = div.querySelectorAll("span")[1].textContent.substring(1);
          missing[3] = Math.min(0, fromFormattedNumber(prod, true) - (baselvl - 1 > tolvl ? demolish[3] : resSum[3]));
          if (baselvl - 1 != tolvl && !(baselvl > tolvl && isResearchPage(context.page)))
            energy.appendChild(
              createDOM(
                "li",
                {
                  class: missing[3] != 0 ? "overmark tooltip" : "tooltip",
                  "data-title": toFormattedNumber(parseInt(missing[3])),
                },
                toFormattedNumber(missing[3], null, true)
              )
            );
          if (missing[3] < 0 && baselvl == tolvl && OGBIData.json.empire[context.current.index]) {
            let energyBonus =
              (context.engineer ? ENGINEER_ENERGY_BONUS : 0) +
              (context.playerClass == PlayerClass.MINER ? OGBIData.json.minerBonusEnergy : 0) +
              (context.allOfficers ? OFFICER_ENERGY_BONUS : 0) +
              (OGBIData.json.allianceClass == AllianceClass.MINER ? TRADER_ENERGY_BONUS : 0) +
              (OGBIData.json.lifeformBonus.productionBonus?.[3] || 0) +
              (OGBIData.json.lifeformPlanetBonus[context.current.id]?.productionBonus[3] || 0);
            let temp = OGBIData.json.empire[context.current.index].db_par2 + 40;
            let satsNeeded = Math.ceil(-missing[3] / (1 + energyBonus) / Math.floor((temp + 140) / 6));
            let link =
              "https://" +
              window.location.host +
              window.location.pathname +
              `?page=ingame&component=supplies&cp=${context.current.id}&techId212=${satsNeeded}`;
            let satsSpan = createDOM("span");
            satsSpan.replaceChildren(
              createDOM("a", { href: `${link}`, "tech-id": "212", class: "ogl-option ogl-solar-satellite" }),
              createDOM("span", {}, `+${toFormattedNumber(satsNeeded)}`)
            );
            energy.appendChild(satsSpan);
          }
        }
      }
      if (techno.pop && techno.pop != 0) {
        let population = document.querySelector(".costs .population");
        population.textContent = tolvl != 0 ? toFormattedNumber(techno.pop, null, true) : "";
        if (tolvl != 0) population.setAttribute("data-title", toFormattedNumber(parseInt(techno.pop)));
        let missingPop = Math.min(0, resourcesBar.resources.population.amount - techno.pop);
        if (baselvl != tolvl && baselvl - 1 != tolvl && !(baselvl > tolvl && isResearchPage(context.page))) {
          population.appendChild(
            createDOM(
              "li",
              {
                class: "ogk-sum tooltip",
                "data-title": toFormattedNumber(parseInt(techno.pop)),
              },
              toFormattedNumber(techno.pop, null, true)
            )
          );
        }
        if (baselvl - 1 != tolvl && !(baselvl > tolvl && isResearchPage(context.page)))
          population.appendChild(
            createDOM(
              "li",
              {
                class: missingPop != 0 ? "overmark tooltip" : "tooltip",
                "data-title": toFormattedNumber(parseInt(missingPop)),
              },
              toFormattedNumber(missingPop, null, true)
            )
          );
      }
      if (baselvl - 1 == tolvl || (baselvl > tolvl && isResearchPage(context.page))) {
        document.querySelector(".ogk-titles").children[2].replaceChildren();
      } else {
        document.querySelector(".ogk-titles").children[2].textContent = Translator.translate(39);
      }
      lockListener = () => {
        needsUtil.lock(context.current.coords, context.current.isMoon, {
          metal: resSum[0],
          crystal: resSum[1],
          deuterium: resSum[2],
        });
      };
    };
    technologyDetails.show = function (technologyId) {
      if (xhrAbortSignal) {
        xhrAbortSignal.abort();
      }
      let element = $(".technology.hasDetails[data-technology=" + technologyId + "]");
      let elemTechnologyDetailsWrapper = $("#technologydetails_wrapper");
      let elemTechnologyDetailsContent = $("#technologydetails_content");
      let elemTechnologyDetails = $("#technologydetails");
      elemTechnologyDetailsWrapper.toggleClass("slide-up", true);
      elemTechnologyDetailsWrapper.toggleClass("slide-down", false);
      let locationIndicator = elemTechnologyDetailsContent.ogameLoadingIndicator();
      locationIndicator.show();
      xhrAbortSignal = $.ajax({
        // `this` here is OGame`s own `technologyDetails` object, not the page
        // controller - this function is assigned onto it two lines above. The
        // endpoint is its property and must not be read off any OGI context.
        url: this.technologyDetailsEndpoint,
        data: { technology: technologyId },
      }).done(function (data) {
        let json = $.parseJSON(data);
        $(".showsDetails").removeClass("showsDetails");
        element.closest(".hasDetails").addClass("showsDetails");
        locationIndicator.hide();
        let anchor = $("header[data-anchor=technologyDetails]");
        if (elemTechnologyDetails.length > 0) {
          removeTooltip(elemTechnologyDetails.find(getTooltipSelector()));
          elemTechnologyDetails.replaceWith(json.content[json.target]);
          elemTechnologyDetails.addClass(anchor.data("technologydetails-size")).offset(anchor.offset());
        } else {
          elemTechnologyDetailsContent.append(json.content[json.target]);
          elemTechnologyDetails.addClass(anchor.data("technologydetails-size")).offset(anchor.offset());
        }
        localStorage.setItem("detailsOpen", true);
        $(document).trigger("ajaxShowElement", typeof technologyId === "undefined" ? 0 : technologyId);
        let costDiv = document.querySelector(".costs");
        let titleDiv = costDiv.appendChild(createDOM("div", { class: "ogk-titles" }));
        let tree = document.querySelector(".technology_tree");
        let clone = tree.cloneNode(true);
        tree.style.display = "none";
        clone.replaceChildren();
        document.querySelector(".description").appendChild(clone);
        let timeDiv = document.querySelector(".build_duration time");
        let baseTime = time.getTimeFromISOString(timeDiv.getAttribute("datetime"));
        if ([...Object.values(shipEnum), 401, 402, 403, 404, 405, 406, 407, 408, 502, 503].includes(technologyId)) {
          let energyDiv;
          let base;
          if (technologyId == shipEnum.Crawler) {
            energyDiv = document.querySelector(".additional_energy_consumption span");
            base =
              energyDiv.getAttribute("data-value") * (1 - OGBIData.json.lifeformBonus.crawlerBonus?.consumption || 1);
          } else if (technologyId == shipEnum.SolarSatellite) {
            energyDiv = document.querySelector(".energy_production span");
            base = energyDiv.querySelector("span").getAttribute("data-value");
          }
          titleDiv.appendChild(DOM.createDOMSanitized("div", {}, "&#8205;"));
          titleDiv.appendChild(createDOM("div", {}, Translator.translate(40)));
          titleDiv.appendChild(createDOM("div", {}, Translator.translate(39)));
          let resDivs = [
            costDiv.querySelector(".metal"),
            costDiv.querySelector(".crystal"),
            costDiv.querySelector(".deuterium"),
          ];
          let baseCost = [
            resDivs[0] ? resDivs[0].getAttribute("data-value") : 0,
            resDivs[1] ? resDivs[1].getAttribute("data-value") : 0,
            resDivs[2] ? resDivs[2].getAttribute("data-value") : 0,
          ];
          let infoDiv = document
            .querySelector("#technologydetails .sprite_large")
            .appendChild(createDOM("div", { class: "ogk-tech-controls" }));
          lock = infoDiv.appendChild(createDOM("a", { class: "icon icon_lock" }));
          lock.addEventListener("click", () => {
            lockListener();
          });
          let helpNode = document.querySelector(".txt_box .details").cloneNode(true);
          infoDiv.appendChild(helpNode);
          let input = document.querySelector(".build_amount input");
          let updateShipDetails = (value) => {
            let missing = [];
            let resSum = [];
            resDivs.forEach((div, index) => {
              if (!div) return;
              resSum[index] = value * baseCost[index];
              let min = Math.min(0, currentRes[index] - resSum[index]);
              missing[index] = min;
              div.textContent = toFormattedNumber(baseCost[index], null, true);
              div.appendChild(
                createDOM(
                  "div",
                  {
                    class: "ogk-sum tooltip",
                    "data-title": toFormattedNumber(resSum[index], 0),
                  },
                  toFormattedNumber(resSum[index], null, true)
                )
              );
              div.appendChild(
                createDOM(
                  "div",
                  {
                    class: min != 0 ? "overmark tooltip" : "tooltip",
                    "data-title": toFormattedNumber(min, 0),
                  },
                  toFormattedNumber(min, null, true)
                )
              );
            });
            timeDiv.textContent = formatTimeWrapper(baseTime * value, 2, true, " ", false, "");
            let currentDate = new Date();
            let timeZoneChange = OGBIData.json.options.timeZone ? 0 : OGBIData.json.timezoneDiff;
            let finishDate = new Date(currentDate.getTime() + (baseTime * value - timeZoneChange) * 1e3);
            const dateTxt = getFormatedDate(finishDate.getTime(), "[d].[m] - [G]:[i]:[s]");
            timeDiv.appendChild(createDOM("div", { class: "ogl-date" }, dateTxt));
            if (technologyId == shipEnum.SolarSatellite) {
              let energyBonus =
                (context.engineer ? ENGINEER_ENERGY_BONUS : 0) +
                (context.playerClass == PlayerClass.MINER ? OGBIData.json.minerBonusEnergy : 0) +
                (context.allOfficers ? OFFICER_ENERGY_BONUS : 0) +
                (OGBIData.json.allianceClass == AllianceClass.MINER ? TRADER_ENERGY_BONUS : 0) +
                (OGBIData.json.lifeformBonus.productionBonus?.[3] || 0) +
                (OGBIData.json.lifeformPlanetBonus[context.current.id]?.productionBonus[3] || 0);
              let diff = Number(currentEnergy) + Math.round(value * base);
              energyDiv.replaceChildren(
                document.createTextNode(`${toFormattedNumber(value * base)}`),
                createDOM("span", { class: `${diff < 0 ? "overmark" : "undermark"}` }, ` (${toFormattedNumber(diff)})`)
              );
              if (Number(currentEnergy) < 0 && OGBIData.json.empire[context.current.index]) {
                let temp = OGBIData.json.empire[context.current.index].db_par2 + 40;
                let satsNeeded = Math.ceil(-Number(currentEnergy) / (1 + energyBonus) / Math.floor((temp + 140) / 6));
                let satsSpan = createDOM("span");
                satsSpan.replaceChildren(
                  createDOM("a", { "tech-id": "212", class: "ogl-option ogl-solar-satellite" }),
                  createDOM("span", {}, `+${toFormattedNumber(satsNeeded)}`)
                );
                energyDiv.appendChild(satsSpan);
                satsSpan.addEventListener("click", () => {
                  let satsInput = document.querySelector("#build_amount");
                  satsInput.focus();
                  satsInput.value = satsNeeded;
                  satsInput.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown" }));
                });
              }
            } else if (technologyId == shipEnum.Crawler) {
              let diff = Number(currentEnergy) - value * base;
              energyDiv.replaceChildren(
                document.createTextNode(`${toFormattedNumber(value * base)}`),
                createDOM("span", { class: `${diff < 0 ? "overmark" : "undermark"}` }, ` (${toFormattedNumber(diff)})`)
              );
              if (diff < 0) {
                let energyBonus =
                  (context.engineer ? ENGINEER_ENERGY_BONUS : 0) +
                  (context.playerClass == PlayerClass.MINER ? OGBIData.json.minerBonusEnergy : 0) +
                  (context.allOfficers ? OFFICER_ENERGY_BONUS : 0) +
                  (OGBIData.json.allianceClass == AllianceClass.MINER ? TRADER_ENERGY_BONUS : 0) +
                  (OGBIData.json.lifeformBonus.productionBonus?.[3] || 0) +
                  (OGBIData.json.lifeformPlanetBonus[context.current.id]?.productionBonus[3] || 0);
                let temp = OGBIData.json.empire[context.current.index].db_par2 + 40;
                let satsNeeded = Math.ceil(-diff / (1 + energyBonus) / Math.floor((temp + 140) / 6));
                let satsSpan = createDOM("span");
                satsSpan.replaceChildren(
                  createDOM("a", { "tech-id": "212", class: "ogl-option ogl-solar-satellite" }),
                  createDOM("span", {}, `+${toFormattedNumber(satsNeeded)}`)
                );
                energyDiv.appendChild(satsSpan);
                satsSpan.addEventListener("click", () => {
                  document.querySelector(".solarSatellite.hasDetails span").click();
                  wait
                    .waitForQuerySelector("#technologydetails[data-technology-id='212']")
                    .then(() => {
                      let satsInput = document.querySelector("#build_amount");
                      satsInput.focus();
                      satsInput.value = satsNeeded;
                      satsInput.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown" }));
                    })
                    .catch(() => logger.warn("solar satellite panel did not open in time"));
                });
              }
            }
            lockListener = () => {
              needsUtil.lock(context.current.coords, context.current.isMoon, {
                metal: resSum[0],
                crystal: resSum[1],
                deuterium: resSum[2],
              });
            };
          };
          if (input) {
            let oldValue;

            input.onkeydown = () => {
              oldValue = input.value;
            };

            if (!context.isMobile) {
              input.onkeyup = (event) => {
                if (event.key.toUpperCase() == "K") input.value = Math.max(oldValue, 1) * 1e3;
                let value = 1;
                if (input.value <= 0 || isNaN(Number(input.value))) {
                  input.value = "";
                } else {
                  value = input.value;
                }
                updateShipDetails(value);
              };
            } else {
              input.oninput = (event) => {
                if (event.data.includes("k")) input.value = Math.max(oldValue, 1) * 1e3;
                let value = 1;
                if (input.value <= 0 || isNaN(Number(input.value))) {
                  input.value = "";
                } else {
                  value = input.value;
                }
                updateShipDetails(value);
              };
            }
          }
          updateShipDetails(1);
          document.querySelector(".maximum") &&
            document.querySelector(".maximum").addEventListener("click", () => {
              updateShipDetails(Number(input.getAttribute("max")));
            });
        } else {
          let infoDiv = (
            document.querySelector("#technologydetails .sprite") ||
            document.querySelector("#technologydetails .lifeformsprite")
          ).appendChild(createDOM("div", { class: "ogk-tech-controls" }));
          let baseLvl = Number(document.querySelector(".level").getAttribute("data-value"));
          let tolvl = baseLvl;
          let lvl = titleDiv.appendChild(
            createDOM("div")
              .appendChild(document.createTextNode("Lvl "))
              .parentElement.appendChild(createDOM("strong", {}, `${toFormattedNumber(baseLvl)}`)).parentElement
          );
          let lvlFromTo = titleDiv.appendChild(createDOM("div"));
          titleDiv.appendChild(createDOM("div", {}, Translator.translate(39)));
          let helpNode = document.querySelector(".txt_box .details").cloneNode(true);
          lock = infoDiv.appendChild(createDOM("a", { class: "icon icon_lock" }));
          lock.addEventListener("click", () => {
            lockListener();
          });
          let timeDiv = document.querySelector(".build_duration time");
          let initTime = time.getTimeFromISOString(timeDiv.getAttribute("datetime"));
          let metalCost = document.querySelector(".costs .metal")
            ? parseInt(document.querySelector(".costs .metal").getAttribute("data-value"))
            : 0;
          let crystalCost = document.querySelector(".costs .crystal")
            ? parseInt(document.querySelector(".costs .crystal").getAttribute("data-value"))
            : 0;
          let deuteriumCost = document.querySelector(".costs .deuterium")
            ? parseInt(document.querySelector(".costs .deuterium").getAttribute("data-value"))
            : 0;
          let baseTechno;
          let object = context.current.isMoon
            ? OGBIData.json.empire[context.current.index].moon
            : OGBIData.json.empire[context.current.index];
          if (isResearchPage(context.page)) {
            baseTechno = research(
              technologyId,
              baseLvl,
              technocrat,
              context.playerClass == PlayerClass.EXPLORER,
              acceleration,
              object
            );
          } else if (
            // `supplies` alone waits for the planet's empire entry: it is the only
            // one of the three whose panel is drawn before the empire data lands.
            isLeveledBuildingPage(context.page) &&
            (context.page != "supplies" || OGBIData.json.empire[context.current.index])
          ) {
            baseTechno = building(technologyId, baseLvl, object);
          }
          if (
            Math.abs((baseTechno.cost[0] - metalCost) / metalCost) > 0.001 ||
            Math.abs((baseTechno.cost[1] - crystalCost) / crystalCost) > 0.001 ||
            Math.abs((baseTechno.cost[2] - deuteriumCost) / deuteriumCost) > 0.001
          )
            document
              .querySelector(".costs")
              .appendChild(createDOM("div", { class: "overmark" }, "resources not correct, try to update LF bonus"));

          updateResearchDetails(technologyId, baseLvl, tolvl);
          let previous = infoDiv.appendChild(createDOM("a", { class: "icon icon_skip_back" }));
          let lvlSpan = infoDiv.appendChild(createDOM("span", { class: "ogk-lvl" }, toFormattedNumber(tolvl)));
          let next = infoDiv.appendChild(createDOM("a", { class: "icon icon_skip" }));
          let textLvl = document.querySelector(".costs p");
          next.addEventListener("click", () => {
            tolvl += 1;
            updateResearchDetails(technologyId, baseLvl, tolvl);
            lvlSpan.textContent = toFormattedNumber(tolvl);
            textLvl.textContent = textLvl.textContent.replace(tolvl - 1, tolvl);
            lvl.replaceChildren(
              document.createTextNode("Lvl "),
              createDOM("strong", {}, `${toFormattedNumber(tolvl)}`)
            );
            lvlFromTo.replaceChildren(
              createDOM("strong", {}, `${toFormattedNumber(baseLvl)}`),
              document.createTextNode("-"),
              createDOM("strong", {}, `${toFormattedNumber(tolvl)}`)
            );
            if (tolvl <= baseLvl) {
              lvlFromTo.replaceChildren();
            }
            if (tolvl < baseLvl - 1 && context.page != "research" && context.page != "lfresearch") {
              lvlFromTo.textContent = Translator.translate(129);
            }
          });
          previous.addEventListener("click", () => {
            if (isResearchPage(context.page) && tolvl == 1) return;
            if (tolvl == 0) return;
            tolvl -= 1;
            updateResearchDetails(technologyId, baseLvl, tolvl);
            lvlSpan.textContent = toFormattedNumber(tolvl);
            tolvl != 0
              ? lvl.replaceChildren(
                  document.createTextNode("Lvl "),
                  createDOM("strong", {}, `${toFormattedNumber(tolvl)}`)
                )
              : lvl.replaceChildren();
            lvlFromTo.replaceChildren(
              createDOM("strong", {}, `${toFormattedNumber(baseLvl)}`),
              document.createTextNode("-"),
              createDOM("strong", {}, `${toFormattedNumber(tolvl)}`)
            );
            if (tolvl <= baseLvl) {
              lvlFromTo.replaceChildren();
            }
            if (tolvl < baseLvl - 1 && context.page != "research" && context.page != "lfresearch") {
              lvlFromTo.textContent = Translator.translate(129);
            }
          });
          infoDiv.appendChild(helpNode);
        }
        xhrAbortSignal = null;
      });
    };
  }
}

export { technoDetail };
