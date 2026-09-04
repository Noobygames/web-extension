/**
 * The three trade-rate inputs, shared by the ROI tab and the trade calculator.
 *
 * One widget over one value: every edit writes `OGBIData.json.options.tradeRate`
 * straight through, so both panels - and the MSU/CSU/DSU sums everywhere else -
 * keep reading the same rate. Rates below 1 are rejected, as the ROI tab always did.
 */
import { createDOM } from "./dom.js";
import { toFormattedNumber } from "../format/numbers.js";
import Translator from "../format/i18n/translate.js";
import OGBIData from "../store/OGBIData.js";

/** Index in `tradeRate` is the resource id: 0 metal, 1 crystal, 2 deuterium. */
const RESOURCES = ["metal", "crystal", "deuterium"];

/**
 * Writes one rate. Mutate-then-`Save()` rather than a setter: `OGBIData.options` only
 * persists on reassignment, so a single array slot cannot go through it.
 */
function writeRate(index, value) {
  OGBIData.json.options.tradeRate[index] = value;
  OGBIData.Save();
}

/** Two decimals, never below 1. `fallback` covers an unparsable field. */
function normalize(raw, fallback, step = 0) {
  let value = parseFloat(String(raw).replace(",", "."));
  if (isNaN(value)) return fallback;
  value = Math.round((value + step) * 100) / 100;
  if (value < 1) {
    value = 1;
    fadeBox(Translator.translate(122), true);
  }
  return value;
}

/**
 * @param {Function} [onChange] - called after every accepted edit
 * @returns {HTMLElement} the `.ogk-tradeRate-grid` icon/input pairs
 */
export function tradeRateInputs(onChange) {
  const grid = createDOM("div", { class: "ogk-tradeRate-grid" });

  RESOURCES.forEach((resource, index) => {
    grid.appendChild(createDOM("a", { class: `ogl-option resourceIcon ${resource}` }));
    const input = grid.appendChild(
      createDOM("input", {
        class: `ogl-tradeRate-input ${resource}`,
        type: "text",
        value: toFormattedNumber(OGBIData.json.options.tradeRate[index]),
      })
    );

    const apply = (value) => {
      input.value = toFormattedNumber(value);
      writeRate(index, value);
      onChange?.();
    };

    input.addEventListener("keyup", (e) => {
      // Deferred: the arrow keys are handled here, but a fresh field must stay
      // editable, so an empty value is left alone until blur.
      setTimeout(() => {
        if (e.key == "Enter") input.blur();
        if (e.key == "." || e.key == ",") return;
        if (input.value === "") return;
        const step = e.key == "ArrowUp" ? 0.1 : e.key == "ArrowDown" ? -0.1 : 0;
        apply(normalize(input.value, OGBIData.json.options.tradeRate[index], step));
      }, 100);
    });

    input.addEventListener("blur", () => {
      apply(normalize(input.value, OGBIData.json.options.tradeRate[index]));
    });
  });

  return grid;
}

export default tradeRateInputs;
