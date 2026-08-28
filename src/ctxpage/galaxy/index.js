import * as DOM from "../../util/dom.js";
import { createDOM, createSVG, createDOMSanitized } from "../../util/dom.js";
import { toFormattedNumber, fromFormattedNumber } from "../../util/numbers.js";
import * as Numbers from "../../util/numbers.js";
import * as popupUtil from "../../util/popup.js";
import * as utilTooltip from "../../util/tooltip.js";
import * as wait from "../../util/wait.js";
import * as time from "../../util/time.js";
import * as stalkUtil from "../../util/stalk.js";
import * as ptreService from "../../util/service.ptre.js";
import * as standardUnit from "../../util/standardUnit.js";
import Translator from "../../util/translate.js";
import DateTime from "../../util/dateTime.js";
import OGIData from "../../util/OGIData.js";
import OgamePageData from "../../util/OgamePageData.js";
import dataHelper from "../../util/dataHelper.js";
import markerui from "../../util/markerui.js";
import highlight, { setHighlightCoords } from "../../util/highlightTarget.js";
import OGIObserver from "../../util/observer.js";
import planetType from "../../util/enum/planetType.js";
import shipEnum from "../../util/enum/ship.js";
import missionType from "../../util/enum/missionType.js";
import { pageSignal } from "../../util/abort.js";
import { getOption } from "../conf-options.js";
import { generateMMORPGLink } from "../../util/mmorpgStats.js";
import { CLAIM_FREE, claimCssClass, claimStatus, indexClaims } from "../../util/targetClaims.js";
import { renderPlanet } from "./renderPlanet.js";

/**
 * Galaxy view: the per-row tooltips and markers, the activity read-out, the target
 * claims shared through PTRE, the stalk overlay and the target list.
 *
 * Lifted out of `OGInfinity` in Phase 3 of refactoring.md.
 *
 * Compliance note (AGENTS.md 1.5.1): nothing in here attaches a direct-probe action to
 * a coordinate. The target list shows coordinates and links into galaxy view, where
 * the game's own probe icon is; `probingWarning()` in the settings module is the
 * notice explaining why those icons are inert elsewhere.
 *
 * The activity cache and the in-flight claim request are module state - one galaxy
 * view per page load. `markedPlayers` is NOT: `start()` fills it too, so it stays on
 * the controller and is reached through the context.
 */

/** Activity read off each galaxy row, keyed by coordinates. */
let activities;

/** The claim request currently in flight, so a slower one cannot overwrite it. */
let pendingClaimRequest;

function addGalaxyTooltips(context) {
  document.querySelectorAll(".tooltipRel").forEach((sender) => {
    let rel = sender.getAttribute("rel");
    if (rel.indexOf("player") == 0 && rel != "player99999") {
      let id = rel.replace("player", "");
      let content = document.querySelector("#" + rel);
      let rank = content.querySelector(".rank a");
      sender.appendChild(
        createDOM(
          "a",
          { href: generateHiscoreLink(context, id) || "", class: "ogl-ranking" },
          "#" + (rank ? rank.textContent : "b")
        )
      );
      sender.classList.add("ogl-tooltipReady");
      stalk(context, sender, id);
    }
  });
}

function fixRedirectGalaxy(context) {
  history.pushState({}, null, `/game/index.php?page=ingame&component=galaxy&galaxy=${galaxy}&system=${system}`);
}

