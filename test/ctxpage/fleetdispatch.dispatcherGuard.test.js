/**
 * `awaitFleetDispatcher()` - the guard in front of the fleet-dispatch wiring.
 *
 * OGame declares `fleetDispatcher` up front and assigns it from its own ready handler.
 * Between those two points the global is `null`, and `typeof null` is `"object"`, so the
 * usual `typeof x === "undefined"` guard passes and the next property read throws
 * `TypeError: Cannot read properties of null (reading 'shipsOnPlanet')`.
 *
 * That throw happens inside `ogCore.js`'s async `#startFleetDispatchPage()`, so it
 * surfaces as one "Uncaught (in promise)" line and cancels every remaining step - the
 * rebuilt dispatcher, the expedition and collect shortcuts, the custom missions - on a
 * page that otherwise looks fine. Nothing else here would catch that: the bundle builds,
 * lint is silent, and no other test opens this page.
 *
 * Page-context module - no `chrome: true` on setupBrowser.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const browser = setupBrowser();
const { awaitFleetDispatcher } = await import("../../src/ctxpage/fleetdispatch/index.js");

test.after(() => {
  delete globalThis.fleetDispatcher;
  browser.cleanup();
});

/** Stands in for `platform/wait.js`, so no test spends real time polling. */
function immediateWaitFor(resolves) {
  return () => (resolves ? Promise.resolve(true) : Promise.reject(new Error("Wait for timeout exception")));
}

test("a dispatcher that is already there is used without waiting", async () => {
  globalThis.fleetDispatcher = { shipsOnPlanet: [] };
  let waited = false;

  const ready = await awaitFleetDispatcher({
    waitFor: () => {
      waited = true;
      return Promise.resolve(true);
    },
  });

  assert.equal(ready, true);
  assert.equal(waited, false, "the fast path does not poll");
});

/** The regression: `typeof null` is "object", so a null global must not read as ready. */
test("a null dispatcher is not mistaken for a present one", async () => {
  globalThis.fleetDispatcher = null;
  let polled = false;

  await awaitFleetDispatcher({
    waitFor: (predicate) => {
      polled = true;
      assert.equal(predicate(), false, "the predicate rejects null");
      return Promise.resolve(true);
    },
  });

  assert.equal(polled, true, "a null global goes to the wait, not straight through");
});

test("a dispatcher that arrives late is waited for", async () => {
  globalThis.fleetDispatcher = null;

  const ready = await awaitFleetDispatcher({
    waitFor: (predicate) => {
      globalThis.fleetDispatcher = { shipsOnPlanet: [] };
      return predicate() ? Promise.resolve(true) : Promise.reject(new Error("Wait for timeout exception"));
    },
  });

  assert.equal(ready, true);
});

test("a dispatcher that never appears is reported, not thrown", async () => {
  globalThis.fleetDispatcher = null;

  assert.equal(await awaitFleetDispatcher({ waitFor: immediateWaitFor(false) }), false);
});

test("an undefined global is handled the same way as a null one", async () => {
  delete globalThis.fleetDispatcher;

  assert.equal(await awaitFleetDispatcher({ waitFor: immediateWaitFor(false) }), false);
});
