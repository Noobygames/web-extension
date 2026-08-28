/**
 * Content-script entry point. Runs at `document_start`.
 *
 * Both halves of the extension start here, as early as the browser lets them,
 * instead of waiting for `DOMContentLoaded` the way this file used to:
 *
 * - All three page-context scripts are injected immediately, so the browser
 *   fetches, parses and compiles `ogCore.js` in parallel with the game's own
 *   page load instead of doing it afterwards. A dynamically inserted `<script>`
 *   is async, so `ogCore.js` waits for DOMContentLoaded itself before it
 *   touches the DOM.
 * - `ctxcontent/index.js` only talks to `chrome.*` and the universe API and
 *   never reads the game DOM, so waiting for the DOM only delayed it. It loads
 *   next to `ogCore.js` rather than in front of it: the handshake token both
 *   halves need is minted here and published before either is started.
 * - The wide-layout classes are put on <html> from a small cached mirror of the
 *   options, before the game paints, so changing pages no longer shows the
 *   vanilla layout first and the wide one a moment later.
 *
 * This is load ordering only. It adds no request to the game, and the requests
 * that do happen still fire once per page load, never on a timer
 * (AGENTS.md §1.3 / §4).
 *
 * `injectScript` is duplicated from `util/runContext.js` on purpose: this file
 * is a classic content script, not a module, so it cannot import - and routing
 * the injection through the dynamic import below would put a module round trip
 * back in front of the thing we are trying to start early.
 */

/**
 * Token for the page <-> content-script bridge, published on `<html>` before
 * anything else runs.
 *
 * `util/service.callbackEvent.js` used to mint this when the content module was
 * evaluated, which forced `ogCore.js` to be injected *after* that module had
 * loaded - `pageContextInit()` throws without a token. Minting it here breaks
 * that dependency, so the 1.1 MB page bundle and the content bundle download at
 * the same time instead of one behind the other. Keep the generator in step
 * with `createCallbackToken()` there; this file is a classic content script and
 * cannot import.
 *
 * @returns {string} 12 hex characters
 */
function createCallbackToken() {
  return (Math.floor(Math.random() * 0xffffffffffff) + 1e6).toString(16).padStart(12, "0");
}

/**
 * @param {string} path extension-relative resource path
 * @param {boolean} [asModule=false]
 */
function injectScript(path, asModule = false) {
  const script = document.createElement("script");
  script.type = asModule ? "module" : "text/javascript";
  script.src = chrome.runtime.getURL(path);
  script.onload = function () {
    script.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

/**
 * Puts the wide-layout classes on `<html>` before the game paints.
 *
 * Content scripts share the page's localStorage, and `ctxpage/wide-layout.js`
 * mirrors its three switches into the small `ogi-layout` key exactly so this
 * can happen at `document_start`. Doing it here instead of waiting for
 * `ogCore.js` is what removes the "vanilla width first, wide layout a moment
 * later" jump on every page change. `wide-layout.js` re-applies the same
 * classes later from the real options, so a stale mirror self-heals.
 *
 * Defaults match `ctxpage/conf-options.js`: both switches on, zoom factor
 * automatic.
 */
function applyCachedLayout() {
  // Same exclusion list the ogCore.js entry point uses. Those pages never got
  // the classes before, because `applyWideLayout()` runs inside `start()` and
  // `start()` never runs there - applying them here would be a new, unreviewed
  // layout change on the intro, empire and combat-simulator screens.
  const url = new URL(window.location.href);
  const page = url.searchParams.get("component") || url.searchParams.get("page");
  if (["intro", "empire", "combatsim"].includes(page)) return;

  let layout = true;
  let zoom = true;
  let factor = 0;

  try {
    const raw = localStorage.getItem("ogi-layout");
    if (raw) {
      const cached = JSON.parse(raw);
      layout = cached.layout !== false;
      zoom = cached.zoom !== false;
      factor = Number(cached.factor) || 0;
    }
  } catch (_) {
    // Unreadable or corrupt mirror: fall through with the defaults.
  }

  const root = document.documentElement;
  root.classList.toggle("ogl-wide-layout", layout);
  root.classList.toggle("ogl-wide-zoom", zoom);
  if (zoom && factor) root.style.setProperty("--ogl-wide-zoom", String(factor));
}

applyCachedLayout();

const callbackToken = createCallbackToken();
document.documentElement.dataset.ogiCallbackEventToken = callbackToken;

// DOMPurify is needed as soon as the start-up sequence runs; LZString is not -
// only the pantry sync uses it, and ogCore.js pulls it in on demand over the
// `ogi-lzstring` event.
injectScript("libs/purify.min.js");
injectScript("ogCore.js", true);

import(chrome.runtime.getURL("./ctxcontent/index.js"))
  .then((contentScript) => contentScript.main(callbackToken))
  .catch((error) => console.error("OGI: content context failed to start", error));
