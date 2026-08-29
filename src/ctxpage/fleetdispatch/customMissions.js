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
import { selectAllShips, selectBestCargoShip, selectMostShips, selectShips } from "./index.js";
import { openPlanetList } from "./planetList.js";

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

/**
 * The user's own mission buttons, and the collect shortcut they share their plumbing
 * with. One button, one dispatch - see the compliance note in `index.js`.
 */
function customMissions(context) {
  if (
    context.page == "fleetdispatch" &&
    fleetDispatcher.shipsOnPlanet?.find((x) => x.number > 0) !== undefined &&
    !fleetDispatcher.isOnVacation
  ) {
    const getMissionClass = (mission) => {
      if (mission == 4) return "statio";
      if (mission == 6) return "spy";
      return "";
    };

    let missionsDiv = document.querySelector("#allornone .secondcol");
    const maxMissions = 5;
    let nbMissions = getOption("nbCustomMissions");
    if (nbMissions > maxMissions) nbMissions = maxMissions;
    const fillerCount = maxMissions - nbMissions;
    for (let i = 0; i < fillerCount; i++) {
      missionsDiv.appendChild(createDOM("div"));
    }

    //ensure no double clicks
    let btnCollectProcessing = false;

    //get the real current id (planet or moon)
    const currentFromEmpire = context.current.isMoon
      ? OGBIData.empire.find((p) => p.id == context.current.id).moon
      : OGBIData.empire.find((p) => p.id == context.current.id);
    const currentId = currentFromEmpire.id;

    //get the mirror id
    const mirrorId = context.current.isMoon
      ? OGBIData.empire.find((p) => p.id == context.current.id) // if current is a moon => get planet id
      : OGBIData.empire.find((p) => p.id == context.current.id).moon?.id ?? undefined; // if current is a planet having moon => get moon id, else get undefined

    //ensure everything is ready
    const everyThingIsReady = () => {
      const missionsDiv = document.querySelector("#missionsDiv");
      const cargo = document.querySelector(".ogl-cargo");
      if (missionsDiv && cargo) {
        return true;
      }
      return false;
    };
    wait.waitFor(everyThingIsReady).then(() => {
      for (let customMissionId = 1; customMissionId <= nbMissions; customMissionId++) {
        //init default customMission if not exists
        if (!OGBIData.json.options.customMissions[customMissionId]) {
          OGBIData.json.options.customMissions[customMissionId] = {
            ship: 202,
            mission: 4,
            rotation: false,
            keepSpeed: false,
            resources: true,
            target: {},
            color: "orange",
          };
        }

        if (!OGBIData.json.options.customMissions[customMissionId].target[currentId]) {
          OGBIData.json.options.customMissions[customMissionId].target[currentId] = {
            id: mirrorId,
            galaxy: currentFromEmpire.galaxy,
            system: currentFromEmpire.system,
            position: currentFromEmpire.position,
            /* if current is a moon => select planet as default target
             * if current is a planet having moon => select moon as default target */
            type: context.current.isMoon ? 1 : currentFromEmpire.moon !== undefined ? 3 : 1,
          };
        }

        const customMissionClassSelector = `.ogk-customMission.ogk-customMission-${customMissionId}`;
        const customMissionClass = `ogk-customMission ogk-customMission-${customMissionId}`;
        const missionClass = getMissionClass(OGBIData.json.options.customMissions[customMissionId].mission);
        const optionClass = `ogk-customMission-options ogk-customMission-${customMissionId}`;
        const optionClassSelector = `.ogk-customMission-options.ogk-customMission-${customMissionId}`;

        const shipClass =
          OGBIData.json.options.customMissions[customMissionId].ship === "select-most"
            ? "select-most"
            : OGBIData.json.options.customMissions[customMissionId].ship === "sendall"
            ? "sendall"
            : OGBIData.json.options.customMissions[customMissionId].ship == 202
            ? "smallCargo"
            : OGBIData.json.options.customMissions[customMissionId].ship == 219
            ? "pathFinder"
            : "largeCargo";

        let optionsDiv = createDOM("div", { class: `${optionClass} ogk-customMission-options-3l` });
        const optionsDivFleet = optionsDiv.appendChild(createDOM("div", { class: "ogk-customMission-options-5c" }));
        const optionsDivMission = optionsDiv.appendChild(createDOM("div", { class: "ogk-customMission-options-6c" }));
        const optionsDivSettings = optionsDiv.appendChild(createDOM("div", { class: "ogk-customMission-options-6c" }));
        let btnCollect = missionsDiv.appendChild(
          createDOM("button", {
            class: `${customMissionClass} ${missionClass} ${shipClass}`,
            "data-marked": OGBIData.json.options.customMissions[customMissionId].color,
          })
        );

        const createFleetChoice = (shipId) => {
          const shipClass =
            shipId == "select-most"
              ? "ogl-option choice select-most"
              : shipId == "sendall"
              ? "ogl-option choice sendall"
              : `ogl-option ogl-fleet-ship choice ogl-fleet-${shipId}`;
          return optionsDivFleet.appendChild(
            createDOM("div", {
              class: `${shipClass} ${
                OGBIData.json.options.customMissions[customMissionId].ship === shipId ? "highlight" : ""
              }`,
            })
          );
        };
        const createMissionChoice = (mission) => {
          return optionsDivMission.appendChild(
            createDOM("div", {
              class: `ogl-option choice-mission-icon ogl-mission-${mission} ${
                OGBIData.json.options.customMissions[customMissionId].mission === mission ? "highlight" : ""
              }`,
            })
          );
        };

        const forseResourcesUsing = (used) => {
          OGBIData.json.options.customMissions[customMissionId].resources = used;
          resources.classList.remove("highlight");
          if (used) {
            resources.classList.add("highlight");
          }
        };

        const toggleResources = () => {
          forseResourcesUsing(!OGBIData.json.options.customMissions[customMissionId].resources);
          if (
            !OGBIData.json.options.customMissions[customMissionId].resources &&
            OGBIData.json.options.customMissions[customMissionId].ship !== "select-most" &&
            OGBIData.json.options.customMissions[customMissionId].ship !== "sendall"
          ) {
            updateDefaultCollectShip("select-most");
          }
          OGBIData.Save();
        };

        //fleet choices
        const selectmost = createFleetChoice("select-most");
        const sendall = createFleetChoice("sendall");
        const sc = createFleetChoice(202);
        const lc = createFleetChoice(203);
        const pf = createFleetChoice(219);

        //mission choices
        const spyMission = createMissionChoice(6);
        const tr = createMissionChoice(3);
        const dp = createMissionChoice(4);

        //target choice
        let tgt = optionsDivMission.appendChild(
          createDOM("div", {
            class: `ogl-option choice-target ${
              OGBIData.json.options.customMissions[customMissionId].target[currentId].type == 3 ? "moon" : "planet"
            }`,
          })
        );

        //color choice
        let color = optionsDivSettings.appendChild(
          createDOM("div", {
            class: `ogl-option choice-customMission-icon choice-color`,
            "data-marked": OGBIData.json.options.customMissions[customMissionId].color,
          })
        );

        //rotation choice
        const rotation = optionsDivSettings.appendChild(
          createDOM("div", { class: "ogl-option choice-customMission-icon customMission-rotation" })
        );
        rotation.classList.toggle("highlight", OGBIData.json.options.customMissions[customMissionId].rotation);
        rotation.addEventListener("click", () => {
          rotation.classList.toggle("highlight");
          OGBIData.json.options.customMissions[customMissionId].rotation =
            !OGBIData.json.options.customMissions[customMissionId].rotation;
          OGBIData.Save();
        });

        //keep speed choice

        const svg1 = createSVG("svg", {
          x: "0px",
          y: "0px",
          viewBox: "0 0 512 512",
          style: "enable-background:new 0 0 512 512;",
        });
        svg1.replaceChildren(
          createSVG("path", {
            fill: "white",
            d:
              "M268.574,511.69c1.342-0.065,2.678-0.154,4.015-0.239c0.697-0.045,1.396-0.082,2.091-0.133c1.627-0.117,3." +
              "247-0.259,4.865-0.406c0.37-0.034,0.741-0.063,1.111-0.099c1.895-0.181,3.783-0.387,5.665-0.609c0.056-0.0" +
              "07,0.111-0.012,0.167-0.019C413.497,495.109,512,387.063,512,256C512,114.618,397.382,0,256,0S0,114.618,0" +
              ",256c0,131.063,98.503,239.109,225.511,254.185c0.056,0.007,0.111,0.013,0.167,0.019c1.883,0.222,3.77,0.4" +
              "28,5.665,0.609c0.37,0.036,0.741,0.065,1.111,0.099c1.618,0.148,3.239,0.289,4.865,0.406c0.696,0.051,1.39" +
              "4,0.087,2.091,0.133c1.337,0.086,2.673,0.174,4.015,0.239c1.098,0.054,2.201,0.086,3.301,0.125c0.976,0.03" +
              "5,1.95,0.081,2.929,0.105c2.111,0.052,4.225,0.08,6.344,0.08s4.234-0.028,6.344-0.08c0.979-0.024,1.952-0." +
              "07,2.929-0.105C266.374,511.776,267.476,511.743,268.574,511.69z M273.523,468.613c-0.921,0.076-1.844,0.1" +
              "4-2.767,0.204c-0.814,0.056-1.629,0.109-2.446,0.155c-0.776,0.045-1.553,0.086-2.331,0.122c-1.037,0.048-2" +
              ".077,0.086-3.118,0.118c-0.608,0.019-1.215,0.043-1.823,0.057c-1.675,0.039-3.353,0.064-5.037,0.064s-3.36" +
              "2-0.025-5.037-0.064c-0.609-0.014-1.216-0.038-1.823-0.057c-1.041-0.033-2.081-0.071-3.118-0.118c-0.778-0" +
              ".036-1.555-0.078-2.331-0.122c-0.817-0.046-1.632-0.099-2.446-0.155c-0.923-0.064-1.846-0.128-2.767-0.204" +
              "c-0.52-0.042-1.037-0.092-1.555-0.138c-41.142-3.68-79.759-19.195-111.96-44.412c32.024-38.424,79.557-61." +
              "396,131.038-61.396s99.015,22.972,131.038,61.396c-32.201,25.218-70.819,40.732-111.96,44.412C274.56,468." +
              "521,274.042,468.571,273.523,468.613z M43.726,277.333h41.608c11.782,0,21.333-9.551,21.333-21.333s-9.551" +
              "-21.333-21.333-21.333H43.726c4.26-42.904,21.234-82.066,47.099-113.672l29.41,29.41c8.331,8.331,21.839,8" +
              ".331,30.17,0s8.331-21.839,0-30.17l-29.41-29.41c31.607-25.865,70.768-42.838,113.672-47.099v41.608c0,11." +
              "782,9.551,21.333,21.333,21.333s21.333-9.551,21.333-21.333V43.726c42.904,4.26,82.066,21.234,113.672,47." +
              "099l-29.41,29.41c-8.331,8.331-8.331,21.839,0,30.17s21.839,8.331,30.17,0l29.41-29.41c25.865,31.607,42.8" +
              "38,70.768,47.099,113.672h-41.608c-11.782,0-21.333,9.551-21.333,21.333s9.551,21.333,21.333,21.333h41.60" +
              "8c-4.428,44.592-22.591,85.14-50.194,117.366C378.101,347.932,319.426,320,256,320s-122.101,27.932-162.08" +
              ",74.7C66.317,362.474,48.154,321.926,43.726,277.333z",
          }),
          createSVG("path", {
            fill: "white",
            d:
              "M248.077,275.807c10.939,4.376,23.355-0.945,27.73-11.885l42.667-106.667c4.376-10.939-0.945-23.355-11.88" +
              "5-27.731c-10.939-4.376-23.355,0.945-27.73,11.885l-42.667,106.667C231.817,259.016,237.138,271.432,248.0" +
              "77,275.807z",
          })
        );
        const keepSpeedIcon = createDOM("div", {
          class: "ogl-option choice-customMission-icon customMission-keep-speed",
        });
        keepSpeedIcon.appendChild(svg1);

        const keepSpeed = optionsDivSettings.appendChild(keepSpeedIcon);
        keepSpeed.classList.toggle("highlight", OGBIData.json.options.customMissions[customMissionId].keepSpeed);
        keepSpeed.addEventListener("click", () => {
          keepSpeed.classList.toggle("highlight");
          OGBIData.json.options.customMissions[customMissionId].keepSpeed =
            !OGBIData.json.options.customMissions[customMissionId].keepSpeed;
          OGBIData.Save();
        });

        //resources choice
        const resources = optionsDivSettings.appendChild(
          createDOM("div", { class: "ogl-option choice-customMission-icon customMission-resources" })
        );
        resources.classList.toggle("highlight", OGBIData.json.options.customMissions[customMissionId].resources);
        resources.addEventListener("click", () => {
          toggleResources();
        });

        let updateCollectTooltipIcon = () => {
          let remove =
            OGBIData.json.options.customMissions[customMissionId].target[currentId].type == 1 ? "moon" : "planet";
          let add =
            OGBIData.json.options.customMissions[customMissionId].target[currentId].type == 3 ? "moon" : "planet";
          let classList = optionsDivMission.querySelector(".choice-target").classList;
          if (classList.contains(remove)) classList.remove(remove);
          if (!classList.contains(add)) classList.add(add);
        };

        const getShipClass = (shipId) =>
          shipId === "select-most"
            ? "select-most"
            : shipId === "sendall"
            ? "sendall"
            : shipId == 202
            ? "smallCargo"
            : shipId == 219
            ? "pathFinder"
            : "largeCargo";
        const getShipClassSelector = (shipId) =>
          shipId === "select-most" ? ".select-most" : shipId === "sendall" ? ".sendall" : `.ogl-fleet-${shipId}`;
        const getMissionClassSelector = (mission) => `.ogl-mission-${mission}`;

        let updateDefaultCollectShip = (shipId) => {
          OGBIData.json.options.customMissions[customMissionId].ship = shipId;

          if (shipId !== "select-most" && shipId !== "sendall") {
            forseResourcesUsing(true);
          }

          OGBIData.Save();

          const missionClass = getMissionClass(OGBIData.json.options.customMissions[customMissionId].mission);
          const shipClass = getShipClass(shipId);
          const shipOptionClassSelector = getShipClassSelector(shipId);

          document.querySelector(
            customMissionClassSelector
          ).classList = `${customMissionClass} ${missionClass} ${shipClass}`;

          const oldHighlight = optionsDivFleet.querySelector(".highlight");
          if (oldHighlight) oldHighlight.classList.remove("highlight");

          const newHighlight = optionsDivFleet.querySelector(shipOptionClassSelector);
          if (newHighlight) newHighlight.classList.add("highlight");
        };

        let updateDefaultMission = (mission) => {
          OGBIData.json.options.customMissions[customMissionId].mission = mission;
          OGBIData.Save();

          const missionClass = getMissionClass(OGBIData.json.options.customMissions[customMissionId].mission);
          const missionClassSelector = getMissionClassSelector(
            OGBIData.json.options.customMissions[customMissionId].mission
          );
          const shipClass = getShipClass(OGBIData.json.options.customMissions[customMissionId].ship);

          document.querySelector(
            customMissionClassSelector
          ).classList = `${customMissionClass} ${missionClass} ${shipClass}`;

          const oldHighlight = optionsDivMission.querySelector(".highlight");
          if (oldHighlight) oldHighlight.classList.remove("highlight");

          const newHighlight = optionsDivMission.querySelector(missionClassSelector);
          if (newHighlight) newHighlight.classList.add("highlight");
        };

        selectmost.addEventListener("click", () => updateDefaultCollectShip("select-most"));
        sendall.addEventListener("click", () => updateDefaultCollectShip("sendall"));
        sc.addEventListener("click", () => updateDefaultCollectShip(202));
        lc.addEventListener("click", () => updateDefaultCollectShip(203));
        pf.addEventListener("click", () => updateDefaultCollectShip(219));
        spyMission.addEventListener("click", () => updateDefaultMission(6));
        tr.addEventListener("click", () => updateDefaultMission(3));
        dp.addEventListener("click", () => updateDefaultMission(4));
        tgt.addEventListener("click", () => {
          let container = openPlanetList(
            context,
            (planet) => {
              OGBIData.json.options.customMissions[customMissionId].target[currentId] = planet;
              document.querySelector(".ogl-dialogOverlay").classList.remove("ogl-active");
              OGBIData.Save();
              updateCollectTooltipIcon();
            },
            OGBIData.json.options.customMissions[customMissionId].target[currentId],
            OGBIData.json.options.customMissions[customMissionId].mission
          );
          popupUtil.popup(false, container);
          OGBIData.Save();
        });

        color.addEventListener("click", () => {
          const colors = ["red", "orange", "yellow", "green", "blue", "violet", "gray", "brown"];

          let container = DOM.createDOM("div", { class: "ogk-customMission-colorChoice" });
          colors.forEach((colorName) => {
            const circle = container.appendChild(createDOM("div", { "data-marked": colorName }));
            container.appendChild(circle);
            if (OGBIData.json.options.customMissions[customMissionId].color == colorName) {
              circle.classList.add("ogl-active");
            }

            circle.addEventListener("click", () => {
              OGBIData.json.options.customMissions[customMissionId].color = colorName;
              OGBIData.Save();
              // Update UI
              btnCollect.setAttribute("data-marked", colorName);
              color.setAttribute("data-marked", colorName);
              container.querySelectorAll("div[data-marked]").forEach((e) => e.classList.remove("ogl-active"));
              circle.classList.add("ogl-active");
              container.closest(".ogl-dialog").querySelector(".close-tooltip").click();
            });
          });

          popupUtil.popup(false, container);
          OGBIData.Save();
        });

        btnCollect.addEventListener("mouseover", () => utilTooltip.tooltip(btnCollect, optionsDiv, false, false, 500));
        btnCollect.addEventListener("click", () => {
          if (btnCollectProcessing) {
            logger.warn("btnCollectProcessing->already");
            return;
          }
          try {
            btnCollectProcessing = true;

            //remove active class of .ogk-customMission buttons
            document.querySelectorAll(".ogk-customMission.ogl-active").forEach((btn) => {
              btn.classList.remove("ogl-active");
            });
            //add active class to the clicked button
            btnCollect.classList.add("ogl-active");

            const selectedRoute = OGBIData.json.options.customMissions[customMissionId];
            const selectedTarget = selectedRoute.target[currentId];

            //resest
            document.querySelector("#resetall").click();
            fleetState.collectMode = true;
            fleetState.expeditionMode = false;
            document.querySelector("#missionsDiv").setAttribute("data", "false");

            // select real target based on id or fallback to coordinates
            const findTargetByIdOrCoords = (sel) => {
              if (sel.type == 3) {
                // moon
                const byId = sel.id ? OGBIData.empire.find((p) => p.moon && p.moon.id == sel.id)?.moon : undefined;
                if (byId) return byId;
                return OGBIData.empire.find(
                  (p) =>
                    p.moon &&
                    p.moon.galaxy == sel.galaxy &&
                    p.moon.system == sel.system &&
                    p.moon.position == sel.position
                )?.moon;
              } else {
                // planet
                const byId = sel.id ? OGBIData.empire.find((p) => p.id == sel.id) : undefined;
                if (byId) return byId;
                return OGBIData.empire.find(
                  (p) => p.galaxy == sel.galaxy && p.system == sel.system && p.position == sel.position
                );
              }
            };
            const target = findTargetByIdOrCoords(selectedTarget);

            // Ghost spy: a P16 custom spy mission targets the empty slot of a nearby system, so the
            // coordinates come from the current planet plus the systemDistance offset rather than
            // from a stored target. Only the inputs on the game's own fleetdispatch form are filled -
            // the player still dispatches the fleet themselves (one click, one action).
            if (selectedRoute.mission == 6) {
              const systemDistance = context.rawURL.searchParams.get("systemDistance") ?? 0;
              let candidateSystem = OgamePageData.currentSystem + parseInt(systemDistance);
              if (OgamePageData.donutSystem) {
                const maxSystem = fleetDispatcher.fleetHelper.MAX_SYSTEM;
                if (candidateSystem > maxSystem) candidateSystem = candidateSystem - maxSystem;
                if (candidateSystem < 1) candidateSystem = maxSystem + candidateSystem;
              }
              document.querySelector(".ogl-coords #galaxyInput").value = OgamePageData.currentGalaxy;
              document.querySelector(".ogl-coords #systemInput").value = candidateSystem;
              document.querySelector(".ogl-coords #positionInput").value = 16;
            }
            //if target doesn't exist anymore (moved or destroyed) do not select a target and let the player select a new one by himself to avoid error and bad experience
            else if (target) {
              document.querySelector(".ogl-coords #galaxyInput").value = target.galaxy;
              document.querySelector(".ogl-coords #systemInput").value = target.system;
              document.querySelector(".ogl-coords #positionInput").value = target.position;
              fleetDispatcher.targetPlanet = target;

              //target display
              context.planetList.forEach((planet) => {
                let planetCoords = planet.querySelector(".planet-koords").textContent.split(":");
                planet.querySelector(".planetlink").classList.remove("ogl-target");
                planet.querySelector(".moonlink") && planet.querySelector(".moonlink").classList.remove("ogl-target");
                planet.querySelector(".planetlink").classList.remove("mission-3");
                planet.querySelector(".moonlink") && planet.querySelector(".moonlink").classList.remove("mission-4");
                if (
                  target.galaxy == planetCoords[0] &&
                  target.system == planetCoords[1] &&
                  target.position == planetCoords[2]
                ) {
                  if (target.type == 1) {
                    planet.querySelector(".planetlink").classList.add("ogl-target");
                    planet.querySelector(".planetlink").classList.add(`mission-${selectedRoute.mission}`);
                  } else if (planet.querySelector(".moonlink")) {
                    planet.querySelector(".moonlink").classList.add("ogl-target");
                    planet.querySelector(".moonlink").classList.add(`mission-${selectedRoute.mission}`);
                  }
                }
              });
            }

            //select cargo
            document.querySelector(".ogl-cargo a.send_none").click();
            if (OGBIData.json.options.customMissions[customMissionId].resources) {
              document.querySelector(".ogl-cargo a.select-most").click();
            }

            //fleet selection
            fleetDispatcher.resetShips();
            if (selectedRoute.ship === "select-most") {
              selectMostShips(context, false);
            } else if (selectedRoute.ship === "sendall") {
              selectAllShips(context, false);
            } else {
              selectBestCargoShip(context, selectedRoute.ship);
            }

            /*
             * if mission is espionage, has not selected probe and has one available, select at least one
             * here, we don't care about keep ships options, because it's a ghosting / emergency feature
             * so if the player want to keep his probe, he will get it at fleet return
             */
            if (selectedRoute.mission == 6) {
              const hasProbeSelected = fleetDispatcher.shipsToSend.some((s) => s.id == 210);
              if (!hasProbeSelected) selectShips(context, 210, 1);
            }

            fleetDispatcher.refreshTarget();
            fleetDispatcher.updateTarget();
            fleetDispatcher.fetchTargetPlayerData();
            fleetDispatcher.refresh();

            //select mission after selecting target and ships
            fleetDispatcher.mission = selectedRoute.mission;
            fleetDispatcher.selectMission(selectedRoute.mission);

            //reselect cargo
            if (OGBIData.json.options.customMissions[customMissionId].resources) {
              document.querySelector(".ogl-cargo a.select-most").click();
            }

            let nextId = currentId;
            const rotation = OGBIData.json.options.customMissions[customMissionId].rotation;
            if (rotation) {
              nextId = context.current.planet.nextElementSibling.id
                ? context.current.planet.nextElementSibling.id.split("-")[1]
                : document.querySelectorAll(".smallplanet")[0].id.split("-")[1];
              if (context.current.isMoon) {
                nextId = new URL(document.querySelector(`#planet-${nextId} .moonlink`).href).searchParams.get("cp");
              }
            }

            fleetState.onFleetSentRedirectUrl = () => {
              // we only need new next position Id, and indicate the current custom mission id in url
              const urlParams = new URLSearchParams({
                page: "ingame",
                component: "fleetdispatch",
                cp: nextId,
                oglMode: ogiMode.CUSTOM_MISSION,
                customMissionId: customMissionId,
              });
              // but some parameters could help for performance with rotation
              if (rotation) {
                urlParams.set("mission", selectedRoute.mission); //preselect mission
                if (selectedRoute.mission == 6) {
                  //find next coords for targe with nextId
                  const nextTarget =
                    OGBIData.empire.find((p) => p.id == nextId) ??
                    OGBIData.empire.find((p) => p.moon && p.moon.id == nextId)?.moon;
                  if (nextTarget.galaxy) urlParams.set("galaxy", nextTarget.galaxy);
                  if (nextTarget.system) urlParams.set("system", nextTarget.system);
                  urlParams.set("position", 16); //preselect P16
                  urlParams.set("type", 1); //preselect planetType

                  /*
                   * if there is some change in system, we need to calculate the difference of coordinates
                   * to apply it to the next target for preselection
                   */

                  if (fleetDispatcher.targetPlanet.system !== OgamePageData.currentSystem) {
                    const maxSystem = fleetDispatcher.fleetHelper.MAX_SYSTEM;
                    let distance = fleetDispatcher.targetPlanet.system - OgamePageData.currentSystem;
                    // In a donut system, if the distance is greater than half of the max, it's shorter to go through the loop.
                    if (OgamePageData.donutSystem) {
                      if (Math.abs(distance) > maxSystem / 2) {
                        distance = distance > 0 ? distance - maxSystem : distance + maxSystem;
                      }
                    }
                    urlParams.set("systemDistance", distance);
                  }
                } else {
                  const nextTarget = selectedRoute.target[nextId];
                  if (nextTarget) {
                    if (nextTarget.galaxy) urlParams.set("galaxy", nextTarget.galaxy);
                    if (nextTarget.system) urlParams.set("system", nextTarget.system);
                    if (nextTarget.position) urlParams.set("position", nextTarget.position);
                    if (nextTarget.type) urlParams.set("type", nextTarget.type);
                  }
                }
              }
              return "https://" + window.location.host + window.location.pathname + "?" + urlParams.toString();
            };
          } catch (error) {
            logger.error(error);
          } finally {
            btnCollectProcessing = false;
          }
        });
      }

      if (context.mode == ogiMode.CUSTOM_MISSION && fleetDispatcher.fleetCount < fleetDispatcher.maxFleetCount) {
        let urlcustomMissionId = context.rawURL.searchParams.get("customMissionId");
        if (urlcustomMissionId) {
          urlcustomMissionId = parseInt(urlcustomMissionId);
          if (OGBIData.json.options.customMissions[urlcustomMissionId].keepSpeed) {
            const lastSentFleet = OGBIData.json.lastSentFleet;

            if (lastSentFleet?.speedPercent) {
              fleetDispatcher.speedPercent = lastSentFleet.speedPercent;
              document.querySelector(`.ogl-fleetSpeed [data-step="${lastSentFleet?.speedPercent}"]`).click();
            }
          }

          if (OGBIData.json.options.customMissions[urlcustomMissionId].rotation) {
            const customMissionButton = document.querySelector(
              `.ogk-customMission.ogk-customMission-${urlcustomMissionId}`
            );
            if (customMissionButton) {
              customMissionButton.click();
            }
          }
        }
      }
    });
  }
}

