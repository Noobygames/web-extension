import * as DOM from "../../ui/dom.js";
import isOwnPlanet from "../../ogame/ownPlanets.js";
import { createDOM } from "../../ui/dom.js";
import { toFormattedNumber } from "../../format/numbers.js";
import * as standardUnit from "../../game/standardUnit.js";
import Translator from "../../format/i18n/translate.js";
import OGBIData from "../../store/OGBIData.js";
import missionType from "../../game/missionType.js";
import { getOption } from "../conf-options.js";
import OGIObserver from "../../platform/observer.js";
import { tooltip } from "../../ui/tooltip.js";
import RecyclingYieldCalculator from "../../game/recyclingYieldCalculator.js";
import * as iconVisibility from "../../ui/icons.js";
import * as wait from "../../platform/wait.js";
import { getLogger } from "../../platform/logger.js";

const logger = getLogger("planetbar");

/**
 * The right-hand planet bar: mine levels, harvest and jump-gate shortcuts, the
 * activity timers, incoming fleets, and the ship presence per planet.
 *
 * Lifted out of `OGBeyondInfinity` in Phase 3 of refactoring.md.
 *
 * `sideOptions()` stayed behind, against the module list in that plan. It is not
 * planet-bar rendering: it is the wiring of the five sidebar buttons, each of which
 * opens a different page module with that module's own context. That is precisely the
 * "Aufrufplan" the phase wants OGBeyondInfinity to keep.
 *
 * Two pieces of cross-page state are module state here, which is the scope they had
 * in practice - one planet bar per page load: the shared activity ticker, and the
 * per-planet fleet maps that `updateFlyings(context)` computes and the two
 * `updatePlanets_*` renderers consume.
 */

/**
 * One interval for the whole bar, not one per planet.
 *
 * The per-planet version leaked a timer on every planet-bar re-render; the perf work
 * in `docs/performance.md` replaced it with this single ticker.
 */
let activityTicker;

/** Fleet movements grouped by planet, produced by `updateFlyings(context)`. */
let flyingFleetPerPlanets;
let incomingHostileFleetPerPlanets;

function minesLevel(context) {
  if (document.querySelectorAll("div[id*=planet-").length != OGBIData.empire.length) return;
  context.planetList.forEach((planet) => {
    let coords = planet.querySelector(".planet-koords").textContent;
    let metal = 0,
      crystal = 0,
      deut = 0;
    OGBIData.empire.forEach((planet) => {
      if (planet.coordinates.slice(1, -1) == coords) {
        metal = planet[1];
        crystal = planet[2];
        deut = planet[3];
      }
    });
    let div = createDOM("div", { class: "ogl-mines" });
    div.textContent = `${toFormattedNumber(metal)}-${toFormattedNumber(crystal)}-${toFormattedNumber(deut)}`;
    planet.querySelector(".planetlink").appendChild(div);
  });
}

