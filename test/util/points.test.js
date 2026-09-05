/**
 * The score column: the arithmetic, and the column it draws into OGame's cost row.
 *
 * The panel that calls it (`ctxpage/technoDetail/index.js`) has no tests of its own -
 * it rewrites a page OGame renders. The two pieces pulled out of it do: the points
 * formula, and the fact that redrawing replaces the column instead of stacking a
 * second one, which is what would happen on every keystroke in the amount field.
 *
 * Page-context modules - no `chrome: true` on setupBrowser.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const bootstrap = setupBrowser();
const { pointsFor, RESOURCES_PER_POINT } = await import("../../src/game/points.js");
const { renderPointsColumn } = await import("../../src/ctxpage/technoDetail/pointsColumn.js");
const { toFormattedNumber } = await import("../../src/format/numbers.js");
bootstrap.cleanup();

/**
 * OGame's cost block, copied from a live battlecruiser panel.
 *
 * The nesting is the whole point: `.costs` is a `<div>` holding a hidden `<p>`, a
 * nested `<ul>` with the cells in it, and OGBI's `.ogk-titles`. Two earlier fixtures
 * were invented rather than captured - one had the cells as direct children of
 * `.costs`, which is why a filter that required exactly that shipped and drew nothing.
 */
const COSTS = `
  <div class="costs">
    <p>Kosten pro Stück:</p>
    <ul class="ipiHintable" data-ipi-hint="">
      <li class="resource metal icon sufficient tooltip js_hideTipOnMobile" data-value="30000">30K<div class="ogk-sum tooltip" data-title="600.000">600K</div><div class="tooltip" data-title="0">0</div></li>
      <li class="resource crystal icon sufficient tooltip js_hideTipOnMobile" data-value="40000">40K<div class="ogk-sum tooltip" data-title="800.000">800K</div><div class="tooltip" data-title="0">0</div></li>
      <li class="resource deuterium icon sufficient tooltip js_hideTipOnMobile" data-value="15000">15K<div class="ogk-sum tooltip" data-title="300.000">300K</div><div class="tooltip" data-title="0">0</div></li>
    </ul>
    <div class="ogk-titles"><div>&zwj;</div><div>Gesamt</div><div>Fehlend</div></div>
  </div>
`;

test("a battlecruiser is worth what it costs, divided by a thousand", () => {
  assert.equal(pointsFor([30000, 40000, 15000]), 85);
});

test("energy, population and anything else past deuterium buy no points", () => {
  assert.equal(pointsFor([1000, 0, 0, 99999, 88888]), 1);
});

test("a first-level mine is worth a fraction rather than nothing", () => {
  assert.equal(pointsFor([60, 15, 0]), 0.075);
});

test("the data-value strings OGame puts in the DOM are read as numbers", () => {
  assert.equal(pointsFor(["30000", "40000", "15000"]), 85);
});

test("a missing or unusable cost counts as zero instead of NaN", () => {
  assert.equal(pointsFor([2000, undefined, null]), 2);
  assert.equal(pointsFor(["", "x", 1000]), 1);
  assert.equal(pointsFor(undefined), 0);
});

test("the rate is the one constant the formula is built on", () => {
  assert.equal(RESOURCES_PER_POINT, 1000);
});

test("the column says what one is worth and what the whole order is worth", () => {
  const browser = setupBrowser({ html: COSTS });

  try {
    const column = renderPointsColumn([30000, 40000, 15000], [4500000, 6000000, 2250000]);

    assert.equal(column.querySelector(".ogl-pointsCost-each").textContent, toFormattedNumber(85));
    assert.equal(column.querySelector(".ogl-pointsCost-sum").textContent, toFormattedNumber(12750));
  } finally {
    browser.cleanup();
  }
});

test("one of them shows one line - the total would only repeat it", () => {
  const browser = setupBrowser({ html: COSTS });

  try {
    const column = renderPointsColumn([30000, 40000, 15000], [30000, 40000, 15000]);

    assert.equal(column.querySelector(".ogl-pointsCost-each").textContent, toFormattedNumber(85));
    assert.equal(column.querySelector(".ogl-pointsCost-sum"), null);
  } finally {
    browser.cleanup();
  }
});

test("no total at all - a research level - shows one line as well", () => {
  const browser = setupBrowser({ html: COSTS });

  try {
    assert.equal(renderPointsColumn([800, 400, 400]).querySelector(".ogl-pointsCost-sum"), null);
  } finally {
    browser.cleanup();
  }
});

test("redrawing replaces the column instead of stacking a second one", () => {
  const browser = setupBrowser({ html: COSTS });

  try {
    renderPointsColumn([30000, 40000, 15000], [30000, 40000, 15000]);
    renderPointsColumn([30000, 40000, 15000], [3000000, 4000000, 1500000]);

    assert.equal(document.querySelectorAll(".ogl-pointsCost").length, 1);
    assert.equal(document.querySelector(".ogl-pointsCost-sum").textContent, toFormattedNumber(8500));
  } finally {
    browser.cleanup();
  }
});

