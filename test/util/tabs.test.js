/**
 * `util/tabs.js` - the tab strip behind the statistics popup.
 *
 * It came out of `ogCore.js` in Phase 3 of refactoring.md as the first piece of that
 * file's UI to get any coverage at all. The behaviour worth pinning is that panels
 * are built lazily and thrown away on switch: a builder that assumes it runs once, or
 * a panel that keeps a timer alive after being discarded, is a leak nothing else here
 * would catch.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";
import { tabs } from "../../src/util/tabs.js";

function withPage(run) {
  const browser = setupBrowser();
  // The labels go through DOMPurify, which is a page global in production.
  globalThis.DOMPurify = { sanitize: (value) => String(value) };
  try {
    run();
  } finally {
    delete globalThis.DOMPurify;
    browser.cleanup();
  }
}

/** A builder that records how often it was asked for a panel. */
function panel(label, calls) {
  return () => {
    calls.push(label);
    const div = document.createElement("div");
    div.className = "panel-" + label;
    div.textContent = label;
    return div;
  };
}

test("tabs renders the strip and the first panel only", () => {
  withPage(() => {
    const calls = [];
    const body = tabs({ First: panel("First", calls), Second: panel("Second", calls) });

    assert.deepEqual(
      [...body.querySelectorAll(".ogl-tab")].map((tab) => tab.textContent),
      ["First", "Second"]
    );
    assert.deepEqual(calls, ["First"], "the second panel is not built until it is needed");
    assert.ok(body.querySelector(".panel-First"));
    assert.equal(body.querySelector(".panel-Second"), null);
  });
});

test("tabs marks the first tab active", () => {
  withPage(() => {
    const calls = [];
    const body = tabs({ First: panel("First", calls), Second: panel("Second", calls) });
    const [first, second] = body.querySelectorAll(".ogl-tab");

    assert.ok(first.classList.contains("ogl-active"));
    assert.equal(second.classList.contains("ogl-active"), false);
  });
});

test("clicking a tab replaces the panel and moves the active marker", () => {
  withPage(() => {
    const calls = [];
    const body = tabs({ First: panel("First", calls), Second: panel("Second", calls) });
    const [first, second] = body.querySelectorAll(".ogl-tab");

    second.dispatchEvent(new window.Event("click", { bubbles: true }));

    assert.deepEqual(calls, ["First", "Second"]);
    assert.equal(body.querySelector(".panel-First"), null, "the old panel is discarded, not hidden");
    assert.ok(body.querySelector(".panel-Second"));
    assert.equal(first.classList.contains("ogl-active"), false);
    assert.ok(second.classList.contains("ogl-active"));
  });
});

test("a panel is rebuilt every time its tab is clicked", () => {
  withPage(() => {
    const calls = [];
    const body = tabs({ First: panel("First", calls), Second: panel("Second", calls) });
    const [first, second] = body.querySelectorAll(".ogl-tab");

    second.dispatchEvent(new window.Event("click", { bubbles: true }));
    first.dispatchEvent(new window.Event("click", { bubbles: true }));
    second.dispatchEvent(new window.Event("click", { bubbles: true }));

    assert.deepEqual(calls, ["First", "Second", "First", "Second"], "no caching - the builder runs each time");
    assert.equal(body.children.length, 2, "the strip plus exactly one panel");
  });
});

test("a single tab still renders its panel", () => {
  withPage(() => {
    const calls = [];
    const body = tabs({ Only: panel("Only", calls) });

    assert.equal(body.querySelectorAll(".ogl-tab").length, 1);
    assert.ok(body.querySelector(".panel-Only"));
  });
});

test("KNOWN BUG: an empty title map throws instead of rendering an empty strip", () => {
  // `tabs[0].classList` runs before anything checks that there is a tab. No caller
  // passes an empty map today, so this is recorded rather than repaired - but it is
  // the reason a tab set built from a filtered list needs a guard at the call site.
  withPage(() => {
    assert.throws(() => tabs({}), TypeError);
  });
});