function onGalaxyUpdate(context) {
  if (context.page != "galaxy") return;

  let timeout;
  let previousSystem = null;
  doExpedition = () => {
    const url = new URLSearchParams({
      page: "ingame",
      component: "fleetdispatch",
      oglMode: "6",
      galaxy: `${galaxy}`,
      system: `${system}`,
      position: "16",
    });
    window.location.href = `?${url.toString()}`;
  };

  // Silent no-op unless all three preconditions hold: the standard-fleet option is on, a
  // template is flagged for expeditions, and it is an admiral (expedition) template. Nothing
  // is shown when only some hold - the game's own template select stays untouched, which is
  // the same state as not having configured the feature at all.
  const preselectTemplate = () => {
    const options = getOption("expedition");
    if (!options.standardFleet) return;
    if (options.standardFleetId && context.admiral && options.standardFleetType === "admiral") {
      DOM.changeOGSelect(".expeditionFleetTemplateSelect", options.standardFleetId);
    }
  };

  if (context.admiral) {
    addTemplateSelector("#expeditionfleettemplatecomponent", "admiral", preselectTemplate);
  }

  let callback = () => {
    preselectTemplate();
    addGalaxyMarkers(context);
    addGalaxyTooltips(context);
    highlightTarget(context);
    scan(context);
    applyTargetClaims(context, galaxy, system);
  };

  let dc = displayContentGalaxy;
  displayContentGalaxy = (b) => {
    dc(b);
    var json = $.parseJSON(b);
    if (!OGIData.keepTooltip) {
      document.querySelector(".ogl-tooltip") && document.querySelector(".ogl-tooltip").classList.remove("ogl-active");
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        fixRedirectGalaxy(context);
        timeout = null;
      }, 200);
    }
    OGIData.keepTooltip = false;
    callback(galaxy, system);
  };
  let rc = renderContentGalaxy;
  renderContentGalaxy = (b) => {
    rc(b);
    if (!OGIData.keepTooltip) {
      document.querySelector(".ogl-tooltip") && document.querySelector(".ogl-tooltip").classList.remove("ogl-active");
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        fixRedirectGalaxy(context);
        timeout = null;
      }, 200);
    }
    OGIData.keepTooltip = false;
    callback(galaxy, system);
  };

  wait.waitForQuerySelector("#galaxyLoading[style='display: none;']").then(() => {
    if (!document.querySelector(".ogl-colors")) {
      callback(galaxy, system);
    }
  });
}

function applyTargetClaims(context, galaxy, system) {
  const teamKey = OGIData.json.options.ptreTK;
  if (!teamKey) return;

  const requestId = `${galaxy}:${system}`;
  // Guards against a second call for a system already being fetched, so navigating quickly
  // cannot stack requests.
  if (pendingClaimRequest === requestId) return;
  pendingClaimRequest = requestId;

  ptreService
    .getGalaxyTargets(OgamePageData.gameLang, context.universe, teamKey, galaxy, system)
    .then((response) => {
      const claims = indexClaims(response?.targets || response?.result || []);
      renderTargetClaims(context, galaxy, system, claims);
    })
    .catch((error) => {
      // A PTRE outage must never break galaxy view - the rows simply stay uncoloured.
      console.warn("[OGI][PTRE] target claims unavailable", error);
    })
    .finally(() => {
      if (pendingClaimRequest === requestId) pendingClaimRequest = null;
    });
}

function renderTargetClaims(context, galaxy, system, claims) {
  document.querySelectorAll("#galaxyContent .galaxyRow.ctContentRow").forEach((row, index) => {
    ["ogl-claim-mine", "ogl-claim-taken", "ogl-claim-stale"].forEach((className) => row.classList.remove(className));

    const coordinates = `${galaxy}:${system}:${index + 1}`;
    const result = claimStatus({
      coordinates,
      claims,
      ownPlayerId: context.playerId,
      ttlMinutes: Number(OGIData.json.options.claimTtlMinutes) || undefined,
    });

    if (result.status === CLAIM_FREE) return;

    const className = claimCssClass(result.status);
    if (className) row.classList.add(className);

    const who = result.claim?.playerName || Translator.translate(250);
    const age = result.ageMinutes === null ? "" : ` (${Math.round(result.ageMinutes)}min)`;
    row.setAttribute("data-ogl-claim", `${Translator.translate(249)}: ${who}${age}`);
  });
}

