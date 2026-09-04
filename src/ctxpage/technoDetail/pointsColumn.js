/**
 * What a build is worth in score, drawn as one more column beside what it costs.
 *
 * OGame's detail panel says what a ship or a level takes and never what it gives back
 * on the highscore, which is the number a player actually compares builds by. One
 * column, two lines: one of these, and everything on screen - 150 battlecruisers, or a
 * mine from level 20 to 24.
 *
 * Reads the DOM the panel just drew and nothing else: no request, no timer.
 */
import { createDOM } from "../../ui/dom.js";
import { toFormattedNumber } from "../../format/numbers.js";
import Translator from "../../format/i18n/translate.js";
import { pointsFor } from "../../game/points.js";

/** Points are small for a first-level mine and huge for a fleet, so both are spelled out. */
function pointsCell(className, points) {
  return createDOM(
    "div",
    { class: `${className} tooltip`, "data-title": toFormattedNumber(points, 2) },
    toFormattedNumber(points)
  );
}

/**
 * Draws (or redraws) the score column. Called again on every amount and level change,
 * so it reuses the column it drew last time rather than stacking a second one.
 *
 * @param {Array<number|string>} each cost of one unit or one level
 * @param {Array<number|string>|null} total cost of everything on screen; left out when
 *   there is only one of them and the two lines would say the same thing
 * @returns {HTMLElement|null} the column, or null when the panel is not on screen
 */
export function renderPointsColumn(each, total = null) {
  const costs = document.querySelector(".costs");
  if (!costs) return null;

  const column =
    costs.querySelector(".ogl-pointsCost") || costs.appendChild(createDOM("div", { class: "ogl-pointsCost" }));

  const eachPoints = pointsFor(each);
  const totalPoints = total ? pointsFor(total) : null;

  column.replaceChildren(
    createDOM(
      "div",
      { class: "ogl-pointsCost-label tooltip", "data-title": Translator.translate(414) },
      Translator.translate(413)
    ),
    pointsCell("ogl-pointsCost-each", eachPoints)
  );

  if (totalPoints !== null && totalPoints !== eachPoints) {
    column.appendChild(pointsCell("ogl-pointsCost-sum", totalPoints));
  }

  return column;
}

export default renderPointsColumn;
