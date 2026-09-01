import { createDOM } from "../../ui/dom.js";
import { tooltip } from "../../ui/tooltip.js";
import Translator from "../../format/i18n/translate.js";
import DateTime from "../../format/dateTime.js";
import { toFormattedNumber } from "../../format/numbers.js";
import planetType from "../../game/planetType.js";
import OGBIData from "../../store/OGBIData.js";
import { getAllSpyReports, estimateResourcesNow } from "../../store/spyReportCache.js";
import { getPins, isPinned, togglePin } from "../../store/raidPins.js";
import { flightContext, estimateTarget } from "../../game/targetProfitability.js";
import { byProfitPerHour } from "../../game/farmEvaluator.js";
import { formatDuration } from "../../game/fleetFlight.js";
import { loadRadarTargets } from "./radarTargets.js";
import { buildSpyReportTooltipContent } from "./galaxyView.js";

/**
 * The raid list, opened from the "Raid" button next to the target-list/search/stats icons
 * (`ogCore.js` `sideOptions()`). Three tabs over three sources:
 *
 * - "Spied": every already-spied target ranked by profit/hour (`store/spyReportCache.js`).
 * - "Radar": inactive players in the player's own galaxies, out of the public-API snapshot
 *   the content script caches (`radarTargets.js`). Never spied, so no loot and no profit -
 *   ranked by flight time instead.
 * - "Pinned": the player's own shortlist (`store/raidPins.js`).
 *
 * Display only, like the spy table this reuses the look of (`.ogl-spyTable`): a
 * coordinate is a plain link into galaxy view, nothing more - no probe or attack action
 * is attached to it here (AGENTS.md 1.5.1), and the pin button writes to local storage
 * and nothing else. "Worth" comes from `spyReportCache.js`'s production-rate estimate
 * (two scans of the same spot), not from the target's building levels, which the compact
 * espionage row never carries - see that file for why a delta beats a guess.
 */
const INACTIVE_STATUS_CLASSES = new Set(["status_abbr_inactive", "status_abbr_longinactive"]);

const TAB_SPIED = "spied";
const TAB_RADAR = "radar";
const TAB_PINNED = "pinned";

function isInactive(entry) {
  return INACTIVE_STATUS_CLASSES.has(entry.statusCssClass);
}

function galaxyLink(coords) {
  const [galaxy, system, position] = coords.split(":");
  return `?page=ingame&component=galaxy&galaxy=${galaxy}&system=${system}&position=${position}`;
}

/**
 * API status letters to the game's own status classes, so a radar row is coloured like
 * the same player in galaxy view. Same table as `ctxpage/stalk/index.js`, kept local:
 * importing it would drag the whole stalk module into this chunk.
 */
function statusClass(status) {
  const flags = String(status || "");
  if (flags.includes("b")) return "status_abbr_banned";
  if (flags.includes("v")) return "status_abbr_vacation";
  if (flags.includes("i")) return "status_abbr_inactive";
  if (flags.includes("I")) return "status_abbr_longinactive";
  if (flags.includes("o")) return "status_abbr_outlaw";
  return "status_abbr_active";
}

/**
 * Every cached report, evaluated for profit/hour against the player's own planets and
 * currently configured farm ship (same formula as the spy-table "Profit/h" column -
 * `game/targetProfitability.js`), best first.
 */
function evaluatedTargets(onlyInactive) {
  const context = flightContext();

  return getAllSpyReports()
    .filter((entry) => !onlyInactive || isInactive(entry))
    .map((entry) => {
      const now = estimateResourcesNow(entry) ?? { metal: entry.metal, crystal: entry.crystal, deut: entry.deut };
      const total = now.metal + now.crystal + now.deut;
      const loot = Math.round((total * (Number(entry.loot) || 0)) / 100);

      return { entry, loot, ...estimateTarget(entry.coords, loot, context) };
    })
    .filter((row) => row.loot > 0)
    .sort(byProfitPerHour);
}

/** Pinned targets carry no loot either, so they are evaluated like radar rows. */
function evaluatedPins() {
  const context = flightContext();

  return getPins().map((pin) => {
    const { distance, durationSeconds } = estimateTarget(pin.coords, 0, context);
    return { target: pin, distance, durationSeconds };
  });
}

