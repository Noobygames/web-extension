/**
 * Test harness for the globals the extension expects to find on a page.
 *
 * `src/` is written against a browser with OGame already loaded, so several
 * modules read globals that no bundler ever declares:
 *
 * - `LocalizationStrings` - injected by OGame, used by numbers.js / cleanValue.js
 * - `document` / `window` / `navigator` - the page
 * - `localStorage` - backing store of the OGBIData singleton (page context)
 * - `chrome` - extension APIs (content-script context only)
 *
 * These helpers install them on `globalThis` for the duration of a test and
 * hand back a restore function, so suites stay isolated from each other.
 */
import { JSDOM } from "jsdom";

/** German-style separators, matching what OGame ships for de/fr/es locales. */
export const LOCALIZATION_DE = Object.freeze({
  decimalPoint: ",",
  thousandSeperator: ".",
  unitKilo: "k",
  unitMega: "M",
  unitMilliard: "Mrd",
});

/** English-style separators (us/en/ro/zh in numbers.js). */
export const LOCALIZATION_EN = Object.freeze({
  decimalPoint: ".",
  thousandSeperator: ",",
  unitKilo: "k",
  unitMega: "M",
  unitMilliard: "B",
});

const GLOBAL_KEYS = [
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "CustomEvent",
  "Event",
  "Element",
  "HTMLElement",
  "Node",
  "DOMParser",
  "XMLSerializer",
  "getComputedStyle",
  "LocalizationStrings",
  "chrome",
  "cloneInto",
];

function snapshot() {
  const saved = new Map();
  for (const key of GLOBAL_KEYS) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  return saved;
}

function restore(saved) {
  for (const [key, descriptor] of saved) {
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      delete globalThis[key];
    }
  }
}

function define(key, value) {
  Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
}

/**
 * Minimal stand-in for the parts of `chrome.*` the extension actually calls.
 * `storage.local` is backed by a plain Map and supports both the callback and
 * the promise form, because the codebase uses both.
 */
export function createChromeStub() {
  const store = new Map();
  const calls = {
    set: 0,
    get: 0,
    clear: 0,
    sendMessage: [],
    alarmsCreated: [],
    alarmsCleared: [],
    notificationsCreated: [],
    notificationsCleared: [],
    tabsUpdated: [],
    tabsCreated: [],
  };

  /** chrome.storage.local.get accepts null, a string, an array or a defaults object. */
  function requestedKeys(keys) {
    if (keys === null || keys === undefined) return [...store.keys()];
    if (Array.isArray(keys)) return keys;
    if (typeof keys === "string") return [keys];
    return Object.keys(keys);
  }

  const local = {
    get(keys, callback) {
      calls.get++;
      const wanted = requestedKeys(keys);

      const result = {};
      for (const key of wanted) {
        if (store.has(key)) result[key] = store.get(key);
      }
      if (callback) {
        callback(result);
        return undefined;
      }
      return Promise.resolve(result);
    },
    set(items, callback) {
      calls.set++;
      for (const [key, value] of Object.entries(items)) store.set(key, value);
      if (callback) {
        callback();
        return undefined;
      }
      return Promise.resolve();
    },
    remove(keys, callback) {
      for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
      if (callback) {
        callback();
        return undefined;
      }
      return Promise.resolve();
    },
    clear(callback) {
      calls.clear++;
      store.clear();
      if (callback) {
        callback();
        return undefined;
      }
      return Promise.resolve();
    },
  };

  // Alarms, notifications and tabs exist for background.js, which is nothing but
  // three listeners over these three APIs. They record rather than no-op, because
  // "did the service worker schedule an alarm" is the only observable it has.
  const alarms = new Map();
  const notifications = new Map();
  const tabs = [];
  const listeners = { message: [], alarm: [], notificationClicked: [] };

  return {
    runtime: {
      getURL: (path) => `chrome-extension://ogi-test-id/${path.replace(/^\.?\//, "")}`,
      sendMessage: (message, callback) => {
        calls.sendMessage.push(message);
        callback?.({});
      },
      onMessage: {
        addListener(fn) {
          listeners.message.push(fn);
        },
      },
      lastError: undefined,
    },
    storage: { local },
    notifications: {
      create(id, options) {
        calls.notificationsCreated.push({ id, options });
        notifications.set(id, options);
      },
      clear(id) {
        calls.notificationsCleared.push(id);
        notifications.delete(id);
        return Promise.resolve(true);
      },
      onClicked: {
        addListener(fn) {
          listeners.notificationClicked.push(fn);
        },
      },
    },
    alarms: {
      create(name, info) {
        calls.alarmsCreated.push({ name, ...info });
        // The real API reports `scheduledTime` as epoch milliseconds; background.js
        // turns it back into an ISO string to compare against the notification.
        alarms.set(name, { name, scheduledTime: info.when });
      },
      get(name) {
        return Promise.resolve(alarms.get(name));
      },
      clear(name) {
        calls.alarmsCleared.push(name);
        return Promise.resolve(alarms.delete(name));
      },
      onAlarm: {
        addListener(fn) {
          listeners.alarm.push(fn);
        },
      },
    },
    tabs: {
      query({ url }) {
        // The real matcher is a match pattern; only the trailing `*` is used here.
        const prefix = String(url).replace(/\*$/, "");
        return Promise.resolve(tabs.filter((tab) => tab.url.startsWith(prefix)));
      },
      update(id, properties) {
        calls.tabsUpdated.push({ id, ...properties });
        const tab = tabs.find((candidate) => candidate.id === id);
        if (tab) Object.assign(tab, properties);
        return Promise.resolve(tab);
      },
      create(properties) {
        calls.tabsCreated.push(properties);
        const tab = { id: tabs.length + 1, ...properties };
        tabs.push(tab);
        return Promise.resolve(tab);
      },
    },
    /** test-only handles */
    _store: store,
    _calls: calls,
    _alarms: alarms,
    _notifications: notifications,
    _tabs: tabs,
    _listeners: listeners,
  };
}

