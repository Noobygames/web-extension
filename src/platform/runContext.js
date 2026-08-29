export function isFirefox() {
  return navigator.userAgent.indexOf("Firefox") > 0;
}

export function isChrome() {
  return navigator.userAgent.indexOf("Chrome") > 0;
}

/**
 * @return {boolean} true: plugin context, false: page context
 */
export function isPluginContext() {
  if (isChrome()) {
    return typeof chrome !== "undefined" && chrome.runtime;
  } else if (isFirefox()) {
    return typeof browser !== "undefined" && browser.runtime;
  }

  // A browser this function does not recognise (Safari, a privacy-hardened UA, a
  // headless test runner) is not a supported plugin context - and returning `false`
  // is what the JSDoc above already promises ("false: page context"). Throwing here
  // used to take injectScript() and the whole boot IIFE down with it on any such
  // browser, instead of just not injecting. refactoring-new.md Phase A.5.
  return false;
}

/**
 * **PLUGIN CONTEXT**
 *
 * @param {string} path
 * @param {()=>void} [onLoadCallback]
 * @param {boolean} [module=false]
 */
export function injectScript(path, onLoadCallback, module = false) {
  if (!isPluginContext()) {
    throw Error("Invalid execution context");
  }

  const script = document.createElement("script");
  script.type = "text/javascript";
  script.src = chrome.runtime.getURL(path);

  if (module) {
    script.type = "module";
  }

  (document.head || document.documentElement).appendChild(script);
  script.onload = function () {
    script.remove();
    onLoadCallback && onLoadCallback();
  };
}
