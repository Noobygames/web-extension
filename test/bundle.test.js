/**
 * The release bundles.
 *
 * `scripts/bundle.mjs` collapses the ~70-file module graph into one entry per
 * execution context plus a chunk per dynamic import, because that graph is a
 * seven-level request waterfall in front of every page load. Bundling is the kind
 * of build step that breaks silently: the module still parses, it just evaluates in
 * a different order, or a name collides, or a cycle that native ESM handled with
 * live bindings turns into a temporal dead zone. Nothing in the unit suite would
 * notice, because the unit suite imports `src/` directly.
 *
 * So this file builds the real bundles and evaluates every page-context chunk, not
 * just the entry - a chunk is a separate module with its own evaluation order, and
 * since Phase 5 of refactoring.md most of the page code lives in one.
 *
 * It also pins the properties that make the output acceptable to submit -
 * readable, self-contained, free of local filesystem paths - and the size of the
 * entry, which is the file every page load pays for.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { bundle } from "../scripts/bundle.mjs";
import { setupBrowser } from "./helpers/globals.js";

const projectRoot = path.resolve(import.meta.dirname, "..");

/**
 * Builds both bundles into a throwaway directory, the way the real build does:
 * a copy of `src/` with the version placeholder already substituted.
 *
 * @returns {Promise<{dir: string, written: {file: string, bytes: number}[]}>}
 */
async function buildBundles() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ogi-bundle-"));
  fs.cpSync(path.join(projectRoot, "src"), dir, { recursive: true });

  const versionJs = path.join(dir, "util", "version.js");
  fs.writeFileSync(versionJs, fs.readFileSync(versionJs, "utf8").replaceAll("__VERSION__", "9.9.9"));

  return { dir, written: await bundle(dir) };
}

// One build, shared by every assertion below - rollup on a 1.1 MB graph is the
// slow part, and the bundles are read-only here.
const { dir: bundleDir, written } = await buildBundles();
const pageBundle = fs.readFileSync(path.join(bundleDir, "ogCore.js"), "utf8");
const contentBundle = fs.readFileSync(path.join(bundleDir, "ctxcontent", "index.js"), "utf8");

const entries = written.filter((w) => w.entry);
const chunks = written.filter((w) => !w.entry);
const bytesOf = (file) => written.find((w) => w.file === file)?.bytes ?? 0;

/** Every generated file, entry or chunk, as [name, source]. */
const allOutputs = written.map((w) => [w.file, fs.readFileSync(path.join(bundleDir, w.file), "utf8")]);

test("both entry points are bundled", () => {
  assert.deepEqual(
    entries.map((w) => w.file),
    ["ogCore.js", "ctxcontent/index.js"]
  );
  // A bundle that lost most of the graph would still parse and still pass the
  // import assertions below, so pin the rough size too.
  assert.ok(bytesOf("ogCore.js") > 300_000, `page bundle looks truncated: ${bytesOf("ogCore.js")} bytes`);
  assert.ok(
    bytesOf("ctxcontent/index.js") > 30_000,
    `content bundle looks truncated: ${bytesOf("ctxcontent/index.js")} bytes`
  );
});

test("the page-specific code is in chunks, not in the file every page loads", () => {
  // The entry is what the manifest injects into every single OGame page. Phase 5
  // of refactoring.md moved the fleet-dispatch page, the statistics popup, the
  // settings dialog, the message analyzers and the build-page detail panel behind
  // dynamic imports; this is the number that says it stayed that way. It is a
  // ceiling, not a target - it should only ever move down.
  // 512_000 is the phase's own exit criterion, 500 KB, as a number a test can fail
  // on. The entry sits just under it: getting there took the five page chunks plus
  // the per-language translation tables, so there is no slack left for a static
  // import that "is only a few KB".
  const entryBytes = bytesOf("ogCore.js");
  assert.ok(entryBytes < 512_000, `the page entry grew back to ${(entryBytes / 1024).toFixed(0)} KB`);

  // Named after where they were split, so `chunks/stats.js` is the statistics
  // popup. A missing one means a static import crept back in and pulled the whole
  // module into the entry - which breaks nothing and is invisible without this.
  const names = chunks.map((c) => c.file);
  for (const expected of [
    "chunks/fleetdispatch.js",
    "chunks/stats.js",
    "chunks/settings.js",
    "chunks/technoDetail.js",
    "chunks/messages.js",
    "chunks/galaxyView.js",
    // Five of the six language tables. English stays in the entry as the fallback
    // for every key; the other five were 67 KB nobody could read, and they are the
    // reason the entry is under 500 KB at all. See util/translate.js.
    "chunks/de.js",
    "chunks/es.js",
    "chunks/fr.js",
    "chunks/tr.js",
    "chunks/br.js",
  ]) {
    assert.ok(names.includes(expected), `${expected} is missing - it is back in the entry:\n${names.join("\n")}`);
  }
});

