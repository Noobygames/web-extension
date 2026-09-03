import * as DOM from "../../ui/dom.js";
import { createDOM } from "../../ui/dom.js";
import * as wait from "../../platform/wait.js";
import { getLogger } from "../../platform/logger.js";
import * as ptreService from "../../integrations/ptre/service.js";
import Translator from "../../format/i18n/translate.js";
import OGBIData from "../../store/OGBIData.js";
import OgamePageData from "../../ogame/pageData.js";
import dataHelper from "../../integrations/dataHelper.js";
import { getOption } from "../conf-options.js";
import { CLAIM_FREE, claimCssClass, claimStatus, indexClaims } from "./targetClaims.js";
import { renderPlanet } from "./renderPlanet.js";
import { pageContextRequest } from "../../platform/bridge.js";
import { addTemplateSelector } from "../fleetdispatch/templates.js";
import { addMarkerUI, generateHiscoreLink, getMarkedPlayers, highlightTarget, stalk, targetList } from "./index.js";
import { tooltip } from "../../ui/tooltip.js";
import DateTime from "../../format/dateTime.js";
import { toFormattedNumber } from "../../format/numbers.js";
import planetType from "../../game/planetType.js";
import { getSpyReport, estimateResourcesNow } from "../../store/spyReportCache.js";
import { getBashStatus, isBashingSystemEnabled, pruneAttacks } from "../../store/bashLog.js";
import { formatBashCountdown } from "../../game/bashing.js";

const logger = getLogger("galaxyView");

