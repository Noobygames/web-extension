import * as DOM from "../../ui/dom.js";
import debounce from "../../platform/debounce.js";
import { fleetState } from "./state.js";
import { getLogger } from "../../platform/logger.js";
import { createDOM, createSVG } from "../../ui/dom.js";
import { toFormattedNumber, fromFormattedNumber } from "../../format/numbers.js";
import * as Numbers from "../../format/numbers.js";
import * as popupUtil from "../../ui/popup.js";
import * as standardUnit from "../../game/standardUnit.js";
import Translator from "../../format/i18n/translate.js";
import OGBIData from "../../store/OGBIData.js";
import OgamePageData from "../../ogame/pageData.js";
import ogiMode from "../../ogame/ogiMode.js";
import PlayerClass from "../../game/playerClass.js";
import { keepOnPlanetDialog } from "./keepOnPlanet.js";
import {
  calcNeededShips,
  initUnionCombat,
  openPlanetList,
  overwriteFleetDispatcher,
  selectBestCargoShip,
  selectShips,
} from "./index.js";
import * as needsUtil from "../planetbar/needs.js";
import RecyclingYieldCalculator from "../../game/recyclingYieldCalculator.js";

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
 * OGBI's rebuild of the dispatch UI: the ship rows, the resource fillers, the target
 * picker and the speed selector.
 *
 * The single largest function in the extension, and the reason this module is split by
 * feature rather than by layer.
 */
