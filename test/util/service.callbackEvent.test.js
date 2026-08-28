/**
 * Tests for the page <-> content-script bridge.
 *
 * Both halves normally live in different JavaScript realms. Here they share one
 * jsdom document, which is exactly what the real implementation relies on: the
 * handshake happens through `document.documentElement.dataset` and CustomEvents
 * on the shared `document`.
 *
 * `installBridge()` reproduces the real sequence - content script first (with
 * `chrome`), page second (without it).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser, importFresh } from "../helpers/globals.js";

const DATASET_NAME = "ogiCallbackEventToken";

/** Boots a page, runs contentContextInit() then pageContextInit() on it. */
async function installBridge(callbackCommandMap, options = {}) {
  const browser = setupBrowser({ chrome: true, ...options });
  const bridge = await importFresh("src/util/service.callbackEvent.js");

  bridge.contentContextInit(callbackCommandMap);
  const contentToken = browser.document.documentElement.dataset[DATASET_NAME];

  // Hand over to the page context: it must not see chrome.runtime.
  delete globalThis.chrome;
  delete browser.window.chrome;
  bridge.pageContextInit();

  return { browser, bridge, contentToken };
}

test("contentContextInit refuses to run when chrome.runtime is missing", async () => {
  const browser = setupBrowser({ chrome: true });
  try {
    delete globalThis.chrome.runtime;
    const bridge = await importFresh("src/util/service.callbackEvent.js");
    assert.throws(() => bridge.contentContextInit({}), /Invalid context execution/);
  } finally {
    browser.cleanup();
  }
});

test("KNOWN BUG: contentContextInit throws ReferenceError when there is no chrome at all", async () => {
  // The guard is `if (!chrome.runtime)`, which dereferences an undeclared
  // global in the page context and blows up before the intended message is
  // produced. pageContextInit() gets this right (`window.chrome !== undefined`).
  const browser = setupBrowser({ chrome: false });
  try {
    const bridge = await importFresh("src/util/service.callbackEvent.js");
    assert.throws(
      () => bridge.contentContextInit({}),
      (error) => {
        assert.ok(error instanceof ReferenceError);
        assert.match(error.message, /chrome is not defined/);
        return true;
      }
    );
  } finally {
    browser.cleanup();
  }
});

test("contentContextInit publishes a token on the document element", async () => {
  const browser = setupBrowser({ chrome: true });
  try {
    const bridge = await importFresh("src/util/service.callbackEvent.js");
    bridge.contentContextInit({});

    const token = browser.document.documentElement.dataset[DATASET_NAME];
    assert.match(token, /^[0-9a-f]{12,}$/, "token must be a hex string");
  } finally {
    browser.cleanup();
  }
});

test("contentContextInit refuses a second initialisation", async () => {
  const browser = setupBrowser({ chrome: true });
  try {
    const bridge = await importFresh("src/util/service.callbackEvent.js");
    bridge.contentContextInit({});
    assert.throws(() => bridge.contentContextInit({}), /already initialized/);
  } finally {
    browser.cleanup();
  }
});

test("pageContextInit refuses to run inside an extension context", async () => {
  const browser = setupBrowser({ chrome: true });
  try {
    const bridge = await importFresh("src/util/service.callbackEvent.js");
    bridge.contentContextInit({});
    assert.throws(() => bridge.pageContextInit(), /Invalid context execution/);
  } finally {
    browser.cleanup();
  }
});

test("pageContextInit refuses to run before the content script initialised", async () => {
  const browser = setupBrowser({ chrome: false });
  try {
    const bridge = await importFresh("src/util/service.callbackEvent.js");
    assert.throws(() => bridge.pageContextInit(), /not initialized/);
  } finally {
    browser.cleanup();
  }
});

