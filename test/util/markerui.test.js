/**
 * `ui/markers.js` - the colour-marker picker.
 *
 * `add()` used to carry two parameters it never read, `_context` first and `_moon` last.
 * `SpyMessagesAnalyzer` called it without the leading one, so every argument shifted:
 * `parent` received the player id and the last line of `add()` threw
 * "parent.addEventListener is not a function" once per spy report, with the spy table
 * left half-built. Nothing caught it - the call sits inside a `.then()`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const browser = setupBrowser({
  url: "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame&component=messages",
  ogameVersion: "13.0.0",
});

const OGBIData = (await import("../../src/store/OGBIData.js")).default;
const Markerui = (await import("../../src/ui/markers.js")).default;

test.after(() => browser.cleanup());

test("add() attaches its listener to the element it was handed", () => {
  OGBIData.json = { markers: {} };
  document.body.innerHTML = `<table><tr><td><div class="ogl-colors" data-context="spytable"></div></td></tr></table>`;
  const parent = document.querySelector(".ogl-colors");

  const listeners = [];
  parent.addEventListener = (type) => listeners.push(type);

  Markerui.add("1:2:3", parent, 12345);

  assert.equal(listeners.length, 1, "the hover listener was not attached to the parent element");
  assert.ok(["mouseenter", "touchstart"].includes(listeners[0]));
});

/**
 * The signature is the contract both call sites share - `ctxpage/galaxy/index.js` and
 * `SpyMessagesAnalyzer`. An extra parameter here is what let them drift apart, and a
 * mismatch is invisible in JavaScript until the wrong value is dereferenced.
 */
test("add() takes exactly (coords, parent, id)", () => {
  assert.equal(Markerui.add.length, 3, "an unused parameter is how the arity drifted last time");
});