function betterFleetDispatcher(context) {
  if (context.page == "fleetdispatch" && fleetDispatcher.shipsOnPlanet.length == 0) {
    // shipyard links when no ships on planets
    const totalResources = Math.max(
      0,
      fleetDispatcher.metalOnPlanet + fleetDispatcher.crystalOnPlanet + fleetDispatcher.deuteriumOnPlanet
    );
    const smallCargo = calcNeededShips(context, { fret: 202, resources: totalResources });
    const largeCargo = calcNeededShips(context, { fret: 203, resources: totalResources });
    const pathfinder = calcNeededShips(context, { fret: 219, resources: totalResources });
    const recycler = calcNeededShips(context, { fret: 209, resources: totalResources });
    const planetId = context.current.isMoon ? OGBIData.empire[context.current.index].moonID : context.current.id;
    const shipyardURL =
      `https://s${context.universe}-${OgamePageData.gameLang}.ogame.gameforge.com/game/index.php?page=ingame` +
      `&component=shipyard&cp=${planetId}`;
    const neededShipsDiv = DOM.createDOM("div", { class: "noShips" });
    neededShipsDiv.appendChild(DOM.createDOM("div", { class: "ogl-res-transport" })).append(
      DOM.createDOM("a", {
        "tech-id": "202",
        class: "ogl-option noShips ogl-fleet-ship ogl-fleet-202",
        href: shipyardURL + `&techId202=${smallCargo}`,
      }),
      DOM.createDOM("span", {}, `${toFormattedNumber(smallCargo, 0)}`),
      DOM.createDOM("a", {
        "tech-id": "203",
        class: "ogl-option noShips ogl-fleet-ship ogl-fleet-203",
        href: shipyardURL + `&techId203=${largeCargo}`,
      }),
      DOM.createDOM("span", {}, `${toFormattedNumber(largeCargo, 0)}`),
      DOM.createDOM("a", {
        "tech-id": "219",
        class: "ogl-option noShips ogl-fleet-ship ogl-fleet-219",
        href: shipyardURL + `&techId219=${pathfinder}`,
      }),
      DOM.createDOM("span", {}, `${toFormattedNumber(pathfinder, 0)}`),
      DOM.createDOM("a", {
        "tech-id": "209",
        class: "ogl-option noShips ogl-fleet-ship ogl-fleet-209",
        href: shipyardURL + `&techId209=${recycler}`,
      }),
      DOM.createDOM("span", {}, `${toFormattedNumber(recycler, 0)}`)
    );
    document.querySelector("#warning").appendChild(neededShipsDiv);
  }
  if (
    context.page == "fleetdispatch" &&
    document.querySelector("#civilships") &&
    fleetDispatcher.shipsOnPlanet.length != 0
  ) {
    let metalAvailable = Math.max(0, fleetDispatcher.metalOnPlanet);
    let crystalAvailable = Math.max(0, fleetDispatcher.crystalOnPlanet);
    let deutAvailable = Math.max(0, fleetDispatcher.deuteriumOnPlanet);
    let fleetPageParameters = new URLSearchParams(window.location.search);
    let selectedMission = null;
    if (fleetPageParameters.has("type") && fleetPageParameters.has("mission")) {
      if (fleetDispatcher.mission) selectedMission = fleetDispatcher.mission;
    }
    let foodAvailable = Math.max(0, fleetDispatcher.foodOnPlanet);

    let needCargo = (fret) => {
      let metal = fromFormattedNumber(metalFiller.value, true);
      if (metal > metalAvailable) metalFiller.value = toFormattedNumber(metalAvailable, 0);
      let crystal = fromFormattedNumber(crystalFiller.value, true);
      if (crystal > crystalAvailable) crystalFiller.value = toFormattedNumber(crystalAvailable, 0);
      let deut = fromFormattedNumber(deutFiller.value, true);
      if (deut > deutAvailable)
        deutFiller.value = toFormattedNumber(Math.max(0, deutAvailable - fleetDispatcher.getConsumption()), 0);
      let amount = calcNeededShips(context, {
        fret: fret,
        resources:
          Math.min(metal, metalAvailable) + Math.min(crystal, crystalAvailable) + Math.min(deut, deutAvailable),
      });
      return amount;
    };
    let highlightFleetTarget = () => {
      context.planetList.forEach((planet) => {
        let targetCoords = planet.querySelector(".planet-koords").textContent.split(":");
        planet.querySelector(".planetlink") && planet.querySelector(".planetlink").classList.remove("ogl-target");
        planet.querySelector(".moonlink") && planet.querySelector(".moonlink").classList.remove("ogl-target");
        planet.querySelector(".planetlink") && planet.querySelector(".planetlink").classList.remove("mission-3");
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
    };
    let dispatch = document.querySelector("#shipsChosen").appendChild(createDOM("div", { class: "ogl-dispatch" }));
    if (!OGBIData.json.options.dispatcher) {
      dispatch.style.display = "none";
    }
    let destination = dispatch.appendChild(createDOM("div", { class: "ogl-dest" }));
    let systemButtons = destination.appendChild(
      createDOM("div", { class: "ogl-system-buttons", system: fleetDispatcher.targetPlanet.system })
    );

    let systemInputMinus = systemButtons.appendChild(createDOM("span", { class: "ogl-system-input-minus" }));
    let systemInputPlus = systemButtons.appendChild(createDOM("span", { class: "ogl-system-input-plus" }));
    let resDiv = dispatch.appendChild(createDOM("div"));
    let actions = resDiv.appendChild(createDOM("div", { class: "ogl-transport" }));
    let coords = destination.appendChild(createDOM("div", { class: "ogl-coords" }));
    document.querySelectorAll("#buttonz .move-box-wrapper + .header").forEach((elem) => (elem.style.display = "none"));
    document.querySelectorAll("#buttonz .missionHeader").forEach((elem) => (elem.style.display = "none"));
    document.querySelectorAll("#buttonz .move-box-wrapper").forEach((elem) => (elem.style.display = "none"));
    document.querySelectorAll("#buttonz .footer").forEach((elem) => (elem.style.display = "none"));
    document.querySelector("#target .coords br").previousSibling.remove();
    document.querySelector("#target .coords br").nextSibling.remove();
    document.querySelector("#target .coords br").remove();
    document.querySelector("#mission tr").style.display = "none";
    document.querySelector("#start .coords").textContent =
      "[" + document.querySelector("#start .coords span").textContent + "]";
    document
      .querySelector("#fleetboxdestination")
      .parentNode.insertBefore(
        createDOM("div", { id: "ogi-fleet2-ships" }),
        document.querySelector("#fleetboxdestination").nextSibling
      );
    document.querySelector("#ogi-fleet2-ships").appendChild(createDOM("div", { class: "content" }));
    document
      .querySelector("#ogi-fleet2-ships")
      .appendChild(
        DOM.createDOMSanitized(
          "div",
          { class: "ajax_loading", style: "display: none;" },
          '<div class="ajax_loading_overlay"></div>'
        )
      );
    let warning = coords.appendChild(
      createDOM("a", { class: "ogl-warning tooltipRight", "data-title": Translator.translate(117) })
    );
    let galaxyInput = coords.appendChild(
      createDOM("input", {
        id: "galaxyInput",
        type: "text",
        pattern: "[0-9]*",
        value: fleetDispatcher.targetPlanet.galaxy,
      })
    );
    let systemInput = coords.appendChild(
      createDOM("input", {
        id: "systemInput",
        type: "text",
        pattern: "[0-9]*",
        value: fleetDispatcher.targetPlanet.system,
      })
    );
    let positionInput = coords.appendChild(
      createDOM("input", {
        id: "positionInput",
        type: "text",
        pattern: "[0-9]*",
        value: fleetDispatcher.targetPlanet.position,
      })
    );
    let planet = coords.appendChild(createDOM("a", { class: "ogl-planet-icon", title: Translator.translate(42) }));
    let moon = coords.appendChild(createDOM("a", { class: "ogl-moon-icon", title: Translator.translate(194) }));
    let debris = coords.appendChild(createDOM("a", { class: "ogl-debris-icon", title: Translator.translate(76) }));
    planet.addEventListener("click", () => {
      fleetDispatcher.targetPlanet.type = fleetDispatcher.fleetHelper.PLANETTYPE_PLANET;
      fleetDispatcher.fetchTargetPlayerData();
      update(true);
    });
    moon.addEventListener("click", () => {
      fleetDispatcher.targetPlanet.type = fleetDispatcher.fleetHelper.PLANETTYPE_MOON;
      fleetDispatcher.fetchTargetPlayerData();
      update(true);
    });
    debris.addEventListener("click", () => {
      fleetDispatcher.targetPlanet.type = fleetDispatcher.fleetHelper.PLANETTYPE_DEBRIS;
      fleetDispatcher.fetchTargetPlayerData();
      update(true);
    });
    let trySubmitFleet1 = fleetDispatcher.trySubmitFleet1.bind(fleetDispatcher);
    fleetDispatcher.trySubmitFleet1 = () => {
      clearTimeout(fleetDispatcher.fetchTargetPlayerDataTimeout);
      fleetDispatcher.fetchTargetPlayerDataTimeout = setTimeout(() => {
        fleetDispatcher.deferred.push($.Deferred());
        if (fleetDispatcher.deferred.length === 1) {
          trySubmitFleet1();
        }
        fleetDispatcher.deferred[fleetDispatcher.deferred.length - 1].done(() => {
          if (fleetDispatcher.deferred.length !== 0) {
            trySubmitFleet1();
          }
        });
      }, 250);
    };
    let that = this;
    overwriteFleetDispatcher(context, "focusSubmitFleet1", false, () => {
      if (!fleetState.expeditionMode) {
        fleetDispatcher.refreshTarget();
        fleetDispatcher.updateTarget();
        clearTimeout(fleetDispatcher.fetchTargetPlayerDataTimeout);
        fleetDispatcher.fetchTargetPlayerDataTimeout = setTimeout(() => {
          fleetDispatcher.deferred.push($.Deferred());
          if (fleetDispatcher.deferred.length === 1) {
            fleetDispatcher.fetchTargetPlayerData();
          }
          fleetDispatcher.deferred[fleetDispatcher.deferred.length - 1].done(() => {
            if (fleetDispatcher.deferred.length !== 0) {
              fleetDispatcher.fetchTargetPlayerData();
            }
          });
        }, 500);
      }
    });
    let auxAjaxFailed = false;
    overwriteFleetDispatcher(context, "setTargetPlayerNameOnStatusBarFleet", false, () => {
      auxAjaxFailed = true;
    });
    overwriteFleetDispatcher(context, "stopLoading", false, () => {
      let that = this;
      let missions = fleetDispatcher.getAvailableMissions();
      let warning = document.getElementsByClassName("ogl-warning tooltipRight")[0];
      let missionsDiv = document.getElementsByClassName("ogl-missions")[0];
      let iconsDiv;
      if (auxAjaxFailed) {
        missionsDiv.replaceChildren(createDOM("span", { style: "color: #9099a3" }, `${Translator.translate(111)}`));
        warning.style.visibility = "visible";
        warning.setAttribute("data-title", Translator.translate(116));
        auxAjaxFailed = false;
      } else if (missions.length == 0 || !fleetDispatcher.hasShipsSelected()) {
        missionsDiv.replaceChildren(createDOM("span", { style: "color: #9099a3" }, `${Translator.translate(111)}`));
        warning.style.visibility = "visible";
        warning.setAttribute("data-title", Translator.translate(115));
      } else {
        warning.style.visibility = "hidden";
        missionsDiv.html(
          "<span>" +
            fleetDispatcher.targetPlayerRankIcon +
            `<span class="status_abbr_${fleetDispatcher.targetPlayerColorClass}">${fleetDispatcher.targetPlayerName}</span>` +
            "</span>"
        );
        if (missionsDiv.textContent == "") {
          if (fleetDispatcher.targetPlanet.name == "?") fleetDispatcher.targetPlanet.name = "Unknown";
          missionsDiv.replaceChildren(createDOM("span", {}, fleetDispatcher.targetPlanet.name));
        }
        iconsDiv = missionsDiv.appendChild(createDOM("div"));
        let defaultMission;
        missions.forEach((index) => {
          iconsDiv.appendChild(createDOM("div", { class: `ogl-mission-${index} ogl-mission-icon`, mission: index }));
        });

        if (
          fleetDispatcher.currentPage == "fleet1" ||
          (fleetDispatcher.currentPage == "fleet2" && missions.length > 0)
        ) {
          let missionURL = Number(context.rawURL.searchParams.get("mission"));
          let autoSelectMission = document.querySelector("#missionsDiv").getAttribute("data") != "false";
          if (missions.length == 1) {
            defaultMission = missions[0];
          } else {
            if (autoSelectMission || !missions.includes(fleetDispatcher.mission)) {
              if (missionURL != 0 && missions.includes(missionURL)) {
                defaultMission = missionURL;
              } else if (fleetDispatcher.targetPlanet.position == 16) {
                if (fleetDispatcher.mission !== 15 && fleetDispatcher.mission !== 6) {
                  defaultMission = OGBIData.json.options.expeditionMission == 15 ? 15 : 6;
                } else {
                  defaultMission = fleetDispatcher.mission;
                }
              } else if (fleetDispatcher.targetIsBuddyOrAllyMember || !missions.includes(1)) {
                // if available missions do not include attack mission, the target is own planet/moon
                defaultMission = OGBIData.json.options.harvestMission;
              } else {
                defaultMission = OGBIData.json.options.foreignMission;
              }
            } else {
              defaultMission = fleetDispatcher.mission;
            }
          }
        }
        let icon = document.querySelectorAll(`div[mission="${defaultMission}"]`)[0];
        if (icon && icon != null) {
          icon.classList.add("ogl-active");
        }
        fleetDispatcher.selectMission(Number(defaultMission));
        $("div.ogl-mission-icon").on("click", (e) => {
          $("div.ogl-mission-icon").removeClass("ogl-active");
          fleetDispatcher.selectMission(Number(e.target.getAttribute("mission")));
          e.target.classList.add("ogl-active");
          document.querySelector("#missionsDiv").setAttribute("data", "false");
          update(false);
        });
        update(false);
      }
    });
    const homeSvg = createSVG("svg", { height: "12px", viewBox: "0 0 512 512", width: "12px" });
    homeSvg.appendChild(
      createSVG("path", {
        fill: "white",
        d:
          "m498.195312 222.695312c-.011718-.011718-.023437-.023437-.035156-.035156l-208.855468-208.847656c-8.902344" +
          "-8.90625-20.738282-13.8125-33.328126-13.8125-12.589843 0-24.425781 4.902344-33.332031 13.808594l-208.746" +
          "093 208.742187c-.070313.070313-.140626.144531-.210938.214844-18.28125 18.386719-18.25 48.21875.089844 66" +
          ".558594 8.378906 8.382812 19.445312 13.238281 31.277344 13.746093.480468.046876.964843.070313 1.453124.0" +
          "70313h8.324219v153.699219c0 30.414062 24.746094 55.160156 55.167969 55.160156h81.710938c8.28125 0 15-6.7" +
          "14844 15-15v-120.5c0-13.878906 11.289062-25.167969 25.167968-25.167969h48.195313c13.878906 0 25.167969 1" +
          "1.289063 25.167969 25.167969v120.5c0 8.285156 6.714843 15 15 15h81.710937c30.421875 0 55.167969-24.74609" +
          "4 55.167969-55.160156v-153.699219h7.71875c12.585937 0 24.421875-4.902344 33.332031-13.808594 18.359375-1" +
          "8.371093 18.367187-48.253906.023437-66.636719zm0 0",
      })
    );
    let planetList = coords.appendChild(createDOM("div", { class: "ogl-homes" }).appendChild(homeSvg).parentElement);
    if (unions.length != 0) {
      let unionsBtn = coords.appendChild(
        createDOM("div", { class: "ogl-union-btn" }).appendChild(
          createDOM("img", {
            src: "https://gf3.geo.gfsrv.net/cdn56/2ff25995f98351834db4b5aa048c68.gif",
            height: "16",
            width: "16",
          })
        ).parentElement
      );
      unionsBtn.addEventListener("click", () => {
        let container = createDOM("div", { class: "ogl-quickLinks", style: "display: flex;flex-direction:column" });
        for (let i in unions) {
          let union = unions[i];
          let unionDiv = container.appendChild(
            createDOM(
              "div",
              { class: "ogl-quickPlanet" },
              `${union.name} [${union.galaxy}:${union.system}:${union.position}] ${union.planetType == 1 ? "P" : "M"}`
            )
          );
          unionDiv.addEventListener("click", () => {
            fleetDispatcher.union = union.id;
            fleetDispatcher.targetPlanet.position = union.position;
            fleetDispatcher.targetPlanet.system = union.system;
            fleetDispatcher.targetPlanet.galaxy = union.galaxy;
            fleetDispatcher.targetPlanet.type = union.planetType;
            galaxyInput.value = fleetDispatcher.targetPlanet.galaxy;
            systemInput.value = fleetDispatcher.targetPlanet.system;
            positionInput.value = fleetDispatcher.targetPlanet.position;
            document.querySelector(".ogl-dialog .close-tooltip").click();
            fleetDispatcher.updateTarget();
            setTimeout(() => {
              fleetDispatcher.fetchTargetPlayerData();
              fleetDispatcher.selectMission(2);
              selectedMission = 2;
            }, 50);
            update(true);
            initUnionCombat(context, union);
          });
        }
        popupUtil.popup(false, container);
      });
    }
    planetList.addEventListener("click", () => {
      let container = openPlanetList(
        context,
        (planet) => {
          fleetDispatcher.targetPlanet = planet;
          fleetDispatcher.refresh();
          galaxyInput.value = fleetDispatcher.targetPlanet.galaxy;
          systemInput.value = fleetDispatcher.targetPlanet.system;
          positionInput.value = fleetDispatcher.targetPlanet.position;
          document.querySelector(".ogl-dialogOverlay").classList.remove("ogl-active");
          fleetDispatcher.refreshTarget();
          fleetDispatcher.updateTarget();
          fleetDispatcher.fetchTargetPlayerData();
          update(true);
        },
        fleetDispatcher.targetPlanet,
        fleetDispatcher.mission
      );
      popupUtil.popup(false, container);
    });
    let briefing = destination.appendChild(createDOM("div", { style: "flex-direction: column" }));
    let info = briefing.appendChild(createDOM("div", { class: "ogl-info" }));
    info.appendChild(createDOM("div", {}, Translator.translate(43)));
    let arrivalDiv = info.appendChild(createDOM("div", { class: "ogl-arrival-time" }));
    info.appendChild(createDOM("div", {}, Translator.translate(44)));
    let durationDiv = info.appendChild(createDOM("div", { class: "ogl-duration" }));
    info.appendChild(createDOM("div", {}, Translator.translate(45)));
    let returnDiv = info.appendChild(createDOM("div", { class: "ogl-return-time" }));
    returnDiv.style.visibility = "hidden";
    info.appendChild(createDOM("div", {}, Translator.translate(49)));
    let consDiv = info.appendChild(createDOM("div", { class: "undermark" }));
    info.appendChild(createDOM("div", {}, Translator.translate(227)));
    let emptySystemsDiv = info.appendChild(createDOM("div", { class: "ogl-empty-systems" }));
    info.appendChild(createDOM("div", {}, Translator.translate(228)));
    let inactiveSystemsDiv = info.appendChild(createDOM("div", { class: "ogl-inactive-systems" }));

    // fleet speed selector in page fleet 1
    const slider = DOM.createDOM("div", { style: "margin-top: 10px" });
    if (context.playerClass === PlayerClass.WARRIOR) {
      slider
        .appendChild(DOM.createDOM("div", { class: "ogl-fleetSpeed first" }))
        .append(
          DOM.createDOM("div", { "data-step": "0.5" }, "5"),
          DOM.createDOM("div", { "data-step": "1" }, "10"),
          DOM.createDOM("div", { "data-step": "1.5" }, "15"),
          DOM.createDOM("div", { "data-step": "2" }, "20"),
          DOM.createDOM("div", { "data-step": "2.5" }, "25"),
          DOM.createDOM("div", { "data-step": "3" }, "30"),
          DOM.createDOM("div", { "data-step": "3.5" }, "35"),
          DOM.createDOM("div", { "data-step": "4" }, "40"),
          DOM.createDOM("div", { "data-step": "4.5" }, "45"),
          DOM.createDOM("div", { "data-step": "5" }, "50")
        );
      slider
        .appendChild(DOM.createDOM("div", { class: "ogl-fleetSpeed second" }))
        .append(
          DOM.createDOM("div", { "data-step": "5.5" }, "55"),
          DOM.createDOM("div", { "data-step": "6" }, "60"),
          DOM.createDOM("div", { "data-step": "6.5" }, "65"),
          DOM.createDOM("div", { "data-step": "7" }, "70"),
          DOM.createDOM("div", { "data-step": "7.5" }, "75"),
          DOM.createDOM("div", { "data-step": "8" }, "80"),
          DOM.createDOM("div", { "data-step": "8.5" }, "85"),
          DOM.createDOM("div", { "data-step": "9" }, "90"),
          DOM.createDOM("div", { "data-step": "9.5" }, "95"),
          DOM.createDOM("div", { class: "ogl-active", "data-step": "10" }, "100")
        );
    } else {
      slider
        .appendChild(DOM.createDOM("div", { class: "ogl-fleetSpeed" }))
        .append(
          DOM.createDOM("div", { "data-step": "1" }, "10"),
          DOM.createDOM("div", { "data-step": "2" }, "20"),
          DOM.createDOM("div", { "data-step": "3" }, "30"),
          DOM.createDOM("div", { "data-step": "4" }, "40"),
          DOM.createDOM("div", { "data-step": "5" }, "50"),
          DOM.createDOM("div", { "data-step": "6" }, "60"),
          DOM.createDOM("div", { "data-step": "7" }, "70"),
          DOM.createDOM("div", { "data-step": "8" }, "80"),
          DOM.createDOM("div", { "data-step": "9" }, "90"),
          DOM.createDOM("div", { class: "ogl-active", "data-step": "10" }, "100")
        );
    }
    briefing.appendChild(slider);

    let oldDeut = null;
    $(".ogl-fleetSpeed div").on("click", (event) => {
      $(".ogl-fleetSpeed div").removeClass("ogl-active");
      fleetDispatcher.speedPercent = event.target.getAttribute("data-step");
      $(`.ogl-fleetSpeed div[data-step="${fleetDispatcher.speedPercent}"]`).addClass("ogl-active");
      update(false);
      deutLeft.classList.remove("middlemark");
    });
    $(".ogl-fleetSpeed div").on("mouseover", (event) => {
      fleetDispatcher.speedPercent = event.target.getAttribute("data-step");
      if (!oldDeut) oldDeut = deutFiller.value;
      let old = fromFormattedNumber(deutLeft.textContent, true);
      update(false);
      document.querySelector("input#deuterium").value = deutFiller.value;
      if (fromFormattedNumber(deutLeft.textContent, true) != old) {
        deutLeft.classList.add("middlemark");
        document.querySelector(".ogi-deuteriumLeft").classList.add("middlemark");
      }
    });
    $(".ogl-fleetSpeed div").on("mouseout", (event) => {
      fleetDispatcher.speedPercent = slider.querySelector(".ogl-active").getAttribute("data-step");
      deutFiller.value = oldDeut;
      document.querySelector("input#deuterium").value = oldDeut;
      oldDeut = null;
      if (deutLeft.classList.contains("middlemark")) {
        deutLeft.classList.remove("middlemark");
        document.querySelector(".ogi-deuteriumLeft").classList.remove("middlemark");
      }
      update(false);
    });
    $("a[id^='missionButton']").on("click", () => {
      document.querySelector("#missionsDiv").setAttribute("data", "false");
      highlightFleetTarget();
    });
    $("#resetall").on("click", () => {
      document.querySelector("#missionsDiv").setAttribute("data", "true");
    });
    let missionsDiv = destination.appendChild(createDOM("div", { class: "ogl-missions", id: "missionsDiv" }));
    missionsDiv.replaceChildren(createDOM("span", { style: "color: #9099a3" }, `${Translator.translate(111)}`));
    let switchToPage = fleetDispatcher.switchToPage.bind(fleetDispatcher);
    let refresh = fleetDispatcher.refresh.bind(fleetDispatcher);
    let resetShips = fleetDispatcher.resetShips.bind(fleetDispatcher);
    let selectShip = fleetDispatcher.selectShip.bind(fleetDispatcher);
    fleetDispatcher.selectShip = (shipId, number) => {
      selectShip(shipId, number);
      if (fleetDispatcher.mission == 0) {
        fleetDispatcher.selectMission(3);
      }
      update(true);
      onResChange(2);
      onResChange(1);
      onResChange(0);
      onShipsChange();
    };
    fleetDispatcher.resetShips = () => {
      resetShips();
      update(true);
      onResChange(2);
      onResChange(1);
      onResChange(0);
      onShipsChange();
    };
    let isDefaultMission = (index) => {
      if (context.rawURL.searchParams.get("mission") == 1) {
        if (index == 1) {
          return true;
        } else {
          return false;
        }
      }
      if (context.rawURL.searchParams.get("mission") == 3) {
        if (index == 3) {
          return true;
        } else {
          return false;
        }
      }
      if (context.rawURL.searchParams.get("mission") == 6) {
        if (index == 6) {
          return true;
        } else {
          return false;
        }
      }
      if (index == 3) {
        if (fleetDispatcher.targetPlayerId == playerId && OGBIData.json.options.harvestMission == 3) {
          return true;
        } else if (OGBIData.json.options.foreignMission == 3) {
          return true;
        }
      }
      if (index == 1 && (context.mode == ogiMode.RAID || OGBIData.json.options.foreignMission == 1)) {
        return true;
      }
      if (index == 4 && OGBIData.json.options.harvestMission == 4) {
        return true;
      }
      if (index == 15 && (OGBIData.json.options.expeditionMission == 15 || fleetState.expeditionMode)) {
        fleetState.expeditionMode = false;
        return true;
      }
      if (index == 6 && OGBIData.json.options.expeditionMission == 6 && !fleetState.expeditionMode) {
        return true;
      }
      return false;
    };
    fleetDispatcher.switchToPage = (page) => {
      if (!(fleetDispatcher.currentPage == "fleet1" && page == "fleet3")) {
        switchToPage(page);
        if (fleetDispatcher.currentPage == "fleet3") {
          if (fleetDispatcher.mission == 0) {
            let missionIcons = document.querySelectorAll("#missions .on a");
            let mission = 0;
            if (missionIcons.length == 1) {
              missionIcons[0].click();
            } else {
              missionIcons.forEach((elem) => {
                mission = elem.getAttribute("data-mission");
                if (isDefaultMission(mission)) {
                  elem.click();
                }
              });
            }
          }
        }
      } else {
        document.querySelector("#continueToFleet2").style.filter = "none";
        if (fleetDispatcher.shipsToSend.length == 0) {
          document
            .querySelector(".ogl-dispatch .ogl-missions")
            .replaceChildren(createDOM("span", { style: "color: #9099a3" }, `${Translator.translate(111)}`));
          warning.style.visibility = "visible";
          warning.setAttribute("data-title", Translator.translate(115));
          return;
        }
        fleetDispatcher.mission = 0;
        let missions = fleetDispatcher.getAvailableMissions();
        let iconsDiv;
        if (missions.length == 0) {
          missionsDiv.replaceChildren(createDOM("span", { style: "color: #9099a3" }, `${Translator.translate(111)}`));
        } else {
          warning.style.visibility = "hidden";
          missionsDiv.html(
            "<span>" +
              fleetDispatcher.targetPlayerRankIcon +
              `<span class="status_abbr_${fleetDispatcher.targetPlayerColorClass}">${fleetDispatcher.targetPlayerName}</span>` +
              "</span>"
          );
          if (missionsDiv.textContent == "") {
            if (fleetDispatcher.targetPlanet.name == "?") fleetDispatcher.targetPlanet.name = "Unknown";
            missionsDiv.replaceChildren(createDOM("span", {}, fleetDispatcher.targetPlanet.name));
          }
          iconsDiv = missionsDiv.appendChild(createDOM("div"));
        }
        let defaultMish = 0;
        let union = false;
        missions.forEach((index) => {
          iconsDiv.appendChild(createDOM("div", { class: `ogl-mission-${index} ogl-mission-icon`, mission: index }));
          if (missions.length == 1) {
            defaultMish = index;
          } else {
            if (isDefaultMission(index)) {
              defaultMish = index;
            }
            if (index == 2) {
              union = true;
            }
          }
        });
        if (union) {
          defaultMish = 2;
        }
        let icon = document.querySelector(`.ogl-missions .ogl-mission-${defaultMish}`);
        icon.classList.add("ogl-active");
        fleetDispatcher.selectMission(Number(defaultMish));
        $("div.ogl-mission-icon").on("click", (e) => {
          $("div.ogl-mission-icon").removeClass("ogl-active");
          fleetDispatcher.selectMission(Number(e.target.getAttribute("mission")));
          e.target.classList.add("ogl-active");
          update(false);
        });
      }
      update(false);
    };
    let displayErrors = fleetDispatcher.displayErrors;
    let error;
    fleetDispatcher.displayErrors = function (errors) {
      document
        .querySelector(".ogl-dispatch .ogl-missions")
        .replaceChildren(createDOM("span", { style: "color: #9099a3" }, `${Translator.translate(111)}`));
      warning.style.visibility = "visible";
      document.querySelector("#continueToFleet2").style.filter = "hue-rotate(-50deg)";
      warning.setAttribute("data-title", errors[0].message);
      error = errors[0].message;
      if (fleetDispatcher.currentPage == "fleet1") return;
      displayErrors(errors);
    };
    let fleet = JSON.stringify(fleetDispatcher.shipsToSend.map((elem) => elem.id));
    let targetPlanet = JSON.stringify(fleetDispatcher.targetPlanet);
    let interval;
    let timeout;
    let firstLoad = true;
    let update = (submit) => {
      if (fleetDispatcher.currentPage == "fleet1") {
        let galaxy = clampInt(galaxyInput.value, 1, fleetDispatcher.fleetHelper.MAX_GALAXY, true);
        galaxyInput.value = galaxy;
        let system = clampInt(systemInput.value, 1, fleetDispatcher.fleetHelper.MAX_SYSTEM, true);
        systemInput.value = system;
        let position = clampInt(positionInput.value, 1, fleetDispatcher.fleetHelper.MAX_POSITION, true);
        positionInput.value = position;
        fleetDispatcher.targetPlanet.galaxy = galaxy;
        fleetDispatcher.targetPlanet.system = system;
        fleetDispatcher.targetPlanet.position = position;
      } else {
        galaxyInput.value = fleetDispatcher.targetPlanet.galaxy;
        galaxyInput.setAttribute("value", fleetDispatcher.targetPlanet.galaxy);
        systemInput.value = fleetDispatcher.targetPlanet.system;
        systemInput.setAttribute("value", fleetDispatcher.targetPlanet.system);
        positionInput.value = fleetDispatcher.targetPlanet.position;
        positionInput.setAttribute("value", fleetDispatcher.targetPlanet.position);
      }
      if (fleetDispatcher.mission == 4 || fleetDispatcher.mission == 0) {
        returnDiv.style.visibility = "hidden";
      } else {
        returnDiv.style.visibility = "visible";
      }
      if (submit) {
        let newFleet = JSON.stringify(fleetDispatcher.shipsToSend.map((elem) => elem.id));
        let newTargetPlanet = JSON.stringify(fleetDispatcher.targetPlanet);
        if (newFleet != fleet || targetPlanet != newTargetPlanet || firstLoad) {
          firstLoad = false;
          warning.style.visibility = "hidden";
          fleet = newFleet;
          targetPlanet = newTargetPlanet;
          clearTimeout(timeout);
        }
      }
      planet.classList.remove("ogl-active");
      moon.classList.remove("ogl-active");
      debris.classList.remove("ogl-active");
      if (fleetDispatcher.targetPlanet.type == fleetDispatcher.fleetHelper.PLANETTYPE_PLANET) {
        planet.classList.add("ogl-active");
      }
      if (fleetDispatcher.targetPlanet.type == fleetDispatcher.fleetHelper.PLANETTYPE_MOON) {
        moon.classList.add("ogl-active");
      }
      if (fleetDispatcher.targetPlanet.type == fleetDispatcher.fleetHelper.PLANETTYPE_DEBRIS) {
        debris.classList.add("ogl-active");
      }
      if (interval) clearInterval(interval);
      let reset = (noShips) => {
        durationDiv.textContent = "-";
        consDiv.textContent = "-";
        arrivalDiv.textContent = "-";
        returnDiv.textContent = "-";
        emptySystemsDiv.textContent = "-";
        inactiveSystemsDiv.textContent = "-";
        document
          .querySelector(".ogl-dispatch .ogl-missions")
          .replaceChildren(createDOM("span", { style: "color: #9099a3" }, `${Translator.translate(111)}`));
        warning.style.visibility = "visible";
        warning.setAttribute("data-title", Translator.translate(117));
        if (noShips) {
          warning.setAttribute("data-title", Translator.translate(115));
        }
        document.querySelector("#continueToFleet2").style.filter = "hue-rotate(-50deg)";
      };
      if (!fleetDispatcher.hasShipsSelected()) {
        reset(true);
        return;
      }
      if (
        context.current.coords ==
        fleetDispatcher.targetPlanet.galaxy +
          ":" +
          fleetDispatcher.targetPlanet.system +
          ":" +
          fleetDispatcher.targetPlanet.position
      ) {
        if (
          context.current.isMoon &&
          fleetDispatcher.targetPlanet.type == fleetDispatcher.fleetHelper.PLANETTYPE_MOON
        ) {
          reset();
          return;
        } else if (
          !context.current.isMoon &&
          fleetDispatcher.targetPlanet.type == fleetDispatcher.fleetHelper.PLANETTYPE_PLANET
        ) {
          reset();
          return;
        }
      }
      if (fleetDispatcher.mission == 0) {
        reset();
        return;
      }
      let icon = document.querySelectorAll(`div[mission="${fleetDispatcher.mission}"]`)[0];
      if (icon && icon != null) {
        $("div.ogl-mission-icon").removeClass("ogl-active");
        icon.classList.add("ogl-active");
      }
      durationDiv.replaceChildren(createDOM("strong", {}, formatTime(fleetDispatcher.getDuration())));
      if (fleetDispatcher.emptySystems > 0) {
        emptySystemsDiv.textContent = fleetDispatcher.emptySystems;
        emptySystemsDiv.classList.add("middlemark");
      } else {
        emptySystemsDiv.textContent = "-";
        emptySystemsDiv.classList.remove("middlemark");
      }

      if (fleetDispatcher.inactiveSystems > 0) {
        inactiveSystemsDiv.textContent = fleetDispatcher.inactiveSystems;
        inactiveSystemsDiv.classList.add("middlemark");
      } else {
        inactiveSystemsDiv.textContent = "-";
        inactiveSystemsDiv.classList.remove("middlemark");
      }
      consDiv.textContent = toFormattedNumber(fleetDispatcher.getConsumption(), 0);
      if (fleetDispatcher.getConsumption() > deutAvailable) {
        consDiv.classList.add("overmark");
        if (!error) {
          warning.style.visibility = "visible";
          warning.setAttribute("data-title", fleetDispatcher.errorCodeMap[613]);
          document.querySelector("#continueToFleet2").style.filter = "hue-rotate(-50deg)";
        }
      } else {
        if (!error) {
          warning.style.visibility = "hidden";
          document.querySelector("#continueToFleet2").style.filter = "none";
        }
        consDiv.classList.remove("overmark");
      }
      interval = setInterval(() => {
        arrivalDiv.textContent = getFormatedDate(
          new Date(serverTime).getTime() + fleetDispatcher.getDuration() * 1e3,
          "[d].[m].[y] - [G]:[i]:[s] "
        );
        returnDiv.textContent = getFormatedDate(
          new Date(serverTime).getTime() +
            2 * fleetDispatcher.getDuration() * 1e3 +
            (fleetDispatcher.expeditionTime + fleetDispatcher.holdingTime) * 3600 * 1e3,
          "[d].[m].[y] - [G]:[i]:[s] "
        );
      }, 100);
      highlightFleetTarget();
      onResChange(2);
      onResChange(1);
      onResChange(0);
      refreshRes();
    };

    galaxyInput.addEventListener("click", () => {
      galaxyInput.value = "";
      document.querySelector("#missionsDiv").setAttribute("data", "true");
    });
    const plusOrMinSystem = (increment) => {
      let system = parseInt(systemButtons.getAttribute("system") ?? "1");
      let candidate = increment ? system + 1 : system - 1;
      if (candidate <= 0) candidate = fleetDispatcher.fleetHelper.MAX_SYSTEM;
      else if (candidate > fleetDispatcher.fleetHelper.MAX_SYSTEM) candidate = 1;
      systemButtons.setAttribute("system", candidate);

      // if system is set, increase or decrease it by one
      if (systemInput.value) {
        const finalSystem = parseInt(systemButtons.getAttribute("system") ?? "1");
        systemInput.value = finalSystem;
        systemInput.setAttribute("value", finalSystem);
      }
      systemButtons.setAttribute("processing", "false");
      const processing = systemButtons.getAttribute("processing");
      if (processing === "true") return;
      systemButtons.setAttribute("processing", "true");
      debounce(() => {
        fleetDispatcher.targetPlanet.system = parseInt(systemButtons.getAttribute("system") ?? "1");
        fleetDispatcher.refreshTarget();
        fleetDispatcher.updateTarget();
        fleetDispatcher.fetchTargetPlayerData();
        fleetDispatcher.refresh();
      }, 250)();
    };
    systemInputMinus.addEventListener("click", () => plusOrMinSystem(false));
    systemInputPlus.addEventListener("click", () => plusOrMinSystem(true));
    systemInput.addEventListener("click", () => {
      systemInput.value = "";
      document.querySelector("#missionsDiv").setAttribute("data", "true");
    });
    positionInput.addEventListener("click", () => {
      positionInput.value = "";
      document.querySelector("#missionsDiv").setAttribute("data", "true");
    });

    var myEfficientFn = debounce(function () {
      fleetDispatcher.targetPlanet.galaxy = galaxyInput.value;
      fleetDispatcher.targetPlanet.system = systemInput.value;
      fleetDispatcher.targetPlanet.position = positionInput.value;
      fleetDispatcher.refreshTarget();
      fleetDispatcher.updateTarget();
      fleetDispatcher.fetchTargetPlayerData();
      update(true);
    }, 500);
    galaxyInput.addEventListener("keyup", myEfficientFn);
    systemInput.addEventListener("keyup", myEfficientFn);
    positionInput.addEventListener("keyup", myEfficientFn);
    let resFiller = actions.appendChild(createDOM("div", { class: "ogl-res-filler" }));
    let metalBtn = resFiller.appendChild(createDOM("div"));
    metalBtn.appendChild(createDOM("div", { class: "resourceIcon metal" }));
    let metalFiller = metalBtn.appendChild(createDOM("input", { type: "text" }));
    let metalLeft = metalBtn.appendChild(createDOM("span", {}, "-"));
    let metalReal = metalBtn.appendChild(createDOM("span", { class: "ogk-real-cargo ogk-metal" }, "-"));
    let btns = metalBtn.appendChild(createDOM("div", { class: "ogl-actions" }));
    let selectMinMetal = btns.appendChild(
      createDOM("img", {
        src: "https://gf2.geo.gfsrv.net/cdn10/45494a6e18d52e5c60c8fb56dfbcc4.gif",
        title: Translator.translate(341),
      })
    );
    let selectMostMetal = btns.appendChild(
      createDOM("a", { class: "select-most-min", title: Translator.translate(343) })
    );
    let selectMaxMetal = btns.appendChild(
      createDOM("img", {
        src: "https://gf3.geo.gfsrv.net/cdnea/fa0c8ee62604e3af52e6ef297faf3c.gif",
        title: Translator.translate(342),
      })
    );
    let crystalBtn = resFiller.appendChild(createDOM("div"));
    crystalBtn.appendChild(createDOM("div", { class: "resourceIcon crystal" }));
    let crystalFiller = crystalBtn.appendChild(createDOM("input", { type: "text" }));
    let crystalLeft = crystalBtn.appendChild(createDOM("span", {}, "-"));
    let crystalReal = crystalBtn.appendChild(createDOM("span", { class: "ogk-real-cargo ogk-crystal" }, "-"));
    let crystalBtns = crystalBtn.appendChild(createDOM("div", { class: "ogl-actions" }));
    let selectMinCrystal = crystalBtns.appendChild(
      createDOM("img", {
        src: "https://gf2.geo.gfsrv.net/cdn10/45494a6e18d52e5c60c8fb56dfbcc4.gif",
        title: Translator.translate(341),
      })
    );
    let selectMostCrystal = crystalBtns.appendChild(
      createDOM("a", { class: "select-most-min", title: Translator.translate(343) })
    );
    let selectMaxCrystal = crystalBtns.appendChild(
      createDOM("img", {
        src: "https://gf3.geo.gfsrv.net/cdnea/fa0c8ee62604e3af52e6ef297faf3c.gif",
        title: Translator.translate(342),
      })
    );
    let deutBtn = resFiller.appendChild(createDOM("div"));
    deutBtn.appendChild(createDOM("div", { class: "resourceIcon deuterium" }));
    let deutFiller = deutBtn.appendChild(createDOM("input", { type: "text" }));
    let deutLeft = deutBtn.appendChild(createDOM("span", {}, "-"));
    let deutReal = deutBtn.appendChild(createDOM("span", { class: "ogk-real-cargo ogk-deut" }, "-"));
    let deutBtns = deutBtn.appendChild(createDOM("div", { class: "ogl-actions" }));
    let selectMinDeut = deutBtns.appendChild(
      createDOM("img", {
        src: "https://gf2.geo.gfsrv.net/cdn10/45494a6e18d52e5c60c8fb56dfbcc4.gif",
        title: Translator.translate(341),
      })
    );
    let selectMostDeut = deutBtns.appendChild(
      createDOM("a", { class: "select-most-min", title: Translator.translate(343) })
    );
    let selectMaxDeut = deutBtns.appendChild(
      createDOM("img", {
        src: "https://gf3.geo.gfsrv.net/cdnea/fa0c8ee62604e3af52e6ef297faf3c.gif",
        title: Translator.translate(342),
      })
    );
    if (!context.isMobile) {
      (context.hasLifeforms
        ? [
            metalFiller,
            document.querySelector("input#metal"),
            crystalFiller,
            document.querySelector("input#crystal"),
            deutFiller,
            document.querySelector("input#deuterium"),
            document.querySelector("input#food"),
          ]
        : [
            metalFiller,
            document.querySelector("input#metal"),
            crystalFiller,
            document.querySelector("input#crystal"),
            deutFiller,
            document.querySelector("input#deuterium"),
          ]
      ).forEach((elem) => {
        elem.addEventListener("keyup", (event) => {
          let factor;
          let value = fromFormattedNumber(event.target.value.replace("k", "")) || 0;
          if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key.toUpperCase() === "K") {
            let add = event.ctrlKey ? 100 : event.shiftKey ? 10 : 1;
            if (event.key === "ArrowUp") value = value + add;
            if (event.key === "ArrowDown") value = Math.max(value - add, 0);
            if (event.key.toUpperCase() === "K") {
              factor = value > 0 && elem.classList.contains("checkThousandSeparator") ? 1 : 1000;
              value = (value || 1) * factor;
            }
          }
          event.target.value = toFormattedNumber(value);
        });
      });
    } else {
      (context.hasLifeforms
        ? [
            metalFiller,
            document.querySelector("input#metal"),
            crystalFiller,
            document.querySelector("input#crystal"),
            deutFiller,
            document.querySelector("input#deuterium"),
            document.querySelector("input#food"),
          ]
        : [
            metalFiller,
            document.querySelector("input#metal"),
            crystalFiller,
            document.querySelector("input#crystal"),
            deutFiller,
            document.querySelector("input#deuterium"),
          ]
      ).forEach((elem) => {
        elem.addEventListener("input", (event) => {
          if (event.data == "K" || event.data == "k" || event.data == "0k") {
            event.target.value = toFormattedNumber(1000);
          } else {
            let value = fromFormattedNumber(event.target.value.replace("k", "000")) || 0;
            event.target.value = toFormattedNumber(value);
          }
        });
      });
    }
    $("#selectMinMetal").after(createDOM("a", { id: "selectMostMetal", class: "select-most-min" }));
    $("#selectMinCrystal").after(createDOM("a", { id: "selectMostCrystal", class: "select-most-min" }));
    $("#selectMinDeuterium").after(createDOM("a", { id: "selectMostDeuterium", class: "select-most-min" }));
    if (context.hasLifeforms) {
      $("#selectMinFood").after(createDOM("a", { id: "selectMostFood", class: "select-most-min" }));
      $("#selectMaxFood").after(createDOM("span", { class: "ogi-foodLeft" }, "-"));
    }
    $("#selectMaxMetal").after(createDOM("span", { class: "ogi-metalLeft" }, "-"));
    $("#selectMaxCrystal").after(createDOM("span", { class: "ogi-crystalLeft" }, "-"));
    $("#selectMaxDeuterium").after(createDOM("span", { class: "ogi-deuteriumLeft" }, "-"));
    $("#allresources").before(createDOM("a", { class: "select-most" }));
    $("#allresources").after(createDOM("a", { class: "send_none" }).appendChild(createDOM("a")).parentElement);
    $("#loadAllResources .select-most").on("click", () => {
      $("#selectMinDeuterium").click();
      $("#selectMinCrystal").click();
      $("#selectMinMetal").click();
      $("#selectMostDeuterium").click();
      $("#selectMostCrystal").click();
      $("#selectMostMetal").click();
    });
    $("#selectMinMetal").on("click", () => {
      setTimeout(function () {
        metalFiller.value = toFormattedNumber(fleetDispatcher.cargoMetal, 0);
        refreshRes();
      }, 100);
    });
    $("#selectMaxMetal").on("click", () => {
      setTimeout(function () {
        metalFiller.value = toFormattedNumber(fleetDispatcher.cargoMetal, 0);
        refreshRes();
      }, 100);
    });
    $("#selectMinCrystal").on("click", () => {
      setTimeout(function () {
        crystalFiller.value = toFormattedNumber(fleetDispatcher.cargoCrystal, 0);
        refreshRes();
      }, 100);
    });
    $("#selectMaxCrystal").on("click", () => {
      setTimeout(function () {
        crystalFiller.value = toFormattedNumber(fleetDispatcher.cargoCrystal, 0);
        refreshRes();
      }, 100);
    });
    $("#selectMinDeuterium").on("click", () => {
      setTimeout(function () {
        deutFiller.value = toFormattedNumber(fleetDispatcher.cargoDeuterium, 0);
        refreshRes();
      }, 100);
    });
    $("#selectMaxDeuterium").on("click", () => {
      setTimeout(function () {
        deutFiller.value = toFormattedNumber(fleetDispatcher.cargoDeuterium, 0);
        refreshRes();
      }, 100);
    });
    $("#allresources").on("click", () => {
      setTimeout(function () {
        metalFiller.value = toFormattedNumber(fleetDispatcher.cargoMetal, 0);
        crystalFiller.value = toFormattedNumber(fleetDispatcher.cargoCrystal, 0);
        deutFiller.value = toFormattedNumber(fleetDispatcher.cargoDeuterium, 0);
        refreshRes();
      }, 100);
    });
    $("#loadAllResources .send_none").on("click", () => {
      $("#selectMinDeuterium").click();
      $("#selectMinCrystal").click();
      $("#selectMinMetal").click();
      metalFiller.value = 0;
      crystalFiller.value = 0;
      deutFiller.value = 0;
      refreshRes();
    });
    document.querySelector("input[id=metal]").addEventListener("keyup", () => {
      let val = fromFormattedNumber(document.querySelector("input#metal").value, true);
      let capacity = fleetDispatcher.getFreeCargoSpace();
      fleetDispatcher.cargoMetal = Math.min(
        Math.min(val, capacity + fleetDispatcher.cargoMetal),
        Math.max(0, metalAvailable)
      );
      metalFiller.value = toFormattedNumber(fleetDispatcher.cargoMetal, 0);
      fleetDispatcher.refresh();
      refreshRes();
    });
    document.querySelector("input[id=crystal]").addEventListener("keyup", () => {
      let val = fromFormattedNumber(document.querySelector("input#crystal").value, true);
      let capacity = fleetDispatcher.getFreeCargoSpace();
      fleetDispatcher.cargoCrystal = Math.min(
        Math.min(val, capacity + fleetDispatcher.cargoCrystal),
        Math.max(0, crystalAvailable)
      );
      crystalFiller.value = toFormattedNumber(fleetDispatcher.cargoCrystal, 0);
      fleetDispatcher.refresh();
      refreshRes();
    });
    document.querySelector("input[id=deuterium]").addEventListener("keyup", () => {
      let val = fromFormattedNumber(document.querySelector("input#deuterium").value, true);
      let capacity = fleetDispatcher.getFreeCargoSpace();
      fleetDispatcher.cargoDeuterium = Math.min(
        Math.min(val, capacity + fleetDispatcher.cargoDeuterium),
        Math.max(0, deutAvailable)
      );
      deutFiller.value = toFormattedNumber(fleetDispatcher.cargoDeuterium, 0);
      fleetDispatcher.refresh();
      refreshRes();
    });
    let firstResRefresh = true;
    let refreshRes = () => {
      let fLeft;
      if (context.hasLifeforms) fLeft = document.querySelector(".res_wrap .ogi-foodLeft");
      let mLeft = document.querySelector(".res_wrap .ogi-metalLeft");
      let cLeft = document.querySelector(".res_wrap .ogi-crystalLeft");
      let dLeft = document.querySelector(".res_wrap .ogi-deuteriumLeft");
      if (firstResRefresh && fleetDispatcher.currentPage == "fleet1") {
        firstResRefresh = false;
        if (deutLeft.classList.contains("overmark")) {
          dLeft.classList.add("overmark");
        } else if (deutLeft.classList.contains("middlemark")) {
          dLeft.classList.add("middlemark");
        }
        if (metalLeft.classList.contains("overmark")) {
          mLeft.classList.add("overmark");
        }
        if (crystalLeft.classList.contains("overmark")) {
          cLeft.classList.add("overmark");
        }
        mLeft.textContent = metalLeft.textContent;
        cLeft.textContent = crystalLeft.textContent;
        dLeft.textContent = deutLeft.textContent;
      } else {
        cLeft.classList.remove("overmark");
        mLeft.classList.remove("overmark");
        dLeft.classList.remove("overmark");
        dLeft.classList.remove("middlemark");
        let val = fromFormattedNumber(document.querySelector("input#metal").value, true);
        mLeft.textContent = toFormattedNumber(Math.max(0, metalAvailable - val), 0);
        val = fromFormattedNumber(document.querySelector("input#crystal").value, true);
        cLeft.textContent = toFormattedNumber(Math.max(0, crystalAvailable - val), 0);
        val = fromFormattedNumber(document.querySelector("input#deuterium").value, true);
        dLeft.textContent = toFormattedNumber(Math.max(0, deutAvailable - fleetDispatcher.getConsumption() - val), 0);
        if (context.hasLifeforms) {
          val = fromFormattedNumber(document.querySelector("input#food").value, true);
          fLeft.textContent = toFormattedNumber(Math.max(0, foodAvailable - val), 0);
        }
      }
    };
    const defaultKept = context.current.isMoon
      ? OGBIData.json.options.defaultKeptMoon ?? OGBIData.json.options.defaultKept
      : OGBIData.json.options.defaultKept;
    let kept = OGBIData.json.options.kept[context.current.coords + (context.current.isMoon ? "M" : "P")] || defaultKept;
    $("#selectMostMetal").on("click", () => {
      let capacity = fleetDispatcher.getFreeCargoSpace();
      let cargo = Math.min(capacity, metalAvailable - (kept[0] || 0));
      fleetDispatcher.cargoMetal = Math.min(
        fleetDispatcher.cargoMetal + capacity,
        Math.max(0, metalAvailable - (kept[0] || 0))
      );
      metalFiller.value = toFormattedNumber(fleetDispatcher.cargoMetal, 0);
      fleetDispatcher.refresh();
      refreshRes();
    });
    $("#selectMostCrystal").on("click", () => {
      let capacity = fleetDispatcher.getFreeCargoSpace();
      fleetDispatcher.cargoCrystal = Math.min(
        fleetDispatcher.cargoCrystal + capacity,
        Math.max(0, crystalAvailable - (kept[1] || 0))
      );
      crystalFiller.value = toFormattedNumber(fleetDispatcher.cargoCrystal, 0);
      fleetDispatcher.refresh();
      refreshRes();
    });
    $("#selectMostDeuterium").on("click", () => {
      let capacity = fleetDispatcher.getFreeCargoSpace();
      fleetDispatcher.cargoDeuterium = Math.min(
        fleetDispatcher.cargoDeuterium + capacity,
        Math.max(0, deutAvailable - fleetDispatcher.getConsumption() - (kept[2] || 0))
      );
      deutFiller.value = toFormattedNumber(fleetDispatcher.cargoDeuterium, 0);
      fleetDispatcher.refresh();
      refreshRes();
    });
    if (context.hasLifeforms) {
      $("#selectMostFood").on("click", () => {
        let capacity = fleetDispatcher.getFreeCargoSpace();
        fleetDispatcher.cargoFood = Math.min(
          fleetDispatcher.cargoFood + capacity,
          Math.max(0, foodAvailable - (kept[3] || 0))
        );
        fleetDispatcher.refresh();
        refreshRes();
      });
    }
    $("#backToFleet2").on("click", () => {
      firstResRefresh = true;
    });
    $("#backToFleet1").on("click", () => {
      update(true);
    });
    document.querySelectorAll("#shipsChosen .technology .icon").forEach((elem) => {
      elem.addEventListener("click", (event) => {
        if (event.ctrlKey || event.metaKey) {
          let shipId = elem.parentElement.getAttribute("data-technology");
          let onPlanet = elem.firstElementChild.getAttribute("data-value");
          let toSend = Math.max(0, onPlanet - (kept[shipId] || 0));
          event.preventDefault();
          event.stopPropagation();
          let selected = fleetDispatcher.shipsToSend;
          selected.forEach((ship) => {
            if (ship.id == shipId && ship.number == toSend) {
              toSend = 0;
              elem.nextElementSibling.value = " ";
            }
          });
          selectShips(context, Number(shipId), toSend);
          document.querySelector("#continueToFleet2").focus();
        }
      });
    });
    let load = createDOM("div", { class: "ogl-cargo" });
    let selectMostRes = load.appendChild(createDOM("a", { class: "select-most" }));
    let selectAllRes = load.appendChild(createDOM("a", { class: "sendall" }));
    let selectNoRes = load.appendChild(
      createDOM("a", { class: "send_none" }).appendChild(createDOM("a")).parentElement
    );
    selectNoRes.addEventListener("click", () => {
      selectMinDeut.click();
      selectMinCrystal.click();
      selectMinMetal.click();
    });
    selectAllRes.addEventListener("click", () => {
      selectMaxDeut.click();
      selectMaxCrystal.click();
      selectMaxMetal.click();
    });
    selectMostRes.addEventListener("click", () => {
      selectMostDeut.click();
      selectMostCrystal.click();
      selectMostMetal.click();
    });
    let bar = load.appendChild(createDOM("div"));
    bar.replaceChildren(
      createDOM("div", {
        class: "fleft bar_container",
        "data-current-amount": "0",
        "data-capacity": "0",
      }).appendChild(createDOM("div", { class: "filllevel_bar" })).parentElement,
      createDOM("div")
        .appendChild(createDOM("span", { class: "undermark" }, "0"))
        .parentElement.appendChild(document.createTextNode(" / "))
        .parentElement.appendChild(createDOM("span", {}, "0")).parentElement
    );
    let settings = load.appendChild(
      createDOM("div", { class: "ogl-setting-icon" }).appendChild(
        createDOM("img", {
          src: "https://gf3.geo.gfsrv.net/cdne7/1f57d944fff38ee51d49c027f574ef.gif",
          height: "16",
          width: "16",
        })
      ).parentElement
    );
    settings.addEventListener("click", () => {
      popupUtil.popup(
        null,
        keepOnPlanetDialog(
          context.current.coords + (context.current.isMoon ? "M" : "P"),
          undefined,
          context.dialogContext
        )
      );
    });
    let updateCargo = () => {
      let total =
        fromFormattedNumber(metalFiller.value) +
        fromFormattedNumber(crystalFiller.value) +
        fromFormattedNumber(deutFiller.value);
      let freeSpace = fleetDispatcher.getCargoCapacity() - total;
      bar.replaceChildren(
        createDOM("div", {
          class: "fleft bar_container",
          "data-current-amount": "0",
          "data-capacity": "0",
        }).appendChild(createDOM("div", { class: "filllevel_bar" })).parentElement,
        createDOM("div")
          .appendChild(
            createDOM(
              "span",
              { class: `${freeSpace >= 0 ? "undermark" : "overmark"}` },
              `${toFormattedNumber(freeSpace, 0)}`
            )
          )
          .parentElement.appendChild(document.createTextNode(" / "))
          .parentElement.appendChild(
            createDOM("span", {}, `${toFormattedNumber(fleetDispatcher.getCargoCapacity(), 0)}`)
          ).parentElement
      );
      let filler = document.querySelector(".ogl-cargo .filllevel_bar");
      let percent = 100 - (freeSpace / fleetDispatcher.getCargoCapacity()) * 100;
      if (percent > 100) {
        percent = 100;
      }
      filler.style.width = percent + "%";
      if (percent < 80) {
        filler.classList.add("filllevel_undermark");
      } else if (percent > 80 && percent < 100) {
        filler.classList.add("filllevel_middlemark");
      } else {
        filler.classList.add("filllevel_overmark");
      }
    };
    resDiv.appendChild(load);
    selectMinMetal.addEventListener("click", () => {
      metalFiller.value = 0;
      onResChange(0);
    });
    selectMaxMetal.addEventListener("click", () => {
      metalFiller.value = toFormattedNumber(metalAvailable, 0);
      onResChange(0);
    });
    selectMostMetal.addEventListener("click", () => {
      metalFiller.value = toFormattedNumber(Math.max(0, metalAvailable - (kept[0] || 0)), 0);
      onResChange(0);
    });
    selectMinCrystal.addEventListener("click", () => {
      crystalFiller.value = 0;
      onResChange(1);
    });
    selectMaxCrystal.addEventListener("click", () => {
      crystalFiller.value = toFormattedNumber(crystalAvailable, 0);
      onResChange(1);
    });
    selectMostCrystal.addEventListener("click", () => {
      crystalFiller.value = toFormattedNumber(Math.max(0, crystalAvailable - (kept[1] || 0)), 0);
      onResChange(1);
    });
    selectMinDeut.addEventListener("click", () => {
      deutFiller.value = 0;
      onResChange(2);
    });
    selectMaxDeut.addEventListener("click", () => {
      deutFiller.value = toFormattedNumber(Math.max(0, deutAvailable - fleetDispatcher.getConsumption()), 0);
      onResChange(2);
    });
    selectMostDeut.addEventListener("click", () => {
      deutFiller.value = toFormattedNumber(
        Math.max(0, deutAvailable - fleetDispatcher.getConsumption() - (kept[2] || 0)),
        0
      );
      onResChange(2);
    });
    let transport = actions.appendChild(createDOM("div", { class: "ogl-res-transport" }));
    let ptBtn = transport.appendChild(
      createDOM("a", { "tech-id": 202, class: "ogl-option ogl-fleet-ship ogl-fleet-202" })
    );
    let ptNum = transport.appendChild(createDOM("span", { class: "tooltip" }, "-"));
    let gtBtn = transport.appendChild(
      createDOM("a", { "tech-id": 203, class: "ogl-option ogl-fleet-ship ogl-fleet-203" })
    );
    let gtNum = transport.appendChild(createDOM("span", { class: "tooltip" }, "-"));
    let pfBtn = transport.appendChild(
      createDOM("a", { "tech-id": 219, class: "ogl-option ogl-fleet-ship ogl-fleet-219" })
    );
    let pfNum = transport.appendChild(createDOM("span", { class: "tooltip" }, "-"));
    let cyBtn = transport.appendChild(
      createDOM("a", { "tech-id": 209, class: "ogl-option ogl-fleet-ship ogl-fleet-209" })
    );
    let cyNum = transport.appendChild(createDOM("span", { class: "tooltip" }, "-"));
    let pbBtn;
    let pbNum;
    if (OGBIData.json.ships[210].cargoCapacity != 0) {
      pbBtn = transport.appendChild(
        createDOM("a", { "tech-id": 210, class: "ogl-option ogl-fleet-ship ogl-fleet-210" })
      );
      pbNum = transport.appendChild(createDOM("span", { class: "tooltip" }, "-"));
    }
    let updateShips = (e) => {
      let amount = e.target.nextElementSibling.getAttribute("amount");
      selectShips(context, Number(e.target.getAttribute("tech-id")), amount);
      fleetDispatcher.updateMissions();
    };
    document.querySelectorAll("input.ogl-formatInput").forEach((input) => {
      input.addEventListener("keyup", fleetDispatcher.updateMissions);
    });
    ptBtn.addEventListener("click", updateShips);
    gtBtn.addEventListener("click", updateShips);
    pfBtn.addEventListener("click", updateShips);
    cyBtn.addEventListener("click", updateShips);
    if (pbBtn) {
      pbBtn.addEventListener("click", updateShips);
      ptBtn.classList.add("scale");
      gtBtn.classList.add("scale");
      pfBtn.classList.add("scale");
      cyBtn.classList.add("scale");
      pbBtn.classList.add("scale");
    }
    let onResChange = (index) => {
      let capacity = fleetDispatcher.getCargoCapacity();
      if (capacity == 0) {
        fleetDispatcher.resetCargo();
      }
      let filled = fromFormattedNumber(deutFiller.value);
      let deut = Math.min(
        fromFormattedNumber(deutFiller.value),
        capacity,
        deutAvailable - fleetDispatcher.getConsumption()
      );
      if (index == 2) {
        fleetDispatcher.cargoDeuterium = Math.min(
          deut,
          fleetDispatcher.cargoDeuterium + fleetDispatcher.getFreeCargoSpace()
        );
        let old = deutLeft.textContent;
        deutLeft.textContent = toFormattedNumber(
          deutAvailable - fleetDispatcher.getConsumption() - fleetDispatcher.cargoDeuterium,
          0
        );
        if (old != deutLeft.textContent || deutLeft.textContent == "0") {
          deutLeft.classList.remove("middlemark");
        }
        if (
          fleetDispatcher.getFreeCargoSpace() == 0 &&
          deutLeft.textContent != "0" &&
          deutLeft.textContent != toFormattedNumber(kept[2])
        ) {
          deutLeft.classList.add("overmark");
          deutReal.textContent = toFormattedNumber(Math.max(0, fleetDispatcher.cargoDeuterium), 0);
        } else {
          deutLeft.classList.remove("overmark");
          deutReal.textContent = "-";
        }
        if (filled > Math.max(0, deutAvailable - fleetDispatcher.getConsumption())) {
          deutFiller.value = toFormattedNumber(deutAvailable - fleetDispatcher.getConsumption(), 0);
        }
      } else if (index == 1) {
        filled = fromFormattedNumber(crystalFiller.value);
        let crystal = Math.min(fromFormattedNumber(crystalFiller.value), capacity, crystalAvailable);
        fleetDispatcher.cargoCrystal = Math.min(
          crystal,
          fleetDispatcher.cargoCrystal + fleetDispatcher.getFreeCargoSpace()
        );
        crystalLeft.textContent = toFormattedNumber(crystalAvailable - fleetDispatcher.cargoCrystal, 0);
        if (
          fleetDispatcher.getFreeCargoSpace() == 0 &&
          crystalLeft.textContent != "0" &&
          crystalLeft.textContent != toFormattedNumber(kept[1])
        ) {
          crystalLeft.classList.add("overmark");
          crystalReal.textContent = toFormattedNumber(Math.max(0, fleetDispatcher.cargoCrystal), 0);
        } else {
          crystalLeft.classList.remove("overmark");
          crystalReal.textContent = "-";
        }
      } else if (index == 0) {
        filled = fromFormattedNumber(metalFiller.value);
        let metal = Math.min(fromFormattedNumber(metalFiller.value), capacity, metalAvailable);
        fleetDispatcher.cargoMetal = Math.min(metal, fleetDispatcher.cargoMetal + fleetDispatcher.getFreeCargoSpace());
        metalLeft.textContent = toFormattedNumber(metalAvailable - fleetDispatcher.cargoMetal, 0);
        if (
          fleetDispatcher.getFreeCargoSpace() == 0 &&
          metalLeft.textContent != "0" &&
          metalLeft.textContent != toFormattedNumber(kept[0])
        ) {
          metalLeft.classList.add("overmark");
          metalReal.textContent = toFormattedNumber(Math.max(0, fleetDispatcher.cargoMetal), 0);
        } else {
          metalLeft.classList.remove("overmark");
          metalReal.textContent = "-";
        }
      }
      let ships = {};
      fleetDispatcher.shipsOnPlanet.forEach((elem) => {
        ships[elem.id] = elem.number;
      });
      ptNum.classList.remove("overmark");
      gtNum.classList.remove("overmark");
      pfNum.classList.remove("overmark");
      cyNum.classList.remove("overmark");
      if (pbNum) pbNum.classList.remove("overmark");
      let amount = needCargo(202);
      ptNum.textContent = toFormattedNumber(amount, null, amount > 999999);
      ptNum.setAttribute("data-title", toFormattedNumber(amount));
      ptNum.setAttribute("amount", amount);
      if (amount > (ships[202] || 0)) ptNum.classList.add("overmark");
      amount = needCargo(203);
      gtNum.textContent = toFormattedNumber(amount, null, amount > 999999);
      gtNum.setAttribute("data-title", toFormattedNumber(amount));
      gtNum.setAttribute("amount", amount);
      if (amount > (ships[203] || 0)) gtNum.classList.add("overmark");
      amount = needCargo(219);
      pfNum.textContent = toFormattedNumber(amount, null, amount > 999999);
      pfNum.setAttribute("data-title", toFormattedNumber(amount));
      pfNum.setAttribute("amount", amount);
      if (amount > (ships[219] || 0)) pfNum.classList.add("overmark");
      amount = needCargo(209);
      cyNum.textContent = toFormattedNumber(amount, null, amount > 999999);
      cyNum.setAttribute("data-title", toFormattedNumber(amount));
      cyNum.setAttribute("amount", amount);
      if (amount > (ships[209] || 0)) cyNum.classList.add("overmark");
      if (pbBtn) {
        amount = needCargo(210);
        pbNum.textContent = toFormattedNumber(amount, null, amount > 999999);
        pbNum.setAttribute("data-title", toFormattedNumber(amount));
        pbNum.setAttribute("amount", amount);
        if (amount > (ships[210] || 0)) pbNum.classList.add("overmark");
      }
      updateCargo();
    };
    let onShipsChange = () => {
      const fleetSelected = document.createDocumentFragment();
      fleetDispatcher.shipsToSend.forEach((ship) => {
        fleetSelected.appendChild(
          createDOM("div", { "tech-id": `${ship.id}`, class: `ogl-option ogl-fleet-ship ogl-fleet-${ship.id}` })
        );
        fleetSelected.appendChild(
          createDOM(
            "span",
            {
              class: "tooltip",
              "data-title": `${Translator.translate(ship.id, "tech")}: ${toFormattedNumber(ship.number, 0)}`,
            },
            `${toFormattedNumber(ship.number, null, ship.number > 999999)}`
          )
        );
      });
      document.querySelector("#ogi-fleet2-ships .content").replaceChildren(fleetSelected);
    };
    metalFiller.addEventListener("keyup", (e) => {
      onResChange(0);
      e.target.focus();
    });
    crystalFiller.addEventListener("keyup", (e) => {
      onResChange(1);
      e.target.focus();
    });
    deutFiller.addEventListener("keyup", (e) => {
      onResChange(2);
      e.target.focus();
    });
    if (context.mode == ogiMode.LOCK || context.mode == ogiMode.HARVEST) {
      if (context.mode == ogiMode.HARVEST) {
        metalFiller.value = toFormattedNumber(metalAvailable, 0);
        crystalFiller.value = toFormattedNumber(crystalAvailable, 0);
        deutFiller.value = toFormattedNumber(deutAvailable, 0);
      } else if (context.mode == ogiMode.LOCK) {
        const coords =
          fleetDispatcher.targetPlanet.galaxy +
          ":" +
          fleetDispatcher.targetPlanet.system +
          ":" +
          fleetDispatcher.targetPlanet.position;
        const isMoon = fleetDispatcher.targetPlanet.type === fleetDispatcher.fleetHelper.PLANETTYPE_MOON;
        const needs = needsUtil.getNeedsByCoords(coords, isMoon);
        if (needs) {
          metalFiller.value = toFormattedNumber(Math.min(needs.metal, fleetDispatcher.metalOnPlanet), 0);
          crystalFiller.value = toFormattedNumber(Math.min(needs.crystal, fleetDispatcher.crystalOnPlanet), 0);
          deutFiller.value = toFormattedNumber(Math.min(needs.deuterium, fleetDispatcher.deuteriumOnPlanet), 0);
        }
      }
      onResChange(2);
      onResChange(1);
      onResChange(0);
      selectBestCargoShip(context, OGBIData.json.options.collect.ship);
    }
    update(false);
  }

  if (context.page == "fleetdispatch") {
    //Display fleet recycling yield
    const slots = document.querySelector(".fleetStatus #slots");
    if (slots) {
      const fleetYield = RecyclingYieldCalculator.CalculateRecyclingYieldFleetFromEmpireData(
        OGBIData.empire[context.current.index],
        OGBIData.universeSettingsTooltip.debrisFactor,
        OGBIData.universeSettingsTooltip.deuteriumInDebris
      );

      const fleetAmount = context.current.isMoon
        ? [
            fleetYield.moonFleetRecyclingYield.metal,
            fleetYield.moonFleetRecyclingYield.crystal,
            fleetYield.moonFleetRecyclingYield.deut,
          ]
        : [
            fleetYield.planetFleetRecyclingYield.metal,
            fleetYield.planetFleetRecyclingYield.crystal,
            fleetYield.planetFleetRecyclingYield.deut,
          ];

      const standardUnitSum = standardUnit.standardUnit(fleetAmount);
      if (standardUnitSum > 0) {
        const limit = context.current.isMoon
          ? OGBIData.options.rvalSelfLimitMoon
          : OGBIData.options.rvalSelfLimitPlanet;
        const labelClass = standardUnitSum >= limit ? "ogk-label ogi-warning" : "ogk-label ogi-info";
        const totalDisplay = `${Numbers.toFormattedNumber(standardUnitSum, [0, 1], true)} ${standardUnit.unitType()}`;
        slots.appendChild(DOM.createDOM("span", { class: labelClass }, totalDisplay));
      }
    }
  }
}

export { betterFleetDispatcher };