test("a registered callback resolves with its return value", async () => {
  const { browser, bridge } = await installBridge({
    messages: { expeditionType: () => ({ type: "resources", busy: false }) },
  });

  try {
    const result = await bridge.pageContextRequest("messages", "expeditionType", "<li class='msg'>");

    assert.equal(result.success, true);
    assert.deepEqual(result.response, { type: "resources", busy: false });
  } finally {
    browser.cleanup();
  }
});

test("arguments are forwarded in order", async () => {
  let received;
  const { browser, bridge } = await installBridge({
    ptre: {
      galaxy: (...args) => {
        received = args;
        return "ok";
      },
    },
  });

  try {
    await bridge.pageContextRequest("ptre", "galaxy", { changed: 3 }, "TEAM-KEY", 1700000000);
    assert.deepEqual(received, [{ changed: 3 }, "TEAM-KEY", 1700000000]);
  } finally {
    browser.cleanup();
  }
});

test("a callback is invoked with its command group as `this`", async () => {
  const { browser, bridge } = await installBridge({
    ptre: {
      key: "TEAM-KEY",
      galaxy() {
        return this.key;
      },
    },
  });

  try {
    const result = await bridge.pageContextRequest("ptre", "galaxy");
    assert.equal(result.response, "TEAM-KEY");
  } finally {
    browser.cleanup();
  }
});

test("an async callback is awaited before responding", async () => {
  const { browser, bridge } = await installBridge({
    ptre: {
      galaxy: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return "late";
      },
    },
  });

  try {
    const result = await bridge.pageContextRequest("ptre", "galaxy");
    assert.equal(result.response, "late");
  } finally {
    browser.cleanup();
  }
});

test("an unknown command rejects instead of hanging", async () => {
  const { browser, bridge } = await installBridge({ ptre: { galaxy: () => 1 } });

  try {
    await assert.rejects(
      () => bridge.pageContextRequest("nope", "galaxy"),
      (rejection) => {
        assert.equal(rejection.success, false);
        assert.equal(rejection.response, "Request callback not found");
        return true;
      }
    );
  } finally {
    browser.cleanup();
  }
});

test("an unknown action on a known command rejects", async () => {
  const { browser, bridge } = await installBridge({ ptre: { galaxy: () => 1 } });

  try {
    await assert.rejects(
      () => bridge.pageContextRequest("ptre", "nope"),
      (rejection) => {
        assert.equal(rejection.response, "Request callback not found");
        return true;
      }
    );
  } finally {
    browser.cleanup();
  }
});

test("a throwing callback rejects with the stringified error", async () => {
  const { browser, bridge } = await installBridge({
    messages: {
      expeditionType: () => {
        throw new Error("parse failed");
      },
    },
  });

  try {
    await assert.rejects(
      () => bridge.pageContextRequest("messages", "expeditionType", "junk"),
      (rejection) => {
        assert.equal(rejection.success, false);
        assert.equal(rejection.response, "Error: parse failed");
        return true;
      }
    );
  } finally {
    browser.cleanup();
  }
});

test("a rejected async callback rejects the request", async () => {
  const { browser, bridge } = await installBridge({
    ptre: { galaxy: async () => Promise.reject(new Error("network down")) },
  });

  try {
    await assert.rejects(
      () => bridge.pageContextRequest("ptre", "galaxy"),
      (rejection) => {
        // The rejection value is a ResponseCallbackEvent, not an Error.
        assert.equal(rejection.success, false);
        assert.equal(rejection.response, "Error: network down");
        return true;
      }
    );
  } finally {
    browser.cleanup();
  }
});

test("the referer identifies the command and action", async () => {
  const { browser, bridge } = await installBridge({ ptre: { galaxy: () => 1 } });

  try {
    const result = await bridge.pageContextRequest("ptre", "galaxy");
    assert.match(result.referer, /^[0-9a-f]+\[ptre\.galaxy\]$/);
  } finally {
    browser.cleanup();
  }
});

