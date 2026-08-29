import * as wait from "./wait.js";

/**
 * Makes sure LZString is available, injecting it if it is not.
 *
 * The library is deliberately NOT on the boot path: it is only needed by the Pantry
 * sync and the import/export of the local store, so it is injected on demand over the
 * `ogi-lzstring` event instead of costing every page load. Lifted out of
 * `ogCore.js` in Phase 3 of refactoring.md.
 */
export function ensureLZString() {
  if (typeof LZString === "undefined") {
    document.dispatchEvent(new CustomEvent("ogi-lzstring"));
  }
  return wait.waitForDefinition(window, "LZString");
}
