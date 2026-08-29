/**
 * One abort signal per page load, plus the handling that goes with it.
 *
 * ## The bug this replaces
 *
 * Six places used to do their own:
 *
 * ```js
 * const abortController = new AbortController();
 * window.onbeforeunload = () => abortController.abort();
 * ```
 *
 * `window.onbeforeunload` is a single slot, not a listener list. Each of those
 * assignments silently replaced the previous one, so whichever ran last was the
 * only controller that ever aborted - every other in-flight request kept going
 * while the page was being torn down. Assigning it also takes the slot away from
 * anything else on the page that wanted it.
 *
 * One controller, registered with `addEventListener`, fixes both. `pagehide`
 * rather than `beforeunload` because it also fires when the page goes into the
 * back/forward cache, and because it does not put the page on the "this handler
 * may block navigation" list.
 *
 * ## The noise it fixes
 *
 * OGame is not a single-page app: changing view is a full navigation, and a
 * navigation aborts whatever the extension had in flight - most often the
 * empire refresh, which starts on every page load. Those rejections were
 * reaching the console as `Uncaught (in promise) AbortError: signal is aborted
 * without reason` and piling up in the extension's error list. They are
 * expected, they mean nothing went wrong, and they were drowning real errors.
 *
 * `suppressAbortRejections()` discards exactly those: an AbortError, and only
 * once this page's own signal has been aborted. Any other rejection, and any
 * AbortError raised while the page is still alive, is left completely alone.
 */

const controller = new AbortController();
let aborted = false;

/** Aborts every request this page has in flight. Idempotent. */
function abortPage() {
  if (aborted) return;
  aborted = true;
  // An explicit reason gives a message worth reading if one of these ever does
  // surface; the default is the bare "signal is aborted without reason".
  controller.abort(new DOMException("OGI: the page was left", "AbortError"));
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", abortPage);
}

/**
 * The signal to hand to every `fetch` the extension makes.
 * @returns {AbortSignal}
 */
export function pageSignal() {
  return controller.signal;
}

/**
 * @returns {boolean} whether this page's requests have been aborted already
 */
export function isPageAborted() {
  return aborted;
}

/**
 * @param {unknown} error
 * @returns {boolean} whether `error` is an abort rather than a real failure
 */
export function isAbortError(error) {
  if (!error || typeof error !== "object") return false;
  return error.name === "AbortError";
}

/**
 * `.catch(ignoreAbort)` - swallows an abort, re-throws anything else so a real
 * failure still reaches whatever handles it.
 *
 * @param {unknown} error
 * @returns {undefined}
 */
export function ignoreAbort(error) {
  if (isAbortError(error)) return undefined;
  throw error;
}

/**
 * Installs the `unhandledrejection` filter described in the header. Call once
 * per execution context.
 *
 * @param {Window} [target] defaults to `window`
 */
export function suppressAbortRejections(target = typeof window === "undefined" ? undefined : window) {
  if (!target) return;

  target.addEventListener("unhandledrejection", (event) => {
    // Deliberately narrow: only while this page is on its way out, and only for
    // an actual AbortError. Everything else keeps its console entry.
    if (!aborted || !isAbortError(event.reason)) return;
    event.preventDefault();
  });
}