test("concurrent requests are matched to their own response", async () => {
  const { browser, bridge } = await installBridge({
    math: {
      // Slower for smaller inputs, so responses arrive out of order.
      double: async (n) => {
        await new Promise((resolve) => setTimeout(resolve, 20 - n));
        return n * 2;
      },
    },
  });

  try {
    const results = await Promise.all([1, 5, 10].map((n) => bridge.pageContextRequest("math", "double", n)));
    assert.deepEqual(
      results.map((r) => r.response),
      [2, 10, 20]
    );

    const referers = new Set(results.map((r) => r.referer));
    assert.equal(referers.size, 3, "each request must get its own referer");
  } finally {
    browser.cleanup();
  }
});

test("responses are cloned with cloneInto on Firefox", async () => {
  const firefoxUA = "Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0";
  const calls = [];

  const browser = setupBrowser({ chrome: true, userAgent: firefoxUA });
  Object.defineProperty(globalThis, "cloneInto", {
    value: (value, view) => {
      calls.push(view);
      return value;
    },
    writable: true,
    configurable: true,
  });

  try {
    const bridge = await importFresh("src/util/service.callbackEvent.js");
    bridge.contentContextInit({ ptre: { galaxy: () => "cloned" } });

    delete globalThis.chrome;
    delete browser.window.chrome;
    bridge.pageContextInit();

    const result = await bridge.pageContextRequest("ptre", "galaxy");

    assert.equal(result.response, "cloned");
    assert.equal(calls.length, 1, "cloneInto must be used exactly once per response");
    assert.equal(calls[0], browser.document.defaultView);
  } finally {
    browser.cleanup();
  }
});

