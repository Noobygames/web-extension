/**
 * The guard that keeps the shortcuts out of the way while someone is typing.
 *
 * Why this one thing has its own file: on the dispatch page the shortcuts pick
 * missions by letter, and the Enter handler calls `preventDefault()` and then clicks
 * "send fleet". The chat bar sits on every page, including that one. If the guard ever
 * stops recognising the chat input, typing a message stops being typing a message.
 *
 * The guard used to be a list of four OGame class names and nothing else, so it held
 * only as long as the game never renamed anything. These pin the shape check that
 * backs it up.
 *
 * Page-context module - no `chrome: true` on setupBrowser.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const bootstrap = setupBrowser();
const OGBIData = (await import("../../src/store/OGBIData.js")).default;
const { keyboardActions } = await import("../../src/ctxpage/keyboard/index.js");
bootstrap.cleanup();

/** An open OGI dialog plus the things a player might be typing into. */
const PAGE = `
  <div class="ogl-dialogOverlay ogl-active">
    <div class="ogl-dialog"><div class="close-tooltip"></div></div>
  </div>
  <textarea id="chat-like"></textarea>
  <textarea id="renamed" class="totally_new_ogame_class"></textarea>
  <div id="rich" contenteditable="true"></div>
  <input id="amount" type="text" class="ogl-formatInput">
`;

/**
 * Registers the shortcuts on an overview page, presses Escape with `focusId` focused
 * and reports whether the dialog was closed.
 *
 * Escape is the one shortcut the general handler runs without jQuery, so it is what
 * the guard can be measured through.
 */
function escapeClosesDialogWhileFocused(focusId) {
  const page = setupBrowser({ html: PAGE });

  try {
    OGBIData.json = { ...OGBIData.json, welcome: false };
    keyboardActions({ page: "overview", current: {}, mode: null });

    let closed = false;
    document.querySelector(".close-tooltip").addEventListener("click", () => (closed = true));

    if (focusId) document.getElementById(focusId).focus();

    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    return closed;
  } finally {
    page.cleanup();
  }
}

test("a shortcut still fires when nothing is focused", () => {
  // The control: without this the tests below would pass on a broken handler.
  assert.equal(escapeClosesDialogWhileFocused(null), true);
});

test("no shortcut fires while the player is typing in a textarea", () => {
  // The chat input is a textarea, whatever OGame decides to call its class.
  assert.equal(escapeClosesDialogWhileFocused("chat-like"), false);
});

test("a textarea OGame renamed is still recognised as typing", () => {
  // The whole point of checking the shape as well as the class list.
  assert.equal(escapeClosesDialogWhileFocused("renamed"), false);
});

test("a contenteditable counts as typing too", () => {
  assert.equal(escapeClosesDialogWhileFocused("rich"), false);
});

test("a plain input does not count - Enter and the arrows belong to those fields", () => {
  // The ship-count and system fields are exactly where the shortcuts must keep
  // working, so the guard deliberately stops at textareas.
  assert.equal(escapeClosesDialogWhileFocused("amount"), true);
});
