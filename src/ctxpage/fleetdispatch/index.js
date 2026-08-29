import debounce from "../../platform/debounce.js";
import { fleetState } from "./state.js";
// Re-exported so ogCore.js keeps one import path for the whole page, and so the
// split parts stay reachable from the module graph.
export { betterFleetDispatcher } from "./betterFleetDispatcher.js";
export { openPlanetList } from "./planetList.js";
export { expedition } from "./expedition.js";
export { collect, customMissions } from "./customMissions.js";
export { cacheShipData } from "./shipData.js";
import { getLogger } from "../../platform/logger.js";
import { getShipsData } from "../../game/shipsData.js";
import { createDOM, createSVG } from "../../ui/dom.js";
import { toFormattedNumber, fromFormattedNumber } from "../../format/numbers.js";
import Translator from "../../format/i18n/translate.js";
import OGBIData from "../../store/OGBIData.js";

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
 * The fleet-dispatch page.
 *
 * Lifted out of `OGBeyondInfinity` in Phase 3 of refactoring.md, then split because one
 * 3.4k-line file is not an improvement on one 19k-line file. This file keeps the
 * entry points and the small ship-selection helpers; the three large features have
 * files of their own.
 *
 * Several functions here patch OGame's own `FleetDispatcher` prototype, and inside
 * those patches `this` is the FleetDispatcher, not the page controller - see
 * `test/ctxpage/module-wiring.test.js` for the list of reads that depend on it.
 *
 * Compliance note (AGENTS.md 1.1 and 1.2): everything here still runs from one user
 * gesture. No button sends more than one fleet, and nothing schedules a dispatch.
 */
function onFleetSent(context, callback) {
  FleetDispatcher.prototype.submitFleet2 = function (force) {
    force = force || false;
    let that = this;
    let params = {};
    this.appendTokenParams(params);
    this.appendShipParams(params);
    this.appendTargetParams(params);
    this.appendCargoParams(params);
    this.appendPrioParams(params);
    params.mission = this.mission;
    params.speed = this.speedPercent;
    params.retreatAfterDefenderRetreat = this.retreatAfterDefenderRetreat === true ? 1 : 0;
    params.lootFoodOnAttack = this.lootFoodOnAttack === true ? 1 : 0;
    params.union = this.union;
    if (force) params.force = force;
    params.holdingtime = this.getHoldingTime();
    this.startLoading();
    $.post(this.sendFleetUrl, params, function (response) {
      let data = JSON.parse(response);
      that.updateToken(data.fleetSendingToken || "");
      token = data?.fleetSendingToken;
      if (data.success === true) {
        fadeBox(data.message, false);
        let href = callback();

        setTimeout(function () {
          $("#sendFleet").removeAttr("disabled");
          window.location = href || data.redirectUrl;
        }, 50);
      } else {
        $("#sendFleet").removeAttr("disabled");
        that.stopLoading();
        if (data.responseArray && data.responseArray.limitReached && !data.responseArray.force) {
          errorBoxDecision(
            that.loca.LOCA_ALL_NETWORK_ATTENTION,
            that.locadyn.localBashWarning,
            that.loca.LOCA_ALL_YES,
            that.loca.LOCA_ALL_NO,
            function () {
              that.submitFleet2(true);
            }
          );
        } else {
          that.displayErrors(data.errors);
        }
      }
    });
  };
}

