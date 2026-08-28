/**
 * One way to `ogk-data`.
 *
 * Phase 4 of refactoring.md removed the second one. `OGBeyondInfinity.init()` used
 * to do `this.json = OGBIData.json` and hand that alias to everything downstream,
 * so 755 sites mutated the store behind the singleton's back and each needed an
 * explicit `this.saveData()` afterwards. Two ways in meant two contracts, and the
 * alias broke in two silent ways:
 *
 * - A module extracted in Phase 3 that still said `this.json` was reading a
 *   property of whatever object it happened to be called on. In
 *   `ctxpage/pantry/index.js` that was `undefined`, and the backup upload shipped
 *   an empty basket without failing - see `test/ctxpage/pantry/pantry.test.js`.
 * - `this.json.x = v; this.saveData()` looks like the setter but is not: it works
 *   only because `saveData()` reserialized the whole blob, which is exactly the
 *   write the `OGBIData` accessors exist to bound.
 *
 * Neither is visible to lint, to the bundler or to any behavioural test, so the
 * rule is enforced by reading the source. `src/ctxcontent/data-helper.js` keeps
 * its own `saveData()`: that is a different class over `chrome.storage.local` in
 * the content context, nothing to do with this store.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const srcRoot = path.join(projectRoot, "src");

/** Vendored third-party code is not ours to hold to this rule. */
const IGNORED_DIRS = new Set(["libs"]);

/** The content-context store, which has its own unrelated `saveData()`. */
const DATA_HELPER = path.join("ctxcontent", "data-helper.js");

function jsFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      found.push(...jsFiles(path.join(dir, entry.name)));
    } else if (entry.name.endsWith(".js")) {
      found.push(path.join(dir, entry.name));
    }
  }
  return found;
}

/**
 * Source lines that are not comments.
 *
 * The header of `util/gameFormulas.js` explains the very rename this file guards,
 * so a naive substring search over the whole text reports its own documentation.
 */
function codeLines(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const out = [];
  let inBlock = false;
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (inBlock) {
      if (trimmed.includes("*/")) inBlock = false;
      return;
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlock = true;
      return;
    }
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    out.push({ number: index + 1, text: line, file });
  });
  return out;
}

const files = jsFiles(srcRoot);
const allCode = files.flatMap(codeLines);

test("no module reaches the page store through a `this.json` alias", () => {
  const offenders = allCode
    .filter(({ text }) => /\bthis\s*\??\.\s*json\b/.test(text))
    .map(({ file, number, text }) => `${path.relative(projectRoot, file)}:${number}: ${text.trim()}`);

  assert.deepEqual(offenders, [], `use OGBIData - the alias is gone:\n${offenders.join("\n")}`);
});

test("the page store is persisted through OGBIData, not through a `saveData()` method", () => {
  const offenders = allCode
    .filter(({ file }) => !file.endsWith(DATA_HELPER))
    .filter(({ text }) => /\bthis\s*\??\.\s*saveData\s*\(/.test(text))
    .map(({ file, number, text }) => `${path.relative(projectRoot, file)}:${number}: ${text.trim()}`);

  assert.deepEqual(offenders, [], `use OGBIData.Save() or a setter:\n${offenders.join("\n")}`);
});

test("a setter is never followed by a redundant Save()", () => {
  const source = fs.readFileSync(path.join(srcRoot, "util", "OGBIData.js"), "utf8");
  const setters = new Set([...source.matchAll(/^\s*set (\w+)\(/gm)].map((m) => m[1]));
  assert.ok(setters.size > 20, "the setter list was not found - did OGBIData change shape?");

  const offenders = [];
  for (const file of files) {
    const lines = codeLines(file);
    lines.forEach((line, index) => {
      const written = line.text.match(/^\s*OGBIData\.(\w+)\s*=[^=]/);
      if (!written || !setters.has(written[1])) return;
      // The setter has already written the whole blob by the time the next
      // statement runs, so a Save() right behind it doubles the cost of the
      // change for nothing.
      const next = lines[index + 1];
      if (next && next.text.includes("OGBIData.Save()")) {
        offenders.push(`${path.relative(projectRoot, file)}:${next.number}: Save() after OGBIData.${written[1]} =`);
      }
    });
  }

  assert.deepEqual(offenders, [], offenders.join("\n"));
});
