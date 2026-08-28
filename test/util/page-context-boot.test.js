/**
 * The `document_start` invariant for page-context modules.
 *
 * `main.js` gets `ogCore.js` injected as early as the browser allows so its ~70
 * module files load, parse and compile in parallel with the game's own page
 * load. At that moment `<head>` is empty and `<body>` does not exist yet, so
 * **no module in that graph may read the DOM at module-evaluation time** - it
 * would see nothing, or throw and take the whole page context down.
 *
 * The modules below all used to do exactly that and were made lazy. This suite
 * is what stops the pattern coming back: it evaluates each of them against a
 * document with no meta tags and no body content, and requires them to survive.
 *
 * Separate file because it uses `importFresh()` - see the header of
 * OGBIData.construction.test.js for why that must not share a file with
 * behaviour tests.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser, importFresh } from "../helpers/globals.js";

/** A document as bare as the one a content script sees at `document_start`. */
function bareDocument() {
  return setupBrowser({ ogameVersion: null, gameLang: null, html: "" });
}

const PAGE_CONTEXT_MODULES = [
  "src/util/OgamePageData.js",
  "src/util/translate.js",
  "src/util/popup.js",
  "src/util/needs.js",
  "src/util/flying.js",
];

for (const path of PAGE_CONTEXT_MODULES) {
  test(`${path} evaluates against an empty document`, async () => {
    const browser = bareDocument();
    try {
      await assert.doesNotReject(
        () => importFresh(path),
        `${path} reads the DOM at module-evaluation time - move that read into a function`
      );
    } finally {
      browser.cleanup();
    }
  });
}

test("OgamePageData reads the meta tags on first access, not on construction", async () => {
  const browser = bareDocument();
  try {
    // Constructed while <head> is still empty, exactly as at document_start.
    const data = (await importFresh("src/util/OgamePageData.js")).default;

    // The game finishes parsing its head.
    const version = document.createElement("meta");
    version.setAttribute("name", "ogame-version");
    version.setAttribute("content", "13.4.1");
    document.head.append(version);
    const lang = document.createElement("meta");
    lang.setAttribute("name", "ogame-language");
    lang.setAttribute("content", "de");
    document.head.append(lang);

    assert.equal(data.version, "13.4.1");
    assert.equal(data.gameLang, "de");
    assert.equal(data.isAtLeast_13_0_0, true);
  } finally {
    browser.cleanup();
  }
});

test("the meta tags are read once and then cached", async () => {
  const browser = setupBrowser({ ogameVersion: "12.0.36", gameLang: "en" });
  try {
    const data = (await importFresh("src/util/OgamePageData.js")).default;
    assert.equal(data.version, "12.0.36");

    document.querySelector("meta[name='ogame-version']").setAttribute("content", "13.0.0");

    assert.equal(data.version, "12.0.36", "a later DOM change must not re-open a resolved value");
  } finally {
    browser.cleanup();
  }
});
