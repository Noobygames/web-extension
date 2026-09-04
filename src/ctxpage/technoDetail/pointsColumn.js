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
 * Adds the column next to the resource cells, built the way they are built.
 *
 * The first version appended a plain `<div>` and styled it `inline-block`. OGame's cost
 * row is a list, so a `<div>` among its `<li>`s is a block box between inline ones: the
 * column broke onto its own line and landed on top of "Produktionsdauer".
 *
 * Rather than guess at the game's layout, the neighbour is measured. The column copies
 * the last resource cell's tag and the two properties that decide whether a box sits
 * beside another one or below it, so it flows with them whatever OGame changes the row
 * to. Without a neighbour to copy there is no row to join, and nothing is drawn.
 *
 * @param {HTMLElement} costs the `.costs` row
 * @returns {HTMLElement|null}
 */
function buildColumn(costs) {
  // The last cost cell of the row - deuterium, energy or population, depending on what
  // is being built. Named rather than "the last child": `.costs` also holds a `<p>` the
  // stylesheet hides and OGI's own `.ogk-titles`, and copying either lays the column out
  // as something that is not a cost cell. Direct children only, so a nested span cannot
  // be mistaken for one.
  const sample = [...costs.querySelectorAll(".resource.icon, .metal, .crystal, .deuterium, .energy, .population")]
    .filter((cell) => cell.parentElement === costs && !cell.classList.contains("ogl-pointsCost"))
    .pop();

  if (!sample) return null;

  const column = createDOM(sample.tagName.toLowerCase(), { class: "ogl-pointsCost" });
  const measured = window.getComputedStyle?.(sample);

  if (measured) {
    column.style.display = measured.display;
    column.style.cssFloat = measured.cssFloat;
  }

  // After the last resource, which is where the row ends and the button begins.
  sample.after(column);

  return column;
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

  const column = costs.querySelector(".ogl-pointsCost") || buildColumn(costs);
  if (!column) return null;

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
