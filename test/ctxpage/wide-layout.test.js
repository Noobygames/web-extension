/**
 * Wide-screen layout / zoom switches.
 *
 * The CSS in global.css matches nothing unless these classes are on <html>, so
 * these assertions are what stands between "the user unticked the box" and the
 * layout actually reverting. The manual zoom factor is equally load-bearing:
 * it is written as an inline custom property precisely so it outranks the
 * stepped media queries, and a stray unit or an out-of-range value would either
 * do nothing or blow the width budget.
 *
 * Page context module - no `chrome: true` on setupBrowser.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const KEYS = ["wideLayoutEnable", "wideZoomEnable", "wideZoomFactor"];

/**
 * conf-options.js pulls in logger.js, which resolves the execution context at
 * module-evaluation time - so the browser globals have to exist before the
 * import, not after. Plain dynamic imports (not importFresh) keep both modules
 * on the same instance, which is what lets setOption here be visible to
 * applyWideLayout there.
 */
async function loadModules() {
  const conf = await import("../../src/ctxpage/conf-options.js");
  const wide = await import("../../src/ctxpage/wide-layout.js");
  return { ...conf, ...wide };
}

/** Runs `run` with the three options set, restoring them afterwards. */
async function withWideOptions(overrides, run) {
  const browser = setupBrowser();
  try {
    const mod = await loadModules();
    const saved = Object.fromEntries(KEYS.map((k) => [k, mod.getOption(k)]));
    try {
      for (const [k, v] of Object.entries(overrides)) mod.setOption(k, v);
      await run(document.documentElement, mod);
    } finally {
      for (const k of KEYS) mod.setOption(k, saved[k]);
    }
  } finally {
    browser.cleanup();
  }
}

/** For assertions that need the module but no DOM state. */
async function withModules(run) {
  const browser = setupBrowser();
  try {
    await run(await loadModules());
  } finally {
    browser.cleanup();
  }
}

test("both options default to on, so the feature ships enabled", async () => {
  await withModules(({ getOption }) => {
    assert.equal(getOption("wideLayoutEnable"), true);
    assert.equal(getOption("wideZoomEnable"), true);
    assert.equal(getOption("wideZoomFactor"), 0);
  });
});

test("enabled options put both classes on <html>", async () => {
  await withWideOptions(
    { wideLayoutEnable: true, wideZoomEnable: true, wideZoomFactor: 0 },
    (root, { applyWideLayout }) => {
      applyWideLayout(root);
      assert.ok(root.classList.contains("ogl-wide-layout"));
      assert.ok(root.classList.contains("ogl-wide-zoom"));
    }
  );
});

test("turning the layout off removes only the layout class", async () => {
  await withWideOptions(
    { wideLayoutEnable: false, wideZoomEnable: true, wideZoomFactor: 0 },
    (root, { applyWideLayout }) => {
      applyWideLayout(root);
      assert.equal(root.classList.contains("ogl-wide-layout"), false);
      assert.ok(root.classList.contains("ogl-wide-zoom"));
    }
  );
});

test("turning the zoom off removes only the zoom class", async () => {
  await withWideOptions(
    { wideLayoutEnable: true, wideZoomEnable: false, wideZoomFactor: 0 },
    (root, { applyWideLayout }) => {
      applyWideLayout(root);
      assert.ok(root.classList.contains("ogl-wide-layout"));
      assert.equal(root.classList.contains("ogl-wide-zoom"), false);
    }
  );
});

test("re-applying after a change clears the previous state", async () => {
  await withWideOptions({ wideLayoutEnable: true, wideZoomEnable: true, wideZoomFactor: 1.3 }, (root, mod) => {
    const { applyWideLayout, setOption } = mod;
    applyWideLayout(root);
    assert.ok(root.classList.contains("ogl-wide-layout"));
    assert.equal(root.style.getPropertyValue("--ogl-wide-zoom"), "1.3");

    setOption("wideLayoutEnable", false);
    setOption("wideZoomEnable", false);
    applyWideLayout(root);
    assert.equal(root.classList.contains("ogl-wide-layout"), false);
    assert.equal(root.classList.contains("ogl-wide-zoom"), false);
    assert.equal(root.style.getPropertyValue("--ogl-wide-zoom"), "");
  });
});

test("factor 0 leaves the stepped media queries in charge", async () => {
  await withWideOptions(
    { wideLayoutEnable: true, wideZoomEnable: true, wideZoomFactor: 0 },
    (root, { applyWideLayout }) => {
      applyWideLayout(root);
      assert.equal(root.style.getPropertyValue("--ogl-wide-zoom"), "");
    }
  );
});

test("a manual factor is written inline so it outranks the media queries", async () => {
  await withWideOptions(
    { wideLayoutEnable: true, wideZoomEnable: true, wideZoomFactor: 1.2 },
    (root, { applyWideLayout }) => {
      applyWideLayout(root);
      assert.equal(root.style.getPropertyValue("--ogl-wide-zoom"), "1.2");
    }
  );
});

test("the manual factor is written unitless - `zoom: 1.2px` would be invalid", async () => {
  await withWideOptions(
    { wideLayoutEnable: true, wideZoomEnable: true, wideZoomFactor: 1.2 },
    (root, { applyWideLayout }) => {
      applyWideLayout(root);
      assert.match(root.style.getPropertyValue("--ogl-wide-zoom"), /^\d+(\.\d+)?$/);
    }
  );
});

test("a manual factor is ignored while the zoom itself is switched off", async () => {
  await withWideOptions(
    { wideLayoutEnable: true, wideZoomEnable: false, wideZoomFactor: 1.5 },
    (root, { applyWideLayout }) => {
      applyWideLayout(root);
      assert.equal(root.style.getPropertyValue("--ogl-wide-zoom"), "");
    }
  );
});

test("normalizeZoomFactor treats blank, zero and junk as automatic", async () => {
  await withModules(({ normalizeZoomFactor }) => {
    for (const raw of ["", "  ", "abc", 0, "0", -1, "-2", null, undefined, NaN, Infinity]) {
      assert.equal(normalizeZoomFactor(raw), 0, `expected automatic for ${JSON.stringify(raw)}`);
    }
  });
});

test("normalizeZoomFactor clamps to the supported range", async () => {
  await withModules(({ normalizeZoomFactor, WIDE_ZOOM_MIN, WIDE_ZOOM_MAX }) => {
    assert.equal(normalizeZoomFactor(0.5), WIDE_ZOOM_MIN);
    assert.equal(normalizeZoomFactor(9), WIDE_ZOOM_MAX);
    assert.equal(WIDE_ZOOM_MAX, 1.75, "ceiling is measured, not arbitrary - see the note in wide-layout.js");
    assert.equal(normalizeZoomFactor(WIDE_ZOOM_MIN), WIDE_ZOOM_MIN);
    assert.equal(normalizeZoomFactor(WIDE_ZOOM_MAX), WIDE_ZOOM_MAX);
  });
});

test("normalizeZoomFactor accepts a comma decimal, as German locales type it", async () => {
  await withModules(({ normalizeZoomFactor }) => {
    assert.equal(normalizeZoomFactor("1,25"), 1.25);
    assert.equal(normalizeZoomFactor("1.25"), 1.25);
  });
});

test("applyWideLayout is a no-op without a document rather than throwing", async () => {
  const { applyWideLayout } = await loadModules();
  assert.doesNotThrow(() => applyWideLayout(null));
  assert.doesNotThrow(() => applyWideLayout(undefined));
});
