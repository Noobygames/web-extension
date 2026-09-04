import OGBIData from "../../store/OGBIData.js";
import { createDOM } from "../../ui/dom.js";
import { toFormattedNumber } from "../../format/numbers.js";
import Translator from "../../format/i18n/translate.js";
import { pricedEntries, planFor, removeEntry, setManual, shiftEntryTarget } from "../../store/upgradePlans.js";
import { categoryOf } from "../../game/upgradeCost.js";
import { CATEGORIES, CATEGORY_ICON, categoryLabel, passesFilter } from "./filter.js";
import { syncNeeds } from "./sync.js";

/**
 * What one planet or moon still has to pay for: the orders already submitted in game
 * first, then whatever the player planned on top of them, then a subtotal per category.
 *
 * A submitted row is read out of the empire data, not out of the plan, so it cannot be
 * deleted here - it disappears when the order does. The one currently building shows a
 * zero cost: OGame charged it when it started (see `submittedOrders`).
 *
 * The numbers here are **costs**, not shortfalls - what the upgrade needs, whether or
 * not the planet already has it. The overview above is the one that nets stock and
 * cargo off. The column header says which, and every abbreviated figure carries its
 * exact value in a tooltip.
 */

/** Rows a category subtotal is built from. */
function subtotals(entries) {
  const byCategory = {};

  for (const entry of entries) {
    const category = categoryOf(entry.technoId) || "supplies";
    const totals = (byCategory[category] ||= { metal: 0, crystal: 0, deuterium: 0 });

    totals.metal += entry.cost[0];
    totals.crystal += entry.cost[1];
    totals.deuterium += entry.cost[2];
  }

  return byCategory;
}

function levelCell(entry) {
  return entry.paid ? `${entry.to}` : `${entry.from} → ${entry.to}`;
}

/**
 * A cost, abbreviated with its exact value on hover. `toFormattedNumber(x, null, true)`
 * renders 1.234.567 as "1,2M", which is unreadable as an amount to ship.
 */
function costCell(value) {
  return createDOM(
    "td",
    { class: "tooltip", title: toFormattedNumber(value || 0) },
    toFormattedNumber(value || 0, null, true)
  );
}

/**
 * One planet's or moon's rows.
 *
 * @param {string} coords
 * @param {boolean} isMoon
 * @param {() => void} onChange redraws the whole panel after an edit
 * @returns {HTMLElement|null} null when this side has nothing to show
 */