/**
 * Column order and per-cell coloring mirror the spy table (`SpyMessagesAnalyzer.js`)
 * exactly - same age/activity traffic-light on the date cell, same `ogl-good`
 * highlight on the gain cell once it clears the player's configured rentability
 * limit - so a player already used to that table reads this one at a glance too.
 */
function buildRow(index, row) {
  const { entry } = row;
  const tr = createDOM("tr");
  // Same hover tooltip as the galaxy-view cache marker (`galaxyView.js`), same cached-report shape.
  tr.addEventListener("mouseover", () => tooltip(tr, buildSpyReportTooltipContent(entry), true, false, 50));

  tr.appendChild(createDOM("td", {}, `${index + 1}`));

  const dateCol = createDOM("td", { class: "ogl-date" }, DateTime.timeSince(new Date(entry.timestamp)));
  if (entry.activity <= 15) dateCol.classList.add("ogl-danger");
  else if (entry.activity < 60) dateCol.classList.add("ogl-care");
  else dateCol.classList.add("ogl-good");
  tr.appendChild(dateCol);

  const coordsCol = createDOM("td");
  const coordsLink = coordsCol.appendChild(createDOM("a", { href: galaxyLink(entry.coords) }, entry.coords));
  if (entry.planetTargetType === planetType.moon) {
    coordsLink.appendChild(createDOM("figure", { class: "planetIcon moon" }));
  }
  tr.appendChild(coordsCol);

  tr.appendChild(
    createDOM(
      "td",
      { class: `ogl-name ${entry.statusCssClass || ""}`.trim() },
      `${entry.playerName} ${entry.status || ""}`.trim()
    )
  );

  const gainCol = createDOM("td", { class: "ogl-lootable" }, `~${toFormattedNumber(row.loot, null, true)}`);
  if (OGBIData.options.rvalLimit <= row.loot) gainCol.classList.add("ogl-good");
  tr.appendChild(gainCol);

  tr.appendChild(
    createDOM("td", { class: "ogl-lootable" }, toFormattedNumber(Math.round(row.profitPerHour), null, true))
  );

  return tr;
}

/**
 * A never-spied target: coordinates, who sits there, how far it is. No gain and no
 * profit/hour column - there is no report to derive either from, and inventing one
 * would be a guess presented as a measurement.
 *
 * @param {() => void} onPinChange re-render, so a row leaving the pinned tab disappears
 */
function buildRadarRow(index, row, onPinChange) {
  const { target } = row;
  const tr = createDOM("tr");

  tr.appendChild(createDOM("td", {}, `${index + 1}`));

  const coordsCol = createDOM("td");
  const coordsLink = coordsCol.appendChild(createDOM("a", { href: galaxyLink(target.coords) }, target.coords));
  if (target.moon) coordsLink.appendChild(createDOM("figure", { class: "planetIcon moon" }));
  tr.appendChild(coordsCol);

  tr.appendChild(createDOM("td", { class: `ogl-name ${statusClass(target.status)}` }, target.name || ""));
  tr.appendChild(createDOM("td", {}, target.status || ""));
  tr.appendChild(createDOM("td", {}, Number.isFinite(row.distance) ? toFormattedNumber(row.distance, 0) : "-"));
  tr.appendChild(createDOM("td", {}, formatDuration(row.durationSeconds)));

  // AGENTS.md 1.5.1: pinning means storing, not sending. This toggles a row in local
  // storage and triggers no request and no game action; probing still happens through
  // the game's own icon in galaxy view, reached by the coordinate link above.
  const pinned = isPinned(target.coords);
  const pinCol = createDOM("td");
  const pinBtn = pinCol.appendChild(
    createDOM("div", {
      class: `ogl-pin ${pinned ? "ogl-active" : ""}`.trim(),
      title: Translator.translate(pinned ? 366 : 365),
    })
  );
  pinBtn.addEventListener("click", () => {
    togglePin(target);
    onPinChange();
  });
  tr.appendChild(pinCol);

  return tr;
}

