/**
 * The delegated click watcher that replaced a permanent 100ms polling loop.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";
import { watchForEmpireChanges, UPDATE_TRIGGER_SELECTOR } from "../../src/util/stageForUpdate.js";

function withPage(html, run) {
  const browser = setupBrowser();
  try {
    globalThis.document.body.innerHTML = html;
    const calls = [];
    const stop = watchForEmpireChanges(() => calls.push(true));
    run({ document: globalThis.document, calls, stop });
  } finally {
    browser.cleanup();
  }
}

const click = (element) => element.dispatchEvent(new globalThis.window.MouseEvent("click", { bubbles: true }));

test("clicking an upgrade button stages an update", () => {
  withPage('<button class="upgrade">Upgrade</button>', ({ document, calls }) => {
    click(document.querySelector("button.upgrade"));

    assert.equal(calls.length, 1);
  });
});

test("every trigger in the selector list is recognised", () => {
  const html = `
    <div class="scrap_it"></div>
    <div class="build-it_wrap"></div>
    <button class="upgrade"></button>
    <button class="buildmulti"></button>
    <div class="abortNow"></div>
    <div class="build-faster"></div>
    <div class="og-button submit"></div>
    <div class="abort_link"></div>
    <div class="js_executeJumpButton"></div>`;

  withPage(html, ({ document, calls }) => {
    document.querySelectorAll("div, button").forEach(click);

    assert.equal(calls.length, 9, "each trigger must stage exactly one update");
  });
});

test("clicking something unrelated stages nothing", () => {
  withPage('<button class="upgrade"></button><a href="#" class="menu">Menu</a>', ({ document, calls }) => {
    click(document.querySelector("a.menu"));

    assert.equal(calls.length, 0);
  });
});

test("a click on a child of a trigger still counts", () => {
  // the game nests icons and labels inside its buttons, so event.target is often not the button
  withPage('<button class="upgrade"><span class="icon">go</span></button>', ({ document, calls }) => {
    click(document.querySelector("span.icon"));

    assert.equal(calls.length, 1);
  });
});

test("an element added after the watcher started is picked up with no delay", () => {
  withPage("<div id='content'></div>", ({ document, calls }) => {
    // this is what the old 100ms poll existed for, and it could be up to 100ms late
    document.querySelector("#content").innerHTML = '<button class="upgrade"></button>';
    click(document.querySelector("button.upgrade"));

    assert.equal(calls.length, 1);
  });
});

test("the watcher still fires when the game stops propagation on its own buttons", () => {
  withPage('<button class="upgrade"></button>', ({ document, calls }) => {
    const button = document.querySelector("button.upgrade");
    button.addEventListener("click", (event) => event.stopPropagation());

    click(button);

    assert.equal(calls.length, 1, "the listener is registered in the capture phase for this reason");
  });
});

test("each click stages exactly one update, no matter how many triggers exist", () => {
  withPage('<button class="upgrade"></button><button class="upgrade"></button>', ({ document, calls }) => {
    click(document.querySelectorAll("button.upgrade")[0]);

    assert.equal(calls.length, 1);
  });
});

test("stopping the watcher removes the listener", () => {
  withPage('<button class="upgrade"></button>', ({ document, calls, stop }) => {
    stop();
    click(document.querySelector("button.upgrade"));

    assert.equal(calls.length, 0);
  });
});

test("the selector list still covers every element the old polling loop watched", () => {
  // the exact list the setInterval version used, kept here so a future edit cannot
  // silently drop one
  [
    ".scrap_it",
    ".build-it_wrap",
    "button.upgrade",
    "button.buildmulti",
    ".abortNow",
    ".build-faster",
    ".og-button.submit",
    ".abort_link",
    ".js_executeJumpButton",
  ].forEach((selector) => {
    assert.ok(UPDATE_TRIGGER_SELECTOR.includes(selector), `${selector} must still be watched`);
  });
});
