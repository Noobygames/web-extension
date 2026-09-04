/**
 * Resource trade calculator, opened from the sidebar.
 *
 * Set the rate at the top - 3:2:1, 2.5:1.5:1, whatever the universe trades at - then
 * type an amount into any of the three fields; the other two show what that amount is
 * worth at that rate. The rate is the same `tradeRate` option the ROI tab and every
 * MSU/CSU/DSU sum already use, so changing it here changes it everywhere.
 *
 * Pure arithmetic over `OGBIData`: nothing here fetches anything and nothing here
 * touches the game (AGENTS.md 1.3, 4).
 */
import { createDOM } from "../../ui/dom.js";
import * as popupUtil from "../../ui/popup.js";
import { tradeRateInputs } from "../../ui/tradeRateInput.js";
import { toFormattedNumber, fromFormattedNumber } from "../../format/numbers.js";
import Translator from "../../format/i18n/translate.js";
import { getOption } from "../conf-options.js";

/** Index is the resource id: 0 metal, 1 crystal, 2 deuterium. */
const RESOURCES = ["metal", "crystal", "deuterium"];

/**
 * What `amount` of resource `from` is worth in resource `to`.
 *
 * Same relation `standardUnit()` uses, just between two resources instead of into a
 * single unit: at 3:2:1, 3000 metal is 2000 crystal is 1000 deuterium.
 *
 * @param {number} amount
 * @param {number} from - resource id of the amount
 * @param {number} to - resource id to express it in
 * @param {Array<number>} [rate] - defaults to the stored trade rate
 * @returns {number}
 */
export function convert(amount, from, to, rate = getOption("tradeRate")) {
  if (!Array.isArray(rate) || !rate[from] || !rate[to]) return 0;
  return (amount / rate[from]) * rate[to];
}

/** @returns {HTMLElement} */
function build() {
  const container = createDOM("div", { class: "ogl-dialogContainer ogl-tradeCalc" });
  container.appendChild(createDOM("h2", {}, Translator.translate(407)));

  const rateBox = container.appendChild(createDOM("div", { class: "ogk-tradeRate-box" }));
  rateBox.appendChild(createDOM("p", { class: "ogk-tradeRate-text" }, Translator.translate(119)));

  const grid = createDOM("div", { class: "ogl-tradeCalc-grid" });
  const inputs = [];

  // Which field the player last typed in - the one result the others are derived from,
  // so recomputing never overwrites what is being typed.
  let source = 0;

  const recompute = () => {
    const rate = getOption("tradeRate");
    const amount = fromFormattedNumber(inputs[source].value, true) || 0;
    inputs.forEach((input, index) => {
      if (index === source) return;
      input.value = amount ? toFormattedNumber(Math.round(convert(amount, source, index, rate))) : "";
    });
  };

  rateBox.appendChild(tradeRateInputs(recompute));
  container.appendChild(createDOM("p", { class: "ogl-tradeCalc-hint" }, Translator.translate(408)));

  RESOURCES.forEach((resource, index) => {
    grid.appendChild(createDOM("a", { class: `ogl-option resourceIcon ${resource}` }));
    const input = grid.appendChild(
      createDOM("input", {
        class: `ogl-formatInput ogl-tradeCalc-input ${resource}`,
        type: "text",
        value: "",
      })
    );
    inputs.push(input);

    const update = () => {
      source = index;
      recompute();
    };

    input.addEventListener("focus", () => (source = index));
    input.addEventListener("input", update);
    // Deferred by a tick: `ogl-formatInput` gives the field arrow-key stepping and the
    // K shortcut from a window-level listener that runs after this one, so reading the
    // value now would read it before that listener rewrote it.
    input.addEventListener("keyup", () => setTimeout(update, 0));
  });

  container.appendChild(grid);

  return container;
}

/** Opens the calculator. */
export function tradeCalculator() {
  popupUtil.popup(null, build());
}

export default tradeCalculator;
