/**
 * OgamePageData is the OGame-version compatibility gate. `isAtLeast_13_0_0`
 * decides which DOM selectors the messages layer uses, so getting it wrong
 * silently disables message analysis on a whole game version.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser, importFresh } from "../helpers/globals.js";

async function pageData(options) {
  const browser = setupBrowser(options);
  const module = await importFresh("src/util/OgamePageData.js");
  return { data: module.default, browser };
}

test("version and language are read from the OGame meta tags", async () => {
  const { data, browser } = await pageData({ ogameVersion: "12.0.36", gameLang: "fr" });
  try {
    assert.equal(data.version, "12.0.36");
    assert.equal(data.gameLang, "fr");
  } finally {
    browser.cleanup();
  }
});

test("a missing version meta tag falls back to 0.0.0", async () => {
  const { data, browser } = await pageData({ ogameVersion: null });
  try {
    assert.equal(data.version, "0.0.0");
    assert.equal(data.isAtLeast_13_0_0, false);
  } finally {
    browser.cleanup();
  }
});

test("playerLang falls back to the game language without an oglocale cookie", async () => {
  const { data, browser } = await pageData({ gameLang: "de" });
  try {
    assert.equal(data.playerLang, "de");
  } finally {
    browser.cleanup();
  }
});

test("playerLang is taken from the oglocale cookie when present", async () => {
  const browser = setupBrowser({ gameLang: "de" });
  try {
    browser.document.cookie = "oglocale=es";
    const data = (await importFresh("src/util/OgamePageData.js")).default;

    assert.equal(data.playerLang, "es");
    assert.equal(data.gameLang, "de", "the game language must stay untouched");
  } finally {
    browser.cleanup();
  }
});

test("versions at or above 13.0.0 pass the gate", async () => {
  for (const version of ["13.0.0", "13.0.1", "13.1.0", "14.0.0", "13.0.0-r1"]) {
    const { data, browser } = await pageData({ ogameVersion: version });
    try {
      assert.equal(data.isAtLeast_13_0_0, true, `${version} must satisfy >= 13.0.0`);
    } finally {
      browser.cleanup();
    }
  }
});

test("versions below 13.0.0 fail the gate", async () => {
  for (const version of ["12.0.36", "12.9.99", "9.0.0", "0.0.0"]) {
    const { data, browser } = await pageData({ ogameVersion: version });
    try {
      assert.equal(data.isAtLeast_13_0_0, false, `${version} must not satisfy >= 13.0.0`);
    } finally {
      browser.cleanup();
    }
  }
});

test("a release suffix is stripped before comparing", async () => {
  const { data, browser } = await pageData({ ogameVersion: "12.0.36-r2" });
  try {
    assert.equal(data.version, "12.0.36-r2", "the raw version stays intact");
    assert.equal(data.isAtLeast_13_0_0, false);
  } finally {
    browser.cleanup();
  }
});

test("versions with fewer segments are padded with zeros", async () => {
  const cases = [
    ["13", true],
    ["12", false],
    ["13.0", true],
  ];

  for (const [version, expected] of cases) {
    const { data, browser } = await pageData({ ogameVersion: version });
    try {
      assert.equal(data.isAtLeast_13_0_0, expected, `version ${version}`);
    } finally {
      browser.cleanup();
    }
  }
});

test("the module exports a single shared instance", async () => {
  const browser = setupBrowser();
  try {
    const first = (await import("../../src/util/OgamePageData.js")).default;
    const second = (await import("../../src/util/OgamePageData.js")).default;
    assert.equal(first, second);
  } finally {
    browser.cleanup();
  }
});