function jumpGate(context) {
  const jumpTimes = [60, 53, 47, 41, 36, 31, 27, 23, 19, 17, 14, 13, 11, 10, 10];
  for (const [moonId, t] of Object.entries(OGBIData.json.jumpGate)) {
    const time = new Date(t);
    context.planetList.forEach((planet) => {
      const moonlink = planet.querySelector(".moonlink");
      if ((moonlink ? new URL(moonlink.href).searchParams.get("cp") : null) === moonId) {
        const gateLevel = Number(moonlink.getAttribute("data-jumpgatelevel"));
        const updateCounter = () => {
          const diff = (new Date() - time) / 1e3 / 60;
          const refreshTime = jumpTimes[gateLevel - 1] / OGBIData.json.speedFleetWar;
          const count = Math.round(refreshTime - diff);
          counter.textContent = count + "'";
          if (count > 0) {
            if (count < 10) {
              counter.classList.add("friendly");
            } else if (count < 30) {
              counter.classList.add("neutral");
            } else {
              counter.classList.add("hostile");
            }
            return true;
          } else {
            delete OGBIData.json.jumpGate[moonId];
            OGBIData.Save();
            return false;
          }
        };
        const counter = moonlink.appendChild(createDOM("div", { class: "ogk-gate-counter" }));
        updateCounter();
        const inter = setInterval(() => {
          if (!updateCounter()) clearInterval(inter);
        }, 1e3);
      }
    });
  }
  if (!context.current.isMoon) return;

  jumpgateDone = (data) => {
    data = $.parseJSON(data);
    if (data.success) {
      planet = data["targetMoon"];
      /* ogi code */
      const origin = new URL(context.current.planet.querySelector(".moonlink").href).searchParams.get("cp");
      const time = new Date();
      OGBIData.json.jumpGate[planet] = time;
      OGBIData.json.jumpGate[origin] = time;
      OGBIData.Save();
      /* end ogi code */
      $(".overlayDiv").dialog("destroy");
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    } else {
      showNotification(data.error, "error");
    }
    if (typeof data.newAjaxToken != "undefined") {
      setNewTokenData(data.newAjaxToken);
    }
  };

  const oj = openJumpgate;
  openJumpgate = () => {
    oj();
    const jumpGateObserver = new OGIObserver();
    const myObs = jumpGateObserver(
      document.getElementById("ingamepage"),
      () => {
        const jumpgate = document.getElementById("jumpgate");
        if (jumpgate && !document.getElementById("jumpgateNotReady")) {
          jumpgate.querySelector(".send_all").after(createDOM("span", { class: "select-most" }));
          jumpgate.querySelector(".select-most").addEventListener("click", () => {
            const kept =
              OGBIData.json.options.kept[context.current.coords + (context.current.isMoon ? "M" : "P")] ??
              OGBIData.json.options.defaultKeptMoon ??
              OGBIData.json.options.defaultKept;
            jumpgate.querySelectorAll(".ship_input_row input").forEach((elem) => {
              const id = elem.getAttribute("name").replace("ship_", "");
              const max = elem.getAttribute("rel");
              elem.value = Math.max(0, max - (kept[id] || 0));
            });
          });
          myObs.disconnect();
        }
      },
      { subtree: true, childList: true }
    );
  };

  if (context.page === "facilities") {
    const openOverlay = document.querySelector("#facilities .overlay");
    openOverlay.href = "";
    openOverlay.addEventListener("click", () => openJumpgate());
  }
  if (context.rawURL.searchParams.get("opengate") === "1") {
    openJumpgate();
  }
}

function flyingFleet() {
  let flyingCount = 0;
  const flying = OGBIData.json.flying.fleet;
  for (let id in flying) flyingCount += flying[id];
  let fleetCount = flyingCount;
  [202, 203, 208, 209, 210, 204, 205, 206, 219, 207, 215, 211, 213, 218, 214].forEach((id) => {
    OGBIData.empire.forEach((planet) => {
      fleetCount += parseInt(planet[id]);
      if (planet.moon) fleetCount += parseInt(planet.moon[id]);
    });
  });
  let per = (flyingCount / fleetCount) * 100;
  let color = "friendly";
  if (per >= 90) color = "neutral";
  // wait.waitFor(), not an unguarded setInterval: the old poll had no timeout - a
  // page where .event_list never appears polled every 200ms, removing and
  // re-checking for .ogk-flying-per, for the rest of the page's life.
  // refactoring-new.md Phase A.4 #10.
  wait
    .waitFor(() => {
      let current = document.querySelector(".ogk-flying-per");
      if (current) current.remove();
      return document.querySelector(".event_list") !== null;
    }, 200)
    .then(() => {
      if (fleetCount == null || fleetCount == 0) {
        fleetCount = 1;
      }
      document.querySelector(".event_list").appendChild(
        DOM.createDOMSanitized(
          "span",
          {
            class: "ogk-flying-per tooltip",
            title: Translator.translate(37),
          },
          `${Translator.translate(38)}: ` +
            '<span class="' +
            color +
            '">' +
            toFormattedNumber((flyingCount / fleetCount) * 100, 0) +
            "%</span>"
        )
      );
    })
    .catch((error) => logger.error(".event_list never appeared", error));
}

