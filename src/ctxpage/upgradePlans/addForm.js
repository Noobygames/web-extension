import OGBIData from "../../store/OGBIData.js";
import { createDOM } from "../../ui/dom.js";
import Translator from "../../format/i18n/translate.js";
import { BUIDLING_INFO } from "../../game/buildingInfo.js";
import { RESEARCH_INFO } from "../../game/researchInfo.js";
import { FACILITIES_TECHID, SUPPLIES_TECHID } from "../../game/gameConstants.js";
import { CLASSIC_RESEARCH_TECHID, LIFEFORM_BUILDING_FLOOR } from "../../game/technoIds.js";
import { addEntry, currentLevel, planetByCoords } from "../../store/upgradePlans.js";
import { CATEGORIES, categoryLabel } from "./filter.js";
import { syncNeeds } from "./sync.js";

/**
 * Planning an upgrade without walking to its build page first.
 *
 * The lock icon in the technology detail panel is still the quick way - it already
 * knows the technology and the level range the player is looking at. This is the other
 * way round: pick a planet, a category, a technology and a level, from anywhere.
 *
 * A plain form, and it stays one: choosing an upgrade writes a row to local storage and
 * nothing else. No request, no dispatch (AGENTS.md 1.2, 1.3).
 */

/** The moon facilities; the rest of `FACILITIES_TECHID` only exists on a planet. */
const MOON_FACILITIES = Object.freeze([41, 42, 43]);

/**
 * The technologies worth offering for one category on one planet or moon.
 *
 * Lifeform technologies are filtered by what the empire entry actually carries: a
 * planet only holds keys for the lifeform settled on it, so the tables never have to be
 * cross-referenced with which lifeform that is.
 *
 * @param {string} category
 * @param {object|null} object the planet's or moon's empire entry
 * @param {boolean} isMoon
 * @returns {number[]}
 */
export function technologiesFor(category, object, isMoon) {
  switch (category) {
    case "supplies":
      return isMoon ? [] : [...SUPPLIES_TECHID];
    case "facilities":
      return isMoon
        ? FACILITIES_TECHID.filter((id) => MOON_FACILITIES.includes(id) || [14, 21].includes(id))
        : FACILITIES_TECHID.filter((id) => !MOON_FACILITIES.includes(id));
    case "research":
      return isMoon ? [] : [...CLASSIC_RESEARCH_TECHID];
    case "lfbuildings":
      return isMoon ? [] : lifeformIdsOn(BUIDLING_INFO, object);
    case "lfresearch":
      return isMoon ? [] : lifeformIdsOn(RESEARCH_INFO, object);
    default:
      return [];
  }
}

function lifeformIdsOn(table, object) {
  if (!object) return [];

  return Object.keys(table)
    .map(Number)
    .filter((id) => id >= LIFEFORM_BUILDING_FLOOR && object[id] !== undefined);
}

/**
 * The name to show. `Translator` answers from the names scraped off the empire page,
 * which is what the player sees in game; the tables' own English names are the fallback
 * for anything that scrape has not covered yet.
 */
export function technologyName(technoId) {
  const scraped = Translator.translate(technoId, "tech");

  return scraped || BUIDLING_INFO[technoId]?.name || RESEARCH_INFO[technoId]?.name || String(technoId);
}

/** Every planet and moon, as the target picker lists them. */
function targets() {
  const list = [];

  for (const planet of OGBIData.empire || []) {
    const coords = String(planet.coordinates || "").replace(/[[\]]/g, "");
    if (!coords) continue;

    list.push({ key: `${coords}P`, coords, isMoon: false, label: `${planet.name} [${coords}]` });
    if (planet.moon) list.push({ key: `${coords}M`, coords, isMoon: true, label: `${planet.name} 🌑 [${coords}]` });
  }

  return list;
}

function select(options, selected) {
  const element = createDOM("select");

  for (const option of options) {
    const node = element.appendChild(createDOM("option", { value: String(option.value) }, option.label));
    if (String(option.value) === String(selected)) node.selected = true;
  }

  return element;
}

/**
 * The form.
 *
 * @param {() => void} onChange redraws the panel once something is planned
 * @param {{coords: string, isMoon: boolean}} [current] the planet to preselect
 * @returns {HTMLElement}
 */
export function addForm(onChange, current) {
  const row = createDOM("div", { class: "ogl-upgradePlans-add" });
  const available = targets();

  if (available.length === 0) return row;

  const preselected = current
    ? `${String(current.coords || "").replace(/[[\]]/g, "")}${current.isMoon ? "M" : "P"}`
    : available[0].key;

  row.appendChild(createDOM("strong", {}, `${Translator.translate(394)}: `));

  const targetSelect = select(
    available.map((target) => ({ value: target.key, label: target.label })),
    preselected
  );
  const categorySelect = select(
    CATEGORIES.map((category) => ({ value: category, label: categoryLabel(category) })),
    "supplies"
  );
  const technologySelect = createDOM("select");
  const levelInput = createDOM("input", { type: "text", class: "ogl-upgradePlans-level", size: "3" });
  const addButton = createDOM("button", { class: "ogl-upgradePlans-addBtn tooltip", title: Translator.translate(394) });
  addButton.textContent = Translator.translate(396);

  const chosenTarget = () => available.find((target) => target.key === targetSelect.value) || available[0];

  const objectFor = (target) => {
    const planet = planetByCoords(target.coords);

    return target.isMoon ? planet?.moon : planet;
  };

  /** Refills the technology list and resets the level to "one above what you own". */
  const refillTechnologies = () => {
    const target = chosenTarget();
    const object = objectFor(target);
    const ids = technologiesFor(categorySelect.value, object, target.isMoon);

    technologySelect.replaceChildren();
    for (const id of ids) {
      const owned = currentLevel(id, object);
      technologySelect.appendChild(createDOM("option", { value: String(id) }, `${technologyName(id)} (${owned})`));
    }

    technologySelect.disabled = ids.length === 0;
    addButton.disabled = ids.length === 0;
    refillLevel();
  };

  const refillLevel = () => {
    const technoId = Number(technologySelect.value);
    if (!technoId) return;

    levelInput.value = String(currentLevel(technoId, objectFor(chosenTarget())) + 1);
  };

  targetSelect.addEventListener("change", refillTechnologies);
  categorySelect.addEventListener("change", refillTechnologies);
  technologySelect.addEventListener("change", refillLevel);

  addButton.addEventListener("click", () => {
    const target = chosenTarget();
    const technoId = Number(technologySelect.value);
    const to = Number(levelInput.value);

    if (!technoId || !to) return;

    // `from` is the level actually owned, not whatever the field last showed: the whole
    // range up to the target is what still has to be paid for.
    addEntry(target.coords, target.isMoon, {
      technoId,
      from: currentLevel(technoId, objectFor(target)),
      to,
    });
    syncNeeds(target.coords, target.isMoon);
    onChange();
  });

  row.append(
    targetSelect,
    categorySelect,
    technologySelect,
    createDOM("span", { class: "ogl-upgradePlans-addLabel" }, ` ${Translator.translate(395)}: `),
    levelInput,
    addButton
  );

  refillTechnologies();

  return row;
}