function initUnionCombat(context, union) {
  if (fleetState.unionInterval) {
    clearInterval(fleetState.unionInterval);
  } else {
    fleetState.delayDiv3 = document
      .querySelector("#continueToFleet2")
      .appendChild(createDOM("div", { class: "ogk-delay" }));
    fleetState.delayTimeDiv = document
      .querySelector("#fleetBriefingPart1 li:first-of-type .value")
      .appendChild(createDOM("div", { class: "undermark" }));
    fleetState.delayTimeDiv2 = document
      .querySelector("#fleet2 #arrivalTime")
      .parentElement.appendChild(createDOM("div", { class: "undermark" }));
    fleetState.delayDiv2 = document.querySelector("#naviActions").appendChild(createDOM("div", { class: "ogk-delay" }));
    fleetState.delayTimeDiv3 = document
      .querySelector("#fleet1 .ogl-info")
      .appendChild(createDOM("div", { class: "undermark", style: "position: absolute;left: 65px;" }));
  }
  const update = () => {
    const diff = union.time * 1e3 - serverTime.getTime();
    const maxDelay = diff * 0.3;
    const flighDiff = fleetDispatcher.getDuration() - diff / 1e3;
    const end = maxDelay / 1e3 - flighDiff;
    const abs = Math.abs(end);
    const timeToJoin = end > 0 ? "Time to join " + getFormatedTime(abs) : "Too late to join! " + getFormatedTime(abs);
    fleetState.delayDiv2.textContent = timeToJoin;
    fleetState.delayDiv3.textContent = timeToJoin;
    if (end > 0) {
      fleetState.delayDiv2.setAttribute("style", "color:green !important");
      fleetState.delayDiv3.setAttribute("style", "color:green !important");
      fleetState.delayTimeDiv3.setAttribute("style", "position: absolute;left: 65px;color:none");
    } else {
      fleetState.delayDiv2.setAttribute("style", "color:none");
      fleetState.delayDiv3.setAttribute("style", "color:none");
      fleetState.delayTimeDiv3.setAttribute("style", "position: absolute;left: 65px;color:#d43635 !important");
    }
    const format = "+" + getFormatedTime(flighDiff >= 0 ? flighDiff : 0);
    fleetState.delayTimeDiv.textContent = format;
    fleetState.delayTimeDiv2.textContent = format;
    fleetState.delayTimeDiv3.textContent = format;
  };
  fleetDispatcher.refreshFleet2();
  update();
  fleetState.unionInterval = setInterval(update, 200);
}