test("every chunk lives under chunks/, where both manifests can serve it", () => {
  // A dynamic import in the bundle resolves against the extension origin, so a
  // chunk outside `chunks/*` is simply not in `web_accessible_resources` and the
  // feature 404s at the moment the user clicks it.
  const stray = chunks.filter((c) => !/(^|\/)chunks\//.test(c.file));
  assert.deepEqual(stray, [], "these chunks are not under a chunks/ directory");

  for (const manifest of ["src/manifest.json", "src/manifest-firefox.json"]) {
    const parsed = JSON.parse(fs.readFileSync(path.join(projectRoot, manifest), "utf8"));
    const resources = parsed.web_accessible_resources.flatMap((entry) => entry.resources);
    assert.ok(resources.includes("chunks/*"), `${manifest} does not make the chunks web-accessible`);
  }
});

test("nothing is left to fetch except the chunks: no static imports survive", () => {
  for (const [name, code] of allOutputs) {
    // A chunk may import from another chunk - that is what a shared chunk is for -
    // but only from `./chunks/...` or `../`, never from the module tree.
    for (const match of code.matchAll(/^\s*import\s.*\sfrom\s+"([^"]+)"/gm)) {
      assert.match(
        match[1],
        /^\.{1,2}\/(chunks\/)?[\w.-]+\.js$/,
        `${name} still resolves a source module at runtime: ${match[1]}`
      );
    }
  }
});

test("the entry still carries the test seam, and the content bundle still carries main", () => {
  // `OGBeyondInfinity` is the seam the calculation tests reach the class through.
  // Nothing imports `ogCore.js` at runtime - the manifest injects it - so this
  // export exists for the tests and has to survive bundling.
  //
  // It used to be the ONLY export, and the assertion used to say so. Since Phase 5
  // it cannot: a module that both the entry and a chunk need stays in the entry,
  // and the chunk imports it back, so the entry re-exports a long list of internals.
  // That is the arrangement that avoids duplicating those modules into every chunk,
  // and `minifyInternalExports: false` keeps the names readable. What still has to
  // hold is that the seam is there and that the shared names are real ones.
  const pageExports = (pageBundle.match(/^\s*export\s.*$/gm) || []).map((line) => line.trim());
  assert.equal(pageExports.length, 1, "the entry should have one export statement");
  assert.match(pageExports[0], /\bOGBeyondInfinity\b/, "the test seam is gone from the page bundle");
  assert.equal(
    /\b(?:as [a-z$_]\b|as [a-z]\d)/.test(pageExports[0]),
    false,
    `the cross-chunk exports were minified:\n${pageExports[0].slice(0, 200)}`
  );

  // ctxcontent's `main` is what main.js calls after its dynamic import, so that one
  // has to survive bundling or the content half never starts.
  assert.match(contentBundle, /^export \{ main \};$/m);
});

test("every generated file is readable, not minified", () => {
  // Minified output is one enormous line and carries no JSDoc. These checks exist
  // because AGENTS.md §0 requires reviewable code, and a change of bundler - or one
  // rollup option - would silently flip it. Applied to the chunks too: they are
  // most of the page code now, and a reviewer opens them like any other file.
  assert.ok(pageBundle.includes("@param"), "JSDoc was stripped");

  for (const [name, code] of allOutputs) {
    assert.ok(code.includes("Bundled by scripts/bundle.mjs"), `${name} lost the banner`);

    const lines = code.split("\n");
    // Source layout averages tens of characters per line; minified output is one
    // line of everything. A ratio holds whatever the file's size, where the old
    // fixed line count silently stopped meaning anything as soon as the entry
    // shrank by half.
    const perLine = code.length / lines.length;
    assert.ok(perLine < 80, `${name} averages ${perLine.toFixed(0)} characters per line - that is not source layout`);

    // The ceiling is generous because src/ogCore.js carries a 6.4k-character line
    // of its own.
    const longestLine = Math.max(...lines.map((line) => line.length));
    assert.ok(longestLine < 50_000, `${name} has a ${longestLine}-character line - that looks minified`);
  }
});

test("no local filesystem paths leak into any shipped file", () => {
  for (const [name, code] of allOutputs) {
    assert.equal(/[A-Za-z]:[\\/]Users[\\/]/.test(code), false, `${name} contains an absolute Windows path`);
    assert.equal(code.includes(bundleDir), false, `${name} contains its own build directory`);
  }
});

test("the page bundle evaluates without throwing", async () => {
  const browser = setupBrowser();
  try {
    // What `contentContextInit()` publishes on <html>; `pageContextInit()` runs
    // at module evaluation and throws without it.
    document.documentElement.dataset.ogiCallbackEventToken = "0123456789ab";

    const url = pathToFileURL(path.join(bundleDir, "ogCore.js")).href;
    await assert.doesNotReject(() => import(url), "module-level code in the bundle threw");

    // The start-up IIFE runs after this and fails on jsdom's empty game DOM,
    // but it catches its own errors - the invariant under test is that nothing
    // at module scope depends on evaluation order the bundler changed.
  } finally {
    browser.cleanup();
  }
});

test("every page-context chunk evaluates without throwing", async () => {
  // The whole reason this file exists, applied to the chunks: rollup rewrote the
  // evaluation order inside each of them too, and a chunk is only ever loaded by a
  // user who opened that page or pressed that button. Without this, the first
  // person to open the statistics popup after a bad split is the test.
  const browser = setupBrowser();
  try {
    document.documentElement.dataset.ogiCallbackEventToken = "0123456789ab";

    for (const chunk of chunks.filter((c) => !c.file.startsWith("ctxcontent/"))) {
      const url = pathToFileURL(path.join(bundleDir, chunk.file)).href;
      await assert.doesNotReject(() => import(url), `module-level code in ${chunk.file} threw`);
    }
  } finally {
    browser.cleanup();
  }
});

test.after(() => fs.rmSync(bundleDir, { recursive: true, force: true }));
