/**
 * Guards for Phase B of `refactoring-new.md`: `src/util/` dissolved into
 * `game/`, `ogame/`, `store/`, `ui/`, `format/`, `platform/`, `integrations/`,
 * sorted by what a file is *about* rather than dumped in one 81-file catch-all.
 *
 * Two things break silently if this phase regresses and nothing else here would
 * notice: a new file lands back in a `util`-shaped catch-all folder, or a module
 * stops being reachable from any entry point and quietly rots - which is exactly
 * how Phase A found 513 dead lines nobody had touched in years
 * (`ctxcontent/parsers/universe.data.js` and friends). Both are checked here by
 * reading the source, the same way `test/src-references.test.js` and
 * `test/ctxpage/module-wiring.test.js` do for their own invariants.
 *
 * What this deliberately does NOT assert: that `game/` is pure (importing nothing
 * from `store/`/`ctxpage/`/`format/`). Several of its modules read `OGBIData`
 * directly (`calcNeededShips.js`, `gameFormulas.js`) or a page setting
 * (`standardUnit.js` reads `ctxpage/conf-options.js`) - making that a hard
 * boundary is a real, separate refactor (parameterising those reads instead of
 * reaching for the singleton), not a side effect of a file move. Recorded here so
 * it is a decision, not a gap nobody noticed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const srcRoot = path.join(projectRoot, "src");

/** Names a `util`-shaped catch-all reads as - the thing this phase got rid of. */
const FORBIDDEN_DIR_NAMES = new Set(["util", "utils", "helpers", "common", "shared", "misc", "lib"]);

/** Vendored third party, not ours to name or to reach from an entry point. */
const IGNORED_DIRS = new Set(["libs"]);

const ENTRY_POINTS = ["ogCore.js", path.join("ctxcontent", "index.js"), "main.js", "background.js"];

function allJsFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      found.push(...allJsFiles(path.join(dir, entry.name)));
    } else if (entry.name.endsWith(".js")) {
      found.push(path.join(dir, entry.name));
    }
  }
  return found;
}

function allDirs(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    found.push(full);
    found.push(...allDirs(full));
  }
  return found;
}

/** Every relative import/export specifier and dynamic import() in a file. */
function relativeSpecifiers(source) {
  const specs = [];
  const re = /(?:import|export)(?:[^'"]*?\bfrom\s*)?\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of source.matchAll(re)) {
    const spec = m[1] ?? m[2];
    if (spec && (spec.startsWith("./") || spec.startsWith("../"))) specs.push(spec);
  }
  return specs;
}

test("no directory under src/ reads as a util-shaped catch-all", () => {
  const offenders = allDirs(srcRoot)
    .map((d) => path.relative(srcRoot, d).replaceAll("\\", "/"))
    .filter((rel) => FORBIDDEN_DIR_NAMES.has(path.basename(rel)));

  assert.deepEqual(
    offenders,
    [],
    `sort by what the code is about, not into a dumping ground:\n${offenders.join("\n")}`
  );
});

test("every file under src/ is reachable from an entry point", () => {
  const seen = new Set();

  function visit(absFile) {
    const real = path.resolve(absFile);
    if (seen.has(real) || !fs.existsSync(real)) return;
    seen.add(real);
    const source = fs.readFileSync(real, "utf8");
    for (const spec of relativeSpecifiers(source)) {
      visit(path.resolve(path.dirname(real), spec));
    }
  }

  for (const entry of ENTRY_POINTS) visit(path.join(srcRoot, entry));

  const all = new Set(allJsFiles(srcRoot).map((f) => path.resolve(f)));
  const unreachable = [...all]
    .filter((f) => !seen.has(f))
    .map((f) => path.relative(projectRoot, f).replaceAll("\\", "/"))
    .sort();

  assert.deepEqual(
    unreachable,
    [],
    `unreachable from every entry point - dead weight nobody will notice until it is audited again:\n${unreachable.join(
      "\n"
    )}`
  );
});

test("platform/ imports nothing outside itself", () => {
  // The one folder this phase can honestly call pure: it is infrastructure
  // (logging, timers, the content/page bridge, the DOM-ready guard) with no
  // OGame or OGBI domain knowledge, and importing back into game/store/ctxpage
  // would be a dependency the wrong way round.
  const offenders = [];
  const platformDir = path.join(srcRoot, "platform");

  for (const file of allJsFiles(platformDir)) {
    const source = fs.readFileSync(file, "utf8");
    for (const spec of relativeSpecifiers(source)) {
      const target = path.resolve(path.dirname(file), spec);
      if (!target.startsWith(platformDir + path.sep)) {
        offenders.push(`${path.relative(projectRoot, file).replaceAll("\\", "/")} -> ${spec}`);
      }
    }
  }

  assert.deepEqual(offenders, [], `platform/ pulled in a domain dependency:\n${offenders.join("\n")}`);
});