function initFleetDispatcher(context) {
  if (
    context.page == "fleetdispatch" &&
    document.querySelector("#civilships") &&
    fleetDispatcher.shipsOnPlanet.length != 0
  ) {
    FleetDispatcher.prototype.updateEmptySystems = function (newData) {
      fleetState.emptySystems = newData || 0;
    };

    FleetDispatcher.prototype.updateInactiveSystems = function (newData) {
      fleetState.inactiveSystems = newData || 0;
    };

    onFleetSent(context, () => {
      let pos = document.querySelector("#position").value;
      const coords =
        document.querySelector("#galaxy").value + ":" + document.querySelector("#system").value + ":" + pos;
      let fuel = fleetDispatcher.getConsumption();
      let dateStr = getFormatedDate(new Date().getTime(), "[d].[m].[y]");
      const isMoon = fleetDispatcher.targetPlanet.type == fleetDispatcher.fleetHelper.PLANETTYPE_MOON;
      let object = OGBIData.empire[context.current.index];
      object = context.current.isMoon ? object.moon : object;
      object.metal = fleetDispatcher.metalOnPlanet - fleetDispatcher.cargoMetal;
      object.crystal = fleetDispatcher.crystalOnPlanet - fleetDispatcher.cargoCrystal;
      object.deuterium = fleetDispatcher.deuteriumOnPlanet - fleetDispatcher.cargoDeuterium;
      object.deuterium -= fuel;
      if (!context.current.isMoon && object.metal < object.metalStorage && object.production.hourly[0] == 0) {
        object.production.hourly[0] = Math.floor(
          (resourcesBar.resources.metal.baseProduction + resourcesBar.resources.metal.production) * 3600
        );
        object.production.daily[0] = object.production.hourly[0] * 24;
        object.production.weekly[0] = object.production.daily[0] * 7;
      }
      if (!context.current.isMoon && object.crystal < object.crystalStorage && object.production.hourly[1] == 0) {
        object.production.hourly[1] = Math.floor(
          (resourcesBar.resources.crystal.baseProduction + resourcesBar.resources.crystal.production) * 3600
        );
        object.production.daily[1] = object.production.hourly[1] * 24;
        object.production.weekly[1] = object.production.daily[1] * 7;
      }
      if (!context.current.isMoon && object.deuterium < object.deuteriumStorage && object.production.hourly[2] == 0) {
        object.production.hourly[2] = Math.floor(
          (resourcesBar.resources.deuterium.baseProduction + resourcesBar.resources.deuterium.production) * 3600
        );
        object.production.daily[2] = object.production.hourly[2] * 24;
        object.production.weekly[2] = object.production.daily[2] * 7;
      }
      fleetDispatcher.shipsToSend.forEach((ship) => {
        object[ship.id] -= ship.number;
      });
      if (pos == 16) {
        if (!OGBIData.json.expeditionSums[dateStr]) {
          OGBIData.json.expeditionSums[dateStr] = {
            found: [0, 0, 0, 0],
            harvest: [0, 0, 0],
            fleet: {},
            losses: {},
            type: {},
            fuel: 0,
            adjust: [0, 0, 0],
          };
        }
        OGBIData.json.expeditionSums[dateStr].fuel -= fuel;
      } else {
        if (!OGBIData.json.combatsSums[dateStr]) {
          OGBIData.json.combatsSums[dateStr] = {
            loot: [0, 0, 0],
            harvest: [0, 0, 0],
            losses: {},
            fuel: 0,
            adjust: [0, 0, 0],
            topCombats: [],
            count: 0,
            wins: 0,
            draws: 0,
          };
        }
        OGBIData.json.combatsSums[dateStr].fuel -= fuel;
      }

      OGBIData.json.lastSentFleet = {
        date: new Date().toISOString(),
        cargoCapacity: fleetDispatcher.cargoCapacity,
        cargoMetal: fleetDispatcher.cargoMetal,
        cargoCrystal: fleetDispatcher.cargoCrystal,
        cargoDeuterium: fleetDispatcher.cargoDeuterium,
        fleetCount: fleetDispatcher.fleetCount,
        hasAdmiral: fleetDispatcher.hasAdmiral,
        hasCommander: fleetDispatcher.hasCommander,
        mission: fleetDispatcher.mission,
        speedPercent: fleetDispatcher.speedPercent,
        targetIsBuddyOrAllyMember: fleetDispatcher.targetIsBuddyOrAllyMember,
        targetIsOutlaw: fleetDispatcher.targetIsOutlaw,
        targetIsStrong: fleetDispatcher.targetIsStrong,
        currentPlanet: fleetDispatcher.currentPlanet,
        targetPlanet: fleetDispatcher.targetPlanet,
        targetPlayerId: fleetDispatcher.targetPlayerId,
        targetPlayerName: fleetDispatcher.targetPlayerName,
        useHalfSteps: fleetDispatcher.useHalfSteps,
      };

      OGBIData.Save();
      //if fleetState.onFleetSentRedirectUrl is string return it.
      //else if it's a method call it and return the result, if it's not a string return undefined
      return typeof fleetState.onFleetSentRedirectUrl === "string"
        ? fleetState.onFleetSentRedirectUrl
        : typeof fleetState.onFleetSentRedirectUrl === "function"
        ? fleetState.onFleetSentRedirectUrl()
        : undefined;
    });
    $(".send_all").before(createDOM("span", { class: "select-most" }));
    $(".allornonewrap > .secondcol > span.select-most").on("click", () => {
      selectMostShips(context);
    });
    let svgButtons = createDOM("div", { class: "ogl-dispatch-icons" });
    $("#civil").append(svgButtons);
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
    let svg = svgButtons.appendChild(createDOM("div", { class: "ogi-speed-icon" }).appendChild(svg1).parentElement);
    svg.addEventListener("mouseover", () => {
      document.querySelectorAll("#shipsChosen .technology").forEach((elem) => {
        elem.classList.add("ogi-transparent");
        let id = elem.getAttribute("data-technology");
        elem.appendChild(
          createDOM("span", { class: "ogi-speed" }, toFormattedNumber(getShipsData()?.[id]?.speed ?? 0, 0))
        );
      });
    });
    svg.addEventListener("mouseout", () => {
      document.querySelectorAll("#shipsChosen .technology").forEach((elem) => {
        elem.classList.remove("ogi-transparent");
        elem.querySelector(".ogi-speed").remove();
      });
    });
    const svg2 = createSVG("svg", {
      viewBox: "0 0 300.003 300.003",
      style: "enable-background:new 0 0 300.003 300.003;",
    });
    svg2.appendChild(
      createSVG("g").appendChild(
        createSVG("path", {
          fill: "white",
          d:
            "M150,0C67.159,0,0.001,67.159,0.001,150c0,82.838,67.157,150.003,149.997,150.003S300.002,232.838,300.002" +
            ",150C300.002,67.159,232.839,0,150,0z M213.281,166.501h-48.27v50.469c-0.003,8.463-6.863,15.323-15.328,1" +
            "5.323c-8.468,0-15.328-6.86-15.328-15.328v-50.464H87.37c-8.466-0.003-15.323-6.863-15.328-15.328c0-8.463" +
            ",6.863-15.326,15.328-15.328l46.984,0.003V91.057c0-8.466,6.863-15.328,15.326-15.328c8.468,0,15.331,6.86" +
            "3,15.328,15.328l0.003,44.787l48.265,0.005c8.466-0.005,15.331,6.86,15.328,15.328C228.607,159.643,221.74" +
            "2,166.501,213.281,166.501z",
        })
      ).parentElement
    );
    let plusSvg = svgButtons.appendChild(createDOM("div", { class: "ogi-plus-icon" }).appendChild(svg2).parentElement);
    if (OGBIData.json.options.dispatcher) {
      plusSvg.classList.add("ogl-active");
    }
    plusSvg.addEventListener("click", () => {
      if (OGBIData.json.options.dispatcher) {
        OGBIData.json.options.dispatcher = false;
        document.querySelector(".ogl-dispatch").style.display = "none";
        plusSvg.classList.remove("ogl-active");
      } else {
        OGBIData.json.options.dispatcher = true;
        if (document.querySelector(".ogl-dispatch")) {
          document.querySelector(".ogl-dispatch").style.display = "flex";
        } else {
          fleetState.ressourceFiller();
        }
        plusSvg.classList.add("ogl-active");
      }
      OGBIData.Save();
    });

    // Add updateMissions methods
    fleetDispatcher.updateMissions = debounce(() => {
      if (!fleetDispatcher.NO_UPDATE_MISSIONS) {
        fleetDispatcher.refreshTarget();
        fleetDispatcher.updateTarget();
        fleetDispatcher.fetchTargetPlayerData();
      }
    }, 200);
  }
}