function addGalaxyMarkers(context) {
  document
    .querySelectorAll("#galaxyContent .galaxyRow.ctContentRow .galaxyCell.cellAlliance")
    .forEach((element, index) => {
      let moon = element.parentNode.querySelector(".cellMoon .tooltipRel") ? true : false;
      let playerDiv = element.parentNode.querySelector(".cellPlayerName > span.tooltipRel");
      let id =
        (playerDiv && playerDiv.getAttribute("rel") && playerDiv.getAttribute("rel").replace("player", "")) || 99999;
      let coords = galaxy + ":" + system + ":" + Number(index + 1);
      const colors = DOM.createDOM("div", { class: "ogl-colors", "data-coords": coords, "data-context": "galaxy" });
      //console.log('Coord: ' + coords + ' parent:' + colors + ' Id:' + id + ' Moon:' + moon);
      element.insertBefore(colors, element.firstChild);
      addMarkerUI(context, coords, colors, id, moon);
    });

  document.querySelectorAll("#galaxyContent .galaxyRow.ctContentRow").forEach((element, index) => {
    element.classList.remove("ogl-marked");
    element.removeAttribute("data-marked");

    let coords = galaxy + ":" + system + ":" + Number(index + 1);
    let playerDiv = element.querySelector(".cellPlayerName > span.tooltipRel");
    const playerId = playerDiv?.getAttribute("rel")?.replace("player", "");
    if (OGIData.json.markers[coords]) {
      if (!playerId || OGIData.json.markers[coords].id != playerId) {
        delete OGIData.json.markers[coords];
        context.markedPlayers = getMarkedPlayers(context, OGIData.json.markers);
        if (OGIData.json.options.targetList) {
          targetList(context, false);
          targetList(context, true);
          document.querySelector(`.ogl-target-list .ogl-stalkPlanets [data-coords="${coords}"]`).remove();
        }
      } else {
        //console.log('marked');
        element.classList.add("ogl-marked");
        element.setAttribute("data-marked", OGIData.json.markers[coords].color);
        OGIData.json.markers[coords].moon = element.querySelector(".cellMoon .tooltipRel") ? true : false;
      }
      OGIData.Save();
    } else if (OGIData.json.playerMarkers && OGIData.json.playerMarkers[playerId]) {
      //there is no marker for these coord but there is a marker for this player

      //Auto add marker
      OGIData.json.markers[coords] = {
        color: OGIData.json.playerMarkers[playerId].color,
        id: playerId,
      };

      //Save data
      OGIData.Save();

      //Update UI
      element.classList.add("ogl-marked");
      element.setAttribute("data-marked", OGIData.json.playerMarkers[playerId].color);
    }
  });
}

function getActivity(context, row) {
  let planet = row.children[1];
  let moon = row.children[3];
  let planetAct = -1,
    moonAct = -1;
  if (planet) {
    if (planet.querySelector(".activity.minute15")) {
      planetAct = 0;
    } else {
      let timer = planet.querySelector(".activity.showMinutes");
      planetAct = timer ? Number(timer.textContent.trim()) : 61;
    }
  }
  if (moon.children.length != 0) {
    if (moon.querySelector(".activity.minute15")) {
      moonAct = 0;
    } else {
      let timer = moon.querySelector(".activity.showMinutes");
      moonAct = timer ? Number(timer.textContent.trim()) : 61;
    }
  }
  return { planet: planetAct, moon: moonAct };
}

function updateSideActivity(context, planet, act) {
  if (!act) return;
  planet.querySelector(".ogl-planet").style.visibility = "hidden";
  planet.querySelector(".ogl-moon").style.visibility = "hidden";
  let planetAct = planet.querySelector(".ogl-planet-act");
  let moonAct = planet.querySelector(".ogl-moon-act");
  if (!planetAct) return;
  planetAct.classList.remove("active");
  planetAct.classList.remove("showMinutes");
  planetAct.classList.remove("activity");
  moonAct.classList.remove("active");
  moonAct.classList.remove("showMinutes");
  moonAct.classList.remove("activity");
  planetAct.replaceChildren();
  moonAct.replaceChildren();
  if (act.planet == 0) {
    planetAct.classList.add("active");
  } else if (act.planet > 0 && act.planet < 60) {
    planetAct.classList.add("activity", "showMinutes");
    planetAct.textContent = act.planet;
  } else {
    planetAct.classList.add("activity", "showMinutes");
    planetAct.textContent = "-";
  }
  if (act.moon != -1) {
    if (act.moon == 0) {
      moonAct.classList.add("active");
    } else if (act.moon > 0 && act.moon < 60) {
      moonAct.classList.add("activity", "showMinutes");
      moonAct.textContent = act.moon;
    } else {
      moonAct.classList.add("activity", "showMinutes");
      moonAct.textContent = "-";
    }
  }
}

