# Testing

Repo had no tests before this suite. Doc cover setup, coverage, how to add.

```bash
make test          # or: npm test
make test-watch    # re-run on change
make coverage      # run + print a per-file coverage table
```

Tests run in CI on every push to `master` and every pull request (`.github/workflows/test.yml`).

---

## Stack

| Piece      | Choice                  | Why                                                                                        |
| ---------- | ----------------------- | ------------------------------------------------------------------------------------------ |
| Runner     | `node:test` (built in)  | No new runtime dependency. Native ESM, watch mode, coverage included.                      |
| Assertions | `node:assert/strict`    | Built in.                                                                                  |
| DOM        | `jsdom` (devDependency) | Only added dependency. Most of `src/` need real `document`, `CustomEvent`, `localStorage`. |

Consequences, know before start:

- Repo now `"type": "module"`. Node load `src/**/*.js` as ES modules — same as browser already did via `<script type="module">`. One CommonJS file, `.eslintrc.js`, renamed `.eslintrc.cjs`.
- `npm test` run with `--experimental-test-module-mocks`, enable `mock.module()`. Used where module-level singleton cannot vary otherwise (see `test/util/numbers.test.js`).
- Extension build untouched: `packaging.sh` and `scripts/build-unpacked.mjs` copy `src/`, never `node_modules/` or `test/`.

## Layout

```
test/
  helpers/globals.js          the harness (see below)
  util/*.test.js              src/game, src/ogame, src/store, src/ui, src/format, src/platform, src/integrations
  ctxpage/*.test.js           src/ctxpage
  ctxcontent/*.test.js        src/ctxcontent
```

One test file per source module, named after it. Files run in **separate processes** — module-level state never leak between files, only within one.

`test/util/` predates Phase B of `refactoring-new.md`, which dissolved `src/util/` into the seven
folders above; the test directory kept its name rather than splitting to match, since moving ~30 test
files bought nothing beyond mirroring a folder name. A test's location still says nothing you can't
get from its import line.

## The harness: `test/helpers/globals.js`

`src/` written against browser with OGame already loaded, read globals nothing declare. `setupBrowser()` install them, return `cleanup()` that restore previous values:

```js
import { setupBrowser } from "../helpers/globals.js";

const browser = setupBrowser({ chrome: true, gameLang: "de", ogameVersion: "13.0.0" });
try {
  // document, window, navigator, localStorage, CustomEvent, DOMParser,
  // LocalizationStrings and (optionally) chrome are live here
} finally {
  browser.cleanup();
}
```

Options: `html`, `url`, `userAgent`, `gameLang`, `ogameVersion`, `localization` (`LOCALIZATION_DE` / `LOCALIZATION_EN`), `chrome`.

`chrome: true` mean **content-script context**. Install `chrome` stub whose `storage.local` is real Map supporting callback and promise form. `chrome: false` (default) mean **page context**, delete `window.chrome` — what `pageContextInit()` check for. Get this wrong = most common reason test fail for wrong reason.

Stub expose `chrome._store` (the Map) and `chrome._calls` (call counters) for assertions.

`setupBrowser()` deliberately **not** call `window.close()`. Modules like `src/platform/fetch.js` build `DOMParser` at import time, hold it for process lifetime. Close the window it came from = null-dereference in later suite.

### `importFresh(specifier)`

Load module under cache-busting URL so module-level singleton re-evaluate. Needed for `OGBIData`, `OgamePageData`, `bridge.js` — behaviour depend on state captured at import time.

**Use only when test is about construction.** Two reasons:

1. Defeats point of singleton — everywhere else, shared instance is more faithful model of real page.
2. Node coverage reporter merge every URL for a path into one row, keep last evaluation seen. One `importFresh()` make whole module look barely covered. `src/store/OGBIData.js` report low % for exactly this reason; accessors in fact exercised exhaustively by `test/util/OGIData.test.js`. Construction tests live in `OGIData.construction.test.js`, migration tests (the hot/cold split, `refactoring-new.md` Phase C) in `OGIData.migration.test.js` — same reason, kept apart. Treat that row as artefact, not gap.

Where singleton can reset through own API, prefer that — `OGBIData.json = {…}` is full reset, keep report honest.