/**
 * Everything OGI draws into OGame's galaxy view: the per-row tooltips and markers,
 * the activity read-out, the stalk refresh and the target claims shared through PTRE.
 *
 * Split off `galaxy/index.js` in Phase 5 of refactoring.md. `onGalaxyUpdate()` began
 * with `if (context.page != "galaxy") return;`, so on every other page this file was
 * 27 KB parsed to reach one comparison. `ogCore.js` now asks the same question before
 * fetching it, and the guard below stays for anyone who calls it from elsewhere.
 *
 * What stayed behind in `index.js` is what the rest of the extension needs off the
 * galaxy page: the target-list overlay (a sidebar button, on any page), the stalk
 * links `ctxpage/stalk` uses, and `getMarkedPlayers()`. This file imports those back;
 * nothing imports this one statically, which is what keeps it a chunk.
 *
 * Compliance note (AGENTS.md 1.5.1): unchanged by the move - nothing here attaches a
 * direct-probe action to a coordinate. It annotates the game's own galaxy rows, where
 * the game's own probe icon already is.
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
      stalk(sender, id);
    }
  });
}

function fixRedirectGalaxy() {
  history.pushState({}, null, `/game/index.php?page=ingame&component=galaxy&galaxy=${galaxy}&system=${system}`);
}

function onGalaxyUpdate(context) {
  if (context.page != "galaxy") return;

  let timeout;
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
    addSpyReportHover();
    highlightTarget(context);
    scan(context);
    applyTargetClaims(context, galaxy, system);
    renderBashingCounters();
  };

  let dc = displayContentGalaxy;
  displayContentGalaxy = (b) => {
    dc(b);
    if (!OGBIData.keepTooltip) {
      document.querySelector(".ogl-tooltip") && document.querySelector(".ogl-tooltip").classList.remove("ogl-active");
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        fixRedirectGalaxy(context);
        timeout = null;
      }, 200);
    }
    OGBIData.keepTooltip = false;
    callback(galaxy, system);
  };
  let rc = renderContentGalaxy;
  renderContentGalaxy = (b) => {
    rc(b);
    if (!OGBIData.keepTooltip) {
      document.querySelector(".ogl-tooltip") && document.querySelector(".ogl-tooltip").classList.remove("ogl-active");
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        fixRedirectGalaxy(context);
        timeout = null;
      }, 200);
    }
    OGBIData.keepTooltip = false;
    callback(galaxy, system);
  };

  wait
    .waitForQuerySelector("#galaxyLoading[style='display: none;']")
    .then(() => {
      if (!document.querySelector(".ogl-colors")) {
        callback(galaxy, system);
      }
    })
    .catch(() => logger.warn("#galaxyLoading never hid - skipping redirect fix"));
}

function applyTargetClaims(context, galaxy, system) {
  const teamKey = OGBIData.json.options.ptreTK;
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
      ttlMinutes: Number(OGBIData.json.options.claimTtlMinutes) || undefined,
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
      element.insertBefore(colors, element.firstChild);
      addMarkerUI(context, coords, colors, id, moon);
    });

  // One write for the whole galaxy view instead of one per row. Every branch below
  // mutates `OGBIData.json.markers`, which is the live object inside the store, so
  // anything reading it during the loop already sees the change; only the
  // serialization is pulled out. Fifteen rows meant fifteen full blob writes on
  // every galaxy render.
  let markersChanged = false;

  document.querySelectorAll("#galaxyContent .galaxyRow.ctContentRow").forEach((element, index) => {
    element.classList.remove("ogl-marked");
    element.removeAttribute("data-marked");

    let coords = galaxy + ":" + system + ":" + Number(index + 1);
    let playerDiv = element.querySelector(".cellPlayerName > span.tooltipRel");
    const playerId = playerDiv?.getAttribute("rel")?.replace("player", "");
    if (OGBIData.json.markers[coords]) {
      if (!playerId || OGBIData.json.markers[coords].id != playerId) {
        delete OGBIData.json.markers[coords];
        context.markedPlayers = getMarkedPlayers(context, OGBIData.json.markers);
        if (OGBIData.json.options.targetList) {
          targetList(context, false);
          targetList(context, true);
          document.querySelector(`.ogl-target-list .ogl-stalkPlanets [data-coords="${coords}"]`).remove();
        }
      } else {
        //console.log('marked');
        element.classList.add("ogl-marked");
        element.setAttribute("data-marked", OGBIData.json.markers[coords].color);
        OGBIData.json.markers[coords].moon = element.querySelector(".cellMoon .tooltipRel") ? true : false;
      }
      markersChanged = true;
    } else if (OGBIData.json.playerMarkers && OGBIData.json.playerMarkers[playerId]) {
      //there is no marker for these coord but there is a marker for this player

      //Auto add marker
      OGBIData.json.markers[coords] = {
        color: OGBIData.json.playerMarkers[playerId].color,
        id: playerId,
      };

      markersChanged = true;

      //Update UI
      element.classList.add("ogl-marked");
      element.setAttribute("data-marked", OGBIData.json.playerMarkers[playerId].color);
    }
  });

  if (markersChanged) OGBIData.Save();
}

/**
 * Shows the last cached espionage report for a coordinate on hover, read from
 * `spyReportCache` (fed by every spy report already in the player's own inbox -
 * see SpyMessagesAnalyzer). Display only: no probe or other game action is
 * attached to a coordinate here (AGENTS.md 1.5.1) - sending a new probe still
 * only happens through the game's own galaxy-view probe icon.
 */
function addSpyReportHover() {
  document.querySelectorAll("#galaxyContent .galaxyRow.ctContentRow").forEach((row, index) => {
    const coords = galaxy + ":" + system + ":" + Number(index + 1);

    attachSpyReportTooltip(row.querySelector(".cellPlanet"), coords, planetType.planet);

    const moonCell = row.querySelector(".cellMoon");
    if (moonCell && moonCell.children.length !== 0) attachSpyReportTooltip(moonCell, coords, planetType.moon);
  });
}

/**
 * Bashing-rule counter: how often this position was attacked in the last 24h.
 *
 * OGame's rule allows a limited number of attacks per planet OR moon per rolling 24h
 * window (`bashlimit` in serverData.xml - 6 by default, 20 in a few universes), and a
 * planet and its moon are counted separately. The badge sits on the row the player is
 * already looking at, tooltip carries the limit and when the count next drops.
 *
 * Source of the numbers is the fleet-dispatch hook, i.e. attacks sent from this browser
 * only - so it is a lower bound and the tooltip says so. Nothing here queries the game
 * (AGENTS.md 1.3 / 4), nothing attaches an attack action to a coordinate
 * (AGENTS.md 1.5.1); it annotates rows the game itself drew.
 */