test("every figure carries its exact value on hover", () => {
  const browser = setupBrowser({ html: COSTS });

  try {
    const column = renderPointsColumn([60, 15, 0], [600, 150, 0]);

    for (const cell of column.querySelectorAll(".ogl-pointsCost-each, .ogl-pointsCost-sum")) {
      assert.ok(cell.classList.contains("tooltip"));
      assert.ok(cell.getAttribute("data-title"));
    }
  } finally {
    browser.cleanup();
  }
});

test("without a cost row on the page nothing is drawn and nothing throws", () => {
  const browser = setupBrowser();

  try {
    assert.equal(renderPointsColumn([1000, 0, 0]), null);
  } finally {
    browser.cleanup();
  }
});

// --------------------------------------------------------------------------
// where the column lands
// --------------------------------------------------------------------------

test("the column joins the list the cost cells are in, not the block around it", () => {
  const browser = setupBrowser({ html: COSTS });

  try {
    const column = renderPointsColumn([1000, 0, 0]);

    // The cells are grandchildren of `.costs`. A column appended to `.costs` itself is
    // a block box among inline ones and breaks onto its own line.
    assert.equal(column.tagName, "LI");
    assert.equal(column.parentElement.tagName, "UL");
    assert.equal(column.parentElement, document.querySelector(".costs ul"));
  } finally {
    browser.cleanup();
  }
});

test("the column is the last cell of the row", () => {
  const browser = setupBrowser({ html: COSTS });

  try {
    const column = renderPointsColumn([1000, 0, 0]);

    assert.ok(column.previousElementSibling.classList.contains("deuterium"));
    assert.equal(column.nextElementSibling, null);
  } finally {
    browser.cleanup();
  }
});

test("the column carries the cells' box and none of their meaning", () => {
  const browser = setupBrowser({ html: COSTS });

  try {
    const column = renderPointsColumn([1000, 0, 0]);

    // `resource icon` is the shared box, and it is all that is copied: `sufficient`
    // means "you can afford this" and `metal` paints a sprite, neither of which says
    // anything about a score.
    assert.ok(column.classList.contains("resource"));
    assert.ok(column.classList.contains("icon"));
    for (const borrowed of ["metal", "crystal", "deuterium", "sufficient"]) {
      assert.ok(!column.classList.contains(borrowed), `${borrowed} was copied off the sample`);
    }
  } finally {
    browser.cleanup();
  }
});

test("the total sits on the game's own Gesamt line and in its colour", () => {
  const browser = setupBrowser({ html: COSTS });

  try {
    const column = renderPointsColumn([30000, 40000, 15000], [600000, 800000, 300000]);
    const rows = [...column.children].filter((child) => !child.classList.contains("ogl-pointsCost-label"));

    assert.equal(rows.length, 2, "one line for each, one for the total");
    assert.ok(rows[1].classList.contains("ogk-sum"), "the total must match the costs above it");
  } finally {
    browser.cleanup();
  }
});

test("the heading stays put while the figures are redrawn", () => {
  const browser = setupBrowser({ html: COSTS });

  try {
    const first = renderPointsColumn([30000, 40000, 15000]).querySelector(".ogl-pointsCost-label");
    renderPointsColumn([30000, 40000, 15000], [3000000, 4000000, 1500000]);

    // It is positioned out of the flow; rebuilding it on every keystroke only flickers.
    assert.equal(document.querySelector(".ogl-pointsCost-label"), first);
    assert.equal(document.querySelectorAll(".ogl-pointsCost-label").length, 1);
  } finally {
    browser.cleanup();
  }
});

test("a cost block with no cells draws nothing rather than a stray box", () => {
  const browser = setupBrowser({ html: `<div class="costs"><p>Kosten pro Stück:</p></div>` });

  try {
    assert.equal(renderPointsColumn([1000, 0, 0]), null);
  } finally {
    browser.cleanup();
  }
});

test("a big figure is rounded, a small one keeps the decimals that are the number", () => {
  const browser = setupBrowser({ html: COSTS });

  try {
    // A metal mine at 26 came out as "1.893,84" in a 60px column - two decimals of
    // noise. A level-1 mine is worth 0.075, where the decimals are all there is.
    const big = renderPointsColumn([1520000, 379000, 0]).querySelector(".ogl-pointsCost-each");
    assert.equal(big.textContent, toFormattedNumber(1899, 0));
    assert.equal(big.getAttribute("data-title"), toFormattedNumber(1899, 2), "the exact value stays on hover");

    document.querySelector(".ogl-pointsCost").remove();
    const small = renderPointsColumn([60, 15, 0]).querySelector(".ogl-pointsCost-each");
    assert.equal(small.textContent, toFormattedNumber(0.075));
  } finally {
    browser.cleanup();
  }
});
