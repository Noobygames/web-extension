import OGBIData from "../../store/OGBIData.js";
import { createDOM } from "../../ui/dom.js";
import { toFormattedNumber } from "../../format/numbers.js";
import Translator from "../../format/i18n/translate.js";
import { getNeedsByCoords } from "../planetbar/needs.js";
import { totalsFor } from "../../store/upgradePlans.js";
import { transportLink } from "./fleetLink.js";
import { supplySource } from "./source.js";
import { getOption } from "../conf-options.js";
import planetType from "../../game/planetType.js";

/**
 * The view from the RSS moon: one row per planet or moon that is still short of
 * something, with the amount and a button that sets that one delivery up.
 *
 * Every number here is **what is still to send**, never what the planet has. The two
 * read the same at a glance, so the column headers say which one it is and each cell
 * carries the arithmetic behind it: cost, minus the planet's stock, minus what is
 * already in flight.
 *
 * Compliance (AGENTS.md 1.1): one row, one button, one fleet. There is deliberately no
 * "send to all" - that would be several game actions behind a single click. Each button
 * only navigates to OGame's own fleet dispatch page with the target and the amounts
 * filled in; the send button there is the game's and stays the player's.
 */

/** Every planet and moon with an open need, in planet-bar order. */
function rows() {
  const found = [];

  for (const planet of OGBIData.empire || []) {
    const coords = String(planet.coordinates || "").replace(/[[\]]/g, "");
    if (!coords) continue;

    for (const isMoon of [false, true]) {
      if (isMoon && !planet.moon) continue;

      const missing = getNeedsByCoords(coords, isMoon);
      if (!missing) continue;

      found.push({ planet, coords, isMoon, missing, needed: totalsFor(coords, isMoon) });
    }
  }

  return found;
}

/** The three resources, in the order every table here uses. */
const RESOURCES = Object.freeze(["metal", "crystal", "deuterium"]);

/** What one resource on one row is made of, spelled out for the tooltip. */
function breakdown(index, row) {
  const key = RESOURCES[index];
  const object = row.isMoon ? row.planet.moon : row.planet;
  const needed = row.needed[key] || 0;
  const stock = object?.[key] || 0;
  const missing = row.missing[key] || 0;
  // Whatever those two do not account for is cargo already on its way there.
  const flying = Math.max(0, needed - stock - missing);

  return [
    `${Translator.translate(397)}: ${toFormattedNumber(needed)}`,
    `${Translator.translate(398)}: ${toFormattedNumber(stock)}`,
    `${Translator.translate(399)}: ${toFormattedNumber(flying)}`,
    `${Translator.translate(401)}: ${toFormattedNumber(missing)}`,
  ].join(" | ");
}

function missingCell(index, row) {
  const value = row.missing[RESOURCES[index]] || 0;

  return createDOM(
    "td",
    {
      class: value > 0 ? "ogl-upgradePlans-short tooltip" : "ogl-upgradePlans-ok tooltip",
      title: breakdown(index, row),
    },
    toFormattedNumber(value, null, true)
  );
}

/**
 * Where the deliveries start from, and the controls to change it.
 *
 * It lives here rather than in the settings dialog because the collect target it
 * defaults to is not configured there either - that one is picked on the fleet
 * dispatch page - and because this is the line the number actually shows up on.
 */