function neededCargo(context) {
  const defaultKept = context.current.isMoon
    ? OGBIData.json.options.defaultKeptMoon ?? OGBIData.json.options.defaultKept
    : OGBIData.json.options.defaultKept;
  let kept = OGBIData.json.options.kept[context.current.coords + (context.current.isMoon ? "M" : "P")] || defaultKept;
  if (context.page == "fleetdispatch" && document.querySelector("#shipChosen")) {
    shipsOnPlanet.forEach((ship) => {
      if (ship.id == 202 || ship.id == 203) {
        let min = {
          metal: Math.max(0, fleetDispatcher.metalOnPlanet - kept[0]),
          crystal: Math.max(0, fleetDispatcher.crystalOnPlanet - kept[1]),
          deut: Math.max(0, fleetDispatcher.deuteriumOnPlanet - kept[2]),
        };
        let total = min.metal + min.crystal + min.deut;
        let amount = calcNeededShips(context, {
          fret: ship.id,
          resources: total,
        });
        let span = createDOM("span", { class: "ogl-needed" }, toFormattedNumber(amount, 0));
        document.querySelector(`.technology[data-technology="${ship.id}"]`).appendChild(span);
        span.addEventListener("click", (event) => {
          event.stopPropagation();
          document.querySelector("#resetall").click();
          selectShips(context, ship.id, amount);
          document.querySelector(".ogl-cargo .select-most").click();
        });
      }
    });
  }
}

