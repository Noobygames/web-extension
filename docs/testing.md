# Testing

The repository had no tests before this suite. This document describes how the suite is set up, what it currently covers, and how to add to it.

```bash
make test          # or: npm test
make test-watch    # re-run on change
make coverage      # run + print a per-file coverage table
```

Tests also run in CI on every push to `master` and on every pull request (`.github/workflows/test.yml`).

---

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Runner | `node:test` (built in) | No new runtime dependency, native ESM, watch mode and coverage included. |
| Assertions | `node:assert/strict` | Built in. |
| DOM | `jsdom` (devDependency) | The only added dependency. Most of `src/` needs a real `document`, `CustomEvent` and `localStorage`. |

Consequences of that choice, worth knowing before you start:

- The repository is now `"type": "module"`, so Node loads `src/**/*.js` as ES modules — which is what the browser already did via `<script type="module">`. The one CommonJS file, `.eslintrc.js`, was renamed to `.eslintrc.cjs`.
- `npm test` runs with `--experimental-test-module-mocks`, which enables `mock.module()`. It is used where a module-level singleton cannot otherwise be varied (see `test/util/numbers.test.js`).
- The extension build is untouched: `packaging.sh` and `scripts/build-unpacked.mjs` copy `src/`, never `node_modules/` or `test/`.

## Layout

```
test/
  helpers/globals.js          the harness (see below)
  util/*.test.js              src/util
  ctxpage/*.test.js           src/ctxpage
  ctxcontent/*.test.js        src/ctxcontent
```

One test file per source module, named after it. Files run in **separate processes**, so module-level state never leaks between files — only within one.

## The harness: `test/helpers/globals.js`

`src/` is written against a browser with OGame already loaded and reads globals nothing declares. `setupBrowser()` installs them and returns a `cleanup()` that restores the previous values:

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

`chrome: true` means **content-script context** and installs a `chrome` stub whose `storage.local` is a real Map supporting both the callback and the promise form. `chrome: false` (the default) means **page context** and deletes `window.chrome`, which is what `pageContextInit()` checks for. Getting this wrong is the most common reason a test fails for the wrong reason.

The stub exposes `chrome._store` (the Map) and `chrome._calls` (call counters) for assertions.

`setupBrowser()` deliberately does **not** call `window.close()`. Modules such as `src/util/fetching.js` build a `DOMParser` at import time and hold it for the process lifetime; closing the window it came from turns that into a null-dereference in a later suite.

### `importFresh(specifier)`

Loads a module under a cache-busting URL so a module-level singleton is re-evaluated. Needed for `OGIData`, `OgamePageData` and `service.callbackEvent`, whose behaviour depends on state captured at import time.

**Use it only when the test is about construction.** Two reasons:

1. It defeats the point of a singleton — everywhere else, a shared instance is the more faithful model of the real page.
2. Node's coverage reporter merges every URL for a path into one row and keeps the last evaluation it saw, so a single `importFresh()` makes the whole module look barely covered. `src/util/OGIData.js` reports ~36% for exactly this reason; its accessors are in fact exercised exhaustively by `test/util/OGIData.test.js`. The construction tests were moved to `OGIData.construction.test.js` to contain the damage, but a merged multi-file run still reports the low number. Treat that one row as an artefact, not a gap.

Where a singleton can be reset through its own API, prefer that — `OGIData.json = {…}` is a full reset and keeps the report honest.

## What is covered

`make coverage` prints the current table. As of writing: **179 tests, ~76% lines / ~73% branches** over the modules under test.

| Area | Module | Notes |
| --- | --- | --- |
| Serialisation | `util/json.js` | Map/Set encoding, `extractJSON`, native round-trip. 96% |
| Coordinates | `util/ogame.coordinate.js` | Encoding, ordering, type handling. 99% |
| Costs | `util/fleetCost.js`, `defenceCost.js`, `enum/*Costs.js`, `recyclingYieldCalculator.js` | Includes a consistency check that every ship/defence has a cost entry and vice versa. 100% |
| Numbers | `util/numbers.js`, `cleanValue.js` | Both locales, unit suffixes, parse/format round-trip. 83% / 100% |
| Context bridge | `util/service.callbackEvent.js` | Full request/response round-trip across both contexts, error paths, concurrency, Firefox `cloneInto`. |
| Context detection | `util/runContext.js` | Chrome/Edge/Firefox, script injection. 96% |
| Page storage | `util/OGIData.js` | Write-through contract, generic check that **every** setter persists. |
| Version gate | `util/OgamePageData.js` | `isAtLeast_13_0_0` across version shapes. |
| Options | `ctxpage/conf-options.js` | Defaults, deep merge, proxy guards. |
| Content storage | `ctxcontent/services/universe.storage.js` | Key namespacing, Map/Set round-trip. 95% |
| API parsers | `ctxcontent/helpers/universe.{planets,players,alliances}.js` | XML fixtures, `fetch` stubbed. |

