/**
 * The shared page abort signal.
 *
 * OGame is not a single-page app: every view change is a full navigation, and a
 * navigation cancels whatever the extension had in flight. That is normal, but
 * it used to reach users as a pile of `Uncaught (in promise) AbortError: signal
 * is aborted without reason` entries in the extension's error list, which is
 * exactly where a real error needs to be visible.
 *
 * Underneath it was also a genuine bug: six call sites each did
 * `window.onbeforeunload = () => controller.abort()`, and that property is a
 * single slot, so every assignment silently disarmed the one before it.
 *
 * `importFresh` throughout - the module owns one controller for its lifetime,
 * and an aborted one cannot be reset.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { setupBrowser, importFresh } from "../helpers/globals.js";

/** @returns {Promise<{abort: any, browser: any}>} */
async function loadAbort(options) {
  const browser = setupBrowser(options);
  return { abort: await importFresh("src/util/abort.js"), browser };
}

test("the signal starts live and is shared by every caller", async () => {
  const { abort, browser } = await loadAbort();
  try {
    assert.equal(abort.pageSignal().aborted, false);
    assert.equal(abort.isPageAborted(), false);
    assert.equal(abort.pageSignal(), abort.pageSignal(), "one controller, not one per call");
  } finally {
    browser.cleanup();
  }
});

test("pagehide aborts the signal with a named reason", async () => {
  const { abort, browser } = await loadAbort();
  try {
    browser.window.dispatchEvent(new Event("pagehide"));

    assert.equal(abort.pageSignal().aborted, true);
    assert.equal(abort.isPageAborted(), true);
    assert.equal(abort.pageSignal().reason.name, "AbortError");
    // The default reason is the bare "signal is aborted without reason", which
    // is what made these unreadable in the first place.
    assert.match(abort.pageSignal().reason.message, /page was left/);
  } finally {
    browser.cleanup();
  }
});

test("a second pagehide is harmless", async () => {
  const { abort, browser } = await loadAbort();
  try {
    browser.window.dispatchEvent(new Event("pagehide"));
    const first = abort.pageSignal().reason;
    browser.window.dispatchEvent(new Event("pagehide"));

    assert.equal(abort.pageSignal().reason, first, "the reason must not be replaced");
  } finally {
    browser.cleanup();
  }
});

test("isAbortError recognises an abort and nothing else", async () => {
  const { abort, browser } = await loadAbort();
  try {
    assert.equal(abort.isAbortError(new DOMException("gone", "AbortError")), true);
    assert.equal(abort.isAbortError({ name: "AbortError" }), true);

    assert.equal(abort.isAbortError(new TypeError("Failed to fetch")), false);
    assert.equal(abort.isAbortError(new Error("AbortError")), false, "the message is not the name");
    assert.equal(abort.isAbortError("AbortError"), false);
    assert.equal(abort.isAbortError(null), false);
    assert.equal(abort.isAbortError(undefined), false);
  } finally {
    browser.cleanup();
  }
});

test("ignoreAbort swallows an abort and re-throws a real failure", async () => {
  const { abort, browser } = await loadAbort();
  try {
    assert.equal(abort.ignoreAbort(new DOMException("gone", "AbortError")), undefined);

    const real = new TypeError("Failed to fetch");
    assert.throws(() => abort.ignoreAbort(real), real);
  } finally {
    browser.cleanup();
  }
});

/**
 * jsdom does not raise `unhandledrejection` itself, so the event is dispatched
 * by hand. What is under test is the filter, not the browser plumbing.
 *
 * @param {Window} window
 * @param {unknown} reason
 * @returns {boolean} whether the handler claimed the rejection
 */
function dispatchRejection(window, reason) {
  const event = new Event("unhandledrejection", { cancelable: true });
  event.reason = reason;
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

test("a navigation abort is suppressed once the page is going away", async () => {
  const { abort, browser } = await loadAbort();
  try {
    abort.suppressAbortRejections(browser.window);
    browser.window.dispatchEvent(new Event("pagehide"));

    assert.equal(dispatchRejection(browser.window, new DOMException("gone", "AbortError")), true);
  } finally {
    browser.cleanup();
  }
});

test("an abort while the page is still alive is left alone", async () => {
  // Only a navigation aborts this signal, so an AbortError before that came
  // from somewhere else and is a real signal to whoever is debugging.
  const { abort, browser } = await loadAbort();
  try {
    abort.suppressAbortRejections(browser.window);

    assert.equal(dispatchRejection(browser.window, new DOMException("gone", "AbortError")), false);
  } finally {
    browser.cleanup();
  }
});

test("a real failure is never suppressed, not even during a navigation", async () => {
  const { abort, browser } = await loadAbort();
  try {
    abort.suppressAbortRejections(browser.window);
    browser.window.dispatchEvent(new Event("pagehide"));

    assert.equal(dispatchRejection(browser.window, new TypeError("Failed to fetch")), false);
    assert.equal(dispatchRejection(browser.window, "something went wrong"), false);
  } finally {
    browser.cleanup();
  }
});

test("no module assigns window.onbeforeunload any more", () => {
  // The regression this file exists for. `onbeforeunload` is one slot: the
  // moment two modules assign it, one of them is disarmed and its requests
  // outlive the page. Everything goes through the shared signal instead.
  const srcDir = path.resolve(import.meta.dirname, "..", "..", "src");
  const offenders = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "libs") continue; // vendored third party, not ours
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) {
        // Line by line, skipping comments - util/abort.js quotes the old
        // pattern in its own header to explain why it exists.
        const assigns = fs
          .readFileSync(full, "utf8")
          .split("\n")
          .some((line) => !/^\s*(\/\/|\*|\/\*)/.test(line) && /onbeforeunload\s*=/.test(line));
        if (assigns) offenders.push(path.relative(srcDir, full));
      }
    }
  };
  walk(srcDir);

  assert.deepEqual(offenders, [], "use pageSignal() from util/abort.js instead");
});