function renderBashingCounters() {
  if (!getOption("bashingCounter")) return;
  if (!isBashingSystemEnabled()) return;

  const now = Date.now();
  pruneAttacks(now);

  document.querySelectorAll("#galaxyContent .galaxyRow.ctContentRow").forEach((row, indexInDom) => {
    const posMatch = /^galaxyRow(\d+)$/.exec(row.id || "");
    const pos = posMatch ? Number(posMatch[1]) : indexInDom + 1;
    const coords = `${galaxy}:${system}:${pos}`;
    const exempt = isBashingExempt(row);

    attachBashBadge(row.querySelector(".cellPlanet"), coords, planetType.planet, now, exempt);
    const moonCell = row.querySelector(".cellMoon");
    if (moonCell && moonCell.children.length !== 0) attachBashBadge(moonCell, coords, planetType.moon, now, exempt);
  });
}

/**
 * Whether the bashing limit applies to this row at all.
 *
 * It does not for an inactive owner - that is part of the rule itself, not a courtesy
 * (see `game/bashing.js`). The flags come off the same `status_abbr_*` spans the PTRE
 * snapshot below reads, so the two cannot disagree about what "inactive" means.
 *
 * @param {Element} row a galaxy row
 * @returns {boolean}
 */
export function isBashingExempt(row) {
  const spans = row?.querySelectorAll?.(".cellPlayerName span") || [];

  for (const span of spans) {
    if (typeof span.className !== "string") continue;

    const status = /status_abbr_(\w+)/.exec(span.className)?.[1];
    if (status === "inactive" || status === "longinactive") return true;
  }

  return false;
}

function attachBashBadge(cell, coords, type, now, exempt) {
  if (!cell) return;

  // The galaxy view is re-rendered in place on every navigation, but a cached row can
  // survive it, so an old badge is removed rather than stacked on.
  cell.querySelector(".ogl-bash-badge")?.remove();

  const status = getBashStatus(coords, type, now, exempt);
  if (status.count <= 0) return;

  cell.classList.add("ogl-bash-cell");
  const badge = cell.appendChild(
    createDOM("div", { class: `ogl-bash-badge ogl-bash-${status.level}` }, String(status.count))
  );
  badge.addEventListener("mouseover", () => tooltip(badge, buildBashTooltipContent(status, type), true, false, 50));
}

export function buildBashTooltipContent(status, type) {
  const container = createDOM("div", { class: "ogl-bashTooltip" });

  container.appendChild(createDOM("div", { class: "splitline" }, Translator.translate(368)));
  container.appendChild(
    createDOM(
      "div",
      {},
      `${Translator.translate(type === planetType.moon ? 370 : 369)}: ${status.count}/${status.limit}`
    )
  );

  if (status.exempt) {
    // The count is still true and worth showing; what would be false is any statement
    // about a limit, so neither the remaining count nor the reset time is drawn.
    container.appendChild(createDOM("div", { class: "ogl-bash-note" }, Translator.translate(406)));
  } else if (status.remaining <= 0) {
    container.appendChild(createDOM("div", { class: "ogl-bash-limit" }, Translator.translate(372)));
  } else {
    container.appendChild(createDOM("div", {}, `${Translator.translate(371)}: ${status.remaining}`));
  }

  if (!status.exempt && status.resetAt) {
    container.appendChild(
      createDOM("div", {}, `${Translator.translate(373)}: ${formatBashCountdown(status.resetAt - Date.now())}`)
    );
  }

  // Entries with no battle report behind them yet - normally fleets still in flight.
  if (status.pending > 0) {
    container.appendChild(
      createDOM("div", { class: "ogl-bash-note" }, `${status.pending} ${Translator.translate(377)}`)
    );
  }

  container.appendChild(createDOM("div", { class: "ogl-bash-note" }, Translator.translate(374)));

  return container;
}

