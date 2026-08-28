/**
 * The release bundles.
 *
 * `scripts/bundle.mjs` collapses the ~70-file module graph into one file per
 * execution context, because that graph is a seven-level request waterfall in
 * front of every page load. Bundling is the kind of build step that breaks
 * silently: the module still parses, it just evaluates in a different order, or
 * a name collides, or a cycle that native ESM handled with live bindings turns
 * into a temporal dead zone. Nothing in the unit suite would notice, because
 * the unit suite imports `src/` directly.
 *
 * So this file builds the real bundles and evaluates the page-context one.
 *
 * It also pins the properties that make the output acceptable to submit:
 * readable, self-contained, and free of local filesystem paths.
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

test("both entry points are bundled", () => {
  assert.deepEqual(
    written.map((w) => w.file),
    ["ogCore.js", "ctxcontent/index.js"]
  );
  // A bundle that lost most of the graph would still parse and still pass the
  // import assertions below, so pin the rough size too.
  assert.ok(written[0].bytes > 900_000, `page bundle looks truncated: ${written[0].bytes} bytes`);
  assert.ok(written[1].bytes > 30_000, `content bundle looks truncated: ${written[1].bytes} bytes`);
});

test("nothing is left to fetch: no static imports survive", () => {
  for (const [name, code] of [
    ["ogCore.js", pageBundle],
    ["ctxcontent/index.js", contentBundle],
  ]) {
    assert.equal(/^\s*import\s.*\sfrom\s/m.test(code), false, `${name} still has a static import`);
  }
});

test("the page bundle exports only the test seam, the content bundle only main", () => {
  // ogCore.js is injected as a script and consumed by nobody at runtime. The one
  // export is the seam the calculation tests reach the class through; it must stay
  // the ONLY one, because anything else would mean a page-context module started
  // being imported rather than injected. ctxcontent's `main` is what main.js calls
  // after its dynamic import, so that one has to survive bundling or the content
  // half never starts.
  const pageExports = (pageBundle.match(/^\s*export\s.*$/gm) || []).map((line) => line.trim());
  assert.deepEqual(pageExports, ["export { OGBeyondInfinity };"]);
  assert.match(contentBundle, /^export \{ main \};$/m);
});

test("the bundle is readable, not minified", () => {
  // Minified output is one enormous line and carries no JSDoc. Both checks
  // exist because AGENTS.md §0 requires reviewable code, and a future change of
  // bundler would silently flip this.
  assert.ok(pageBundle.includes("@param"), "JSDoc was stripped");
  assert.ok(pageBundle.includes("Bundled by scripts/bundle.mjs"), "banner missing");

  // Minified output is essentially one line. The ceiling is generous because
  // src/ogCore.js already carries a 6.4k-character line of its own.
  const lines = pageBundle.split("\n");
  const longestLine = Math.max(...lines.map((line) => line.length));
  assert.ok(lines.length > 20_000, `only ${lines.length} lines - that is not source layout`);
  assert.ok(longestLine < 50_000, `a ${longestLine}-character line suggests minified output`);
});

test("no local filesystem paths leak into the shipped file", () => {
  for (const [name, code] of [
    ["ogCore.js", pageBundle],
    ["ctxcontent/index.js", contentBundle],
  ]) {
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

test.after(() => fs.rmSync(bundleDir, { recursive: true, force: true }));