function refreshStalk(context, stalk) {
  // Stalk = planet list of  pinned target
  dataHelper.getPlayer(stalk.getAttribute("player-id")).then((player) => {
    player.planets.forEach((planet) => {
      //console.log(player.planets);
      let olds = stalk.querySelectorAll("a");
      let max;
      let maxCoords;
      let found = false;
      let coords;
      olds.forEach((elem) => {
        coords = elem.getAttribute("data-coords");
        if (planet.coords > coords) {
          max = elem;
        }
        if (planet.coords == coords) {
          if (planet.deleted) {
            elem.classList.add("ogl-deleted");
          }
          updateSideActivity(context, elem, activities[planet.coords]);
          found = true;
        }
      });
      if (!found) {
        $(max).after(renderPlanet(context, planet.coords, false, true, false));
        //console.log(planet.coords);
      }
    });
    highlightTarget(context);
  });
}

function scan(context) {
  if (!activities) activities = {};
  let ptreJSON = {};
  let baseCords = galaxy + ":" + system;
  let secureCoords =
    document.getElementById("galaxy_input").value + ":" + document.getElementById("system_input").value;
  let doubleCheckCoords = document.querySelector(".ogl-colors")?.getAttribute("data-coords");
  if (secureCoords !== baseCords || (doubleCheckCoords && doubleCheckCoords !== baseCords + ":1")) {
    return;
  }

  // PTRE gala snapshot state - positions 1..15 only (see PTRE_MAX_POS below).
  // Non-PTRE OGI DOM features (marker/tooltip/activity refresh) run on ALL rows the
  // DOM exposes, including the expedition slot at position 16 if present, so any
  // future feature can safely enhance them.
  const PTRE_MIN_POS = 1;
  const PTRE_MAX_POS = 15;
  const galaPositions = {};
  const galaAdditionnal = {};
  for (let pos = PTRE_MIN_POS; pos <= PTRE_MAX_POS; pos++) {
    galaPositions[pos] = { playerId: -1, planetId: -1, moonId: -1 };
    galaAdditionnal[pos] = { playerName: "", playerRank: -1, playerStatus: "" };
  }

  document.querySelectorAll("#galaxycomponent .galaxyRow.ctContentRow").forEach((row, indexInDom) => {
    // Derive the OGame position from the row id (robust against DOM re-ordering
    // and against extra rows OGame may add). Fallback to DOM index only if the id
    // is missing / malformed.
    const posMatch = /^galaxyRow(\d+)$/.exec(row.id || "");
    const pos = posMatch ? Number(posMatch[1]) : indexInDom + 1;
    const coords = baseCords + ":" + pos;
    const isPtrePos = pos >= PTRE_MIN_POS && pos <= PTRE_MAX_POS;

    const target = document.querySelector(`.ogl-target-list .ogl-stalkPlanets [data-coords="${coords}"]`);
    if (target) {
      updateSideActivity(context, target, getActivity(context, row));
    }

    const playerDiv = row.querySelector(".cellPlayerName div");
    // own-planet rows have NO <div> inside .cellPlayerName (just two <span>s, one
    // with class .ownPlayerRow bearing the player name). Detect it as a fallback so we
    // don't miss the current player's own planets in the DOM walk.
    const ownPlayerSpan = playerDiv ? null : row.querySelector(".cellPlayerName .ownPlayerRow");

    if (playerDiv || ownPlayerSpan) {
      const planetDiv = row.querySelector(".cellPlanet div");
      const moonDiv = row.querySelector(".cellMoon div");
      let playerId = -1;
      let name = "";
      if (playerDiv) {
        const rawPlayerId = playerDiv.getAttribute("id")?.replace("player", "");
        playerId = rawPlayerId && rawPlayerId !== "" ? Number(rawPlayerId) : -1;
        name = playerDiv.querySelector("span:first-of-type")?.textContent || "";
      } else {
        // own-planet row: no player id in the row itself, fall back to the current player id.
        playerId = Number.isFinite(context.playerId) ? context.playerId : -1;
        name = ownPlayerSpan.textContent?.trim() || "";
      }
      const rawPlanetId = planetDiv ? planetDiv.getAttribute("data-planet-id") : null;
      const planetId = rawPlanetId ? Number(rawPlanetId) : -1;
      const rawMoonId = moonDiv ? moonDiv.getAttribute("data-moon-id") : null;
      const moonId = rawMoonId ? Number(rawMoonId) : -1;

      // Status flags (matches EasyPTRE extraction).
      let statusStr = "";
      const preElem = row.querySelector(".cellPlayerName pre");
      if (preElem) {
        preElem.querySelectorAll("span").forEach((span) => {
          const m = typeof span.className === "string" ? span.className.match(/status_abbr_(\w+)/) : null;
          if (m) {
            const s = m[1];
            if (s === "inactive") statusStr += "i";
            else if (s === "longinactive") statusStr += "I";
            else if (s === "vacation") statusStr += "v";
            else if (s === "admin") statusStr += "a";
          }
        });
      }

      // PTRE snapshot: only for real planet positions.
      if (isPtrePos) {
        galaPositions[pos] = { playerId, planetId, moonId };
        galaAdditionnal[pos].playerName = name;
        galaAdditionnal[pos].playerStatus = statusStr;
      }

      const sidedAll = document.querySelectorAll(".ogl-stalkPlanets");
      if (sidedAll.length != 0) {
        sidedAll.forEach((side) => {
          if (playerId == side.getAttribute("player-id")) {
            activities[coords] = getActivity(context, row);
          }
        });
      }

      // PTRE activities (stalked / marked / searched players only, positions 1..15).
      const playerIdStr = String(playerId);
      if (
        isPtrePos &&
        OGIData.json.options.ptreTK &&
        playerId > -1 &&
        (OGIData.json.sideStalk.indexOf(playerId) > -1 ||
          OGIData.json.sideStalk.indexOf(playerIdStr) > -1 ||
          context.markedPlayers.indexOf(playerIdStr) > -1 ||
          (OGIData.json.searchHistory.length > 0 &&
            playerIdStr == OGIData.json.searchHistory[OGIData.json.searchHistory.length - 1].id))
      ) {
        let planetActivity = row.querySelector("[data-planet-id] .activity.minute15")
          ? "*"
          : row.querySelector("[data-planet-id] .activity")?.textContent.trim() || 60;
        let moonActivity = row.querySelector("[data-moon-id] .activity.minute15")
          ? "*"
          : row.querySelector("[data-moon-id] .activity")?.textContent.trim() || 60;

        ptreJSON[coords] = {};
        ptreJSON[coords].id = planetId;
        ptreJSON[coords].player_id = playerId;
        ptreJSON[coords].teamkey = OGIData.json.options.ptreTK;
        ptreJSON[coords].mv = !!row.querySelector('span[class*="vacation"]');
        ptreJSON[coords].activity = planetActivity;
        ptreJSON[coords].galaxy = galaxy;
        ptreJSON[coords].system = system;
        ptreJSON[coords].position = String(pos);
        ptreJSON[coords].main = false;

        if (moonId > -1) {
          ptreJSON[coords].moon = {};
          ptreJSON[coords].moon.id = moonId;
          ptreJSON[coords].moon.activity = moonActivity;
        }
      }
    } else {
      // Empty position: refresh sidebar activity for the stalk tooltip if the coord is watched.
      const sided = document.querySelectorAll(`.ogl-stalkPlanets [data-coords="${coords}"]`);
      if (sided.length != 0) {
        if (!document.querySelector(".ogl-tooltip.ogl-active") && document.querySelector(".ogl-tooltip")) {
          document.querySelector(".ogl-tooltip").classList.add("ogl-active");
        }
        activities[coords] = getActivity(context, row);
      }
    }
  });

  // do final check before send changes data to ensure that game variables or DOM have not been modified
  const baseCordsFinal = galaxy + ":" + system;
  const secureCoordsFinal =
    document.getElementById("galaxy_input").value + ":" + document.getElementById("system_input").value;
  const doubleCheckCoordsFinal = document.querySelector(".ogl-colors")?.getAttribute("data-coords");
  if (baseCordsFinal !== baseCords || secureCoordsFinal !== baseCords || doubleCheckCoordsFinal !== baseCords + ":1") {
    return;
  }

  if (Object.keys(ptreJSON).length > 0) {
    let systemCoords = [galaxy, system];
    ptreActivityUpdate(context, ptreJSON, systemCoords);
  }

  // Galaxy scan dispatch. Runs unconditionally so the OGI-internal maps
  // (scannedPlanets/scannedPlayers -> stalking sidebar, tooltips, search box) are
  // refreshed even when no PTRE team key is set. PTRE work is gated inside scan(context).
  // Any failure here must NOT propagate to the OGame galaxy render path.
  try {
    const serverTimeMs = serverTime && typeof serverTime.getTime !== "undefined" ? serverTime.getTime() : null;
    const ptreKey = OGIData.json.options.ptreTK || null;
    pageContextRequest(
      "ptre",
      "galaxy",
      Number(galaxy),
      Number(system),
      galaPositions,
      galaAdditionnal,
      ptreKey,
      serverTimeMs
    )
      .then((value) => {
        try {
          if (value && value.response && Object.keys(value.response).length > 0) {
            ptreService.updateGalaxy(OgamePageData.gameLang, context.universe, value.response);
          }
        } catch (err) {
          console.error("[OGI][PTRE] updateGalaxy failed", err);
        }
      })
      .catch((err) => console.error("[OGI][PTRE] galaxy request failed", err));
  } catch (err) {
    console.error("[OGI][PTRE] galaxy dispatch failed", err);
  }

  document.querySelectorAll("div:not(.ogl-target-list) .ogl-stalkPlanets").forEach((reset) => {
    refreshStalk(context, reset);
  });
}

