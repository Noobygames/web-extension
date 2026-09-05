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

/**
 * One figure, rounded to what is worth reading.
 *
 * The range is enormous - a level-1 mine is worth 0.075 points, a mine at 26 is worth
 * 1893.84, a fleet order runs into six figures - so a fixed precision is wrong at one
 * end or the other. Two decimals only below 100, where they are the whole number;
 * above it they are noise on a column that is 60px wide. The exact value stays on the
 * tooltip either way.
 */
function pointsCell(className, points) {
  return createDOM(
    "div",
    { class: `${className} tooltip`, "data-title": toFormattedNumber(points, 2) },
    toFormattedNumber(points, points < 100 ? null : 0)
  );
}

/**
 * Adds the column to OGame's cost row, built exactly like the cells already in it.
 *
 * The row is not what the class name suggests. `.costs` is a `<div>` that holds a
 * hidden `<p>`, a nested `<ul class="ipiHintable">` with the cost cells in it, and
 * OGBI's own `.ogk-titles`. So the cells are grandchildren, not children, and the
 * column has to go inside that `<ul>` - two earlier attempts got this wrong in
 * opposite directions: a `<div>` appended to `.costs` broke onto its own line and
 * landed on "Produktionsdauer", and restricting the search to direct children of
 * `.costs` then matched nothing at all and drew no column.
 *
 * One cell looks like this, and the column mirrors it line for line:
 *
 *     <li class="resource metal icon ..." data-value="30000">
 *       30K                                   <- cost of one, the row with no label
 *       <div class="ogk-sum">600K</div>       <- "Gesamt"
 *       <div>0</div>                          <- "Fehlend"
 *     </li>
 *
 * The row labels live in `.ogk-titles`, positioned to the left of the whole row, so a
 * column cannot carry a heading in the flow without pushing its figures onto the wrong
 * lines. The star therefore sits absolutely in the space the resource sprite occupies.
 *
 * @param {HTMLElement} costs the `.costs` block
 * @returns {HTMLElement|null}
 */
function buildColumn(costs) {
  const sample = [...costs.querySelectorAll("li.resource.icon")]
    .filter((cell) => !cell.classList.contains("ogl-pointsCost"))
    .pop();

  if (!sample) return null;

  // `resource icon` and nothing else off the sample: those two carry the box the cells
  // share. Copying its full class list would bring `metal`/`deuterium` (a sprite),
  // `sufficient` (a colour that means "you can afford this") and OGame's own tooltip
  // hooks along with it, none of which mean anything for a score.
  const column = createDOM("li", { class: "resource icon ogl-pointsCost" });

  // A mark, not a word. Every other cell in this row is an icon with its name on
  // hover, and a bare caption spelled out between them read as something that had
  // fallen into the panel rather than a column of it. The glyph is drawn by the
  // stylesheet; the name stays on the tooltip and on `aria-label`, exactly the way
  // OGame labels its own resource cells.
  column.appendChild(
    createDOM("span", {
      class: "ogl-pointsCost-label tooltip",
      "data-title": `${Translator.translate(413)} - ${Translator.translate(414)}`,
      "aria-label": Translator.translate(413),
    })
  );

  // Into the list, beside the last cost cell - not into `.costs`, which is the block
  // around it.
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

  // The heading is kept and everything after it redrawn: it is positioned out of the
  // flow, so rebuilding it on every keystroke would only make it flicker.
  const label = column.querySelector(".ogl-pointsCost-label");
  column.replaceChildren(label, pointsCell("ogl-pointsCost-each", eachPoints));

  // Same line as the game's own "Gesamt", and `ogk-sum` so it is the same yellow.
  if (totalPoints !== null && totalPoints !== eachPoints) {
    column.appendChild(pointsCell("ogk-sum ogl-pointsCost-sum", totalPoints));
  }

  return column;
}

export default renderPointsColumn;
