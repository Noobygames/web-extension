import OGBIData from "../../store/OGBIData.js";
import { createDOM } from "../../ui/dom.js";
import Translator from "../../format/i18n/translate.js";
import { getOption } from "../conf-options.js";
import { categoryOf } from "../../game/upgradeCost.js";

/**
 * The category filter over the plan lists.
 *
 * A **view** filter, deliberately: it changes what the per-planet lists and the
 * breakdown show, and leaves the missing-resource column and the fleet buttons in the
 * overview alone. Those two have to agree with what the button actually sends, and the
 * fleet page reads the full need out of `OGBIData.needs` - a filter that quietly halved
 * one of them and not the other would be a good way to under-supply a planet.
 */

/** The five build pages, in the order they appear in the game's menu. */
export const CATEGORIES = Object.freeze(["supplies", "facilities", "research", "lfbuildings", "lfresearch"]);

/** Category -> its translation key. */
const CATEGORY_LABEL = Object.freeze({
  supplies: 386,
  facilities: 387,
  research: 388,
  lfbuildings: 389,
  lfresearch: 390,
});

/** Category -> the icon class `global.css` already carries. */
export const CATEGORY_ICON = Object.freeze({
  supplies: "icon_wrench",
  facilities: "icon_wrench",
  research: "icon_wrench",
  lfbuildings: "icon_wrench_lf",
  lfresearch: "icon_research_lf",
});

/** @param {string} category */
export function categoryLabel(category) {
  return CATEGORY_LABEL[category] ? Translator.translate(CATEGORY_LABEL[category]) : category;
}

/** @returns {Record<string, boolean>} */
export function activeFilter() {
  return getOption("upgradePlanFilter") || {};
}

/** @returns {boolean} whether anything is hidden right now */
export function isFiltering() {
  const filter = activeFilter();

  return CATEGORIES.some((category) => filter[category] === false);
}

/** @param {{technoId: number}} entry */
export function passesFilter(entry) {
  return activeFilter()[categoryOf(entry.technoId)] !== false;
}

/**
 * The chip row that drives it.
 *
 * @param {() => void} onChange redraws the panel
 * @returns {HTMLElement}
 */
export function filterChips(onChange) {
  const row = createDOM("div", { class: "ogl-upgradePlans-filter" });
  const filter = activeFilter();

  for (const category of CATEGORIES) {
    const on = filter[category] !== false;
    const chip = createDOM("span", {
      class: `ogl-upgradePlans-chip tooltip${on ? " ogl-active" : ""}`,
      title: Translator.translate(402),
    });

    chip.appendChild(createDOM("span", { class: `icon12px ${CATEGORY_ICON[category]}` }));
    chip.appendChild(createDOM("span", {}, ` ${categoryLabel(category)}`));

    chip.addEventListener("click", () => {
      OGBIData.json.options.upgradePlanFilter = { ...activeFilter(), [category]: !on };
      OGBIData.Save();
      onChange();
    });

    row.appendChild(chip);
  }

  return row;
}