function sourceRow(onChange) {
  const row = createDOM("div", { class: "ogl-upgradePlans-source" });
  const stored = getOption("upgradePlanSource") || {};
  const source = supplySource();

  const toggle = createDOM("input", { type: "checkbox", id: "ogl-upgradePlans-useBank" });
  toggle.checked = Boolean(stored.useCollectTarget);
  toggle.addEventListener("change", () => {
    OGBIData.json.options.upgradePlanSource = { ...stored, useCollectTarget: toggle.checked };
    OGBIData.Save();
    onChange();
  });

  row.appendChild(toggle);
  row.appendChild(
    createDOM(
      "label",
      { for: "ogl-upgradePlans-useBank", class: "tooltip", title: Translator.translate(384) },
      ` ${Translator.translate(383)}`
    )
  );

  if (!stored.useCollectTarget) {
    const inputs = {};
    for (const field of ["galaxy", "system", "position"]) {
      inputs[field] = createDOM("input", {
        type: "text",
        class: "ogl-upgradePlans-coord",
        value: String(stored[field] || ""),
      });
      row.appendChild(inputs[field]);
    }

    const moonToggle = createDOM("input", { type: "checkbox", id: "ogl-upgradePlans-sourceMoon" });
    moonToggle.checked = Number(stored.type) === planetType.moon;
    row.appendChild(moonToggle);
    row.appendChild(createDOM("label", { for: "ogl-upgradePlans-sourceMoon" }, " 🌑"));

    const apply = () => {
      OGBIData.json.options.upgradePlanSource = {
        useCollectTarget: false,
        galaxy: Number(inputs.galaxy.value) || 0,
        system: Number(inputs.system.value) || 0,
        position: Number(inputs.position.value) || 0,
        type: moonToggle.checked ? planetType.moon : planetType.planet,
      };
      OGBIData.Save();
      onChange();
    };

    for (const field of Object.values(inputs)) field.addEventListener("change", apply);
    moonToggle.addEventListener("change", apply);
  }

  row.appendChild(
    createDOM(
      "span",
      { class: "ogl-upgradePlans-sourceValue" },
      ` ${Translator.translate(382)}: ${source ? source.coords + (source.isMoon ? " 🌑" : "") : "-"}`
    )
  );

  return row;
}

/**
 * @param {() => void} onChange redraws the panel after the source changes
 * @returns {HTMLElement} the summary table, or an empty-state line
 */
export function overviewTable(onChange) {
  const content = createDOM("div", { class: "ogl-upgradePlans-overview" });
  const source = supplySource();

  content.appendChild(sourceRow(onChange));

  const open = rows();

  if (open.length === 0) {
    content.appendChild(createDOM("div", { class: "ogl-upgradePlans-empty" }, Translator.translate(379)));

    return content;
  }

  const table = createDOM("table", { class: "ogl-upgradePlans-table" });
  const head = createDOM("tr");

  // Spelled out rather than left to the reader: a bare column of numbers next to a
  // planet name reads just as easily as "this is what the planet has".
  head.appendChild(createDOM("th", {}, Translator.translate(42)));
  for (const resource of ["ogl-metal", "ogl-crystal", "ogl-deut"]) {
    head.appendChild(
      createDOM("th", { class: `${resource} tooltip`, title: Translator.translate(404) }, Translator.translate(401))
    );
  }
  head.appendChild(createDOM("th", {}, ""));
  table.appendChild(head);

  const totals = { metal: 0, crystal: 0, deuterium: 0 };

  for (const row of open) {
    const { planet, coords, isMoon, missing } = row;
    const covered = missing.metal === 0 && missing.crystal === 0 && missing.deuterium === 0;
    const tr = createDOM("tr", covered ? { class: "ogl-upgradePlans-covered" } : {});

    tr.appendChild(createDOM("td", {}, `${planet.name}${isMoon ? " 🌑" : ""} [${coords}]`));
    tr.appendChild(missingCell(0, row));
    tr.appendChild(missingCell(1, row));
    tr.appendChild(missingCell(2, row));

    totals.metal += missing.metal;
    totals.crystal += missing.crystal;
    totals.deuterium += missing.deuterium;

    const actionCell = createDOM("td");

    // A covered row keeps its place instead of vanishing - it is the answer to "have I
    // sent enough here yet", and a row that disappeared would look like a lost plan.
    if (covered) {
      actionCell.appendChild(
        createDOM("span", { class: "ogl-upgradePlans-coveredMark tooltip", title: Translator.translate(400) }, "✔")
      );
    } else {
      actionCell.appendChild(
        createDOM("a", {
          class: "ogl-option ogl-upgradePlans-send tooltip",
          title: Translator.translate(381),
          href: transportLink(coords, isMoon, source?.id),
        })
      );
    }

    tr.appendChild(actionCell);
    table.appendChild(tr);
  }

  const totalRow = createDOM("tr", { class: "ogl-upgradePlans-total" });
  totalRow.appendChild(createDOM("td", {}, `${Translator.translate(40)} (${Translator.translate(401)})`));
  for (const key of RESOURCES) {
    totalRow.appendChild(
      createDOM(
        "td",
        { class: "tooltip", title: toFormattedNumber(totals[key]) },
        toFormattedNumber(totals[key], null, true)
      )
    );
  }
  totalRow.appendChild(createDOM("td"));
  table.appendChild(totalRow);

  content.appendChild(table);

  return content;
}
