/**
 * Static guards for the modules Phase 3 of `refactoring.md` pulled out of `ogCore.js`.
 *
 * Both describe failures nothing else here sees: the bundle builds, ESLint is silent
 * (`no-undef` is off for this codebase), and the module only breaks when a user opens
 * the page it draws. Both caught real defects during the cut.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");

/**
 * The files Phase 3 created, listed rather than globbed.
 *
 * `ctxpage/` also holds modules that were never part of OGBeyondInfinity - the message
 * analyzers, `conf-options.js`, `wide-layout.js` - and the legacy `messages-analyzer`,
 * which is still invoked as `ctxMessageAnalyzer.call(this)` and therefore uses `this`
 * on purpose. Globbing would sweep those in and make both guards meaningless.
 */
const PHASE_3_MODULES = [
  "src/ctxpage/empire/index.js",
  "src/ctxpage/empire/lifeform.js",
  "src/ctxpage/empire/production.js",
  "src/ctxpage/empireOverview/resourceDetail.js",
  "src/ctxpage/empireOverview/tables.js",
  "src/ctxpage/eventbox/index.js",
  "src/ctxpage/keyboard/index.js",
  "src/ctxpage/pageTweaks/index.js",
  "src/ctxpage/pantry/index.js",
  "src/ctxpage/stalk/index.js",
  "src/ctxpage/empireOverview/index.js",
  "src/ctxpage/fleetdispatch/index.js",
  "src/ctxpage/fleetdispatch/betterFleetDispatcher.js",
  "src/ctxpage/fleetdispatch/customMissions.js",
  "src/ctxpage/fleetdispatch/expedition.js",
  "src/ctxpage/stats/boxes.js",
  "src/ctxpage/stats/combatStats.js",
  "src/ctxpage/stats/discoveryStats.js",
  "src/ctxpage/stats/expeditionStats.js",
  "src/ctxpage/stats/generalStats.js",
  "src/ctxpage/stats/graphs.js",
  "src/ctxpage/stats/minesStats.js",
  "src/ctxpage/stats/roiStats.js",
  "src/ctxpage/fleetdispatch/keepOnPlanet.js",
  "src/ctxpage/galaxy/index.js",
  "src/ctxpage/galaxy/renderPlanet.js",
  "src/ctxpage/planetbar/index.js",
  "src/ctxpage/settings/index.js",
  "src/ctxpage/stats/index.js",
  "src/ctxpage/technoDetail/index.js",
  "src/integrations/dataHelper.js",
  "src/platform/debounce.js",
  "src/game/gameFormulas.js",
  "src/ogame/ownPlanets.js",
  "src/store/usage.js",
  "src/integrations/mmorpgStats.js",
  "src/ui/tabs.js",
];

/** Comments are prose; a guard that scans them reports words, not code. */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Every name a file brings in or declares for itself, under any of the forms used here. */
function ownBindings(source) {
  const own = new Set();
  for (const m of source.matchAll(/import\s*\{([^}]*)\}/g))
    m[1].split(",").forEach((x) =>
      own.add(
        x
          .trim()
          .split(/\s+as\s+/)
          .pop()
      )
    );
  for (const m of source.matchAll(/import\s+(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)/g)) own.add(m[1]);
  for (const m of source.matchAll(/(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)) own.add(m[1]);
  // Parameters shadow anything of the same name, so a match on one says nothing.
  for (const m of source.matchAll(/\(([^)]*)\)\s*(?:=>|\{)/g))
    m[1].split(",").forEach((a) => {
      const name = a
        .trim()
        .split(/[=:\s]/)[0]
        .replace(/^\.\.\./, "");
      if (/^[A-Za-z_$][\w$]*$/.test(name)) own.add(name);
    });
  return own;
}

/**
 * A binding that stayed behind in `ogCore.js` while its users moved out is a
 * `ReferenceError` the first time the moved code runs. Twelve existed at once during
 * the cut - `PLAYER_CLASS_*`, the expedition tier tables, `CARGO_SHIP_IDS`,
 * `CLAIM_FREE`, `isOwnPlanet`, `debounce`, `logger` - and every one of them built,
 * linted and bundled cleanly.
 */
