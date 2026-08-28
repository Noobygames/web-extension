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
  util/*.test.js              src/util
  ctxpage/*.test.js           src/ctxpage
  ctxcontent/*.test.js        src/ctxcontent
```

One test file per source module, named after it. Files run in **separate processes** — module-level state never leak between files, only within one.

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

`setupBrowser()` deliberately **not** call `window.close()`. Modules like `src/util/fetching.js` build `DOMParser` at import time, hold it for process lifetime. Close the window it came from = null-dereference in later suite.

### `importFresh(specifier)`

Load module under cache-busting URL so module-level singleton re-evaluate. Needed for `OGBIData`, `OgamePageData`, `service.callbackEvent` — behaviour depend on state captured at import time.

**Use only when test is about construction.** Two reasons:

1. Defeats point of singleton — everywhere else, shared instance is more faithful model of real page.
2. Node coverage reporter merge every URL for a path into one row, keep last evaluation seen. One `importFresh()` make whole module look barely covered. `src/util/OGBIData.js` report ~36% for exactly this reason; accessors in fact exercised exhaustively by `test/util/OGBIData.test.js`. Construction tests moved to `OGBIData.construction.test.js` to contain damage, but merged multi-file run still report low number. Treat that row as artefact, not gap.

Where singleton can reset through own API, prefer that — `OGBIData.json = {…}` is full reset, keep report honest.

## What is covered

`make coverage` print current table. As of writing: **524 tests**. Headline percentage not meaningful alone — the extracted page modules are in the denominator and almost none of them has behavioural coverage.

| Area              | Module                                                                                 | Notes                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Serialisation     | `util/json.js`                                                                         | Map/Set encoding, `extractJSON`, native round-trip. 96%                                               |
| Coordinates       | `util/ogame.coordinate.js`                                                             | Encoding, ordering, type handling. 99%                                                                |
| Costs             | `util/fleetCost.js`, `defenceCost.js`, `enum/*Costs.js`, `recyclingYieldCalculator.js` | Includes consistency check: every ship/defence has cost entry and vice versa. 100%                    |
| Numbers           | `util/numbers.js`, `cleanValue.js`                                                     | Both locales, unit suffixes, parse/format round-trip. 83% / 100%                                      |
| Context bridge    | `util/service.callbackEvent.js`                                                        | Full request/response round-trip across both contexts, error paths, concurrency, Firefox `cloneInto`. |
| Context detection | `util/runContext.js`                                                                   | Chrome/Edge/Firefox, script injection. 96%                                                            |
| Page storage      | `util/OGBIData.js`                                                                     | Write-through contract, generic check that **every** setter persists.                                 |
| Store access      | `src/**` (static)                                                                      | Phase 4 rule: no `this.json` alias, no `saveData()` method, no `Save()` behind a setter.              |
| Version gate      | `util/OgamePageData.js`                                                                | `isAtLeast_13_0_0` across version shapes.                                                             |
| Options           | `ctxpage/conf-options.js`                                                              | Defaults, deep merge, proxy guards.                                                                   |
| Content storage   | `ctxcontent/services/universe.storage.js`                                              | Key namespacing, Map/Set round-trip. 95%                                                              |
| API parsers       | `ctxcontent/helpers/universe.{planets,players,alliances}.js`                           | XML fixtures, `fetch` stubbed.                                                                        |

| Page context seam | `util/pageContext.js` | Everything `OGBeyondInfinity` constructor read out of DOM. 100% |
| Calculation core | `util/gameFormulas.js` | `consumption`, `minesProduction`, `research`, `building`, five `roi*` functions, `getBestRoi`. Characterisation only: values recorded before the Phase 3 move and unchanged after it. |
| Service worker | `background.js` | Persistence across worker restart, alarm scheduling, notification clicks, per-domain sync. 81% |
| Message analyzers | `ctxcontent/services/analyzer/*` | Tab dispatch for all five; parsing paths for harvest, trade, expedition fights. |
| Pantry backup | `ctxpage/pantry/index.js` | What the `post` upload actually puts in the basket, plus the timestamp it records. |
| Bridge token | `main.js` vs `util/service.callbackEvent.js` | The two hand-copied `createCallbackToken()` bodies compared as source. |
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
- **`ctxcontent/data-helper.js`** — `update()` orchestration and `loading` race behind issue #131.
- `util/translate.js`, `util/stalk.js`, `util/flying.js`, `util/needs.js`.

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

Current entries:

| Test                                                | Module                              | Defect                                                                                                                                           |
| --------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| invalid input throws TypeError                      | `ogame.coordinate.js`               | `throw InvalidCoordinateArgument(...)` missing `new`, so intended error never reach caller.                                                      |
| `toNumber(instance)` ignores the type               | `ogame.coordinate.js`               | Free function and method disagree about moon encoding.                                                                                           |
| `toString` returns `undefined`                      | `ogame.coordinate.js`               | Empty `if (text === undefined) {}` guard.                                                                                                        |
| `contentContextInit` throws `ReferenceError`        | `service.callbackEvent.js`          | `!chrome.runtime` dereference undeclared global in page context.                                                                                 |
| `pageContextInit()` overwrites the token with `"1"` | `service.callbackEvent.js`          | Second init latch onto token nobody listen on.                                                                                                   |
| a precision of `0` is ignored                       | `numbers.js`                        | `precision ? precision : 0` treat valid `0` as absent.                                                                                           |
| mutating a getter result does not persist           | `OGBIData.js`                       | Contract trap, not bug — but failure is silent. Flagged in review on PR #546.                                                                    |
| pretty-printed XML crashes the parsers              | `ctxcontent/helpers/*`              | `childNodes` include text nodes; work only because live API minifies.                                                                            |
| an error response surfaces as a `TypeError`         | `ctxcontent/helpers/*`              | `fetchXml()` check neither `response.ok` nor `<parsererror>`.                                                                                    |
| `roiMine` charges the target level once per level   | `ogCore.js`                         | Cost loop count `lvl` but pass `tolvl` to `building()`, so 20→25 upgrade priced as 5× level 25.                                                  |
| ~~`getBestRoi` averages over two empire lists~~     | `util/gameFormulas.js`              | **Fixed by the Phase 3 move**: both reads collapsed onto `OGBIData.json.empire`, so they can no longer drift. Prefix dropped.                    |
| `TradeMessagesAnalyzer` discards what it computes   | `analyzer/TradeMessagesAnalyzer.js` | Both writes back to `OGBIData` commented out, nothing else write `trades`, so trade statistics have no source.                                   |
| one bad message blanks the battle-report tab        | `analyzer/FightMessagesAnalyzer.js` | Neither message filter check `data-raw-messagetype`, so `JSON.parse(null).owner` throw out of `analyze()` and rest of pass skipped.              |
| `readPageContext` throws on an incomplete page      | `util/pageContext.js`               | Three separate null dereferences (player-id meta, empty planet list, universe meta). Lifted verbatim out of constructor; recorded, not repaired. |

**Fixed since, prefix dropped** — both were in this table, now ordinary tests:
`pageContextRequest` has 30 s deadlock guard instead of hanging forever, and
corrupt `ogk-data` start empty store (move unreadable value to
`ogk-data-corrupt`) instead of throwing at import time.

**Never hit the network.** Stub `globalThis.fetch`; see `stubFetchXml` in `test/ctxcontent/universe.helpers.test.js`.

**Formatting.** Test files follow same prettier config as `src/`. Run `npm run format` before committing; `npm run check` lint `src/` and `test/` (vendored `src/libs/` excluded via `.eslintignore`). `npm run check` green, gates CI (Phase 0 of `refactoring.md`). The `indent` rule that used to disagree with prettier over nested ternaries is gone — prettier formatting now only authority.

## Adding a test for a new module

1. Read global at **import** time (`document`, `window`, `LocalizationStrings`)? No: static `import` at top of test file is best — keep coverage attribution clean. Yes: `await import()` after first `setupBrowser()`.
2. Hold module-level state test need to vary? Reset through own API if you can. Reach for `importFresh()` only if you cannot, and put those tests in separate file.
3. Content context or page context? Pass `chrome: true` or leave out.
4. If it fetches, stub `globalThis.fetch` and delete in `finally`.