## What is covered

`make coverage` print current table. As of writing: **650 tests**, 59.2% lines / 70.4% branches / 49.7% functions overall. Headline percentage not meaningful alone — the extracted page modules are in the denominator and almost none of them has behavioural coverage.

`refactoring-new.md` Phase D covered the five worst boot-path files (all ran on every page load at 3-19% before) plus `SpyMessagesAnalyzer.js`/`SpyReport.js` (docs' own "where most bug reports land"): `resourceDetail.js` 3→98%, `production.js` 4→95%, `stalkPanel.js` 7→79%, `fleetMovements.js` 9→99% (see next paragraph), `needs.js` 19→92%, `SpyMessagesAnalyzer.js` 10→71%, `SpyReport.js` 13→89%. The overall >70%-lines exit criterion is not met by this alone - Phase D2 ("restliche Abdeckung") is explicitly ongoing, not a one-shot target.

`fleetMovements.js` is the sharpest example of the artefact below: `make coverage` still reports 9% for it because `test/util/page-context-boot.test.js` (a pure module-evaluation smoke test, alphabetically after `test/ogame/`) re-imports it and "wins" the merge. Isolated (`node --test --experimental-test-coverage test/ogame/fleetMovements*.test.js`) it measures 98.68%. Same artefact as `OGBIData.js` above - trust the isolated number.

| Area              | Module                                                                                                  | Notes                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Serialisation     | `store/json.js`                                                                                         | Map/Set encoding, `extractJSON`, native round-trip. 96%                                                                                                                                                      |
| Coordinates       | `ogame/coordinates.js`                                                                                  | Encoding, ordering, type handling. 99%                                                                                                                                                                       |
| Costs             | `game/fleetCost.js`, `defenceCost.js`, `shipCosts.js`, `defenceCosts.js`, `recyclingYieldCalculator.js` | Includes consistency check: every ship/defence has cost entry and vice versa. 100%                                                                                                                           |
| Numbers           | `format/numbers.js`, `text.js`                                                                          | Both locales, unit suffixes, parse/format round-trip. 83% / 100%                                                                                                                                             |
| Context bridge    | `platform/bridge.js`                                                                                    | Full request/response round-trip across both contexts, error paths, concurrency, Firefox `cloneInto`.                                                                                                        |
| Context detection | `platform/runContext.js`                                                                                | Chrome/Edge/Firefox, script injection. 96%                                                                                                                                                                   |
| Page storage      | `store/OGBIData.js`                                                                                     | Write-through contract, generic check that **every** setter persists. Hot/cold blob split (`ogk-data` / `ogk-history`, Phase C): dirty-flag `Save()`, migration from a pre-split blob incl. abort mid-write. |
| Store access      | `src/**` (static)                                                                                       | Phase 4 rule: no `this.json` alias, no `saveData()` method, no `Save()` behind a setter.                                                                                                                     |
| Version gate      | `ogame/pageData.js`                                                                                     | `isAtLeast_13_0_0` across version shapes.                                                                                                                                                                    |
| Options           | `ctxpage/conf-options.js`                                                                               | Defaults, deep merge, proxy guards.                                                                                                                                                                          |
| Content storage   | `ctxcontent/services/universe.storage.js`                                                               | Key namespacing, Map/Set round-trip. 95%                                                                                                                                                                     |
| API parsers       | `ctxcontent/parsers/universe.{planets,players,alliances}.js`                                            | XML fixtures, `fetch` stubbed.                                                                                                                                                                               |

| Page context seam | `ogame/pageContext.js` | Everything `OGBeyondInfinity` constructor read out of DOM. 100% |
| Calculation core | `game/gameFormulas.js` | `consumption`, `minesProduction`, `research`, `building`, five `roi*` functions, `getBestRoi`. Characterisation only: values recorded before the Phase 3 move and unchanged after it. |
| Service worker | `background.js` | Persistence across worker restart, alarm scheduling, notification clicks, per-domain sync. 81% |
| Message analyzers | `ctxpage/messages/analyzer/*` | Tab dispatch for all five; parsing paths for harvest, trade, expedition fights. |
| Pantry backup | `ctxpage/pantry/index.js` | What the `post` upload actually puts in the basket, plus the timestamp it records. |
| Bridge token | `main.js` vs `platform/bridge.js` | The two hand-copied `createCallbackToken()` bodies compared as source. |
| Ship table | `ctxpage/fleetdispatch/shipData.js` | Table already there / arrives late / empty / never arrives, plus the one-write rule. |

**Fixtures** live in `test/fixtures/`. `ogamePage.js` build OGame 13 page fragments
(planet bar, officer bar, meta tags) out of named pieces, not saved dump: real
overview page is ~400 KB markup and hide which attribute a test depend on.
Every selector in there is one `src/` read. **OGame 13 markup only** - v12
support dropped, no second variant to keep in step.

**Reaching into `ogCore.js`.** Module export `OGBeyondInfinity` for tests only, and
`test/bundle.test.js` assert this stay the _only_ export of page bundle.
Importing module run its boot IIFE, so test file `setupBrowser()` URL use
`component=intro` - one of three pages IIFE bail out on before touching
DOM or network.

Not covered, rough order of value:

- **The extracted page modules** (`ctxpage/stats/`, `ctxpage/fleetdispatch/`, `ctxpage/galaxy/`, …). Phase 3 moved ~17k lines out of `ogCore.js`; almost none has behavioural coverage. `test/ctxpage/module-wiring.test.js` guards the wiring statically — module reachable, no binding left behind in `ogCore.js`, `this` only where an OGame object owns it — but nothing opens the pages they draw.
- **`SpyMessagesAnalyzer`** (1k lines) and **`ExpeditionMessagesAnalyzer`** — only `support()` and `clean()` covered. Parsing paths need full spy-report and expedition-message fixtures.
- **`ctxcontent/data-helper.js`** — `getPlayer()`, `filter()`, `scan()`. `update()` TTL/`loading` behaviour now in `test/ctxcontent/data-helper.update.test.js`.
- `format/i18n/translate.js`, `ctxpage/stalk/stalkPanel.js`, `ogame/fleetMovements.js`, `ctxpage/planetbar/needs.js`.

**Two of these tests read source, not behaviour.** `test/util/store-access.test.js` and
`test/util/callback-token-twins.test.js` scan `src/` as text. That is deliberate: the
failures they guard against - a `this.json` alias resolving to `undefined` in a module,
the two token generators drifting apart - break no build, no lint and no bundle, and
surface only as a feature quietly doing nothing on a real page. Same reasoning as
`test/ctxpage/module-wiring.test.js` and `test/src-references.test.js`.

## Conventions

**Name the behaviour, not the function.** `"a player without an alliance attribute gets null, not NaN"` beat `"toPlayerResponse works"`. Name is what future reader see when it fail.

**Test observable behaviour through public export.** Nothing here reach into private state.

**`KNOWN BUG:` / `TRAP:` prefixes.** Several tests assert behaviour that is wrong but currently shipped. Named with one of those prefixes, carry comment explaining what should happen instead. Exist so fix register as _deliberate_ change, not silent one — when you fix bug, update test and drop prefix.

Current entries — as of `refactoring-new.md` Phase A, only the one genuine `TRAP:`
remains; every `KNOWN BUG:` in the suite has been fixed and its prefix dropped:

| Test                                      | Module        | Defect                                                                        |
| ----------------------------------------- | ------------- | ----------------------------------------------------------------------------- |
| mutating a getter result does not persist | `OGBIData.js` | Contract trap, not bug — but failure is silent. Flagged in review on PR #546. |

**Fixed since, prefix dropped** — all were `KNOWN BUG:` in this table, now ordinary
tests. `pageContextRequest` has a 30 s deadlock guard instead of hanging forever, and
corrupt `ogk-data` starts an empty store (moves the unreadable value to
`ogk-data-corrupt`) instead of throwing at import time. `refactoring-new.md` Phase A
fixed the rest:

Phase D (coverage-only) found 3 more while writing tests for previously near-zero-coverage
files, and — although Phase D is supposed to be coverage-only — they were fixed immediately
afterward rather than left standing:

- `stalkPanel.js`'s `update()` compared `mainId` (a number, `Math.min(...)`) against `planet.id`
  (a string everywhere it's actually populated) with `===` — never matched, so no planet was ever
  flagged `ogl-main`. Fixed: `parseFloat(planet.id) === mainId`.
- `fleetMovements.js` read deuterium via `fleetDataRow.slice(-1, 0)` — the end argument is the
  literal index `0`, not "one past the start", so start > end and the call always returned `[]`;
  deuterium always read as 0 without lifeforms. Metal/crystal didn't cross zero, so they were
  unaffected. Fixed: `fleetDataRow.at(row)`, which handles a negative index directly, for all three.
- `SpyMessagesAnalyzer.js`'s danger check compared against the literal `"No Data"` (capital D);
  `SpyReport.js` only ever produces `"No data"` (lowercase). The riskiest report (fleet/defense
  unknown) rendered identically to a harmless 0/0 one, and as a blank cell rather than a label
  (`toFormattedNumber("No data", ...)` returns `undefined` for non-numeric input). Fixed: match the
  real sentinel string, and special-case it before formatting so the cell shows "No data".

- `numbers.js`'s precision-0 handling (`precision ?? 0`, not `precision ? precision : 0`).
- The pretty-printed-XML and HTTP-error-response crashes in `ctxcontent/parsers/*`
  (`doc.childNodes` → `doc.children`; `fetchXml()` now checks `response.ok` and the
  DOM parser's `<parsererror>` node).
- `roiMine`'s cost loop (summed `lvl`, not `tolvl` five times).
- `TradeMessagesAnalyzer`'s dead `OGBIData.trades` / `.tradesSums` writes, removed
  rather than turned back on since nothing ever read either field.
- One bad message no longer blanking the whole battle-report tab in
  `FightMessagesAnalyzer` (each message's parse is now isolated in its own
  `try`/`catch`).
- `readPageContext()`'s three null-dereference crashes (missing player-id meta,
  empty planet list, missing universe meta) now throw a named, descriptive error
  instead of an opaque `TypeError` — construction still cannot continue without
  them, but the boot path's `catch (ex) { logger.error(ex); }` now says what was
  missing.
- `ogame.coordinate.js`: `throw InvalidCoordinateArgument(...)` was missing `new`
  (a bare `TypeError`, not the intended error type); the free `toNumber()` ignored
  an `OGameCoordinate` instance's own type, disagreeing with `instance.toNumber()`;
  `toString()`'s `if (text === undefined) {}` guard was empty.
- `runContext.js`'s `isPluginContext()` threw for an unrecognised browser instead
  of returning `false`, which is what its own JSDoc already promised — took
  `injectScript()` and the whole boot IIFE down with it on Safari, a
  privacy-hardened UA, or a headless test runner.
- `tabs()` threw on an empty title map (`tabs[0]` undefined) instead of rendering
  an empty strip.
- `service.callbackEvent.js`: `contentContextInit()`'s `!chrome.runtime` guard
  dereferenced an undeclared global in the page context, throwing a bare
  `ReferenceError` before its own intended error; `pageContextInit()` had no guard
  against a second call, which silently latched onto the placeholder token `"1"` it
  writes on the first call, so every request after that dispatched on an event name
  nobody listened to.

**Never hit the network.** Stub `globalThis.fetch`; see `stubFetchXml` in `test/ctxcontent/universe.helpers.test.js`.

**Formatting.** Test files follow same prettier config as `src/`. Run `npm run format` before committing; `npm run check` lint `src/` and `test/` (vendored `src/libs/` excluded via `.eslintignore`). `npm run check` green, gates CI (Phase 0 of `refactoring.md`). The `indent` rule that used to disagree with prettier over nested ternaries is gone — prettier formatting now only authority.

## Adding a test for a new module

1. Read global at **import** time (`document`, `window`, `LocalizationStrings`)? No: static `import` at top of test file is best — keep coverage attribution clean. Yes: `await import()` after first `setupBrowser()`.
2. Hold module-level state test need to vary? Reset through own API if you can. Reach for `importFresh()` only if you cannot, and put those tests in separate file.
3. Content context or page context? Pass `chrome: true` or leave out.
4. If it fetches, stub `globalThis.fetch` and delete in `finally`.