function selectMostShips(context, reclickSelectedTargetType = true) {
  fleetDispatcher.shipsOnPlanet.forEach((ship) => {
    const defaultKept = context.current.isMoon
      ? OGBIData.json.options.defaultKeptMoon ?? OGBIData.json.options.defaultKept
      : OGBIData.json.options.defaultKept;
    let kept = OGBIData.json.options.kept[context.current.coords + (context.current.isMoon ? "M" : "P")] || defaultKept;
    selectShips(context, ship.id, Math.max(0, ship.number - (kept[ship.id] || 0)));
  });
  if (reclickSelectedTargetType) {
    const selectedTargetType =
      document.querySelector(".ogl-planet-icon.ogl-active") ??
      document.querySelector(".ogl-moon-icon.ogl-active") ??
      document.querySelector(".ogl-debris-icon.ogl-active");
    if (selectedTargetType) selectedTargetType.click();
  }
}

function selectAllShips(context, reclickSelectedTargetType = true) {
  fleetDispatcher.shipsOnPlanet.forEach((ship) => {
    selectShips(context, ship.id, ship.number);
  });
  if (reclickSelectedTargetType) {
    const selectedTargetType =
      document.querySelector(".ogl-planet-icon.ogl-active") ??
      document.querySelector(".ogl-moon-icon.ogl-active") ??
      document.querySelector(".ogl-debris-icon.ogl-active");
    if (selectedTargetType) selectedTargetType.click();
  }
}

function selectShips(context, shipID, amount) {
  if (context.page == "fleetdispatch") {
    fleetDispatcher.shipsOnPlanet.forEach((ship) => {
      if (ship.id == shipID) {
        if (amount > ship.number) amount = ship.number;
        fleetDispatcher.selectShip(shipID, amount);
        fleetDispatcher.refresh();
      }
    });
  }
  return amount;
}

function preselectShips(context) {
  if (context.page == "fleetdispatch") {
    // One selectShip() per matching ship, one refresh() after all of them - not one
    // refresh() per ship. A URL preselecting several ship types (am202=10&am203=5, ...)
    // used to call fleetDispatcher.refresh() back-to-back inside this loop, which could
    // crash inside OGame's own refresh() ("Cannot read properties of null (reading 'href')")
    // when it ran against a still-mid-update DOM state.
    let anySelected = false;
    fleetDispatcher.shipsOnPlanet.forEach((ship) => {
      let param = context.rawURL.searchParams.get(`am${ship.id}`);
      if (param) {
        if (param > ship.number) param = ship.number;
        fleetDispatcher.selectShip(ship.id, param);
        anySelected = true;
      }
    });
    if (anySelected) fleetDispatcher.refresh();
  }
}

function calcNeededShips(context, options) {
  options = options || {};
  let resources = [
    fromFormattedNumber(document.querySelector("#resources_metal").textContent),
    fromFormattedNumber(document.querySelector("#resources_crystal").textContent),
    fromFormattedNumber(document.querySelector("#resources_deuterium").textContent),
  ];
  resources = resources.reduce((a, b) => parseInt(a) + parseInt(b));
  if (options.resources || options.resources == 0) resources = options.resources;
  let type = options.fret || OGBIData.json.options.fret;
  let fret = OGBIData.json.ships[type].cargoCapacity;
  let total = resources / fret;
  if (options.moreFret) total *= 107 / 100;
  return Math.ceil(total);
}

