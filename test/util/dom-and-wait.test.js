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

// createDOMSanitized was lifted out of OGBeyondInfinity.createDOM() in the Phase 1 cut.
// It differs from createDOM in exactly the two ways asserted below, and both
// differences are load-bearing for its ~50 call sites - hence the tests.
// DOMPurify is a page global injected by main.js, so it is stubbed here; what
// matters is that the content goes through it, not what it strips.
async function withSanitizer(run, options) {
  const browser = setupBrowser(options);
  const calls = [];
  globalThis.DOMPurify = {
    sanitize: (input) => {
      calls.push(input);
      return String(input).replace(/<script[^>]*>.*?<\/script>/g, "");
    },
  };
  try {
    await run(domModule, calls);
  } finally {
    delete globalThis.DOMPurify;
    browser.cleanup();
  }
}

test("createDOMSanitized inserts content as HTML, through DOMPurify", async () => {
  await withSanitizer(({ createDOMSanitized }, calls) => {
    const element = createDOMSanitized("div", { class: "ogl-dialog" }, "<b>ok</b><script>alert(1)</script>");

    assert.equal(element.getAttribute("class"), "ogl-dialog");
    assert.deepEqual(calls, ["<b>ok</b><script>alert(1)</script>"], "content must pass through the sanitizer");
    assert.equal(element.querySelector("b").textContent, "ok", "surviving markup becomes real elements");
    assert.equal(element.querySelector("script"), null);
  });
});

test("createDOMSanitized treats a numeric 0 as content, unlike createDOM", async () => {
  await withSanitizer(({ createDOMSanitized, createDOM }) => {
    // The class version guarded with `content || content == 0`; call sites pass
    // resource counts, so a real zero has to render.
    assert.equal(createDOMSanitized("div", {}, 0).textContent, "0");
    assert.equal(createDOM("div", {}, 0).textContent, "", "createDOM still skips it");
  });
});

test("createDOMSanitized only skips content that is absent, not content that is empty", async () => {
  await withSanitizer(({ createDOMSanitized }, calls) => {
    // TRAP: the guard is `content || content == 0`, and "" == 0 is true in JS,
    // so an empty string still reaches the sanitizer. Inherited verbatim from
    // OGBeyondInfinity.createDOM(); the result is the same empty element either way,
    // but do not "simplify" the guard without checking this.
    assert.equal(createDOMSanitized("div", {}, "").innerHTML, "");
    assert.deepEqual(calls, [""]);

    assert.equal(createDOMSanitized("span").innerHTML, "");
    assert.equal(createDOMSanitized("i", {}, null).innerHTML, "");
    assert.deepEqual(calls, [""], "undefined and null never reach the sanitizer");
  });
});

test("createDOMSanitized does not mark selects the way createDOM does", async () => {
  await withSanitizer(({ createDOMSanitized }) => {
    // Deliberate: the class version never did, and no caller builds a <select>
    // through it. Documented in util/dom.js so the difference stays a choice.
    assert.equal(createDOMSanitized("select").classList.contains("dropdownInitialized"), false);
  });
});

test("createSVG builds elements in the SVG namespace", async () => {
  await withDom(({ createSVG }) => {
    const circle = createSVG("circle", { cx: "10", cy: "10", r: "5" });

    assert.equal(circle.namespaceURI, "http://www.w3.org/2000/svg");
    assert.equal(circle.getAttribute("r"), "5");
  });
});

// changeOGSelect drives OGame's custom select widget: a real <select> that is
// visually replaced by a .dropdown sibling, so setting .value alone shows the
// old label and never notifies the game's own change listeners.
function selectMarkup(document) {
  document.body.innerHTML = `
    <select class="expeditionFleetTemplateSelect">
      <option value="0">-</option>
      <option value="42">Raid template</option>
    </select>
    <div class="dropdown"><a href="#">-</a></div>`;
}

test("changeOGSelect sets the value, the visible label and fires change", async () => {
  await withDom(({ changeOGSelect }, { window }) => {
    selectMarkup(window.document);
    let changes = 0;
    window.document.querySelector(".expeditionFleetTemplateSelect").addEventListener("change", () => changes++);

    changeOGSelect(".expeditionFleetTemplateSelect", "42");

    assert.equal(window.document.querySelector(".expeditionFleetTemplateSelect").value, "42");
    assert.equal(window.document.querySelector(".dropdown > a").textContent, "Raid template");
    assert.equal(changes, 1, "the game's own listeners must see the selection change");
  });
});

test("changeOGSelect leaves everything alone for an unknown value", async () => {
  await withDom(({ changeOGSelect }, { window }) => {
    selectMarkup(window.document);
    let changes = 0;
    window.document.querySelector(".expeditionFleetTemplateSelect").addEventListener("change", () => changes++);

    changeOGSelect(".expeditionFleetTemplateSelect", "999");

    assert.equal(window.document.querySelector(".expeditionFleetTemplateSelect").value, "0");
    assert.equal(changes, 0);
  });
});

test("changeOGSelect is a no-op when the select is not on the page", async () => {
  await withDom(({ changeOGSelect }, { window }) => {
    window.document.body.innerHTML = "";

    assert.doesNotThrow(() => changeOGSelect(".expeditionFleetTemplateSelect", "42"));
  });
});

test("changeOGSelect still selects when the game renders no dropdown label", async () => {
  await withDom(({ changeOGSelect }, { window }) => {
    window.document.body.innerHTML = `
      <select class="expeditionFleetTemplateSelect">
        <option value="0">-</option>
        <option value="42">Raid template</option>
      </select>`;

    changeOGSelect(".expeditionFleetTemplateSelect", "42");

    assert.equal(window.document.querySelector(".expeditionFleetTemplateSelect").value, "42");
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