function collect(context) {
  if (
    context.page == "fleetdispatch" &&
    fleetDispatcher.shipsOnPlanet?.find((x) => x.number > 0) !== undefined &&
    !fleetDispatcher.isOnVacation
  ) {
    let cargoChoice = createDOM("div", { class: "ogk-collect-cargo" });
    let btnCollect = document.querySelector("#allornone .secondcol").appendChild(
      createDOM("button", {
        class: `ogl-collect ${OGBIData.json.options.collect.mission == 4 ? "statio" : ""} ${
          OGBIData.json.options.collect.ship == 202
            ? "smallCargo"
            : OGBIData.json.options.collect.ship == 219
            ? "pathFinder"
            : "largeCargo"
        }`,
      })
    );
    let sc = cargoChoice.appendChild(
      createDOM("div", {
        class: `ogl-option ogl-fleet-ship choice ogl-fleet-202 ${
          OGBIData.json.options.collect.ship == 202 ? "highlight" : ""
        }`,
      })
    );
    let lc = cargoChoice.appendChild(
      createDOM("div", {
        class: `ogl-option ogl-fleet-ship choice ogl-fleet-203 ${
          OGBIData.json.options.collect.ship == 203 ? "highlight" : ""
        }`,
      })
    );
    let pf = cargoChoice.appendChild(
      createDOM("div", {
        class: `ogl-option ogl-fleet-ship choice ogl-fleet-219 ${
          OGBIData.json.options.collect.ship == 219 ? "highlight" : ""
        }`,
      })
    );
    let tr = cargoChoice.appendChild(
      createDOM("div", {
        class: `ogl-option choice-mission-icon ogl-mission-3 ${
          OGBIData.json.options.collect.mission == 3 ? "highlight" : ""
        }`,
      })
    );
    let dp = cargoChoice.appendChild(
      createDOM("div", {
        class: `ogl-option choice-mission-icon ogl-mission-4 ${
          OGBIData.json.options.collect.mission == 4 ? "highlight" : ""
        }`,
      })
    );
    let tgt = cargoChoice.appendChild(
      createDOM("div", {
        class: `ogl-option choice-target ${OGBIData.json.options.collect.target.type == 3 ? "moon" : "planet"}`,
      })
    );

    let updateCollectTooltipIcon = () => {
      let remove = OGBIData.json.options.collect.target.type == 1 ? "moon" : "planet";
      let add = OGBIData.json.options.collect.target.type == 3 ? "moon" : "planet";
      let classList = cargoChoice.querySelector(".choice-target").classList;
      if (classList.contains(remove)) classList.remove(remove);
      if (!classList.contains(add)) classList.add(add);
    };
    let updateDefaultCollectShip = (id) => {
      OGBIData.json.options.collect.ship = id;
      OGBIData.Save();
      document.querySelector(".ogl-collect").classList = `ogl-collect ${
        OGBIData.json.options.collect.mission == 4 ? "statio" : ""
      } ${
        OGBIData.json.options.collect.ship == 202
          ? "smallCargo"
          : OGBIData.json.options.collect.ship == 219
          ? "pathFinder"
          : "largeCargo"
      }`;
      document.querySelector(".ogk-collect-cargo .ogl-fleet-ship.highlight").classList.remove("highlight");
      document
        .querySelector(
          `.ogk-collect-cargo ${
            OGBIData.json.options.collect.ship == 202
              ? ".ogl-fleet-202"
              : OGBIData.json.options.collect.ship == 219
              ? ".ogl-fleet-219"
              : ".ogl-fleet-203"
          }`
        )
        .classList.add("highlight");
    };
    let updateDefaultCollectMission = (mission) => {
      OGBIData.json.options.collect.mission = mission;
      OGBIData.Save();
      document.querySelector(".ogl-collect").classList = `ogl-collect ${
        OGBIData.json.options.collect.mission == 4 ? "statio" : ""
      } ${
        OGBIData.json.options.collect.ship == 202
          ? "smallCargo"
          : OGBIData.json.options.collect.ship == 219
          ? "pathFinder"
          : "largeCargo"
      }`;
      document.querySelector(".ogk-collect-cargo .choice-mission-icon.highlight").classList.remove("highlight");
      document
        .querySelector(`.ogk-collect-cargo ${".ogl-mission-" + OGBIData.json.options.collect.mission}`)
        .classList.add("highlight");
    };
    sc.addEventListener("click", () => updateDefaultCollectShip(202));
    lc.addEventListener("click", () => updateDefaultCollectShip(203));
    pf.addEventListener("click", () => updateDefaultCollectShip(219));
    tr.addEventListener("click", () => updateDefaultCollectMission(3));
    dp.addEventListener("click", () => updateDefaultCollectMission(4));
    tgt.addEventListener("click", () => {
      let container = openPlanetList(
        context,
        (planet) => {
          OGBIData.json.options.collect.target = planet;
          document.querySelector(".ogl-dialogOverlay").classList.remove("ogl-active");
          OGBIData.Save();
          updateCollectTooltipIcon();
        },
        OGBIData.json.options.collect.target,
        OGBIData.json.options.collect.mission
      );
      popupUtil.popup(false, container);
      OGBIData.Save();
    });
    btnCollect.addEventListener("mouseover", () => utilTooltip.tooltip(btnCollect, cargoChoice, false, false, 500));
    btnCollect.addEventListener("click", () => {
      //remove active class of .ogk-customMission buttons
      document.querySelectorAll(".ogk-customMission.ogl-active").forEach((btn) => {
        btn.classList.remove("ogl-active");
      });

      document.querySelector("#resetall").click();
      fleetState.collectMode = true;
      fleetState.expeditionMode = false;
      document.querySelector("#missionsDiv").setAttribute("data", "false");
      fleetDispatcher.mission = OGBIData.json.options.collect.mission;
      document.querySelector(".ogl-cargo a.send_none").click();
      document.querySelector(".ogl-cargo a.select-most").click();
      fleetDispatcher.resetShips();
      selectBestCargoShip(context, OGBIData.json.options.collect.ship);
      let inputs = document.querySelectorAll(".ogl-coords input");
      inputs[0].value = OGBIData.json.options.collect.target.galaxy || context.homePlanetCoords.galaxy;
      inputs[1].value = OGBIData.json.options.collect.target.system || context.homePlanetCoords.system;
      inputs[2].value = OGBIData.json.options.collect.target.position || context.homePlanetCoords.position;
      fleetDispatcher.targetPlanet = {
        galaxy: inputs[0].value,
        system: inputs[1].value,
        position: inputs[2].value,
        type: OGBIData.json.options.collect.target.type || context.homePlanetCoords.type,
      };
      context.planetList.forEach((planet) => {
        let targetCoords = planet.querySelector(".planet-koords").textContent.split(":");
        planet.querySelector(".planetlink").classList.remove("ogl-target");
        planet.querySelector(".moonlink") && planet.querySelector(".moonlink").classList.remove("ogl-target");
        planet.querySelector(".planetlink").classList.remove("mission-3");
        planet.querySelector(".moonlink") && planet.querySelector(".moonlink").classList.remove("mission-4");
        if (
          fleetDispatcher.targetPlanet.galaxy == targetCoords[0] &&
          fleetDispatcher.targetPlanet.system == targetCoords[1] &&
          fleetDispatcher.targetPlanet.position == targetCoords[2]
        ) {
          if (fleetDispatcher.targetPlanet.type == 1) {
            planet.querySelector(".planetlink").classList.add("ogl-target");
            planet.querySelector(".planetlink").classList.add(`mission-${fleetDispatcher.mission}`);
          } else if (planet.querySelector(".moonlink")) {
            planet.querySelector(".moonlink").classList.add("ogl-target");
            planet.querySelector(".moonlink").classList.add(`mission-${fleetDispatcher.mission}`);
          }
        }
      });
      fleetDispatcher.refreshTarget();
      fleetDispatcher.updateTarget();
      fleetDispatcher.fetchTargetPlayerData();
      fleetDispatcher.selectMission(OGBIData.json.options.collect.mission);
      fleetDispatcher.refresh();
      let nextId = context.current.planet.nextElementSibling.id
        ? context.current.planet.nextElementSibling.id.split("-")[1]
        : document.querySelectorAll(".smallplanet")[0].id.split("-")[1];
      if (context.current.isMoon) {
        nextId = new URL(document.querySelector(`#planet-${nextId} .moonlink`).href).searchParams.get("cp");
      }
      fleetState.onFleetSentRedirectUrl =
        "https://" +
        window.location.host +
        window.location.pathname +
        `?page=ingame&component=fleetdispatch&cp=${nextId}&galaxy=${OGBIData.json.options.collect.target.galaxy}&system=${OGBIData.json.options.collect.target.system}&position=${OGBIData.json.options.collect.target.position}&type=${OGBIData.json.options.collect.target.type}&mission=${OGBIData.json.options.collect.mission}&oglMode=0`;
      document.querySelector(".ogl-cargo a.select-most").click();
    });
  }
}

export { customMissions, collect };