/**
 * Boots a jsdom page and publishes the globals `src/` expects.
 *
 * @param {object} [options]
 * @param {string} [options.html] document body markup
 * @param {string} [options.url] page URL (drives `window.location`)
 * @param {string} [options.userAgent] used by the Firefox checks in the codebase
 * @param {string} [options.gameLang] value of `<meta name="ogame-language">`
 * @param {string} [options.ogameVersion] value of `<meta name="ogame-version">`
 * @param {object|null} [options.localization] `LocalizationStrings`, defaults to German
 * @param {boolean} [options.chrome] install a `chrome` stub (content-script context)
 * @returns {{window: object, document: object, chrome: object|undefined, cleanup: () => void}}
 */
export function setupBrowser(options = {}) {
  const {
    html = "",
    url = "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame&component=overview",
    userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    gameLang = "en",
    ogameVersion = "12.0.36",
    localization = LOCALIZATION_DE,
    chrome: withChrome = false,
  } = options;

  const saved = snapshot();

  const head = [
    ogameVersion === null ? "" : `<meta name="ogame-version" content="${ogameVersion}">`,
    gameLang === null ? "" : `<meta name="ogame-language" content="${gameLang}">`,
  ].join("");

  const dom = new JSDOM(`<!doctype html><html><head>${head}</head><body>${html}</body></html>`, {
    url,
  });

  const { window } = dom;

  // `userAgent` is not a top-level JSDOM option, so patch it onto the instance.
  // Several modules branch on `navigator.userAgent.indexOf("Firefox")`.
  Object.defineProperty(window.navigator, "userAgent", { value: userAgent, configurable: true });

  define("window", window);
  define("document", window.document);
  define("navigator", window.navigator);
  define("localStorage", window.localStorage);
  define("sessionStorage", window.sessionStorage);
  define("CustomEvent", window.CustomEvent);
  define("Event", window.Event);
  define("Element", window.Element);
  define("HTMLElement", window.HTMLElement);
  define("Node", window.Node);
  define("DOMParser", window.DOMParser);
  define("XMLSerializer", window.XMLSerializer);
  define("getComputedStyle", window.getComputedStyle.bind(window));

  if (localization) define("LocalizationStrings", { ...localization });

  let chromeStub;
  if (withChrome) {
    chromeStub = createChromeStub();
    define("chrome", chromeStub);
    window.chrome = chromeStub;
  } else {
    // Page context: `window.chrome` must be absent for pageContextInit() to run.
    delete globalThis.chrome;
    delete window.chrome;
  }

  return {
    window,
    document: window.document,
    chrome: chromeStub,
    dom,
    cleanup() {
      // Deliberately not window.close(): modules such as util/fetching.js keep a
      // module-level DOMParser bound to the window of their first import, and a
      // closed window turns that into a null-dereference in later suites.
      restore(saved);
    },
  };
}

/**
 * Imports a module with a cache-busting query so module-level singletons
 * (`OGBIData`, `OgamePageData`, `Translator`, ...) are re-evaluated against the
 * globals of the current test instead of leaking state between tests.
 *
 * @param {string} specifier module path relative to the repository root, e.g. "src/util/OGBIData.js"
 * @returns {Promise<any>}
 */
let importCounter = 0;
export async function importFresh(specifier) {
  const url = new URL(`../../${specifier}`, import.meta.url);
  url.searchParams.set("__fresh", String(++importCounter));
  return import(url.href);
}