function attachSpyReportTooltip(cell, coords, type) {
  if (!cell) return;

  const report = getSpyReport(coords, type);
  if (!report) return;

  cell.classList.add("ogl-hasSpyReportCache");
  cell.addEventListener("mouseover", () => tooltip(cell, buildSpyReportTooltipContent(report), true, false, 50));
}

/** Past this age the snapshot is treated as stale enough to suggest a fresh probe. */
const STALE_REPORT_MINUTES = 60;

/** Also used by `raidList.js` (same cached-report shape) so both hovers show the same content. */
export function buildSpyReportTooltipContent(report) {
  const container = createDOM("div", { class: "ogl-spyReportCacheTooltip" });

  container.appendChild(createDOM("div", { class: "splitline" }, Translator.translate(354)));
  container.appendChild(createDOM("div", {}, `${report.playerName} ${report.status || ""}`.trim()));
  container.appendChild(
    createDOM("div", {}, `${Translator.translate(97)}: ${DateTime.timeSince(new Date(report.timestamp))}`)
  );
  container.appendChild(
    createDOM(
      "div",
      { class: "ogl-metal" },
      `${Translator.translate(0, "res")}: ${toFormattedNumber(report.metal, null, true)}`
    )
  );
  container.appendChild(
    createDOM(
      "div",
      { class: "ogl-crystal" },
      `${Translator.translate(1, "res")}: ${toFormattedNumber(report.crystal, null, true)}`
    )
  );
  container.appendChild(
    createDOM(
      "div",
      { class: "ogl-deut" },
      `${Translator.translate(2, "res")}: ${toFormattedNumber(report.deut, null, true)}`
    )
  );
  container.appendChild(
    createDOM(
      "div",
      { class: "splitline" },
      `${Translator.translate(40)}: ${toFormattedNumber(report.total, null, true)}`
    )
  );

  const estimate = estimateResourcesNow(report);
  if (estimate) {
    container.appendChild(createDOM("div", { class: "splitline" }, `~ ${Translator.translate(355)}`));
    container.appendChild(
      createDOM(
        "div",
        { class: "ogl-metal" },
        `${Translator.translate(0, "res")}: ~${toFormattedNumber(estimate.metal, null, true)}`
      )
    );
    container.appendChild(
      createDOM(
        "div",
        { class: "ogl-crystal" },
        `${Translator.translate(1, "res")}: ~${toFormattedNumber(estimate.crystal, null, true)}`
      )
    );
    container.appendChild(
      createDOM(
        "div",
        { class: "ogl-deut" },
        `${Translator.translate(2, "res")}: ~${toFormattedNumber(estimate.deut, null, true)}`
      )
    );
  }
  container.appendChild(
    createDOM(
      "div",
      {},
      `${Translator.translate(63)}: ${
        report.fleet === "No data" ? report.fleet : toFormattedNumber(report.fleet, null, true)
      }`
    )
  );
  container.appendChild(
    createDOM(
      "div",
      {},
      `${Translator.translate(54)}: ${
        report.defense === "No data" ? report.defense : toFormattedNumber(report.defense, null, true)
      }`
    )
  );

  const ageMinutes = (Date.now() - report.timestamp) / 60000;
  if (ageMinutes > STALE_REPORT_MINUTES) {
    container.appendChild(createDOM("div", { class: "ogl-danger" }, Translator.translate(356)));
  }

  return container;
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
        OGBIData.json.options.ptreTK &&
        playerId > -1 &&
        (OGBIData.json.sideStalk.indexOf(playerId) > -1 ||
          OGBIData.json.sideStalk.indexOf(playerIdStr) > -1 ||
          context.markedPlayers.indexOf(playerIdStr) > -1 ||
          (OGBIData.json.searchHistory.length > 0 &&
            playerIdStr == OGBIData.json.searchHistory[OGBIData.json.searchHistory.length - 1].id))
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
        ptreJSON[coords].teamkey = OGBIData.json.options.ptreTK;
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
    const ptreKey = OGBIData.json.options.ptreTK || null;
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

export { onGalaxyUpdate, refreshStalk };
