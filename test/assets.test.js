/**
 * The files `global.css` and the two manifests point at.
 *
 * A missing asset is silent everywhere it matters: a `background: url()` that 404s
 * paints nothing, and the browser reports it in a devtools panel nobody has open while
 * playing. Both branding files were replaced at once here - the wordmark that still
 * read "OGAME INFINITY" and the emblem behind it - which is exactly the change that
 * leaves a stale reference behind.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(repoRoot, "src");

/** Every extension-relative URL in the stylesheet, as a repo path. */
function stylesheetAssets() {
  const css = fs.readFileSync(path.join(srcRoot, "global.css"), "utf8");
  const found = new Set();

  // `chrome-extension://__MSG_@@extension_id__/<path>` - packaging.sh rewrites the
  // scheme for Firefox, so the path after the host is what has to exist.
  for (const match of css.matchAll(/(?:chrome|moz)-extension:\/\/[^/]+\/([^"')\s]+)/g)) {
    found.add(match[1]);
  }

  return [...found];
}

test("every asset global.css references exists", () => {
  const missing = stylesheetAssets().filter((asset) => !fs.existsSync(path.join(srcRoot, asset)));

  assert.deepEqual(missing, []);
});

test("both manifests point at icons that exist", () => {
  const missing = [];

  for (const name of ["manifest.json", "manifest-firefox.json"]) {
    const manifest = JSON.parse(fs.readFileSync(path.join(srcRoot, name), "utf8"));

    // `icons`, plus the toolbar button's own set, plus Firefox's sidebar/page action.
    const sets = [manifest.icons, manifest.action?.default_icon, manifest.browser_action?.default_icon];

    for (const set of sets) {
      for (const file of Object.values(set || {})) {
        if (!fs.existsSync(path.join(srcRoot, file))) missing.push(`${name}: ${file}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});

/**
 * The manifest icons are generated - `node scripts/make-logo.mjs` rasterises the same
 * geometry the SVGs draw. Chrome's `icons` key will not take an SVG, so the two forms
 * have to be kept in step by hand; this at least catches the emblem being deleted or
 * emptied without the script being run.
 */
test("the generated icons are real PNGs", () => {
  for (const size of [128, 512]) {
    const file = path.join(srcRoot, "assets", "images", `logo${size}.png`);
    const head = fs.readFileSync(file).subarray(0, 8);

    assert.deepEqual([...head], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `logo${size}.png is not a PNG`);
    assert.ok(fs.statSync(file).size > 1000, `logo${size}.png is suspiciously small`);
  }
});

test("the wordmark carries this fork's name, not upstream's", () => {
  // A fork must not present another project's identity as its own (AGENTS.md 0), and
  // the settings dialog is the most visible place it could. The mark is inline SVG
  // built by ui/wordmark.js, so the words live in the source, not in an asset file.
  const source = fs.readFileSync(path.join(srcRoot, "ui", "wordmark.js"), "utf8");
  // Anchored on the row shape, not the bare word - the docblock above it quotes two of
  // them while explaining why the three lines are measured separately.
  const words = [...source.matchAll(/\["(OGAME|BEYOND|INFINITY)",/g)].map((match) => match[1]);

  assert.deepEqual(words, ["OGAME", "BEYOND", "INFINITY"]);
});

/**
 * The readme shows the emblem the extension actually ships, by repo path. A rename in
 * `src/assets/images/` would leave a broken image on the project's front page, which is
 * the one place nobody on the team looks with fresh eyes.
 */
test("every local image the readme shows exists", () => {
  const readme = fs.readFileSync(path.join(repoRoot, "readme.md"), "utf8");
  const missing = [];

  for (const match of readme.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)) {
    const src = match[1];
    // Shields.io badges and anything else remote is not this test's business.
    if (/^https?:/.test(src)) continue;

    if (!fs.existsSync(path.join(repoRoot, src))) missing.push(src);
  }

  assert.deepEqual(missing, []);
});
