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
// Re-exported so ogkush.js keeps one import path per page, and so the split parts
// stay reachable from the module graph.
export { updateLifeform } from "./lifeform.js";
export { ProcessProductionProgressData, updateProductionProgress } from "./production.js";
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

import { updateEmpireProduction, updateProductionProgress } from "./production.js";
import { updateLifeformPlanetBonus } from "./lifeform.js";

/**
 * Reading the empire: the background fetch of the standalone empire page and the
 * refresh throttle around it.
 *
 * Lifted out of `OGInfinity` in Phase 3 of refactoring.md, then split. This file keeps
 * the fetch itself and the throttle that decides whether it happens at all; the
 * derived production numbers and the lifeform bonuses have files of their own.
 *
 * Compliance (AGENTS.md 4): every fetch in this directory is a background call and
 * therefore produces galaxy-view activity. `empireRefreshDue()` below is the ONLY copy
 * of the rule that decides whether a page load refreshes, and the document_start
 * prefetch shares it - a second copy would drift and double the call count.
 */
function empireRefreshDue(json, mode, force = false) {
  const timeSinceLastUpdate = new Date() - new Date(json?.lastEmpireUpdate);
  return !!(
    force ||
    isNaN(new Date(json?.lastEmpireUpdate)) ||
    (mode == ogiMode.DEFAULT &&
      ((timeSinceLastUpdate > 5 * 60 * 1e3 && json.needsUpdate) ||
        (timeSinceLastUpdate > 1 * 60 * 1e3 && !json.options?.lessAggressiveEmpireAutomaticUpdate)))
  );
}

function startEmpirePrefetch(rawURL) {
  if (empirePrefetch) return;
  const mode = rawURL.searchParams.get("oglMode") || ogiMode.DEFAULT;
  // Only the moon half of the refresh needs the DOM, and that half stays in
  // getEmpireInfo(). The planets page is the one carrying every planet's
  // resources, i.e. the numbers the user sees arrive late.
  if (!empireRefreshDue(OGIData.json, mode)) return;
  empirePrefetch = empireRequest(EMPIRE_PLANETS_PARAMS);
  // Nothing awaits it yet; without this the rejection of an aborted page load
  // surfaces as an unhandled one.
  empirePrefetch.catch(() => {});
}

function takeEmpirePrefetch() {
  const pending = empirePrefetch;
  empirePrefetch = null;
  return pending;
}

async function updateEmpireData(context, force = false) {
  if (empireRefreshDue(OGIData.json, context.mode, force)) {
    await updateInfo(context);
  }
  let stageForUpdate = () => {
    OGIData.json.needsUpdate = true;
    OGIData.Save();
  };
  // One delegated listener instead of a 100ms querySelectorAll poll that ran for the whole
  // session and, after its first pass, had nothing left to do. See util/stageForUpdate.js.
  watchForEmpireChanges(stageForUpdate);

  /*
   * When browser is closed, all scheduled notifications are cleared
   * => So we need to re-schedule the notification
   * => close tab doesn't clear scheduled notifications
   */
  Notifier.BeginSyncNotifications(force);
}

