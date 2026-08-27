/**
 * DOM construction helpers and the polling primitives the whole codebase uses
 * to cope with OGame rendering asynchronously.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";
// Neither module touches globals at import time, so a plain static import keeps
// the coverage report honest (a cache-busted URL counts as a separate file).
import * as domModule from "../../src/util/dom.js";
import * as waitModule from "../../src/util/wait.js";

// --------------------------------------------------------------------------
// util/dom.js
// --------------------------------------------------------------------------

async function withDom(run, options) {
  const browser = setupBrowser(options);
  try {
    await run(domModule, browser);
  } finally {
    browser.cleanup();
  }
}

test("createDOM builds an element with attributes and text", async () => {
  await withDom(({ createDOM }) => {
    const element = createDOM("div", { class: "ogl-option", "data-coords": "1:2:3" }, "Hello");

    assert.equal(element.tagName, "DIV");
    assert.equal(element.getAttribute("class"), "ogl-option");
    assert.equal(element.dataset.coords, "1:2:3");
    assert.equal(element.textContent, "Hello");
  });
});

test("createDOM works without attributes or text", async () => {
  await withDom(({ createDOM }) => {
    const element = createDOM("span");
    assert.equal(element.tagName, "SPAN");
    assert.equal(element.attributes.length, 0);
    assert.equal(element.textContent, "");
  });
});

test("createDOM assigns text as textContent, never as HTML", async () => {
  await withDom(({ createDOM }) => {
    // Content from spy reports and player names flows through here.
    const element = createDOM("div", {}, "<img src=x onerror=alert(1)>");

    assert.equal(element.children.length, 0);
    assert.equal(element.textContent, "<img src=x onerror=alert(1)>");
  });
});

test("createDOM skips empty text instead of clearing it", async () => {
  await withDom(({ createDOM }) => {
    assert.equal(createDOM("div", {}, "").textContent, "");
    assert.equal(createDOM("div", {}, 0).textContent, "", "0 is falsy and therefore skipped");
  });
});

test("createDOM marks selects as already styled so OGame leaves them alone", async () => {
  await withDom(({ createDOM }) => {
    const select = createDOM("select", { name: "ships" });
    assert.ok(select.classList.contains("dropdownInitialized"));
  });
});

test("createDOM does not add the select marker to other elements", async () => {
  await withDom(({ createDOM }) => {
    assert.equal(createDOM("div").classList.contains("dropdownInitialized"), false);
  });
});

test("createDOM keeps an explicit class when marking a select", async () => {
  await withDom(({ createDOM }) => {
    const select = createDOM("select", { class: "ogl-fleetSelect" });

    assert.ok(select.classList.contains("ogl-fleetSelect"));
    assert.ok(select.classList.contains("dropdownInitialized"));
  });
});

test("createSVG builds elements in the SVG namespace", async () => {
  await withDom(({ createSVG }) => {
    const circle = createSVG("circle", { cx: "10", cy: "10", r: "5" });

    assert.equal(circle.namespaceURI, "http://www.w3.org/2000/svg");
    assert.equal(circle.getAttribute("r"), "5");
  });
});

// --------------------------------------------------------------------------
// util/wait.js
// --------------------------------------------------------------------------

async function withWait(run, options) {
  const browser = setupBrowser(options);
  try {
    await run(waitModule, browser);
  } finally {
    browser.cleanup();
  }
}

test("waitFor resolves once the predicate turns true", async () => {
  await withWait(async ({ waitFor }) => {
    let ready = false;
    setTimeout(() => {
      ready = true;
    }, 20);

    assert.equal(await waitFor(() => ready, 5, 500), true);
  });
});

test("waitFor resolves immediately when the predicate is already true", async () => {
  await withWait(async ({ waitFor }) => {
    const started = Date.now();
    await waitFor(() => true, 5, 500);
    assert.ok(Date.now() - started < 200);
  });
});

test("waitFor rejects on timeout", async () => {
  await withWait(async ({ waitFor }) => {
    await assert.rejects(() => waitFor(() => false, 5, 30), /Wait for timeout exception/);
  });
});

test("waitFor stops polling after it resolves", async () => {
  await withWait(async ({ waitFor }) => {
    let calls = 0;
    await waitFor(
      () => {
        calls++;
        return true;
      },
      5,
      500
    );

    const afterResolve = calls;
    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.equal(calls, afterResolve, "the interval must be cleared");
  });
});

test("waitForDefinition waits for an own property to appear", async () => {
  await withWait(async ({ waitForDefinition }) => {
    const target = {};
    setTimeout(() => {
      target.DOMPurify = {};
    }, 20);

    assert.equal(await waitForDefinition(target, "DOMPurify", 5, 500), true);
  });
});

test("waitForDefinition ignores inherited properties", async () => {
  await withWait(async ({ waitForDefinition }) => {
    // Object.hasOwn, not `in` - a prototype property must not count as ready.
    const target = Object.create({ inherited: true });
    await assert.rejects(() => waitForDefinition(target, "inherited", 5, 30), /timeout/);
  });
});

test("waitForQuerySelector resolves with the matched element", async () => {
  await withWait(async ({ waitForQuerySelector }, browser) => {
    setTimeout(() => {
      const div = browser.document.createElement("div");
      div.id = "messagescomponent";
      browser.document.body.appendChild(div);
    }, 20);

    const element = await waitForQuerySelector("#messagescomponent", 5, 500);
    assert.equal(element.id, "messagescomponent");
  });
});

test("waitForQuerySelector rejects when the element never appears", async () => {
  await withWait(async ({ waitForQuerySelector }) => {
    await assert.rejects(() => waitForQuerySelector("#never", 5, 30), /timeout/);
  });
});

test("delay resolves after roughly the requested time", async () => {
  await withWait(async ({ delay }) => {
    const started = Date.now();
    await delay(30);
    assert.ok(Date.now() - started >= 25, "must not resolve early");
  });
});