test("responses are not cloned on Chromium", async () => {
  let cloneCalled = false;
  Object.defineProperty(globalThis, "cloneInto", {
    value: () => {
      cloneCalled = true;
    },
    writable: true,
    configurable: true,
  });

  const { browser, bridge } = await installBridge({ ptre: { galaxy: () => "plain" } });

  try {
    await bridge.pageContextRequest("ptre", "galaxy");
    assert.equal(cloneCalled, false);
  } finally {
    browser.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Known defects - see docs/testing.md.
// ---------------------------------------------------------------------------

test('KNOWN BUG: pageContextInit() overwrites the published token with "1"', async () => {
  // pageContextInit() ends with `dataset[DATASET_NAME] = "1"`, presumably to
  // stop other page scripts from reading the token. Two consequences:
  //   1. a second pageContextInit() silently latches onto the token "1" and
  //      every subsequent request is dispatched on an event name nobody listens to;
  //   2. the dataset no longer reflects the real token, so any later
  //      contentContextInit() sees "1" and reports "already initialized".
  const { browser, contentToken } = await installBridge({ ptre: { galaxy: () => 1 } });

  try {
    assert.notEqual(contentToken, "1");
    assert.equal(browser.document.documentElement.dataset[DATASET_NAME], "1");
  } finally {
    browser.cleanup();
  }
});

test("a request for an unregistered token is rejected rather than left hanging", async (t) => {
  // Follow-on from the above: after a second pageContextInit() the module token is
  // "1" and no listener exists for that event name. This used to be a KNOWN BUG -
  // the promise neither resolved nor rejected, so the caller and everything awaiting
  // it stalled with no error anywhere. There is now a 30 s deadlock guard.
  const { browser, bridge } = await installBridge({ ptre: { galaxy: () => 1 } });
  t.mock.timers.enable({ apis: ["setTimeout"] });

  try {
    bridge.pageContextInit(); // re-init picks up the placeholder token "1"

    const request = bridge.pageContextRequest("ptre", "galaxy");
    const outcome = request.then(
      () => ({ settled: "resolved" }),
      (reason) => ({ settled: "rejected", reason })
    );

    t.mock.timers.tick(30_000);
    const result = await outcome;

    assert.equal(result.settled, "rejected");
    assert.equal(result.reason.success, false);
    assert.match(result.reason.data, /No response for "ptre\.galaxy"/);
  } finally {
    t.mock.timers.reset();
    browser.cleanup();
  }
});

test("a request that gets its reply does not fire the timeout", async (t) => {
  const { browser, bridge } = await installBridge({ ptre: { galaxy: () => 42 } });
  t.mock.timers.enable({ apis: ["setTimeout"] });

  try {
    const response = await bridge.pageContextRequest("ptre", "galaxy");
    assert.equal(response.success, true);

    // Winding the clock past the deadline must not turn a settled promise into a
    // rejection, and must not leave an unhandled one behind.
    t.mock.timers.tick(60_000);
  } finally {
    t.mock.timers.reset();
    browser.cleanup();
  }
});

/**
 * The preset-token path.
 *
 * `main.js` mints the token at `document_start` and publishes it before it
 * injects anything, so `ogkush.js` and the content bundle download in parallel
 * instead of one behind the other. That only works if `contentContextInit()`
 * accepts a token it did not create - and, critically, if it still works when
 * the page context got there first and replaced the published token with the
 * "1" placeholder.
 */
test("contentContextInit accepts a token minted by the caller", async () => {
  const browser = setupBrowser({ chrome: true });
  try {
    const bridge = await importFresh("src/util/service.callbackEvent.js");
    const token = bridge.createCallbackToken();
    browser.document.documentElement.dataset[DATASET_NAME] = token;

    // No throw, even though the dataset is already populated.
    bridge.contentContextInit({}, token);

    assert.equal(browser.document.documentElement.dataset[DATASET_NAME], token, "the caller's token must survive");
  } finally {
    browser.cleanup();
  }
});

test("a preset token still routes a request end to end", async () => {
  const browser = setupBrowser({ chrome: true });
  try {
    const bridge = await importFresh("src/util/service.callbackEvent.js");
    const token = bridge.createCallbackToken();
    browser.document.documentElement.dataset[DATASET_NAME] = token;
    bridge.contentContextInit({ ptre: { galaxy: () => "routed" } }, token);

    delete globalThis.chrome;
    delete browser.window.chrome;
    bridge.pageContextInit();

    const response = await bridge.pageContextRequest("ptre", "galaxy");
    assert.equal(response.response, "routed");
  } finally {
    browser.cleanup();
  }
});

test("the page context may consume the token before the content script registers", async () => {
  // The real race: ogkush.js is injected first, so pageContextInit() can run -
  // and overwrite the dataset with "1" - before ctxcontent/index.js has been
  // evaluated. contentContextInit() must not read the dataset in that case.
  const browser = setupBrowser({ chrome: true });
  try {
    const bridge = await importFresh("src/util/service.callbackEvent.js");
    const token = bridge.createCallbackToken();
    browser.document.documentElement.dataset[DATASET_NAME] = token;

    // Page context first.
    const savedChrome = globalThis.chrome;
    delete globalThis.chrome;
    delete browser.window.chrome;
    bridge.pageContextInit();
    assert.equal(browser.document.documentElement.dataset[DATASET_NAME], "1", "precondition: token was consumed");

    // Content context second, with the token it kept in hand.
    globalThis.chrome = savedChrome;
    browser.window.chrome = savedChrome;
    assert.doesNotThrow(() => bridge.contentContextInit({ ptre: { galaxy: () => "late" } }, token));

    delete globalThis.chrome;
    delete browser.window.chrome;
    const response = await bridge.pageContextRequest("ptre", "galaxy");
    assert.equal(response.response, "late");
  } finally {
    browser.cleanup();
  }
});

test("a second contentContextInit is refused even with a preset token", async () => {
  const browser = setupBrowser({ chrome: true });
  try {
    const bridge = await importFresh("src/util/service.callbackEvent.js");
    const token = bridge.createCallbackToken();
    bridge.contentContextInit({}, token);
    assert.throws(() => bridge.contentContextInit({}, token), /already initialized/);
  } finally {
    browser.cleanup();
  }
});
