/**
 * **PLUGIN CONTEXT** The one state a content script cannot recover from.
 *
 * Reloading or updating the extension orphans the content scripts already injected
 * into open tabs. The page keeps running, but every `chrome.*` call from then on
 * throws `Error: Extension context invalidated`, and only a page reload fixes it. So
 * stop calling `chrome.*` rather than logging a stack trace per attempt.
 *
 * Kept out of `runContext.js` on purpose: that module is in the page bundle, and
 * these two are content-context-only.
 */

/** `chrome.runtime.id` is undefined exactly while the context is invalidated. */
export function isExtensionContextValid() {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime && chrome.runtime.id);
}

/** @param {unknown} error */
export function isExtensionContextInvalidated(error) {
  return /extension context invalidated/i.test(String(error?.message ?? error ?? ""));
}