async function ptreActivityUpdate(context, ptreJSON, systemCoords) {
  for (const coords of Object.keys(ptreJSON)) {
    const pl = await dataHelper.getPlayer(ptreJSON[coords].player_id);
    const validIds = pl.planets.map((planet) => parseFloat(planet.id)).filter((id) => !isNaN(id));
    const mainId = Math.min(...validIds);
    const mainPlanet = pl.planets.find((planet) => {
      return planet.id == mainId;
    });
    if (typeof mainPlanet !== "undefined") {
      ptreJSON[coords].main = mainPlanet.coords === coords || false;
    }
  }

  ptreService.importPlayerActivity(OgamePageData.gameLang, context.universe, ptreJSON).then((result) => {
    if (result.code == 1) {
      document
        .querySelectorAll(`.ogl-stalkPlanets [data-coords^="${systemCoords[0]}:${systemCoords[1]}:"]`)
        .forEach((e) => {
          if (!e.classList.contains(".ptre_updated")) {
            e.classList.add("ptre_updated");
          }
        });
      document.querySelectorAll(`.ogl-active [data-coords^="${systemCoords[0]}:${systemCoords[1]}:"]`).forEach((e) => {
        if (!e.classList.contains(".ptre_updated")) {
          e.classList.add("ptre_updated");
        }
      });
    }
  });
}