function harvest(context) {
  let btnAction = (event, coords, type) => {
    event.preventDefault();
    event.stopPropagation();
    let link = `?page=ingame&component=fleetdispatch&galaxy=${coords[0]}&system=${coords[1]}&position=${coords[2]}&type=${type}&mission=${OGBIData.json.options.harvestMission}&oglMode=1`;
    window.location.href = "https://" + window.location.host + window.location.pathname + link;
  };
  context.planetList.forEach((planet) => {
    let coords = planet.querySelector(".planet-koords").textContent.split(":");
    if (context.current.coords != coords.join(":") || context.current.isMoon) {
      // The icon is absent on some planet rows, and an unguarded call here throws inside
      // renderPlanetBar(), which aborts start() before any page-specific work runs.
      planet
        .querySelector(".planetlink .icon-planet")
        ?.addEventListener("click", (event) => btnAction(event, coords, 3));
    }
    let moon = planet.querySelector(".moonlink");
    if (moon) {
      if (context.current.coords == coords.join(":") && context.current.isMoon) return;
      planet.querySelector(".moonlink .icon-moon").addEventListener("click", (event) => btnAction(event, coords, 3));
    }
  });
}

function activitytimers(context) {
  let now = Date.now();
  if (!OGBIData.json.myActivities[context.current.coords]) OGBIData.json.myActivities[context.current.coords] = [0, 0];
  let planetActivity = OGBIData.json.myActivities[context.current.coords][0];
  let moonActivity = OGBIData.json.myActivities[context.current.coords][1];
  if (context.current.isMoon) moonActivity = now;
  else planetActivity = now;
  OGBIData.json.myActivities[context.current.coords] = [planetActivity, moonActivity];
  OGBIData.Save();
  context.planetList.forEach((planet) => {
    let coords = planet.querySelector(".planet-koords").textContent;
    let timers = OGBIData.json.myActivities[coords] || [0, 0];
    let value = Math.min(Math.round((now - timers[0]) / 6e4), 60);
    let pTimer = planet
      .querySelector(".planetlink")
      .appendChild(createDOM("div", { class: "ogl-timer ogl-short ogl-medium", "data-timer": value }));
    if (OGBIData.json.options.activitytimers && value != 60 && value >= 15) {
      planet.querySelector(".planetlink").appendChild(createDOM("div", { class: "activity showMinutes" }, value));
    }
    updateTimer(context, pTimer);
    value = Math.min(Math.round((now - timers[1]) / 6e4), 60);
    if (planet.querySelector(".moonlink")) {
      let mTimer = planet.querySelector(".moonlink").appendChild(
        createDOM("div", {
          class: "ogl-timer ogl-short ogl-medium",
          "data-timer": Math.min(Math.round((now - timers[1]) / 6e4), 60),
        })
      );
      if (OGBIData.json.options.activitytimers && value != 60 && value >= 15) {
        planet.querySelector(".moonlink").appendChild(createDOM("div", { class: "activity showMinutes" }, value));
      }
      updateTimer(context, mTimer);
    }
  });

  // One ticker for the whole bar, registered once. It used to be two
  // setIntervals per planet, re-registered on every planet-bar re-render, so a
  // long session accumulated dozens of them - each one pinning a detached
  // element the game had already thrown away.
  if (!activityTicker) {
    activityTicker = setInterval(() => {
      document.querySelectorAll("#planetList .ogl-timer[data-timer]").forEach((timer) => {
        updateTimer(context, timer, true);
      });
    }, 6e4);
  }
}

function updateTimer(context, element, increment) {
  let time = parseInt(element.getAttribute("data-timer"));
  if (time <= 61) {
    if (increment) {
      time++;
      element.setAttribute("data-timer", time);
    }
    element.title = time;
    if (time >= 30) {
      element.classList.remove("ogl-medium");
    }
    if (time >= 15) {
      element.classList.remove("ogl-short");
    }
  }
}

