import { createDOM } from "../../ui/dom.js";
import { tooltip } from "../../ui/tooltip.js";
import Translator from "../../format/i18n/translate.js";
import DateTime from "../../format/dateTime.js";
import { toFormattedNumber } from "../../format/numbers.js";
import planetType from "../../game/planetType.js";
import OGBIData from "../../store/OGBIData.js";
import { getAllSpyReports, estimateResourcesNow } from "../../store/spyReportCache.js";
import { flightContext, estimateTarget } from "../../game/targetProfitability.js";
import { byProfitPerHour } from "../../game/farmEvaluator.js";
import { buildSpyReportTooltipContent } from "./galaxyView.js";

/**
 * The raid list: every already-spied target ranked by profit/hour, opened from the
 * "Raid" button next to the target-list/search/stats icons (`ogCore.js` `sideOptions()`).
 *
 * Display only, like the spy table this reuses the look of (`.ogl-spyTable`): a
 * coordinate is a plain link into galaxy view, nothing more - no probe or attack action
 * is attached to it here (AGENTS.md 1.5.1). "Worth" comes from `spyReportCache.js`'s
 * production-rate estimate (two scans of the same spot), not from the target's building
 * levels, which the compact espionage row never carries - see that file for why a
 * delta beats a guess.
 */
const INACTIVE_STATUS_CLASSES = new Set(["status_abbr_inactive", "status_abbr_longinactive"]);

function isInactive(entry) {
  return INACTIVE_STATUS_CLASSES.has(entry.statusCssClass);
}

function galaxyLink(coords) {
  const [galaxy, system, position] = coords.split(":");
  return `?page=ingame&component=galaxy&galaxy=${galaxy}&system=${system}&position=${position}`;
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

function raidList() {
  const container = createDOM("div", { class: "ogl-raidList" });
  container.appendChild(createDOM("h1", { style: "text-align: center; font-weight: 800" }, Translator.translate(357)));
  container.appendChild(createDOM("hr"));

  const header = container.appendChild(createDOM("div", { class: "ogk-controls" }));
  const onlyInactiveToggle = header.appendChild(createDOM("div", { class: "ogl-tab" }, Translator.translate(358)));

  const scroll = container.appendChild(createDOM("div", { class: "ogl-spyTableScroll" }));
  const table = scroll.appendChild(createDOM("table", { class: "ogl-spyTable" }));
  const thead = table.appendChild(createDOM("thead"));
  const headRow = thead.appendChild(createDOM("tr"));
  headRow.appendChild(createDOM("th", {}, "#"));
  headRow.appendChild(createDOM("th", {}, Translator.translate(97)));
  headRow.appendChild(createDOM("th", {}, Translator.translate(98)));
  headRow.appendChild(createDOM("th", {}, Translator.translate(73)));
  headRow.appendChild(createDOM("th", {}, Translator.translate(265)));
  headRow.appendChild(createDOM("th", {}, Translator.translate(232)));

  let onlyInactive = false;

  const render = () => {
    table.querySelector("tbody")?.remove();
    const body = table.appendChild(createDOM("tbody"));

    const targets = evaluatedTargets(onlyInactive);
    if (targets.length === 0) {
      const row = body.appendChild(createDOM("tr"));
      row.appendChild(createDOM("td", { colspan: "6", class: "ogl-spyTable-empty" }, Translator.translate(345)));
      return;
    }

    targets.forEach((row, index) => body.appendChild(buildRow(index, row)));
  };

  onlyInactiveToggle.addEventListener("click", () => {
    onlyInactive = !onlyInactive;
    onlyInactiveToggle.classList.toggle("ogl-active", onlyInactive);
    render();
  });

  render();

  return container;
}

export { raidList };
