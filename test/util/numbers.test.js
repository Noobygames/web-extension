/**
 * Number formatting and parsing.
 *
 * Every resource figure the extension shows or reads back goes through here,
 * and the behaviour depends on two independent sources of locale:
 *   - `OgamePageData.playerLang` picks the number format (en-US vs de-DE)
 *   - `LocalizationStrings` supplies the separators and unit suffixes
 * Getting those out of sync produces silently wrong resource maths.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { setupBrowser, LOCALIZATION_DE, LOCALIZATION_EN } from "../helpers/globals.js";

/**
 * OgamePageData is a singleton built once at page load, so `playerLang` cannot
 * change inside a running page - and a plain re-import will not re-evaluate it
 * either. The module is mocked once with a mutable stand-in; numbers.js reads
 * `playerLang` on every call, so flipping the field per test is enough.
 */
const pageData = { playerLang: "de", gameLang: "de" };
mock.module(new URL("../../src/ogame/pageData.js", import.meta.url).href, { defaultExport: pageData });

const numbers = await import("../../src/format/numbers.js");
const cleanValueModule = await import("../../src/format/text.js");

async function withNumbers(options, run) {
  const browser = setupBrowser(options);
  pageData.playerLang = options.gameLang;
  pageData.gameLang = options.gameLang;

  try {
    await run(numbers);
  } finally {
    browser.cleanup();
  }
}

const german = { gameLang: "de", localization: LOCALIZATION_DE };
const english = { gameLang: "en", localization: LOCALIZATION_EN };

test("toFormattedNumber groups thousands German-style for de players", async () => {
  await withNumbers(german, ({ toFormattedNumber }) => {
    assert.equal(toFormattedNumber(1234567), "1.234.567");
    assert.equal(toFormattedNumber(0), "0");
    assert.equal(toFormattedNumber(-4200), "-4.200");
  });
});

test("toFormattedNumber groups thousands English-style for en players", async () => {
  await withNumbers(english, ({ toFormattedNumber }) => {
    assert.equal(toFormattedNumber(1234567), "1,234,567");
  });
});

test("toFormattedNumber honours an explicit precision", async () => {
  await withNumbers(german, ({ toFormattedNumber }) => {
    assert.equal(toFormattedNumber(1234.5678, 2), "1.234,57");
    assert.equal(toFormattedNumber(1234.5678, 3), "1.234,568");
    assert.equal(toFormattedNumber(1234, 2), "1.234,00");
  });
});

test("an explicit precision of 0 rounds to a whole number", async () => {
  await withNumbers(german, ({ toFormattedNumber }) => {
    // Fixed in refactoring-new.md Phase A.1 #4: numbers.js used to decide with
    // `precision ? precision : 0` / `precision ? precision : 2` - the falsy value 0
    // fell through to the 0-to-2-decimal default range instead of rounding to a
    // whole number. `precision ?? 0` / `precision ?? 2` only falls back when
    // precision is genuinely unset (the default parameter value is `null`).
    assert.equal(toFormattedNumber(1234.5678, 0), "1.235");
    assert.equal(toFormattedNumber(1234, 0), "1.234");
  });
});

test("toFormattedNumber caps at two decimals when no precision is given", async () => {
  await withNumbers(german, ({ toFormattedNumber }) => {
    assert.equal(toFormattedNumber(1234.5678), "1.234,57");
  });
});

test("toFormattedNumber returns undefined for non-numbers", async () => {
  await withNumbers(german, ({ toFormattedNumber }) => {
    assert.equal(toFormattedNumber(NaN), undefined);
    assert.equal(toFormattedNumber(undefined), undefined);
    assert.equal(toFormattedNumber(null), undefined);
  });
});

test("toFormattedNumber in unit mode abbreviates by magnitude", async () => {
  await withNumbers(german, ({ toFormattedNumber }) => {
    assert.equal(toFormattedNumber(1500, 1, true), "1,5k");
    assert.equal(toFormattedNumber(2500000, 1, true), "2,5M");
    assert.equal(toFormattedNumber(3000000000, 0, true), "3Mrd");
    assert.equal(toFormattedNumber(4000000000000, 0, true), "4T");
  });
});

