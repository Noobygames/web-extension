import OGBIData from "../../store/OGBIData.js";
import { createDOM } from "../../ui/dom.js";
import * as popupUtil from "../../ui/popup.js";
import Translator from "../../format/i18n/translate.js";
import { overviewTable } from "./overviewTable.js";
import { planetTable } from "./planetTable.js";
import { filterChips, isFiltering } from "./filter.js";
import { addForm } from "./addForm.js";
import { refreshPlans, syncAllNeeds } from "./sync.js";
import { clearAllPlans } from "../../store/upgradePlans.js";

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

/** @returns {HTMLElement} */
function build(render, current) {
  const container = createDOM("div", { class: "ogl-dialogContainer ogl-upgradePlans" });

  const head = container.appendChild(createDOM("div", { class: "ogl-upgradePlans-head" }));
  head.appendChild(createDOM("h2", {}, Translator.translate(378)));

  // Asked first: there is no undo in the store, and this drops every planet at once.
  const clearAllBtn = head.appendChild(
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
