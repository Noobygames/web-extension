/**
 * Elements whose click means "the empire data is about to change, refresh it".
 *
 * Kept next to the listener that uses it so the two cannot drift apart, and exported so it
 * can be asserted on in tests.
 */
export const UPDATE_TRIGGER_SELECTOR =
  ".scrap_it, .build-it_wrap, button.upgrade, button.buildmulti, .abortNow, .build-faster, .og-button.submit, .abort_link, .js_executeJumpButton";

/**
 * Watches for clicks on anything that changes the empire, using ONE delegated listener.
 *
 * This used to be a `setInterval(..., 100)` that ran `querySelectorAll` over the nine selectors
 * above and attached a listener to every match it had not seen before. That polled ten times a
 * second, for the whole session, on every page - and after the first pass it had nothing left to
 * do, so essentially all of that work was wasted.
 *
 * Delegation removes the polling entirely: the browser already knows when a click happens, and a
 * click that started inside a matching element is found with one `closest()` call. It also picks
 * up elements the game adds later with no delay, where the poll could be up to 100 ms late.
 *
 * The listener is registered in the capture phase so it still sees the click when the game stops
 * propagation on its own buttons.
 *
 * @param {() => void} onTrigger
 * @param {Document|Element} [root]
 * @return {() => void} removes the listener
 */
export function watchForEmpireChanges(onTrigger, root = document) {
  const handler = (event) => {
    const target = event.target;
    // Text nodes and the document itself have no closest()
    if (!target || typeof target.closest !== "function") return;

    if (target.closest(UPDATE_TRIGGER_SELECTOR)) onTrigger();
  };

  root.addEventListener("click", handler, true);

  return () => root.removeEventListener("click", handler, true);
}
