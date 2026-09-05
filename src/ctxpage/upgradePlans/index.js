import OGBIData from "../../store/OGBIData.js";
import { createDOM } from "../../ui/dom.js";
import * as popupUtil from "../../ui/popup.js";
import Translator from "../../format/i18n/translate.js";
import { overviewTable } from "./overviewTable.js";
import { planetTable } from "./planetTable.js";
import { filterChips, isFiltering } from "./filter.js";
import { addForm } from "./addForm.js";
import { clearPlanFor, refreshPlans, syncAllNeeds } from "./sync.js";
import { clearAllPlans } from "../../store/upgradePlans.js";
import { getNeedsByCoords } from "../planetbar/needs.js";

/**
 * The upgrade plans panel, opened from the sidebar.
 *
 * Two halves, one scroll: the view from the RSS moon at the top - what each planet is
 * short of and a button per row that sets that delivery up - and below it what is
 * actually planned on each planet, technology by technology.
 *
 * A chunk on purpose. Pricing the plans needs `gameFormulas.js` and both cost tables,
 * which the page entry cannot carry; see the header of `store/upgradePlans.js`.
 *
 * Nothing here fetches anything: every number comes from `OGBIData`, which the boot
 * path already loaded (AGENTS.md 1.3, 4).
 */

/**
 * Drops every plan whose side matches, both the plan and the planet-bar cache behind it.
 *
 * Lives here rather than in the planet bar: these two used to be a pair of unlabelled
 * 16px sprites floating under the planet list, next to nothing that explained what they
 * would delete. This is the view that shows what is about to go.
 *
 * @param {(missing: {metal: number, crystal: number, deuterium: number}) => boolean} matches
 */
function clearWhere(matches) {
  for (const planet of OGBIData.empire || []) {
    const coords = String(planet.coordinates || "").replace(/[[\]]/g, "");
    if (!coords) continue;

    for (const isMoon of [false, true]) {
      if (isMoon && !planet.moon) continue;

      const missing = getNeedsByCoords(coords, isMoon);
      if (!missing || !matches(missing)) continue;

      clearPlanFor(coords, isMoon);
    }
  }
}

/** @returns {HTMLElement} */
function build(render, current) {
  const container = createDOM("div", { class: "ogl-dialogContainer ogl-upgradePlans" });

  const head = container.appendChild(createDOM("div", { class: "ogl-upgradePlans-head" }));
  head.appendChild(createDOM("h2", {}, Translator.translate(378)));

  const actions = head.appendChild(createDOM("div", { class: "ogl-upgradePlans-actions" }));

  const bulk = (variant, labelKey, tooltipKey, matches) => {
    const button = actions.appendChild(
      createDOM(
        "button",
        { class: `ogl-upgradePlans-bulk ${variant} tooltip`, title: Translator.translate(tooltipKey) },
        Translator.translate(labelKey)
      )
    );

    button.addEventListener("click", () => {
      if (!confirm(Translator.translate(420))) return;

      clearWhere(matches);
      render();
    });
  };

  const short = (missing) => missing.metal + missing.crystal + missing.deuterium !== 0;

  bulk("ogl-upgradePlans-bulkShort", 418, 338, short);
  bulk("ogl-upgradePlans-bulkDone", 419, 339, (missing) => !short(missing));

  // Asked first: there is no undo in the store, and this drops every planet at once.
  const clearAllBtn = actions.appendChild(
    createDOM("a", { class: "icon icon_trash tooltip", title: Translator.translate(409) })
  );
  clearAllBtn.addEventListener("click", () => {
    if (!confirm(Translator.translate(410))) return;

    clearAllPlans();
    // Not optional: this is what rewrites `OGBIData.needs` and redraws the planet bar's
    // lock icons, which would otherwise still show the plans that are gone.
    syncAllNeeds();
    render();
  });

  container.appendChild(overviewTable(render));
  container.appendChild(addForm(render, current));
  container.appendChild(filterChips(render));

  if (isFiltering()) {
    // Said out loud because the overview above keeps the full amount and the fleet
    // buttons send it: the filter shapes the lists below, not what gets shipped.
    container.appendChild(createDOM("div", { class: "ogl-upgradePlans-filterHint" }, Translator.translate(393)));
  }

  const details = createDOM("div", { class: "ogl-upgradePlans-details" });

  for (const planet of OGBIData.empire || []) {
    const coords = String(planet.coordinates || "").replace(/[[\]]/g, "");
    if (!coords) continue;

    const planetSection = planetTable(coords, false, render);
    if (planetSection) details.appendChild(planetSection);

    if (!planet.moon) continue;

    const moonSection = planetTable(coords, true, render);
    if (moonSection) details.appendChild(moonSection);
  }

  container.appendChild(details);

  return container;
}

/**
 * Opens the panel. Brings the plans back in step first: carries any pre-plan locks
 * over, drops what has been built since, and refreshes the planet bar's cache - the
 * player may not have visited half these planets since the levels changed.
 */
export function upgradePlans(current) {
  refreshPlans();

  const container = createDOM("div");
  const render = () => container.replaceChildren(build(render, current));

  render();
  popupUtil.popup(null, container);
}

export default upgradePlans;
