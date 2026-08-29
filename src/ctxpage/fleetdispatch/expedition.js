import * as DOM from "../../ui/dom.js";
import debounce from "../../platform/debounce.js";
import { fleetState } from "./state.js";
import { getLogger } from "../../platform/logger.js";
import { createDOM, createSVG, createDOMSanitized, changeOGSelect } from "../../ui/dom.js";
import { toFormattedNumber, fromFormattedNumber } from "../../format/numbers.js";
import * as Numbers from "../../format/numbers.js";
import * as popupUtil from "../../ui/popup.js";
import * as utilTooltip from "../../ui/tooltip.js";
import * as wait from "../../platform/wait.js";
import * as time from "../../format/time.js";
import * as standardUnit from "../../game/standardUnit.js";
import Translator from "../../format/i18n/translate.js";
import OGBIData from "../../store/OGBIData.js";
import OgamePageData from "../../ogame/pageData.js";
import dataHelper from "../../integrations/dataHelper.js";
import shipEnum from "../../game/ship.js";
import missionType from "../../game/missionType.js";
import planetType from "../../game/planetType.js";
import ogiMode from "../../ogame/ogiMode.js";
import PlayerClass from "../../game/playerClass.js";
import { pageSignal } from "../../platform/abort.js";
import { fleetCost } from "../../game/fleetCost.js";
import { calcNeededShips as calcNeededShipsUtil } from "../../game/calcNeededShips.js";
import highlight, { setHighlightCoords } from "../../ui/highlight.js";
import { getOption } from "../conf-options.js";
import { keepOnPlanetDialog } from "./keepOnPlanet.js";
import { tabs } from "../../ui/tabs.js";
import {
  SHIP_EXPEDITION_POINTS,
  EXPEDITION_EXPEDITION_POINTS,
  EXPEDITION_MAX_RESOURCES,
  EXPEDITION_TOP1_POINTS,
} from "../../game/gameConstants.js";
import { building, research } from "../../game/gameFormulas.js";
import itemImageID from "../../game/itemImageID.js";
import itemType from "../../game/itemType.js";
import { calcNeededShips, selectShips } from "./index.js";
import { planExpeditionFleets } from "../../game/expeditionBalancer.js";
import { addTemplateSelector } from "./templates.js";

/**
 * The fleet-dispatch page: the rebuilt dispatcher UI, the expedition and collect
 * shortcuts, the custom-mission buttons, and the cargo-selection helpers.
 *
 * Lifted out of `OGBeyondInfinity` in Phase 3 of refactoring.md. This is the module that
 * plan rates highest-risk, and the reason is not its size: several functions in here
 * patch OGame's own `FleetDispatcher` prototype, and inside those patches `this` is
 * the FleetDispatcher, not the page controller. Nothing that reads `this.mission`,
 * `this.sendFleetUrl`, `this.loca`, `this.appendTokenParams` and friends was
 * rewritten - only the members that belonged to `OGBeyondInfinity`.
 *
 * Compliance note (AGENTS.md 1.1 and 1.2): everything here still runs from one user
 * gesture. No button in this module sends more than one fleet, and nothing schedules
 * a dispatch for later.
 *
 * The controller state these functions used arrives as one `context` object. The
 * handful of fields that only ever lived inside this set - the union-combat timers,
 * the delay rows, the resource filler, the redirect URL after a dispatch - are module
 * state now, which is the scope they always had in practice.
 */

const logger = getLogger("fleetdispatch");

