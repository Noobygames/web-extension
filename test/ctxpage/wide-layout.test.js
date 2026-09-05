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

test("turning the layout off takes the zoom with it", async () => {
  // It used to remove only the layout class. That left the scaling running on a
  // column that was no longer allowed to grow, which is the state that hid page
  // content under the planet bar - see the section on the dependency below.
  await withWideOptions({ wideLayoutEnable: false }, (root, mod) => {
    mod.applyWideLayout();
    assert.equal(root.classList.contains("ogl-wide-layout"), false);
    assert.equal(root.classList.contains("ogl-wide-zoom"), false);
  });
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

/**
 * The boot mirror. `main.js` reads this key at `document_start` to put the
 * classes on <html> before the game paints; it exists because `ogk-data` is far
 * too large to parse at that point. If it stops being written, the wide layout
 * silently goes back to flashing the vanilla width on every page change.
 */
test("applying the layout mirrors the switches into the boot cache", async () => {
  await withWideOptions({ wideLayoutEnable: true, wideZoomEnable: true, wideZoomFactor: 1.25 }, (root, mod) => {
    mod.applyWideLayout(root);

    assert.deepEqual(JSON.parse(localStorage.getItem(mod.BOOT_CACHE_KEY)), {
      layout: true,
      zoom: true,
      factor: 1.25,
    });
  });
});

test("the boot cache follows the options off again", async () => {
  await withWideOptions({ wideLayoutEnable: false, wideZoomEnable: false, wideZoomFactor: 1.5 }, (root, mod) => {
    mod.applyWideLayout(root);

    assert.deepEqual(JSON.parse(localStorage.getItem(mod.BOOT_CACHE_KEY)), {
      layout: false,
      zoom: false,
      // Zoom off means "no factor", not "the factor the user last picked".
      factor: 0,
    });
  });
});

test("an out-of-range factor is mirrored clamped, the way it is applied", async () => {
  await withWideOptions({ wideLayoutEnable: true, wideZoomEnable: true, wideZoomFactor: 9 }, (root, mod) => {
    mod.applyWideLayout(root);

    assert.equal(JSON.parse(localStorage.getItem(mod.BOOT_CACHE_KEY)).factor, mod.WIDE_ZOOM_MAX);
  });
});

// --------------------------------------------------------------------------
// the zoom depends on the width stretching
// --------------------------------------------------------------------------

/**
 * `zoom` is a *layout* zoom: the column it scales takes up that much more room, and
 * OGame's content column cannot go below its ~670px intrinsic width. Measured on a
 * saved account page at 1920px with the zoom on and the stretching off: #middle had a
 * 536px box holding 667px of content, and the event box hung 164px past the start of
 * #right - straight over the planet bar, which is where the fleet-recall column at the
 * end of every event row went. Narrowing the column cannot fix it; 670px is what the
 * content needs. So the scaling is only honoured together with the stretching.
 */
test("the zoom class is withheld while the wide layout is off", async () => {
  await withWideOptions({ wideLayoutEnable: false, wideZoomEnable: true }, (root, mod) => {
    mod.applyWideLayout();

    assert.equal(root.classList.contains("ogl-wide-layout"), false);
    assert.equal(root.classList.contains("ogl-wide-zoom"), false, "scaling without stretching hides page content");
  });
});

test("the withheld zoom does not write a factor either", async () => {
  await withWideOptions({ wideLayoutEnable: false, wideZoomEnable: true, wideZoomFactor: 1.4 }, (root, mod) => {
    mod.applyWideLayout();

    // The column formula divides by this even where nothing is scaled, so a factor
    // left behind would shrink the column for a layout that never grew it back.
    assert.equal(root.style.getPropertyValue("--ogl-wide-zoom"), "");
  });
});

test("the boot mirror carries the dependency, so document_start agrees", async () => {
  await withWideOptions({ wideLayoutEnable: false, wideZoomEnable: true }, (root, mod) => {
    mod.applyWideLayout();

    // `main.js` reads this key before the game paints and does not re-derive the
    // rule - a mirror saying "zoom on" would flash the broken layout for one paint.
    assert.deepEqual(JSON.parse(globalThis.localStorage.getItem(mod.BOOT_CACHE_KEY)), {
      layout: false,
      zoom: false,
      factor: 0,
    });
  });
});

test("with the stretching on the zoom is honoured as before", async () => {
  await withWideOptions({ wideLayoutEnable: true, wideZoomEnable: true }, (root, mod) => {
    mod.applyWideLayout();

    assert.ok(root.classList.contains("ogl-wide-layout"));
    assert.ok(root.classList.contains("ogl-wide-zoom"));
  });
});

test("the column floor is a flat 670px, not 670px divided by the zoom", async () => {
  // Dividing it let the column shrink below what the content needs: at 1600px and
  // zoom 1.25 the measured column was 628px for 667px of content, and the event box
  // hung 49px over the planet bar. Zoom scales the content up; it does not make its
  // CSS-pixel width smaller.
  const fs = await import("node:fs");
  const path = await import("node:path");
  const css = fs.readFileSync(path.join(import.meta.dirname, "..", "..", "src", "global.css"), "utf8");

  const formula = css.slice(css.indexOf("--ogl-wide-column: clamp("), css.indexOf("--ogl-wide-column: clamp(") + 200);

  assert.ok(formula.includes("670px,"), "the floor must be a flat 670px");
  assert.equal(formula.includes("calc(670px / var(--ogl-wide-zoom))"), false);
});

test("#right grows with the planet bar it has been told to scale", async () => {
  // Measured: the bar came out 343px inside a 300px #right and hung 43px past it.
  const fs = await import("node:fs");
  const path = await import("node:path");
  const css = fs.readFileSync(path.join(import.meta.dirname, "..", "..", "src", "global.css"), "utf8");

  assert.ok(
    /\.ogl-wide-zoom #pageContent > #right \{\s*width: calc\(300px \* var\(--ogl-wide-zoom\)\)/.test(css),
    "the planet bar is zoomed inside a box that is not"
  );
  assert.ok(css.includes("300px * (var(--ogl-wide-zoom) - 1)"), "and the reserve has to pay for that extra width");
});

test("main.js puts the same classes on <html> as wide-layout.js does", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  // `main.js` is a classic content script and cannot import this module, so its
  // `applyCachedLayout()` is a hand copy - it exists to put the classes on <html> at
  // document_start and stop the vanilla layout flashing before the wide one. A class
  // added on one side only reappears as exactly that flash, on a layout that is then
  // wrong for one paint, and nothing else in the repo would notice.
  const read = (file) => fs.readFileSync(path.join(import.meta.dirname, "..", "..", "src", file), "utf8");
  const classesIn = (source) => [...source.matchAll(/classList\.toggle\("([^"]+)"/g)].map((m) => m[1]).sort();

  assert.deepEqual(classesIn(read("main.js")), classesIn(read("ctxpage/wide-layout.js")));
});
