/**
 * A static guard for the Phase 3 cuts: no `this.foo()` in `ogCore.js` may point at a
 * method that no longer exists on the class.
 *
 * This is not a style check. When a method moves into a page module, every call site
 * has to move with it, and a missed one is invisible: ESLint has `no-undef` off and
 * cannot resolve members anyway, the bundle still builds, and the failure is a
 * `TypeError` on whichever page happens to call it - a page no test opens.
 *
 * It has already caught two: `that.createDOM(` survived the Phase 1 rewrite of
 * `this.createDOM(` and had been dead ever since, and `this.getLocalStorageSize()` was
 * left behind in `start()` when the settings dialog moved out.
 *
 * The source is read as text rather than imported: the question is what the file
 * says, not what it does.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const source = fs.readFileSync(path.join(projectRoot, "src", "ogCore.js"), "utf8");
const lines = source.split("\n");

/** Every name the class defines as a method, including the private ones. */
function definedMethods() {
  const names = new Set();
  for (const line of lines) {
    const match = /^ {2}(?:async )?([A-Za-z_$#][\w$]*)\(/.exec(line);
    if (match) names.add(match[1]);
  }
  return names;
}

/** Every name assigned onto the instance somewhere in the file. */
function assignedFields() {
  const names = new Set();
  for (const match of source.matchAll(/this\.([A-Za-z_$][\w$]*)\s*=/g)) names.add(match[1]);
  return names;
}

/**
 * What `readPageContext()` puts on the instance via `Object.assign`. Listed here
 * rather than parsed, so that dropping one of them from the seam shows up as a
 * failure here too.
 */
const FROM_PAGE_CONTEXT = [
  "playerId",
  "commander",
  "rawURL",
  "page",
  "playerClass",
  "mode",
  "planetList",
  "homePlanetCoords",
  "isMobile",
  "universe",
  "universeUrl",
  "universeName",
  "universeDomain",
  "geologist",
  "technocrat",
  "admiral",
  "engineer",
  "allOfficers",
  "current",
];

test("every this.foo() in ogCore.js resolves to something the class has", () => {
  const known = new Set([...definedMethods(), ...assignedFields(), ...FROM_PAGE_CONTEXT]);

  const dangling = [];
  for (let i = 0; i < lines.length; i++) {
    for (const match of lines[i].matchAll(/\b(?:this|that)\.([A-Za-z_$][\w$]*)\(/g)) {
      if (!known.has(match[1])) dangling.push(`${match[1]}() at ogCore.js:${i + 1}`);
    }
  }

  assert.deepEqual(dangling, [], "these calls would throw TypeError at run time");
});

test("readPageContext still provides every field this guard assumes", async () => {
  // If the seam stops setting one of these, the list above would quietly start
  // excusing a genuinely dangling call.
  const { readPageContext } = await import("../src/ogame/pageContext.js");
  const provided = new Set(
    String(readPageContext)
      .split("\n")
      .flatMap((line) => {
        const match = /^\s{4}([A-Za-z_$][\w$]*)[,:]/.exec(line);
        return match ? [match[1]] : [];
      })
  );

  const missing = FROM_PAGE_CONTEXT.filter((name) => !provided.has(name));
  assert.deepEqual(missing, [], "readPageContext no longer returns these");
});