export function planetTable(coords, isMoon, onChange) {
  const side = planFor(coords, isMoon);
  const entries = pricedEntries(coords, isMoon).filter(passesFilter);
  const manual = side.manual || {};
  const manualSum = (manual.metal || 0) + (manual.crystal || 0) + (manual.deuterium || 0);

  if (entries.length === 0 && manualSum === 0) return null;

  const planet = (OGBIData.empire || []).find(
    (candidate) => String(candidate.coordinates || "").replace(/[[\]]/g, "") === coords
  );

  const section = createDOM("div", { class: "ogl-upgradePlans-planet" });
  section.appendChild(
    createDOM(
      "div",
      { class: "ogl-upgradePlans-planetName" },
      `${planet?.name || coords}${isMoon ? " 🌑" : ""} [${coords}]`
    )
  );

  const table = createDOM("table", { class: "ogl-upgradePlans-table" });
  const head = createDOM("tr");
  head.appendChild(createDOM("th", {}, ""));
  head.appendChild(createDOM("th", {}, Translator.translate(380)));
  for (const resource of ["ogl-metal", "ogl-crystal", "ogl-deut"]) {
    head.appendChild(
      createDOM("th", { class: `${resource} tooltip`, title: Translator.translate(403) }, Translator.translate(397))
    );
  }
  head.appendChild(createDOM("th", {}, ""));
  table.appendChild(head);

  for (const entry of entries) {
    const row = createDOM("tr", entry.submitted ? { class: "ogl-upgradePlans-submitted" } : {});

    const nameCell = createDOM("td");
    nameCell.appendChild(
      createDOM("span", { class: `icon12px ${CATEGORY_ICON[categoryOf(entry.technoId)] || "icon_wrench"}` })
    );
    nameCell.appendChild(createDOM("span", {}, ` ${Translator.translate(entry.technoId, "tech")}`));

    if (entry.submitted) {
      // The finish time rides along in the tooltip: a paid row shows a cost of zero, so
      // without it the line says nothing about what the planet is actually busy with.
      const finishes = entry.endDate ? ` (${new Date(entry.endDate).toLocaleString()})` : "";

      nameCell.appendChild(
        createDOM(
          "span",
          {
            class: "ogl-upgradePlans-badge tooltip",
            title: entry.paid ? `${Translator.translate(392)}${finishes}` : Translator.translate(391),
          },
          entry.paid ? " ⏳" : ` ${Translator.translate(391)}`
        )
      );
    }

    row.appendChild(nameCell);
    row.appendChild(createDOM("td", {}, levelCell(entry)));
    for (const index of [0, 1, 2]) row.appendChild(costCell(entry.cost[index]));

    const removeCell = createDOM("td");

    // Only what the player planned can be edited here. A submitted order lives in the
    // game, and cancelling it is the game's own button on the build page.
    if (!entry.submitted) {
      const actions = createDOM("div", { class: "ogl-upgradePlans-actions" });

      // `entry.from` rather than the stored one: on a row the game is already part way
      // through, one level less means one level off what is still on screen.
      const step = (delta) => () => {
        shiftEntryTarget(coords, isMoon, entry.technoId, delta, entry.from);
        syncNeeds(coords, isMoon);
        onChange();
      };

      const lessBtn = createDOM("a", { class: "icon icon_minus tooltip", title: Translator.translate(411) });
      lessBtn.addEventListener("click", step(-1));
      actions.appendChild(lessBtn);

      const moreBtn = createDOM("a", { class: "icon icon_plus tooltip", title: Translator.translate(412) });
      moreBtn.addEventListener("click", step(1));
      actions.appendChild(moreBtn);

      const removeBtn = createDOM("a", { class: "icon icon_against tooltip", title: Translator.translate(385) });
      removeBtn.addEventListener("click", () => {
        removeEntry(coords, isMoon, entry.technoId);
        syncNeeds(coords, isMoon);
        onChange();
      });
      actions.appendChild(removeBtn);

      removeCell.appendChild(actions);
    }

    row.appendChild(removeCell);
    table.appendChild(row);
  }

  // The free-hand pile: ships and defences, and whatever a pre-plan lock left behind.
  // One row, no level, and removable like any other. No category, so no filter.
  if (manualSum > 0) {
    const row = createDOM("tr", { class: "ogl-upgradePlans-manual" });
    row.appendChild(createDOM("td", {}, Translator.translate(63)));
    row.appendChild(createDOM("td", {}, "-"));
    for (const key of ["metal", "crystal", "deuterium"]) row.appendChild(costCell(manual[key] || 0));

    const removeCell = createDOM("td");
    const removeBtn = createDOM("a", { class: "icon icon_against tooltip", title: Translator.translate(385) });
    removeBtn.addEventListener("click", () => {
      setManual(coords, isMoon, {});
      syncNeeds(coords, isMoon);
      onChange();
    });
    removeCell.appendChild(removeBtn);
    row.appendChild(removeCell);

    table.appendChild(row);
  }

  // What this planet needs, and what for. Categories with nothing open are left out
  // rather than shown as three zeroes.
  const byCategory = subtotals(entries);
  for (const category of CATEGORIES) {
    const totals = byCategory[category];
    if (!totals || totals.metal + totals.crystal + totals.deuterium === 0) continue;

    const row = createDOM("tr", { class: "ogl-upgradePlans-subtotal" });
    row.appendChild(createDOM("td", {}, categoryLabel(category)));
    row.appendChild(createDOM("td", {}, ""));
    for (const key of ["metal", "crystal", "deuterium"]) row.appendChild(costCell(totals[key]));
    row.appendChild(createDOM("td"));
    table.appendChild(row);
  }

  section.appendChild(table);

  return section;
}