test("no extracted module uses a binding that only ogCore.js declares", () => {
  const ogCore = withoutComments(read("src/ogCore.js"));

  // Module-scope declarations only: no indentation, so not class members.
  const ogCoreOnly = new Set();
  for (const match of ogCore.matchAll(/^(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm)) {
    ogCoreOnly.add(match[1]);
  }

  const offenders = [];
  for (const file of PHASE_3_MODULES) {
    const source = withoutComments(read(file));
    const own = ownBindings(source);

    for (const name of ogCoreOnly) {
      if (own.has(name)) continue;
      // Not a property access, not part of a longer identifier, not an object key.
      if (new RegExp(`(?<![.\\w$'"\`])\\b${name}\\b\\s*(?![:\\w$])`).test(source)) {
        offenders.push(`${file}: ${name}`);
      }
    }
  }

  assert.deepEqual(offenders, [], "these are ReferenceErrors waiting for the page to open");
});

/**
 * `this` inside an extracted module is never the page controller - the controller
 * hands modules a plain `context` object instead. Where `this` does appear, it belongs
 * to one of OGame's own objects, because the function around it was assigned onto that
 * object.
 *
 * Those reads are listed by name. The list exists because rewriting one of them to
 * `context.` looks exactly like every other substitution and silently changes what the
 * code reads - which happened once, to `this.technologyDetailsEndpoint` inside
 * `technologyDetails.show`.
 */
const OGAME_BOUND_READS = {
  // FleetDispatcher.prototype.submitFleet2 and the callbacks it hands to jQuery.
  "src/ctxpage/fleetdispatch/index.js": [
    "appendCargoParams",
    "appendPrioParams",
    "appendShipParams",
    "appendTargetParams",
    "appendTokenParams",
    "displayErrors",
    "getHoldingTime",
    "loca",
    "locadyn",
    "lootFoodOnAttack",
    "mission",
    "retreatAfterDefenderRetreat",
    "sendFleetUrl",
    "speedPercent",
    "startLoading",
    "stopLoading",
    "submitFleet2",
    "union",
    "updateToken",
  ],
  // technologyDetails.show
  "src/ctxpage/technoDetail/index.js": ["technologyDetailsEndpoint"],
};

test("the only `this` left in an extracted module belongs to an OGame object", () => {
  const unexpected = [];

  for (const file of PHASE_3_MODULES) {
    const allowed = new Set(OGAME_BOUND_READS[file] || []);
    const lines = withoutComments(read(file)).split("\n");

    for (let i = 0; i < lines.length; i++) {
      for (const match of lines[i].matchAll(/\b(?:this|that)\.([A-Za-z_$][\w$]*)/g)) {
        if (!allowed.has(match[1])) unexpected.push(`${file}:${i + 1} ${match[0]}`);
      }
      // Computed access hides the same coupling from the dotted scan above: `FPSLoop`
      // survived the cut as `this[callbackAsString](params)` and threw
      // "Cannot read properties of undefined (reading 'checkDebris')" on every galaxy view.
      for (const match of lines[i].matchAll(/\b(?:this|that)\s*\[/g)) {
        unexpected.push(`${file}:${i + 1} ${match[0].trim()}`);
      }
    }
  }

  assert.deepEqual(unexpected, [], "a module reaching through `this` is still coupled to the controller");
});

/**
 * Every relative specifier in a file, static or dynamic.
 *
 * Both forms have to count. Since Phase 5 of refactoring.md the page-specific
 * modules are reached through `import("./ctxpage/...")` rather than a top-level
 * `import ... from`, and a walk that only followed the static form would report
 * every split-out page as dead - which is the exact opposite of the truth.
 *
 * @param {string} source a file with its comments already stripped
 * @returns {string[]}
 */
function specifiers(source) {
  const found = [];
  for (const m of source.matchAll(/from\s+"([^"]+)"/g)) found.push(m[1]);
  for (const m of source.matchAll(/\bimport\s*\(\s*"([^"]+)"\s*\)/g)) found.push(m[1]);
  return found.filter((specifier) => specifier.startsWith("."));
}

/**
 * A module nobody imports is dead weight that still looks alive: the file is there,
 * ESLint is happy, and the page it draws simply never appears. It happened once, when
 * the statistics tabs were split into their own files and the entry point kept
 * referencing them as values (`minesStats` rather than `minesStats()`) - the
 * bundle silently shrank by 109 KB and six tabs stopped existing.
 */
test("every extracted module is reachable from ogCore.js", () => {
  const seen = new Set();
  const queue = ["src/ogCore.js"];

  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);

    for (const specifier of specifiers(withoutComments(read(file)))) {
      queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)));
    }
  }

  const unreachable = PHASE_3_MODULES.filter((file) => !seen.has(file));
  assert.deepEqual(unreachable, [], "nothing imports these, so their pages are gone");
});

/**
 * The chunk boundaries themselves.
 *
 * A dynamic import only pays for itself while nothing in the core graph reaches the
 * same module statically: rollup runs with `treeshake: false`, so one static edge
 * from core pulls the whole module - and, through a barrel's re-exports, everything
 * it re-exports - straight back into the boot bundle. That is not a build error and
 * not a runtime error. The chunk simply stops existing and the page bundle quietly
 * grows again, which is exactly how `probingWarning()` kept the 43 KB settings
 * dialog and `openPlanetList()` kept the 185 KB fleet-dispatch page on the boot
 * path before Phase 5 pulled them into files of their own.
 */
test("nothing in the core graph statically imports a module meant to be a chunk", () => {
  // The dynamic-import targets, as `ogCore.js` writes them.
  const dynamic = new Set(
    [...withoutComments(read("src/ogCore.js")).matchAll(/\bimport\s*\(\s*"([^"]+)"\s*\)/g)].map((m) =>
      path.posix.normalize(path.posix.join("src", m[1]))
    )
  );
  assert.ok(dynamic.size >= 6, `only ${dynamic.size} chunk entries - did the split get reverted?`);

  // Walk the graph reachable from ogCore.js through STATIC edges only, stopping at
  // nothing: if a chunk entry turns up in here, it is in the core bundle.
  const seen = new Set();
  const queue = ["src/ogCore.js"];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);

    const source = withoutComments(read(file));
    for (const m of source.matchAll(/from\s+"([^"]+)"/g)) {
      if (!m[1].startsWith(".")) continue;
      queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1])));
    }
  }

  const leaked = [...dynamic].filter((entry) => seen.has(entry));
  assert.deepEqual(leaked, [], "these are loaded as chunks but a core module also imports them statically");
});
