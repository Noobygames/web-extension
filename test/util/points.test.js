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

/** OGame's own cost row, empty - the panel fills it before OGI appends to it. */
const COSTS = `<ul class="costs"></ul>`;

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