function overwriteFleetDispatcher(context, functionName, param, callback, callbackAfter) {
  let old = fleetDispatcher[functionName];
  fleetDispatcher[functionName] = function (param) {
    let state;
    if (callback) state = callback();
    if (state != "canceled") old.call(fleetDispatcher, param);
    callbackAfter && callbackAfter();
  };
}

function selectBestCargoShip(context, preferredShipId = null) {
  if (fleetDispatcher.currentPage == "fleet1" && fleetDispatcher.shipsOnPlanet.length != 0) {
    let metalAvailable = Math.max(0, fleetDispatcher.metalOnPlanet);
    let crystalAvailable = Math.max(0, fleetDispatcher.crystalOnPlanet);
    let deutAvailable = Math.max(0, fleetDispatcher.deuteriumOnPlanet);
    let metalFiller = document.querySelector(".resourceIcon.metal+input");
    let crystalFiller = document.querySelector(".resourceIcon.crystal+input");
    let deutFiller = document.querySelector(".resourceIcon.deuterium+input");
    let metal = fromFormattedNumber(metalFiller.value, true);
    if (metal > metalAvailable) metalFiller.value = toFormattedNumber(metalAvailable, 0);
    let crystal = fromFormattedNumber(crystalFiller.value, true);
    if (crystal > crystalAvailable) crystalFiller.value = toFormattedNumber(crystalAvailable, 0);
    let deut = fromFormattedNumber(deutFiller.value, true);
    if (deut > deutAvailable)
      deutFiller.value = toFormattedNumber(Math.max(0, deutAvailable - fleetDispatcher.getConsumption()), 0);
    let resources =
      Math.min(metal, metalAvailable) + Math.min(crystal, crystalAvailable) + Math.min(deut, deutAvailable);
    let cargoShipsOnPlanet = {};
    let cargoIds = [];
    if (preferredShipId) cargoIds.push(preferredShipId);
    [202, 203, 219].forEach((id) => {
      if (!cargoIds.includes(id)) cargoIds.push(id);
    });
    if (OGBIData.json.ships[210].cargoCapacity != 0 && !cargoIds.includes(210)) cargoIds.push(210);
    fleetDispatcher.shipsOnPlanet.forEach((ship) => {
      if (cargoIds.includes(ship.id)) cargoShipsOnPlanet[ship.id] = ship.number || 0;
    });
    let enoughCargo = false;
    let selectedCargoShip;
    let neededShips;
    cargoIds.forEach((cargoShip) => {
      if (!enoughCargo) {
        neededShips = calcNeededShips(context, {
          fret: cargoShip,
          resources: resources,
        });
        if (neededShips <= cargoShipsOnPlanet[cargoShip]) {
          selectedCargoShip = cargoShip;
          enoughCargo = true;
          return;
        }
      }
    });
    if (enoughCargo) {
      selectShips(context, selectedCargoShip, neededShips);
    } else {
      cargoIds.forEach((ship) => {
        if (cargoShipsOnPlanet[ship]) {
          let numShips = Math.min(
            calcNeededShips(context, { fret: ship, resources: resources }),
            cargoShipsOnPlanet[ship]
          );
          selectShips(context, ship, numShips);
          resources -= (getShipsData()?.[ship]?.baseCargoCapacity ?? 0) * numShips;
          if (resources <= 0) {
            enoughCargo = true;
            return;
          }
        }
      });
    }
    if (!enoughCargo) fadeBox(Translator.translate(107), true);
  }
}

export {
  initFleetDispatcher,
  neededCargo,
  preselectShips,
  calcNeededShips,
  selectShips,
  selectBestCargoShip,
  onFleetSent,
  initUnionCombat,
  overwriteFleetDispatcher,
  selectMostShips,
  selectAllShips,
};