function raidList() {
  const container = createDOM("div", { class: "ogl-raidList" });
  container.appendChild(createDOM("h1", { style: "text-align: center; font-weight: 800" }, Translator.translate(357)));
  container.appendChild(createDOM("hr"));

  const tabs = container.appendChild(createDOM("div", { class: "ogl-tabs" }));
  const header = container.appendChild(createDOM("div", { class: "ogk-controls" }));
  const onlyInactiveToggle = header.appendChild(createDOM("div", { class: "ogl-tab" }, Translator.translate(358)));

  const scroll = container.appendChild(createDOM("div", { class: "ogl-spyTableScroll" }));
  const table = scroll.appendChild(createDOM("table", { class: "ogl-spyTable" }));

  let onlyInactive = false;
  let activeTab = TAB_SPIED;
  /** null while the radar bridge call is still in flight. */
  let radarRows = null;

  const headers = {
    [TAB_SPIED]: ["#", 97, 98, 73, 265, 232],
    [TAB_RADAR]: ["#", 98, 73, 358, 363, 364, ""],
    [TAB_PINNED]: ["#", 98, 73, 358, 363, 364, ""],
  };

  const buildHead = () => {
    table.querySelector("thead")?.remove();
    const thead = createDOM("thead");
    const headRow = thead.appendChild(createDOM("tr"));
    headers[activeTab].forEach((key) =>
      headRow.appendChild(createDOM("th", {}, typeof key === "number" ? Translator.translate(key) : key))
    );
    table.prepend(thead);
  };

  const emptyRow = (columns, text) => {
    const row = createDOM("tr");
    row.appendChild(createDOM("td", { colspan: `${columns}`, class: "ogl-spyTable-empty" }, text));
    return row;
  };

  const render = () => {
    buildHead();
    table.querySelector("tbody")?.remove();
    const body = table.appendChild(createDOM("tbody"));
    const columns = headers[activeTab].length;

    if (activeTab === TAB_SPIED) {
      const targets = evaluatedTargets(onlyInactive);
      if (targets.length === 0) {
        body.appendChild(emptyRow(columns, Translator.translate(345)));
        return;
      }
      targets.forEach((row, index) => body.appendChild(buildRow(index, row)));
      return;
    }

    // Radar rows are still on the way over the bridge.
    if (activeTab === TAB_RADAR && radarRows === null) {
      body.appendChild(emptyRow(columns, Translator.translate(345)));
      return;
    }

    const rows = activeTab === TAB_RADAR ? radarRows : evaluatedPins();
    if (rows.length === 0) {
      body.appendChild(emptyRow(columns, Translator.translate(activeTab === TAB_RADAR ? 367 : 345)));
      return;
    }
    rows.forEach((row, index) => body.appendChild(buildRadarRow(index, row, render)));
  };

  const selectTab = (tab, element) => {
    activeTab = tab;
    tabs.querySelectorAll(".ogl-tab").forEach((node) => node.classList.remove("ogl-active"));
    element.classList.add("ogl-active");
    // The "only inactive" filter belongs to the spy table; the other two tabs are
    // inactive-only by construction.
    header.style.display = tab === TAB_SPIED ? "" : "none";

    if (tab === TAB_RADAR && radarRows === null) {
      // One bridge call per page load, on demand - never on a timer (AGENTS.md 1.3).
      loadRadarTargets().then((rows) => {
        radarRows = rows;
        if (activeTab === TAB_RADAR) render();
      });
    }

    render();
  };

  [
    [TAB_SPIED, 360],
    [TAB_RADAR, 361],
    [TAB_PINNED, 362],
  ].forEach(([tab, label]) => {
    const element = tabs.appendChild(createDOM("div", { class: "ogl-tab" }, Translator.translate(label)));
    element.addEventListener("click", () => selectTab(tab, element));
    if (tab === TAB_SPIED) element.classList.add("ogl-active");
  });

  onlyInactiveToggle.addEventListener("click", () => {
    onlyInactive = !onlyInactive;
    onlyInactiveToggle.classList.toggle("ogl-active", onlyInactive);
    render();
  });

  render();

  return container;
}

export { raidList };