function updateFlyings() {
  const FLYING_PER_PLANETS = {};
  const INCOMING_HOSTILE_FLEETS_PER_PLANETS = {};
  const eventTable = document.getElementById("eventContent");

  const ACSrows = eventTable.querySelectorAll("tr.allianceAttack");
  const unionTable = [];
  ACSrows.forEach((acsRow) => {
    const union = Array.from(acsRow.classList)
      .find((cl) => cl.includes("union"))
      .split("unionunion")[1];
    unionTable.push([union, acsRow.querySelectorAll("td")[1].textContent]);
  });
  const rows = eventTable.querySelectorAll("#eventContent tr");
  rows.forEach((row) => {
    const fleetMissionType = row.getAttribute("data-mission-type");
    const cols = row.querySelectorAll("td");
    const destCoordCell = row.querySelector(".destCoords");
    const destFleetCell = row.querySelector(".destFleet");

    const destCoords = destCoordCell.textContent.replace("[", "").replace("]", "").trim();
    const timestamp = row.getAttribute("data-arrival-time");
    const date = new Date(timestamp * 1000);

    const flying = {
      missionType: fleetMissionType,
      date: timestamp,
      arrivalTime: date.toLocaleTimeString(),
      isDestMoon: !!destFleetCell.querySelector(".moon"),
    };

    const hostileCountDown = row.querySelector(".countDown .hostile");
    if (hostileCountDown && hostileCountDown.textContent.trim() !== "---") {
      //Hostile fleet
      if (!INCOMING_HOSTILE_FLEETS_PER_PLANETS[destCoords]) INCOMING_HOSTILE_FLEETS_PER_PLANETS[destCoords] = [];
      INCOMING_HOSTILE_FLEETS_PER_PLANETS[destCoords].push(flying);
    } else if (row.classList.contains("eventFleet")) {
      flying.missionFleetIcon = cols[2].querySelector("img").src;

      // Get the mission title by removing the suffix "own fleet" and the "return" suffix (eg: "(R)")
      flying.missionFleetTitle = cols[2].querySelector("img").getAttribute("data-tooltip-title").trim();
      if (flying.missionFleetTitle.includes("|"))
        flying.missionFleetTitle = flying.missionFleetTitle.split("|")[1].trim();
      if (flying.missionFleetTitle.includes("("))
        flying.missionFleetTitle = flying.missionFleetTitle.split("(")[0].trim();

      flying.origin = cols[3].textContent.trim();
      flying.originMoon = !!cols[3].querySelector(".moon");
      flying.originCoords = cols[4].textContent.replace("[", "").replace("]", "").trim();
      flying.originLink = cols[4].querySelector("a").href;
      flying.fleetCount = cols[5].textContent;

      // Get the direction
      flying.direction = Array.from(cols[6].classList).includes("icon_movement") ? "go" : "back";

      // Get the direction image (no used as of today, but we never know)
      const styleDirection = window.getComputedStyle(cols[6]).getPropertyValue("background");
      flying.directionIcon = styleDirection.substring(
        styleDirection.indexOf('url("') + 5,
        styleDirection.indexOf('")')
      );

      flying.dest = cols[7].textContent.trim();
      flying.destMoon = cols[7].querySelector(".moon");
      flying.destDebris = cols[7].querySelector(".tf");
      flying.destCoords = destCoords;
      flying.destLink = destCoordCell.querySelector("a").href;
      if (!FLYING_PER_PLANETS[flying.originCoords]) FLYING_PER_PLANETS[flying.originCoords] = {};
      if (!FLYING_PER_PLANETS[flying.originCoords][flying.missionFleetTitle]) {
        FLYING_PER_PLANETS[flying.originCoords][flying.missionFleetTitle] = {
          icon: flying.missionFleetIcon,
          data: [],
        };
      }
      FLYING_PER_PLANETS[flying.originCoords][flying.missionFleetTitle].data.push(flying);
    }
  });

  flyingFleetPerPlanets = FLYING_PER_PLANETS;
  incomingHostileFleetPerPlanets = INCOMING_HOSTILE_FLEETS_PER_PLANETS;
}