test("toFormattedNumber unit mode keeps the sign", async () => {
  await withNumbers(german, ({ toFormattedNumber }) => {
    assert.equal(toFormattedNumber(-2500000, 1, true), "-2,5M");
  });
});

test("toFormattedNumber unit mode clamps at the largest known unit", async () => {
  await withNumbers(german, ({ toFormattedNumber }) => {
    // 10^15 has no suffix beyond T, so it must not fall off the table.
    assert.equal(toFormattedNumber(1e15, 0, true), "1.000T");
  });
});

test("toFormattedNumber unit mode accepts a [min, max] precision pair", async () => {
  await withNumbers(german, ({ toFormattedNumber }) => {
    assert.equal(toFormattedNumber(2500000, [0, 2], true), "2,5M");
  });
});

test("fromFormattedNumber reverses German grouping", async () => {
  await withNumbers(german, ({ fromFormattedNumber }) => {
    assert.equal(fromFormattedNumber("1.234.567"), 1234567);
    assert.equal(fromFormattedNumber("1.234,5"), 1234.5);
    assert.equal(fromFormattedNumber("0"), 0);
  });
});

test("fromFormattedNumber reverses English grouping", async () => {
  await withNumbers(english, ({ fromFormattedNumber }) => {
    assert.equal(fromFormattedNumber("1,234,567"), 1234567);
    assert.equal(fromFormattedNumber("1,234.5"), 1234.5);
  });
});

test("fromFormattedNumber expands unit suffixes", async () => {
  await withNumbers(german, ({ fromFormattedNumber }) => {
    assert.equal(fromFormattedNumber("1,5k"), 1500);
    assert.equal(fromFormattedNumber("2,5M"), 2500000);
    assert.equal(fromFormattedNumber("3Mrd"), 3000000000);
    assert.equal(fromFormattedNumber("4T"), 4000000000000);
  });
});

test("fromFormattedNumber truncates to an integer when asked", async () => {
  await withNumbers(german, ({ fromFormattedNumber }) => {
    assert.equal(fromFormattedNumber("1.234,89", true), 1234);
  });
});

test("fromFormattedNumber can skip group-separator stripping", async () => {
  await withNumbers(german, ({ fromFormattedNumber }) => {
    // noGroup is used where the dot is a decimal point, not a separator.
    assert.equal(fromFormattedNumber("1.5", false, true), 1.5);
    assert.equal(fromFormattedNumber("1.5"), 15, "without noGroup the dot is a group separator");
  });
});

test("format -> parse round-trips for plain integers", async () => {
  await withNumbers(german, ({ toFormattedNumber, fromFormattedNumber }) => {
    for (const value of [0, 7, 1234, 1234567, 987654321]) {
      assert.equal(fromFormattedNumber(toFormattedNumber(value)), value, `value ${value}`);
    }
  });
});

test("formatToUnits scales precision with magnitude", async () => {
  await withNumbers(german, ({ formatToUnits }) => {
    assert.equal(formatToUnits(0), "0");
    assert.equal(formatToUnits(999), "999");
    assert.equal(formatToUnits(1500), "1.5k");
    assert.equal(formatToUnits(2500000), "2.50M");
    assert.equal(formatToUnits(-1500), "-1.5k");
  });
});

test("formatToUnits passes NaN through unchanged", async () => {
  await withNumbers(german, ({ formatToUnits }) => {
    assert.ok(Number.isNaN(formatToUnits(NaN)));
  });
});

test("cleanValue parses formatted resource strings back to integers", async () => {
  const browser = setupBrowser(german);
  try {
    const { cleanValue } = cleanValueModule;

    assert.equal(cleanValue("1.234.567"), 1234567);
    assert.equal(cleanValue("2,5M"), 2500000);
    assert.equal(cleanValue("1,5k"), 1500);
    assert.equal(cleanValue("3Mrd"), 3000000000);
  } finally {
    browser.cleanup();
  }
});

test("cleanValue truncates fractions to whole resources", async () => {
  const browser = setupBrowser(german);
  try {
    const { cleanValue } = cleanValueModule;
    assert.equal(cleanValue("1,234k"), 1234);
  } finally {
    browser.cleanup();
  }
});