function getEmpireInfo(context) {
  const hasMoon = document.querySelector("a.moonlink") !== null;

  // Started at document_start when this page load was going to refresh anyway,
  // so it has usually been in flight for the whole of the game's own page load
  // by the time we get here. Same single request either way - see
  // `startEmpirePrefetch()`.
  const empireRequestPlanets = takeEmpirePrefetch() ?? empireRequest(EMPIRE_PLANETS_PARAMS);
  const empireRequestMoons = hasMoon ? wait.delay(10).then(() => empireRequest(EMPIRE_MOONS_PARAMS)) : null;

  const getWorkinProgressGroupsAndPatterns = (groups) => {
    //create a list of patterns to match the groups ('?' is a wildcard for lifeform groups)
    //there is also "ships" and "defence" groups for any future evolution
    const toParseGroups = ["supply", "station", "research", "lifeform?buildings", "lifeform?research"];

    const patterns = toParseGroups.map((pattern) => ({
      pattern,
      name: pattern.replace("?", ""),
      regex: new RegExp("^" + pattern.replace("?", ".*") + "$"),
    }));

    const result = [];
    for (const key of Object.keys(groups)) {
      const match = patterns.find(({ regex }) => regex.test(key));
      if (match) {
        result.push({ property: key, name: match.name, techIds: groups[key] });
      }
    }
    return result;
  };
  const getWorkInProgressTechs = (planetOrMoon, groups) => {
    const workInProgressTechs = new Array();
    const parser = new window.DOMParser();

    groups.forEach((group) => {
      group.techIds.forEach((techId) => {
        const htmlKey = `${techId}_html`;

        if (planetOrMoon[htmlKey]) {
          const htmlString = planetOrMoon[htmlKey];
          if (htmlString) {
            // Create a temporary document to parse the HTML string
            const temp = parser.parseFromString(htmlString, "text/html").querySelector("body");

            /*
             * if there is only one child, we can ignore it, because it is just a text node.
             * but if there is more than one child, there is a downgrade or an upgrade
             */
            if (temp.children.length > 1) {
              const activeElement = temp.querySelector(".active");
              const activeValue = activeElement ? parseInt(activeElement.textContent.trim(), 10) : null;

              if (activeValue && !isNaN(activeValue)) {
                workInProgressTechs.push({
                  group: group.name,
                  id: techId,
                  from: planetOrMoon[techId],
                  to:
                    group.name === "defence" || group.name === "ships"
                      ? planetOrMoon[techId] + activeValue
                      : activeValue, // for defence and ships, the value is the current level + the upgrade level
                });
              }
            }
          }
        }
      });
    });

    return workInProgressTechs;
  };

  const setWorkInProgressTechs = (planetsOrMoons, groups) => {
    planetsOrMoons.forEach((planetOrMoon) => {
      planetOrMoon.workInProgressTechs = getWorkInProgressTechs(
        planetOrMoon,
        getWorkinProgressGroupsAndPatterns(groups)
      );

      // Remove HTML keys that was only used for the work in progress techs
      // We don't need the HTML keys anymore, so we can delete them
      for (const key in planetOrMoon) {
        if (key.includes("html") && key !== "equipment_html") {
          delete planetOrMoon[key];
        }
      }
    });
  };

  const promises = [empireRequestPlanets];
  if (empireRequestMoons) promises.push(empireRequestMoons);
  return Promise.all(promises).then((values) => {
    const empireObjectPlanets = values[0];
    const empireObjectMoons = values.length > 1 ? values[1] : null;

    Translator.UpdateAllTechNamesFromEmpire(empireObjectPlanets, empireObjectMoons);
    setWorkInProgressTechs(empireObjectPlanets.planets, empireObjectPlanets.groups);
    if (empireObjectMoons && empireObjectMoons.planets) {
      setWorkInProgressTechs(empireObjectMoons.planets, empireObjectMoons.groups);
    }

    empireObjectPlanets.planets.forEach((planet) => {
      planet.invalidate = false;
      if (empireObjectMoons && empireObjectMoons.planets) {
        empireObjectMoons.planets.forEach((moon) => {
          if (planet.moonID === moon.id) {
            planet.moon = moon;
            planet.moon.invalidate = false;
          }
        });
      }
    });

    return empireObjectPlanets.planets;
  });
}

function updateInfo(context) {
  if (context.isLoading()) return;
  context.setLoading(true);
  const svg = createSVG("svg", {
    width: "80px",
    height: "30px",
    viewBox: "0 0 187.3 93.7",
    preserveAspectRatio: "xMidYMid meet",
  });
  svg.append(
    createSVG("path", {
      stroke: "#3c536c",
      id: "outline",
      fill: "none",
      "stroke-width": "4",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "stroke-miterlimit": "10",
      d:
        "M93.9,46.4c9.3,9.5,13.8,17.9,23.5,17.9s17.5-7.8,17.5-17.5s-7.8-17.6-17.5-17.5c-9.7,0.1-1" +
        "3.3,7.2-22.1,17.1c-8.9,8.8-15.7,17.9-25.4,17.9s-17.5-7.8-17.5-17.5s7.8-17.5,17.5-17.5S86.2,38.6,93.9,46.4z",
    }),
    createSVG("path", {
      opacity: "0.1",
      stroke: "#eee",
      id: "outline-bg",
      fill: "none",
      "stroke-width": "4",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "stroke-miterlimit": "10",
      d:
        "M93.9,46.4c9.3,9.5,13.8,17.9,23.5,17.9s17.5-7.8,17.5-17.5s-7.8-17.6-17.5-17.5c-9.7,0.1-1" +
        "3.3,7.2-22.1,17.1c-8.9,8.8-15.7,17.9-25.4,17.9s-17.5-7.8-17.5-17.5s7.8-17.5,17.5-17.5S86.2,38.6,93.9,46.4z",
    })
  );
  document
    .querySelector("#countColonies")
    .appendChild(createDOM("div", { class: "spinner" }).appendChild(svg).parentElement);
  return getEmpireInfo(context).then((empire) => {
    for (const techId in OGIData.json.technology) {
      OGIData.json.technology[techId] = empire[0][techId];
    }
    OGIData.empire = empire;
    OGIData.json.lastEmpireUpdate = new Date();
    updateLifeformPlanetBonus(context);
    updateEmpireProduction(context);
    updateresourceDetail(context.overviewContext);
    context.flyingFleet();
    updateProductionProgress(context, true); //We just updated the empire data, so => true
    context.updateSpaceShipsPresence();
    context.setLoading(false);
    OGIData.json.needsUpdate = false;
    OGIData.Save();
    document.querySelector(".spinner").remove();
  });
}

export { updateEmpireData, updateInfo, startEmpirePrefetch };