function updatePlanets_IncomingHostileFleet() {
  if (incomingHostileFleetPerPlanets) {
    const planetList = document.getElementById("planetList");

    // replace the alert icon with a background animation

    const alertMode = getOption("alertHostileIncomingMode");
    planetList.setAttribute("data-alert-hostile-incoming-mode", alertMode);

    const createAlertIcon = (type, planetOrMoonId, fleetCount) => {
      //create the tooltip
      const tooltipDiv = DOM.createDOM("div");
      tooltipDiv.appendChild(DOM.createDOM("span", {}, `${Translator.translate(183)}: ${fleetCount}`));

      const alert = DOM.createDOM("a", {
        href: `/game/index.php?page=ingame&component=fleetdispatch&cp=${planetOrMoonId}`,
        class: `ogi-${type}_alert`,
      });

      alert.addEventListener("mouseover", () => tooltip(alert, tooltipDiv, true, { auto: true }, 50, false));
      return alert;
    };

    Array.from(planetList.children).forEach((planet) => {
      const planetId = planet.getAttribute("id")?.replace("planet-", "");
      const planetKoordsEl = planet.querySelector(".planet-koords");
      if (planetKoordsEl) {
        const planetKoords = planetKoordsEl.textContent;
        if (incomingHostileFleetPerPlanets[planetKoords]) {
          const movements = incomingHostileFleetPerPlanets[planetKoords];

          const countToMoon = movements.filter((movement) => movement.isDestMoon).length;
          const countToPlanet = movements.filter((movement) => !movement.isDestMoon).length;
          if (countToMoon > 0) {
            const moon = planet.querySelector(".moonlink");
            if (moon) {
              planet.classList.add("ogi-moon_under_hostile_activity");

              const moonId = moon.href.match(/=(\d+)/)[1];
              const alert = createAlertIcon("moon", moonId, countToMoon);

              moon.insertAdjacentElement("afterend", alert);
            }
          }
          if (countToPlanet > 0) {
            planet.classList.add("ogi-planet_under_hostile_activity");
            const alert = createAlertIcon("planet", planetId, countToPlanet);
            planetKoordsEl.insertAdjacentElement("afterend", alert);
          }
        }
      }
    });
  }
}