/** The expedition button: picks a system, a fleet and a duration for one send. */
function expedition(context) {
  if (
    context.page == "fleetdispatch" &&
    fleetDispatcher.shipsOnPlanet?.find((x) => x.number > 0) !== undefined &&
    !fleetDispatcher.isOnVacation
  ) {
    if (!document.querySelector("#allornone .allornonewrap")) return;
    const btnExpe = createDOM("button", {
      class: `ogl-expedition ${OGBIData.json.options.expedition.cargoShip == 202 ? "smallCargo" : "largeCargo"}`,
    });
    document.querySelector("#allornone .secondcol").appendChild(btnExpe);
    const optionsContainerDiv = createDOM("div");
    const combatShipDiv = optionsContainerDiv.appendChild(createDOM("div", { class: "ogk-expedition-options" }));
    const optionsDiv = optionsContainerDiv.appendChild(createDOM("div", { class: "ogk-expedition-options" }));

    const smallCargo = optionsDiv.appendChild(
      createDOM("div", { class: "ogl-option ogl-fleet-ship choice ogl-fleet-202" })
    );
    smallCargo.classList.toggle("highlight", OGBIData.json.options.expedition.cargoShip == 202);
    const largeCargo = optionsDiv.appendChild(
      createDOM("div", { class: "ogl-option ogl-fleet-ship choice ogl-fleet-203" })
    );
    largeCargo.classList.toggle("highlight", OGBIData.json.options.expedition.cargoShip == 203);
    smallCargo.addEventListener("click", () => updateCargoShip(202));
    largeCargo.addEventListener("click", () => updateCargoShip(203));
    const updateCargoShip = (ship) => {
      btnExpe.classList = `ogl-expedition ${ship == 202 ? "smallCargo" : "largeCargo"}`;
      smallCargo.classList.toggle("highlight", ship == 202);
      largeCargo.classList.toggle("highlight", ship == 203);
      OGBIData.json.options.expedition.cargoShip = ship;
      OGBIData.Save();
    };

    const sendProbe = optionsDiv.appendChild(
      createDOM("div", { class: "ogl-option ogl-fleet-ship choice ogl-fleet-210" })
    );
    sendProbe.classList.toggle("highlight", OGBIData.json.options.expedition.sendProbe);
    sendProbe.addEventListener("click", () => {
      sendProbe.classList.toggle("highlight");
      OGBIData.json.options.expedition.sendProbe = !OGBIData.json.options.expedition.sendProbe;
      OGBIData.Save();
    });

    const sendCombat = optionsDiv.appendChild(
      createDOM("div", {
        class: `ogl-option ogl-fleet-ship choice ogl-fleet-${OGBIData.json.options.expedition.combatShip}`,
      })
    );
    sendCombat.classList.toggle("highlight", OGBIData.json.options.expedition.sendCombat);
    sendCombat.addEventListener("click", () => {
      sendCombat.classList.toggle("highlight");
      OGBIData.json.options.expedition.sendCombat = !OGBIData.json.options.expedition.sendCombat;
      OGBIData.Save();
    });

    const expeditionRotation = optionsDiv.appendChild(
      createDOM("div", { class: "ogl-option choice-expedition-icon expedition-rotation" })
    );
    expeditionRotation.classList.toggle("highlight", OGBIData.json.options.expedition.rotation);
    expeditionRotation.addEventListener("click", () => {
      expeditionRotation.classList.toggle("highlight");
      OGBIData.json.options.expedition.rotation = !OGBIData.json.options.expedition.rotation;
      OGBIData.Save();
    });

    if (context.commander || context.admiral) {
      const expeditionFleet = optionsDiv.appendChild(
        createDOM("div", { class: "ogl-option choice-expedition-icon expedition-fleet" })
      );
      expeditionFleet.classList.toggle("highlight", OGBIData.json.options.expedition.standardFleet);
      expeditionFleet.addEventListener("click", () => {
        expeditionFleet.classList.toggle("highlight");
        OGBIData.json.options.expedition.standardFleet = !OGBIData.json.options.expedition.standardFleet;
        OGBIData.Save();
      });
    }

    const combatShip = [218, 213, 211, 215, 207];
    combatShip.forEach((ship) => {
      const element = combatShipDiv.appendChild(
        createDOM("div", { class: `ogl-option ogl-fleet-ship choice ogl-fleet-${ship}` })
      );
      element.classList.toggle("highlight", ship == OGBIData.json.options.expedition.combatShip);
      element.addEventListener("click", () => updateCombatShip(ship));
    });

    const updateCombatShip = (ship) => {
      sendCombat.classList = `ogl-option ogl-fleet-ship choice ogl-fleet-${ship}`;
      sendCombat.classList.toggle("highlight", OGBIData.json.options.expedition.sendCombat);
      for (const children of combatShipDiv.children) {
        const id = Number(children.className.match(/(?<=ogl-fleet-)\d+/)[0]);
        children.classList.toggle("highlight", id == ship);
      }
      OGBIData.json.options.expedition.combatShip = ship;
      OGBIData.Save();
    };

    // add mx buttons to choose fleet template
    if (context.commander) {
      addTemplateSelector("#standardfleettemplatecomponent", "commander");
    }
    if (context.admiral) {
      addTemplateSelector("#expeditionfleettemplatecomponent", "admiral");
    }

    btnExpe.addEventListener("mouseover", () => utilTooltip.tooltip(btnExpe, optionsContainerDiv, false, false, 750));
    btnExpe.addEventListener("click", async () => {
      //remove active class of .ogk-customMission buttons
      document.querySelectorAll(".ogk-customMission.ogl-active").forEach((btn) => {
        btn.classList.remove("ogl-active");
      });

      try {
        await wait.waitFor(() => !fleetDispatcher.loading);
      } catch {
        logger.warn("fleetDispatcher stayed loading - expedition button click ignored");
        return;
      }
      document.querySelector("#resetall").click();
      fleetState.expeditionMode = true;
      fleetState.collectMode = false;
      document.querySelector("#missionsDiv").setAttribute("data", "false");

      let level = EXPEDITION_TOP1_POINTS.findIndex((points) => points > OGBIData.json.topScore);
      level = level !== -1 ? level : EXPEDITION_TOP1_POINTS.length;
      const maxExpeditionPoints = EXPEDITION_EXPEDITION_POINTS[level];
      let maxResources = EXPEDITION_MAX_RESOURCES[level];

      if (context.playerClass == PlayerClass.EXPLORER) {
        // explorer class bonus
        maxResources *= (1 + OGBIData.json.explorerBonusIncreasedExpeditionOutcome) * OGBIData.json.speed;
        // LF character class bonus
        maxResources *= 1 + (OGBIData.json.lifeformBonus.classBonus?.explorer || 0);
      }
      // LF expedition bonus
      maxResources *= 1 + (OGBIData.json.lifeformBonus.expeditionBonus || 0);
      // expedition resource boost item bonus
      let resourceBoostItemBonus = 0;
      // expedition resource boost item has global effect, we look in the planet 1
      const html = new window.DOMParser().parseFromString(OGBIData.empire[0].equipment_html, "text/html");
      const itemDivs = html.querySelectorAll(".item_img");
      itemDivs.forEach((div) => {
        const style = div.getAttribute("style");
        const id = style.substring(style.indexOf("images/") + 7, style.indexOf(".png"));
        const item = itemImageID[id];
        if (item && item.type === itemType.ExpeditionResources) resourceBoostItemBonus = item.bonus;
      });
      maxResources *= 1 + resourceBoostItemBonus;

      const availableShips = {
        202: 0,
        203: 0,
        204: 0,
        205: 0,
        206: 0,
        207: 0,
        208: 0,
        209: 0,
        210: 0,
        211: 0,
        213: 0,
        214: 0,
        215: 0,
        218: 0,
        219: 0,
      };
      const selectedShips = {
        202: 0,
        203: 0,
        204: 0,
        205: 0,
        206: 0,
        207: 0,
        208: 0,
        209: 0,
        210: 0,
        211: 0,
        213: 0,
        214: 0,
        215: 0,
        218: 0,
        219: 0,
      };

      fleetDispatcher.shipsOnPlanet.forEach((ship) => (availableShips[ship.id] = ship.number));
      let warningText = "";

      if (availableShips[219]) {
        selectedShips[219] = 1;
        maxResources *= 2; // Pathfinder bonus
      } else {
        warningText += Translator.translate(110) + "<br>";
      }

      if (OGBIData.json.options.expedition.sendProbe) {
        if (availableShips[210]) {
          selectedShips[210] = 1;
        } else {
          warningText += Translator.translate(109) + "<br>";
        }
      }

      if (OGBIData.json.options.expedition.sendCombat) {
        let combatShip = OGBIData.json.options.expedition.combatShip;
        if (!availableShips[combatShip]) {
          const combatShipPriority = [218, 213, 211, 215, 207, 206, 205, 204];
          combatShip = combatShipPriority.find((ship) => availableShips[ship]);
          if (combatShip == 205 || combatShip == 206) {
            if (selectedShips[219]) {
              combatShip = 0;
            }
          } else if (combatShip == 204) {
            if (selectedShips[219] || (OGBIData.json.options.expedition.cargoShip == 203 && availableShips[203])) {
              combatShip = 0;
            }
          }
        }
        if (combatShip) {
          selectedShips[combatShip] = 1;
        } else {
          if (combatShip !== 0) warningText += Translator.translate(108) + "<br>";
        }
      }

      let expeditionPoints = 0;
      let cargoCapacity = 0;
      for (const ship in selectedShips) {
        expeditionPoints += selectedShips[ship] * SHIP_EXPEDITION_POINTS[ship];
        cargoCapacity += selectedShips[ship] * OGBIData.json.ships[ship].cargoCapacity;
      }
      maxResources = Math.floor(maxResources * OGBIData.json.options.expedition.limitCargo);
      // minimum cargo ships needed to fulfill expedition points
      const minSC = Math.ceil((maxExpeditionPoints - expeditionPoints) / SHIP_EXPEDITION_POINTS[202]);
      const minLC = Math.ceil((maxExpeditionPoints - expeditionPoints) / SHIP_EXPEDITION_POINTS[203]);
      // always fulfill expedition points, cargo ships needed to fulfill desired maximum resources cargo space
      const maxSC = Math.max(minSC, calcNeededShips(context, { fret: 202, resources: maxResources - cargoCapacity }));
      const maxLC = Math.max(minLC, calcNeededShips(context, { fret: 203, resources: maxResources - cargoCapacity }));
      const cargoShip = OGBIData.json.options.expedition.cargoShip;
      let cargoShipsNeeded = cargoShip === 202 ? maxSC : maxLC;

      // Balanced dispatch: spread the cargo parked here across the expedition slots that are
      // actually free, so the first fleet does not swallow ships the later ones still need.
      // The minimum keeps every proposed fleet able to reach the top expedition tier - below
      // that it is better to fill fewer expeditions properly.
      if (OGBIData.json.options.expedition.balancedDispatch) {
        const minimumPerFleet = Math.ceil(maxExpeditionPoints / SHIP_EXPEDITION_POINTS[cargoShip]);
        const balanced = planExpeditionFleets({
          maxExpeditions: fleetDispatcher.maxExpeditionCount,
          activeExpeditions: fleetDispatcher.expeditionCount,
          maxFleets: fleetDispatcher.maxFleetCount,
          activeFleets: fleetDispatcher.fleetCount,
          availableShips: availableShips[cargoShip] || 0,
          minimumPerFleet,
          maximumPerFleet: cargoShipsNeeded,
        });

        if (balanced.perFleet > 0) {
          cargoShipsNeeded = balanced.perFleet;
        } else if (balanced.openSlots > 0) {
          // Not enough cargo here to fill even one expedition properly - say so rather than
          // silently proposing a fleet that underperforms.
          warningText += Translator.translate(240) + "<br>";
        }
      }

      if (availableShips[cargoShip] >= cargoShipsNeeded) {
        selectedShips[cargoShip] = cargoShipsNeeded;
      } else {
        // select as many cargo ships as we can if there are not enough available
        const cargoShipExpeditionPoints = availableShips[cargoShip] * SHIP_EXPEDITION_POINTS[cargoShip];
        const remainingExpeditionPoints = maxExpeditionPoints - expeditionPoints - cargoShipExpeditionPoints;
        const cargoShipCargoCapacity = availableShips[cargoShip] * OGBIData.json.ships[cargoShip].cargoCapacity;
        const remainingCargoCapacity = maxResources - cargoCapacity - cargoShipCargoCapacity;
        const otherCargoShip = cargoShip === 202 ? 203 : 202;
        const maxOtherCargoShip = Math.max(
          Math.ceil(remainingExpeditionPoints / SHIP_EXPEDITION_POINTS[otherCargoShip]),
          calcNeededShips(context, { fret: otherCargoShip, resources: remainingCargoCapacity })
        );
        selectedShips[cargoShip] = availableShips[cargoShip];
        selectedShips[otherCargoShip] = Math.min(maxOtherCargoShip, availableShips[otherCargoShip]);
        warningText += Translator.translate(107) + "<br>";
      }

      // use fleet templates if activated and available
      let timeFleetTemplate = null;
      let speedFleetTemplate = null;
      if (OGBIData.json.options.expedition.standardFleet) {
        // standardFleetType is new in this feature; configs saved before it exists carry an id
        // with no type. Treating null as "either list" keeps those users' template working -
        // templateApplied then stops the commander pass from overriding an admiral match, the
        // same precedence the pre-split code had.
        let templateApplied = false;
        const configuredType = OGBIData.json.options.expedition.standardFleetType;
        const selectShipsFromFleetTemplate = (fleetTemplate, templateType) => {
          if (templateApplied) return;
          if (configuredType == null || configuredType === templateType) {
            for (const template of fleetTemplate) {
              if (template.id === Number(OGBIData.json.options.expedition.standardFleetId)) {
                if (template.fleetSpeed) speedFleetTemplate = template.fleetSpeed;
                if (template.expeditionTime) timeFleetTemplate = template.expeditionTime;
                let enoughShips = true;
                for (const ship in template.ships) {
                  if (template.ships[ship] > availableShips[ship]) enoughShips = false;
                }
                if (enoughShips) {
                  for (const ship in selectedShips) selectedShips[ship] = template.ships[ship] ?? 0;
                  warningText = "";
                } else {
                  warningText = Translator.translate(164) + "<br>" + warningText + "<br>";
                }
                templateApplied = true;
                break;
              } else {
                if (template.id == null) break;
              }
            }
          }
        };
        if (context.admiral) {
          selectShipsFromFleetTemplate(expeditionFleetTemplates, "admiral");
        }
        if (context.commander) {
          selectShipsFromFleetTemplate(standardFleetTemplates, "commander");
        }
      }

      // select expedition time and speed, using default options and templates
      const expeditionTime = timeFleetTemplate ? timeFleetTemplate : OGBIData.json.options.expedition.defaultTime;
      const expeditionSpeed = (speedFleetTemplate ? speedFleetTemplate : 100) / 10;
      document.querySelector("#expeditiontime").value = expeditionTime;
      const dropdown = document.querySelector("#expeditiontime + .dropdown > a");
      if (dropdown) dropdown.textContent = expeditionTime;
      document.querySelector(`.ogl-fleetSpeed div[data-step="${expeditionSpeed}"]`).click();

      for (const ship in selectedShips) selectShips(context, ~~ship, selectedShips[ship]);
      if (warningText.length) fadeBox(warningText, true);

      document.querySelector(".send_none").click();
      if (fleetDispatcher.targetPlanet.position != 16) {
        // force own system in case no other position 16 system was selected
        // avoids wrong destination problems whith collect button missclicks
        const coords = context.current.coords.split(":");
        document.querySelector(".ogl-coords #galaxyInput").value = coords[0];
        document.querySelector(".ogl-coords #systemInput").value = coords[1];
      }
      document.querySelector(".ogl-coords #positionInput").value = 16;
      fleetDispatcher.targetPlanet.position = 16;
      fleetDispatcher.mission = 15;
      fleetDispatcher.targetPlanet.type = 1;
      fleetDispatcher.refreshTarget();
      fleetDispatcher.updateTarget();
      fleetDispatcher.fetchTargetPlayerData();
      fleetDispatcher.refresh();
      document.querySelector(".ogl-moon-icon").classList.remove("ogl-active");
      document.querySelector(".ogl-planet-icon").classList.add("ogl-active");

      let link = "?page=ingame&component=fleetdispatch&oglMode=6";
      const originSystem = context.current.coords.split(":", 2).join(":");
      const destinationSystem = fleetDispatcher.targetPlanet.galaxy + ":" + fleetDispatcher.targetPlanet.system;

      // do not enable rotation of expeditions in a not own system, but keep same system for auto expedition
      if (originSystem != destinationSystem) {
        link += `&galaxy=${fleetDispatcher.targetPlanet.galaxy}&system=${fleetDispatcher.targetPlanet.system}`;
        link += "&position=16";
      } else if (OGBIData.json.options.expedition.rotation) {
        const planetSystems = [];
        document
          .querySelectorAll(".planet-koords")
          .forEach((planet) => planetSystems.push(planet.textContent.split(":", 2).join(":")));
        const moonSystems = [];
        document
          .querySelectorAll(".moonlink")
          .forEach((moon) =>
            moonSystems.push(moon.parentElement.querySelector(".planet-koords").textContent.split(":", 2).join(":"))
          );

        // number of expeditions in the same expedition system, including the one we are going to send
        let sameExpeditionDestination = 1;
        try {
          await wait.waitFor(() => document.querySelector("#eventContent") !== null);
        } catch {
          logger.warn("#eventContent did not appear - skipping same-destination expedition check");
        }
        document.querySelectorAll(".eventFleet td.destCoords").forEach((coords) => {
          if (
            coords.textContent.trim() == "[" + originSystem + ":16]" &&
            coords.parentElement.getAttribute("data-mission-type") == 15 &&
            coords.parentElement.getAttribute("data-return-flight") == "true"
          )
            sameExpeditionDestination++;
        });

        // there is any other different system to do expeditions?
        const moreExpeditionPlaces = context.current.isMoon
          ? moonSystems.some((moon) => moon != originSystem)
          : planetSystems.some((planet) => planet != originSystem);

        if (moreExpeditionPlaces && sameExpeditionDestination >= OGBIData.json.options.expedition.rotationAfter) {
          const rotate = (planet) => planet.nextElementSibling || context.planetList[0];
          let nextPlanet = context.current.planet;
          // if same system, try the next planet until we find a different system
          while (nextPlanet.querySelector(".planet-koords").textContent.split(":", 2).join(":") == originSystem) {
            nextPlanet = rotate(nextPlanet);
            // if place is not a planet row (planet overview on), go to first planet
            if (!nextPlanet.querySelector(".planet-koords")) nextPlanet = context.planetList[0];
            // if place is a moon and system does not have it, try next planet until we find one
            if (context.current.isMoon) {
              while (!nextPlanet.querySelector(".moonlink")) {
                nextPlanet = rotate(nextPlanet);
              }
            }
          }
          let nextId = nextPlanet.id.split("-")[1];
          if (context.current.isMoon) {
            // Falls back to the planet itself when it has no moon - landing on the planet
            // beats crashing the whole redirect (`.moonlink` is null: "Cannot read
            // properties of null (reading 'href')").
            const moonLink = document.querySelector(`#planet-${nextId} .moonlink`);
            if (moonLink) nextId = new URL(moonLink.href).searchParams.get("cp");
          }
          link += `&cp=${nextId}`;
        }
      }
      fleetState.onFleetSentRedirectUrl = "https://" + window.location.host + window.location.pathname + link;
      fleetState.expeditionMode = false;
    });

    if (
      context.mode == ogiMode.AUTOEXPEDITION &&
      fleetDispatcher.expeditionCount < fleetDispatcher.maxExpeditionCount &&
      fleetDispatcher.fleetCount < fleetDispatcher.maxFleetCount
    ) {
      document.querySelector(".ogl-expedition").click();
    }
  }
}

export { expedition };
