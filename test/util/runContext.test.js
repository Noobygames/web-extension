/**
 * Context detection and script injection - the mechanism that gets ogCore.js
 * from the content script into the page.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";
import * as runContext from "../../src/util/runContext.js";

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const FIREFOX_UA = "Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0";
const EDGE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0";

async function withContext(options, run) {
  const browser = setupBrowser(options);
  try {
    await run(runContext, browser);
  } finally {
    browser.cleanup();
  }
}

test("isFirefox and isChrome read the user agent", async () => {
  await withContext({ userAgent: FIREFOX_UA }, ({ isFirefox, isChrome }) => {
    assert.equal(isFirefox(), true);
    assert.equal(isChrome(), false);
  });

  await withContext({ userAgent: CHROME_UA }, ({ isFirefox, isChrome }) => {
    assert.equal(isFirefox(), false);
    assert.equal(isChrome(), true);
  });
});

test("Edge is detected as Chrome, which is what the code relies on", async () => {
  // Edge ships the Chromium extension APIs, and its UA contains "Chrome".
  await withContext({ userAgent: EDGE_UA }, ({ isChrome, isFirefox }) => {
    assert.equal(isChrome(), true);
    assert.equal(isFirefox(), false);
  });
});

test("isPluginContext is truthy in a content script and false in the page", async () => {
  await withContext({ userAgent: CHROME_UA, chrome: true }, ({ isPluginContext }) => {
    assert.ok(isPluginContext());
  });

  await withContext({ userAgent: CHROME_UA, chrome: false }, ({ isPluginContext }) => {
    assert.equal(isPluginContext(), false);
  });
});

test("injectScript appends a script tag pointing at the packaged resource", async () => {
  await withContext({ userAgent: CHROME_UA, chrome: true }, ({ injectScript }, browser) => {
    injectScript("libs/lz-string.min.js");

    const script = browser.document.querySelector("script");
    assert.ok(script, "a script element must be inserted");
    assert.equal(script.src, "chrome-extension://ogi-test-id/libs/lz-string.min.js");
    assert.equal(script.type, "text/javascript");
  });
});

test("injectScript marks module scripts as modules", async () => {
  await withContext({ userAgent: CHROME_UA, chrome: true }, ({ injectScript }, browser) => {
    injectScript("ogCore.js", null, true);
    assert.equal(browser.document.querySelector("script").type, "module");
  });
});

test("injectScript removes the tag again and fires the callback on load", async () => {
  await withContext({ userAgent: CHROME_UA, chrome: true }, async ({ injectScript }, browser) => {
    let called = false;
    injectScript("libs/purify.min.js", () => {
      called = true;
    });

    const script = browser.document.querySelector("script");
    script.onload();

    assert.equal(called, true);
    assert.equal(browser.document.querySelector("script"), null, "the tag must not linger in the DOM");
  });
});

test("injectScript tolerates a missing callback", async () => {
  await withContext({ userAgent: CHROME_UA, chrome: true }, ({ injectScript }, browser) => {
    injectScript("libs/purify.min.js", null);
    assert.doesNotThrow(() => browser.document.querySelector("script").onload());
  });
});

test("injectScript refuses to run from the page context", async () => {
  await withContext({ userAgent: CHROME_UA, chrome: false }, ({ injectScript }, browser) => {
    assert.throws(() => injectScript("ogCore.js"), /Invalid execution context/);
    assert.equal(browser.document.querySelector("script"), null);
  });
});

test("KNOWN BUG: an unrecognised browser throws instead of reporting a context", async () => {
  // isPluginContext() has no fallback branch: a user agent that matches neither
  // "Chrome" nor "Firefox" (Safari, a privacy-hardened UA, a headless runner)
  // hits `throw Error("It is not possible to identify the execution context")`,
  // which takes injectScript() - and therefore the whole boot - down with it.
  const safariUA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

  await withContext({ userAgent: safariUA, chrome: true }, ({ isPluginContext, injectScript }) => {
    assert.throws(() => isPluginContext(), /not possible to identify the execution context/);
    assert.throws(() => injectScript("ogCore.js"), /not possible to identify the execution context/);
  });
});