function updatePlanets_FleetActivity() {
  if (flyingFleetPerPlanets && OGBIData.json.options.fleetActivity) {
    const planetList = document.getElementById("planetList").children;
    Array.from(planetList).forEach((planet) => {
      const planetKoordsEl = planet.querySelector(".planet-koords");
      if (planetKoordsEl) {
        const planetKoords = planetKoordsEl.textContent;
        Object.keys(flyingFleetPerPlanets).forEach((key) => {
          if (planetKoords === key) {
            const movements = flyingFleetPerPlanets[key];
            const div = document.createElement("div");
            const sizeDiv = 18;
            div.style = `
              position: absolute !important;
              left: -${sizeDiv + 7}px !important;
              top: 0px !important;
              width: ${sizeDiv + 5}px;
              height: ${sizeDiv + 5}px;
              display: flex;
              flex-direction: row;
              flex-wrap: wrap;
              direction: rtl;
            `;
            planetKoordsEl.parentNode.parentNode.appendChild(div);

            const movementTooltipToScroll = DOM.createDOM("div", { class: "ogi-movement-scroll" });

            const movementTooltip = DOM.createDOM("div", { class: "ogi-movement" });
            movementTooltipToScroll.appendChild(movementTooltip);

            movementTooltip.appendChild(DOM.createDOM("div", {}, "Type"));
            movementTooltip.appendChild(DOM.createDOM("div", {}, "Target"));
            movementTooltip.appendChild(DOM.createDOM("div", {}, "Time"));

            const movementsList = [];
            Object.keys(movements).forEach((movementKey, i) => {
              if (i < 8) {
                const nbrMovements = Object.keys(movements).length;
                const movement = movements[movementKey];
                let size = sizeDiv;
                if (nbrMovements > 2) {
                  size = size / 2;
                }
                const img = DOM.createDOM("img");
                img.src = movement.icon;

                movement.data.forEach((m) => movementsList.push({ ...m, img: img.cloneNode(true) }));

                img.style = `position: initial !important; width: ${size}px; height: ${size}px; margin: 1px !important;`;

                div.appendChild(img);
              }
            });

            movementsList.sort((a, b) => {
              if (a.date < b.date) return -1;
              if (a.date > b.date) return 1;
              return 0;
            });

            movementsList.forEach((m) => {
              const symbolDirection = m.direction === "go" ? ">" : "<";

              const rowType = DOM.createDOM("div");
              rowType.appendChild(m.img);
              movementTooltip.appendChild(rowType);

              const rowTarget = DOM.createDOM("div", { class: "ogi-movement-target" });
              const fromMoon = DOM.createDOM("div");
              const rowTargetDirection = DOM.createDOM("div", {}, symbolDirection);
              const rowTargetCoords = DOM.createDOM("div", { class: "ogi-movement-target-coords" });

              const coordsSpan = rowTargetCoords.appendChild(DOM.createDOM("span", {}, m.destCoords));

              if (parseInt(m.missionType) === missionType.HARVEST) {
                coordsSpan.classList.add("ogk-coords-debris");
              } else if (parseInt(m.missionType) === missionType.DEPLOYMENT || isOwnPlanet(m.destCoords)) {
                coordsSpan.classList.add("ogk-own-coords");
              } else if (
                [missionType.TRANSPORT, missionType.ACS_DEFEND, missionType.COLONISATION].includes(
                  parseInt(m.missionType)
                )
              ) {
                coordsSpan.classList.add("ogk-coords-neutral");
              } else if (
                [
                  missionType.MOON_DESTRUCTION,
                  missionType.ATTACK,
                  missionType.MISSILE_ATTACK,
                  missionType.ACS_ATTACK,
                  missionType.SPY,
                ].includes(parseInt(m.missionType))
              ) {
                coordsSpan.classList.add("ogk-coords-hostile");
              } else if ([missionType.EXPEDITION, missionType.EXPLORATION].includes(parseInt(m.missionType))) {
                coordsSpan.classList.add("ogk-coords-expedition");
              }

              if (m.originMoon) {
                fromMoon.appendChild(DOM.createDOM("figure", { class: "planetIcon moon" }));
              }

              if (m.destMoon) {
                rowTargetCoords.appendChild(DOM.createDOM("figure", { class: "planetIcon moon" }));
              }

              if (m.destDebris) {
                rowTargetCoords.appendChild(DOM.createDOM("figure", { class: "planetIcon tf" }));
              }

              rowTarget.appendChild(fromMoon);
              rowTarget.appendChild(rowTargetDirection);
              rowTarget.appendChild(rowTargetCoords);

              movementTooltip.appendChild(rowTarget);

              const rowTime = DOM.createDOM("div");
              rowTime.appendChild(DOM.createDOM("span", {}, `${m.arrivalTime}`));
              movementTooltip.appendChild(rowTime);
            });

            //if there is less than 19 lines, auto disable the tooltip
            const autoTooltipDisable = movementsList.length < 19;

            div.addEventListener("ontouchstart" in document.documentElement ? "touchstart" : "mouseenter", () => {
              $(".ogi-movement-scroll").mCustomScrollbar("destroy");
              tooltip(div, movementTooltipToScroll, true, { auto: true }, 50, !autoTooltipDisable);
              $(".ogi-movement-scroll, .mCS_destroyed").mCustomScrollbar({ theme: "ogame" });
            });
          }
        });
      }
    });
  }
}

