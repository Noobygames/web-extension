/**
 * The resource trade calculator.
 *
 * Two things worth pinning: the conversion is the relation `standardUnit()` already
 * uses between two resources - at 3:2:1, 3000 metal is 2000 crystal is 1000 deuterium -
 * and the field the player is typing in is never overwritten by the recompute it
 * triggers. The rate inputs are the shared widget, so the clamp at 1 is pinned here too.
 *
 * Page-context module - no `chrome: true` on setupBrowser.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser, LOCALIZATION_EN } from "../helpers/globals.js";

// English separators against the en URL above: `toFormattedNumber` picks its locale
// from the page language and `fromFormattedNumber` from LocalizationStrings, so a
// mismatch would break the round trip inside the calculator, not in the code under test.
const bootstrap = setupBrowser({ localization: LOCALIZATION_EN });
const OGBIData = (await import("../../src/store/OGBIData.js")).default;
const { initConfOptions, getOptions } = await import("../../src/ctxpage/conf-options.js");
const { convert, tradeCalculator } = await import("../../src/ctxpage/tradeCalc/index.js");
const { toFormattedNumber } = await import("../../src/format/numbers.js");
bootstrap.cleanup();

/** `conf-options.js` keeps `_options` at module level, so the rate is passed every time. */
function seed(tradeRate = [3, 2, 1, 0]) {
  OGBIData.json = { options: {} };
  initConfOptions({ tradeRate: tradeRate.slice(), standardUnitBase: 0 });
  OGBIData.json.options = getOptions();
}

/** Opens the calculator and hands back its two rows of fields. */
function open() {
  tradeCalculator();
  return {
    amounts: [...document.querySelectorAll(".ogl-tradeCalc-input")],
    rates: [...document.querySelectorAll(".ogl-tradeRate-input")],
  };
}

function type(input, value) {
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

test("converts at the configured rate, in both directions", () => {
  const browser = setupBrowser({ localization: LOCALIZATION_EN });

  try {
    seed([3, 2, 1, 0]);

    assert.equal(convert(3000, 0, 1), 2000);
    assert.equal(convert(3000, 0, 2), 1000);
    assert.equal(convert(1000, 2, 0), 3000);
    assert.equal(convert(2000, 1, 2), 1000);
  } finally {
    browser.cleanup();
  }
});

test("a rate that cannot be divided by converts to zero rather than Infinity", () => {
  const browser = setupBrowser({ localization: LOCALIZATION_EN });

  try {
    seed([0, 2, 1, 0]);

    assert.equal(convert(100, 0, 1), 0);
    assert.equal(convert(100, 1, 0), 0);
  } finally {
    browser.cleanup();
  }
});

test("an amount typed into metal fills crystal and deuterium and leaves metal alone", () => {
  const browser = setupBrowser({ localization: LOCALIZATION_EN });

  try {
    seed([3, 2, 1, 0]);
    const { amounts } = open();

    type(amounts[0], toFormattedNumber(3000));

    assert.equal(amounts[0].value, toFormattedNumber(3000));
    assert.equal(amounts[1].value, toFormattedNumber(2000));
    assert.equal(amounts[2].value, toFormattedNumber(1000));
  } finally {
    browser.cleanup();
  }
});

test("any of the three fields can be the one typed in", () => {
  const browser = setupBrowser({ localization: LOCALIZATION_EN });

  try {
    seed([3, 2, 1, 0]);
    const { amounts } = open();

    type(amounts[2], toFormattedNumber(1000));

    assert.equal(amounts[0].value, toFormattedNumber(3000));
    assert.equal(amounts[1].value, toFormattedNumber(2000));
    assert.equal(amounts[2].value, toFormattedNumber(1000));
  } finally {
    browser.cleanup();
  }
});

test("clearing the field clears the results instead of showing a zero", () => {
  const browser = setupBrowser({ localization: LOCALIZATION_EN });

  try {
    seed([3, 2, 1, 0]);
    const { amounts } = open();

    type(amounts[0], toFormattedNumber(3000));
    type(amounts[0], "");

    assert.equal(amounts[1].value, "");
    assert.equal(amounts[2].value, "");
  } finally {
    browser.cleanup();
  }
});

test("editing the rate stores it and recomputes what is on screen", () => {
  const browser = setupBrowser({ localization: LOCALIZATION_EN });

  try {
    seed([3, 2, 1, 0]);
    const { amounts, rates } = open();

    type(amounts[0], toFormattedNumber(3000));
    rates[1].value = "4";
    rates[1].dispatchEvent(new Event("blur"));

    assert.equal(OGBIData.json.options.tradeRate[1], 4);
    assert.equal(amounts[1].value, toFormattedNumber(4000));
    assert.equal(amounts[2].value, toFormattedNumber(1000));
  } finally {
    browser.cleanup();
  }
});

test("a rate below 1 is refused and clamped", () => {
  const browser = setupBrowser({ localization: LOCALIZATION_EN });
  // OGame's own toast, a page global the widget calls on a rejected rate.
  const warnings = [];
  globalThis.fadeBox = (message) => warnings.push(message);

  try {
    seed([3, 2, 1, 0]);
    const { rates } = open();

    rates[0].value = "0.5";
    rates[0].dispatchEvent(new Event("blur"));

    assert.equal(OGBIData.json.options.tradeRate[0], 1);
    assert.equal(warnings.length, 1);
  } finally {
    delete globalThis.fadeBox;
    browser.cleanup();
  }
});