function generateHiscoreLink(context, playerid) {
  const url = new URLSearchParams({
    page: "ingame",
    component: "highscore",
    searchRelId: playerid,
  });

  return `?${url.toString()}`;
}

function targetList(context, show) {
  let renderTagetList = () => {
    let galaxy = OGIData.json.targetTabs.g == -1 ? false : true;
    let system = OGIData.json.targetTabs.s == -1 ? false : true;
    let div = createDOM("div", { class: "ogl-target-list" });
    let header = div.appendChild(createDOM("div", { class: "ogk-controls" }));
    let markers = header.appendChild(createDOM("div"));
    ["red", "orange", "yellow", "green", "blue", "violet", "gray", "brown"].forEach((color) => {
      let toggle = createDOM("div", { class: "tooltip ogl-toggle", title: Translator.translate(40) });
      toggle.setAttribute("data-toggle", color);
      markers.appendChild(toggle);
      if (!OGIData.json.options.hiddenTargets[color]) toggle.classList.add("ogl-active");
      toggle.addEventListener("click", () => {
        OGIData.json.options.hiddenTargets[color] = OGIData.json.options.hiddenTargets[color] ? false : true;
        OGIData.Save();
        if (OGIData.json.options.hiddenTargets[color]) toggle.classList.remove("ogl-active");
        else toggle.classList.add("ogl-active");
        content.querySelectorAll(`[data-marked="${color}"]`).forEach((planet) => {
          if (OGIData.json.options.hiddenTargets[color]) planet.classList.add("ogl-colorHidden");
          else planet.classList.remove("ogl-colorHidden");
        });
        checkEmpty(galaxy, system);
      });
    });
    let filterTabs = header.appendChild(createDOM("div", { class: "ogl-tabList", style: "margin-bottom: 5px;" }));
    let tabG = filterTabs.appendChild(createDOM("div", { class: "ogl-tab" + (!galaxy ? " ogl-active" : "") }, "Gs"));
    tabG.addEventListener("click", () => {
      if (OGIData.json.targetTabs.g == -1) {
        OGIData.json.targetTabs.g = 0;
        galaxy = true;
        OGIData.Save();
        tabG.classList.remove("ogl-active");
      } else {
        OGIData.json.targetTabs.g = -1;
        galaxy = false;
        OGIData.Save();
        let active = header.querySelector(".ogl-tab[data-galaxy].ogl-active");
        if (active) active.classList.remove("ogl-active");
        document.querySelectorAll("a.ogl-galaxyHidden").forEach((target) => {
          target.classList.remove("ogl-galaxyHidden");
        });
        tabG.classList.add("ogl-active");
      }
      checkEmpty(galaxy, system);
    });
    let tabS = filterTabs.appendChild(createDOM("div", { class: "ogl-tab" + (!system ? " ogl-active" : "") }, "Ss"));
    tabS.addEventListener("click", () => {
      if (OGIData.json.targetTabs.s == -1) {
        OGIData.json.targetTabs.s = 0;
        system = true;
        OGIData.Save();
        tabS.classList.remove("ogl-active");
      } else {
        OGIData.json.targetTabs.s = -1;
        system = false;
        OGIData.Save();
        let active = header.querySelector(".ogl-tab[data-system].ogl-active");
        if (active) active.classList.remove("ogl-active");
        document.querySelectorAll("a.ogl-systemHidden").forEach((target) => {
          target.classList.remove("ogl-systemHidden");
        });
        tabS.classList.add("ogl-active");
      }
      checkEmpty(galaxy, system);
    });
    let content = div.appendChild(
      createDOM("div", {
        class: "ogl-dialogContainer ogl-stalkContainer",
        style: "max-height: 400px; overflow: hidden",
      })
    );
    let galaxyTabList = header.appendChild(createDOM("div", { class: "ogl-tabList ogl-galaxyTabList" }));
    let systemTabList = header.appendChild(createDOM("div", { class: "ogl-tabList ogl-systemTabList" }));
    let planetList = content.appendChild(createDOM("div", { class: "ogl-stalkPlanets" }));
    header.appendChild(createDOM("hr"));
    let checkEmpty = (galaxy, system) => {
      for (let g = 1; g <= 10; g++) {
        if (galaxy) {
          let children = content.querySelector(`[data-galaxy="${g}"]:not(.ogl-colorHidden)`);
          if (children) header.querySelector(`.ogl-tab[data-galaxy="${g}"]`).classList.remove("ogl-isEmpty");
          else header.querySelector(`.ogl-tab[data-galaxy="${g}"]`).classList.add("ogl-isEmpty");
        } else {
          header.querySelector(`.ogl-tab[data-galaxy="${g}"]`).classList.add("ogl-isEmpty");
        }
      }
      for (let s = 0; s < step * 10; s += step) {
        if (system) {
          let children = content.querySelector(
            `[data-galaxy="${OGIData.json.targetTabs.g}"][data-system="${s}"]:not(.ogl-colorHidden)`
          );
          if (children) header.querySelector(`.ogl-tab[data-system="${s}"]`).classList.remove("ogl-isEmpty");
          else header.querySelector(`.ogl-tab[data-system="${s}"]`).classList.add("ogl-isEmpty");
        } else {
          header.querySelector(`.ogl-tab[data-system="${s}"]`).classList.add("ogl-isEmpty");
        }
      }
    };
    for (let coords in OGIData.json.markers) {
      if (OGIData.json.markers[coords] == "") {
        delete OGIData.json.markers[coords];
        context.markedPlayers = getMarkedPlayers(context, OGIData.json.markers);
      }
    }
    let keys = Object.keys(OGIData.json.markers).sort((a, b) => {
      let coordsA = a
        .split(":")
        .map((x) => x.padStart(3, "0"))
        .join("");
      let coordsB = b
        .split(":")
        .map((x) => x.padStart(3, "0"))
        .join("");
      return coordsA - coordsB;
    });
    let step = 50;
    for (let i = 0; i < step * 10; i += step) {
      let sTab = systemTabList.appendChild(createDOM("div", { class: "ogl-tab", "data-system": i }, i));
      if (OGIData.json.targetTabs.s == i && system) sTab.classList.add("ogl-active");
      sTab.addEventListener("click", (event) => {
        if (!system) return;
        header.querySelectorAll(".ogl-tab[data-system].ogl-active").forEach((e) => e.classList.remove("ogl-active"));

        event.target.classList.add("ogl-active");
        content.querySelectorAll("[data-system]").forEach((planet) => {
          planet.classList.add("ogl-systemHidden");
          if (planet.getAttribute("data-system") == i) {
            planet.classList.remove("ogl-systemHidden");
          }
          OGIData.json.targetTabs.s = i;
        });
        OGIData.Save();
      });
    }
    for (let i = 1; i <= 10; i++) {
      let gTab = galaxyTabList.appendChild(createDOM("div", { class: "ogl-tab", "data-galaxy": i }, "G" + i));
      if (OGIData.json.targetTabs.g == i && galaxy) gTab.classList.add("ogl-active");
      if (OGIData.json.targetTabs.g == 0) gTab.click();
      gTab.addEventListener("click", (event) => {
        if (!galaxy) return;
        header.querySelectorAll(".ogl-tab[data-galaxy]").forEach((e) => e.classList.remove("ogl-active"));
        event.target.classList.add("ogl-active");
        content.querySelectorAll("[data-galaxy]").forEach((planet) => {
          planet.classList.add("ogl-galaxyHidden");
          if (planet.getAttribute("data-galaxy") == i) {
            planet.classList.remove("ogl-galaxyHidden");
          }
        });
        OGIData.json.targetTabs.g = i;
        OGIData.Save();
        checkEmpty(galaxy, system);
      });
    }
    keys.forEach((coords) => {
      if (OGIData.json.markers[coords]) {
        let a = renderPlanet(context, coords, false, false, OGIData.json.markers[coords].moon);
        let splitted = coords.split(":");
        a.setAttribute("data-coords", coords);
        a.setAttribute("data-galaxy", splitted[0]);
        a.setAttribute("data-system", Math.floor(splitted[1] / step) * step);
        if (OGIData.json.options.hiddenTargets[OGIData.json.markers[coords].color]) {
          a.classList.add("ogl-colorHidden");
        }
        if (galaxy) {
          if (OGIData.json.targetTabs.g != splitted[0]) {
            a.classList.add("ogl-galaxyHidden");
          }
        }
        if (system) {
          if (OGIData.json.targetTabs.s != Math.floor(splitted[1] / step) * step) {
            a.classList.add("ogl-systemHidden");
          }
        }
        planetList.appendChild(a);
      }
      setTimeout(() => {
        $(content).mCustomScrollbar({ theme: "ogame" });
      }, 100);
    });
    checkEmpty(galaxy, system);
    return div;
  };
  if (show) {
    document.querySelector("#planetList").style.display = "none";
    document.querySelector("#countColonies").style.display = "none";
    document.querySelector("#rechts").children[0].appendChild(renderTagetList());
  } else {
    let list = document.querySelector(".ogl-target-list");
    if (list) {
      list.remove();
      document.querySelector("#planetList").style.display = "block";
      document.querySelector("#countColonies").style.display = "block";
    }
  }
}

function addMarkerUI(context, coords, parent, id) {
  markerui.add(coords, parent, id);
}

function stalk(context, sender, player, delay) {
  stalkUtil.stalk(context, sender, player, delay);
}

function highlightTarget(context) {
  if (context.page != "galaxy") return;
  let coords;
  if (context.highlighted) {
    coords = context.highlighted.split(":");
  } else {
    coords = [
      context.rawURL.searchParams.get("galaxy") || 0,
      context.rawURL.searchParams.get("system") || 0,
      context.rawURL.searchParams.get("position") || 0,
    ];
    coords.join(":");
  }

  highlight(coords);
}

function getMarkedPlayers(context, markerList) {
  let playerList = [];
  let markerListLength = Object.keys(markerList).length;

  if (markerList) {
    Object.keys(markerList).forEach(function (key, index) {
      const id = parseInt(markerList[key].id);
      if (playerList.indexOf(id) == -1) {
        playerList.push(id);
      }
    });
    return playerList;
  }
  return [];
}

export {
  onGalaxyUpdate,
  targetList,
  getMarkedPlayers,
  highlightTarget,
  stalk,
  addMarkerUI,
  generateHiscoreLink,
  refreshStalk,
};