function updateSpaceShipsPresence(context) {
  const ownFleetYieldIconsDisplayMode = getOption("ownFleetYieldIconsDisplayMode");
  if (!iconVisibility.shouldDisplayIcon(ownFleetYieldIconsDisplayMode)) return;

  document.querySelectorAll(".planet-koords").forEach((planet) => {
    const smallplanet = planet.parentElement.parentElement;
    const planetId = planet.parentElement.href.match(/=(\d+)/)[1];

    const planetFromEmpire = OGBIData.empire.find((p) => p.id === parseInt(planetId));

    const fleetYield = RecyclingYieldCalculator.CalculateRecyclingYieldFleetFromEmpireData(
      planetFromEmpire,
      OGBIData.universeSettingsTooltip.debrisFactor,
      OGBIData.universeSettingsTooltip.deuteriumInDebris
    );
    const planetFleetAmount = [
      fleetYield.planetFleetRecyclingYield.metal,
      fleetYield.planetFleetRecyclingYield.crystal,
      fleetYield.planetFleetRecyclingYield.deut,
    ];
    const moonFleetAmount = [
      fleetYield.moonFleetRecyclingYield.metal,
      fleetYield.moonFleetRecyclingYield.crystal,
      fleetYield.moonFleetRecyclingYield.deut,
    ];

    const planetFleetStandardUnitSum = standardUnit.standardUnit(planetFleetAmount);
    const moonFleetStandardUnitSum = standardUnit.standardUnit(moonFleetAmount);

    const createFleetIcon = (standardUnitSum, planetOrMoonId, iconClass, redirect) => {
      const fleetIcon = DOM.createDOM("a", {
        class: "fleetIcon planet tooltip js_hideTipOnMobile",
        href: `/game/index.php?page=ingame&component=${redirect ? "fleetdispatch" : context.page}&cp=${planetOrMoonId}`,
      });

      fleetIcon.appendChild(DOM.createDOM("span", { class: `icon12px ${iconClass}` }));
      return fleetIcon;
    };

    if (planetFromEmpire.moon) {
      if (moonFleetStandardUnitSum >= OGBIData.options.rvalSelfLimitMoon) {
        const moonFleetIconsDiv = DOM.createDOM("div", { class: "moonFleetIcons" });
        moonFleetIconsDiv.appendChild(
          createFleetIcon(
            moonFleetStandardUnitSum,
            planetFromEmpire.moon.id,
            "icon_spaceship",
            iconVisibility.shouldAddIconRedirection(ownFleetYieldIconsDisplayMode)
          )
        );
        smallplanet.appendChild(moonFleetIconsDiv);
      }
    }

    smallplanet.querySelector(".planetFleetIcons")?.remove();
    if (planetFleetStandardUnitSum >= OGBIData.options.rvalSelfLimitPlanet) {
      const planetFleetIconsDiv = DOM.createDOM("div", { class: "planetFleetIcons" });
      planetFleetIconsDiv.appendChild(
        createFleetIcon(
          planetFleetStandardUnitSum,
          planetId,
          "icon_spaceship",
          iconVisibility.shouldAddIconRedirection(ownFleetYieldIconsDisplayMode)
        )
      );
      smallplanet.appendChild(planetFleetIconsDiv);
    }
  });
}

function markLifeforms(context) {
  if (!context.hasLifeforms) return;
  document.querySelectorAll(".smallplanet a.planetlink").forEach((elem) => {
    const lifeform = OGBIData.json.selectedLifeforms[elem.href.split("cp=")[1]];
    elem.appendChild(createDOM("div", { class: `lifeform-item-icon small ${lifeform ? lifeform : ""}` }));
  });
}

export {
  minesLevel,
  jumpGate,
  flyingFleet,
  harvest,
  activitytimers,
  updateTimer,
  updateFlyings,
  updatePlanets_IncomingHostileFleet,
  updatePlanets_FleetActivity,
  updateSpaceShipsPresence,
  markLifeforms,
};