Not covered, in rough order of value:

- **`src/ogkush.js`** — 18k lines, one class, no seams. Untestable as it stands; the way in is to keep moving logic out into `src/ctxpage/**` and `src/util/**` (PR #547 is a good example) and test it there.
- **Message analyzers** (`ctxcontent/services/analyzer/*`) — need realistic message-list DOM fixtures. The highest-value gap, since these are where most bug reports land.
- **`ctxcontent/data-helper.js`** — the `update()` orchestration and the `loading` race behind issue #131.
- `util/translate.js`, `util/stalk.js`, `util/flying.js`, `util/needs.js`.

## Conventions

**Name the behaviour, not the function.** `"a player without an alliance attribute gets null, not NaN"` beats `"toPlayerResponse works"`. The name is what a future reader sees when it fails.

**Test observable behaviour through the public export.** Nothing here reaches into private state.

**`KNOWN BUG:` / `TRAP:` prefixes.** Several tests assert behaviour that is wrong but currently shipped. They are named with one of those prefixes and carry a comment explaining what should happen instead. They exist so a fix registers as a *deliberate* change rather than a silent one — when you fix the bug, update the test and drop the prefix.

Current entries:

| Test | Module | Defect |
| --- | --- | --- |
| invalid input throws TypeError | `ogame.coordinate.js` | `throw InvalidCoordinateArgument(...)` is missing `new`, so the intended error never reaches the caller. |
| `toNumber(instance)` ignores the type | `ogame.coordinate.js` | The free function and the method disagree about a moon's encoding. |
| `toString` returns `undefined` | `ogame.coordinate.js` | An empty `if (text === undefined) {}` guard. |
| `contentContextInit` throws `ReferenceError` | `service.callbackEvent.js` | `!chrome.runtime` dereferences an undeclared global in the page context. |
| `pageContextInit()` overwrites the token with `"1"` | `service.callbackEvent.js` | A second init latches onto a token nobody listens on. |
| a request for an unregistered token never settles | `service.callbackEvent.js` | `pageContextRequest` has no timeout. |
| a precision of `0` is ignored | `numbers.js` | `precision ? precision : 0` treats a valid `0` as absent. |
| corrupt `localStorage` crashes on import | `OGIData.js` | `JSON.parse` with no `try/catch`, at import time. |
| mutating a getter result does not persist | `OGIData.js` | Contract trap, not a bug — but the failure is silent. Flagged in review on PR #546. |
| pretty-printed XML crashes the parsers | `ctxcontent/helpers/*` | `childNodes` includes text nodes; works only because the live API minifies. |
| an error response surfaces as a `TypeError` | `ctxcontent/helpers/*` | `fetchXml()` checks neither `response.ok` nor `<parsererror>`. |

**Never hit the network.** Stub `globalThis.fetch`; see `stubFetchXml` in `test/ctxcontent/universe.helpers.test.js`.

**Formatting.** Test files follow the same prettier config as `src/`. Run `npm run format` before committing; `npm run check` lints `src/` and `test/` (the vendored `src/libs/` is excluded via `.eslintignore`). Two gotchas: the repo's `indent` ESLint rule disagrees with prettier on nested ternaries, so write an `if` chain instead; and `npm run check` is currently red for ten pre-existing `src/` files that do not satisfy prettier — that is not your change, and reformatting them is out of scope.

## Adding a test for a new module

1. Does it read a global at **import** time (`document`, `window`, `LocalizationStrings`)? If not, a static `import` at the top of the test file is best — it keeps coverage attribution clean. If yes, `await import()` it after the first `setupBrowser()`.
2. Does it hold module-level state that the test needs to vary? Reset it through its own API if you can; reach for `importFresh()` only if you cannot, and put those tests in a separate file.
3. Content context or page context? Pass `chrome: true` or leave it out.
4. If it fetches, stub `globalThis.fetch` and delete it in `finally`.
