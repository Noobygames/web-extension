# Performance analysis

Measured with `make bench` (`scripts/bench.mjs`), a micro-benchmark harness over the hot paths.
Numbers below are from that harness on a 251 KB `ogk-data` blob — the size an established
account reaches. They are reproducible, so a future change has a baseline to beat.

The harness is **not** a substitute for profiling in the real game. It measures the arithmetic and
the DOM work in jsdom; a real browser's `querySelectorAll` over OGame's full DOM is slower than
jsdom's, and real `localStorage` is slower than an in-memory map. Treat these as lower bounds.

---

## Fixed

### 1. `calcNeededShips()` re-parsed the whole data blob on every call

`JSON.parse(localStorage["ogk-data"])` on entry, on a function `SpyReport` calls **four times per
report**. Rendering a 50-report spy table therefore spent roughly **400 ms** doing nothing but
re-parsing data `OGBIData` already held parsed in memory.

|                                   |    per call |
| :-------------------------------- | ----------: |
| before — `JSON.parse` of the blob | 2303.045 µs |
| after — read the parsed object    |    0.042 µs |

It also read the resource bar on every call and discarded the result whenever the caller passed an
explicit amount, which is the common case. Skipping that additionally stopped the function throwing
on pages with no resource bar.

Fixed in `perf(spy): stop re-parsing the whole data blob on every cargo calculation`.
Pinned by 9 tests written against the old implementation first, so the rewrite is provably
equivalent.

### 2. A permanent 100 ms DOM poll

`setInterval(..., 100)` ran `querySelectorAll` over nine selectors, ten times a second, forever, on
every page — to attach a click listener to anything it had not already seen. After its first pass
it had nothing left to do, so essentially all of that work was wasted: **~51 µs per tick in the
steady state, ~510 µs/second, for the whole session.**

Replaced by one delegated capture-phase listener (`src/platform/domChanges.js`). No polling at all,
and elements the game adds later are picked up immediately rather than up to 100 ms late. Capture
phase because the game calls `stopPropagation()` on some of its own buttons.

### 3. The planet-bar observer did ~6× the necessary work, then repeated it

The observer used `subtree: true` but its callback only ever acted on mutations whose target **is**
the observed element. Every descendant mutation was delivered just to be filtered out — measured at
**72 deliveries for the 12 that mattered** on a 12-planet re-render.

Worse, the refresh — about fifteen methods including `updateFlyings`, `updateProductionProgress`
and `markLifeforms` — ran once **per matching mutation**, so that same re-render ran the whole
refresh **12 times**. It is idempotent, so it now runs once per batch.

Both fixed in `perf(page): replace a permanent 100ms DOM poll and stop redundant observer work`.

### 4. The whole extension waited for `DOMContentLoaded` before it started loading

`main.js` registered a `DOMContentLoaded` listener and did nothing until it fired. Only then did it
dynamically import the content module, and only then did that module inject `ogCore.js`. So the
browser began fetching, parsing and compiling **69 module files, 1.15 MB** at the moment the game
page was already finished — all of it serial, in front of the first OGI pixel. That is the "vanilla
UI is done, then a second or two of nothing, then the extension appears" the users describe.

Now `main.js` runs its work at `document_start`:

| step                      | before                          | after                                          |
| :------------------------ | :------------------------------ | :--------------------------------------------- |
| wide-layout classes       | in `start()`, after module load | `document_start`, from the `ogi-layout` mirror |
| `lz-string` + `DOMPurify` | after DOMContentLoaded          | `document_start`                               |
| content module import     | after DOMContentLoaded          | `document_start`                               |
| `ogCore.js` + 69 modules  | after DOMContentLoaded          | one module round trip after `document_start`   |

`ogCore.js` is a dynamically inserted script, so it is _async_, not deferred: it now loads in
parallel with the game's own page load and waits for `DOMContentLoaded` itself before it touches
anything (`domReady()` in the bottom IIFE). That in turn required every page-context module to stop
reading the DOM at module-evaluation time — `<head>` is still empty at `document_start`. Made lazy:
`OgamePageData` (all getters), `translate.js#currentLanguage()`, `popup.js#getPlayerClass()`,
`flying.js#hasLifeforms()`; `needs.js` defers its observer registration.

`ogCore.js` deliberately stays **last** in the injection order: `pageContextInit()` throws unless
`contentContextInit()` has already published its callback token on `<html>`.

`domReady()` resumes via `setTimeout(..., 0)` rather than straight out of the DOMContentLoaded
listener, because the game creates page globals such as `resourcesBar` and `fleetDispatcher` in its
own listeners and the old ordering always ran after the whole dispatch.

### 5. Two smaller ones on the same path

- **The wide-layout flash.** The layout classes were applied in `start()`, so every page change
  painted the vanilla-width layout first and jumped to the wide one when OGI caught up.
  `wide-layout.js` now mirrors its three switches into a small `ogi-layout` localStorage key, and
  `main.js` applies them at `document_start`, before the first paint. `ogk-data` itself is far too
  large to parse there.
- **`waitFor()` never checked its predicate before the first interval tick.** Every caller paid a
  full `checkIntervals` (10 ms by default) even when the condition already held — `DOMPurify` and
  `#eventContent` both sit on the start-up path.

### 6. The module graph itself: 69 files, seven levels deep, on every page load

Starting the load early (§4) fixed _when_ the graph was fetched. It did not
change _what_ was fetched: 69 files, 1.15 MB, and a dependency chain seven
levels deep. The browser cannot know it needs level 7 until it has fetched and
parsed levels 1 to 6, so this is a request waterfall in front of every page - and
OGame is not a single-page app, so it is paid again on every view change.

`scripts/bundle.mjs` collapses it, at build time, to one file per execution
context:

| loaded on boot                     | before              | after               |
| :--------------------------------- | :------------------ | :------------------ |
| page context (`ogCore.js` + graph) | 69 requests, 7 deep | 1 request, 1.13 MB  |
| content context (`ctxcontent/`)    | 18 requests         | 1 request, 61 KB    |
| vendored libs                      | 2, in parallel      | 1, in parallel (§8) |
| content script (`main.js`)         | 1                   | 1                   |

**Rollup, and no minification.** AGENTS.md §0 requires reviewable code, and
`packaging.sh` keeps its terser pass deliberately disabled. Rollup was chosen
over faster bundlers precisely because its output _is_ the source: identifiers,
formatting and every JSDoc block survive, in module evaluation order. esbuild
was tried first and rejected - it strips all non-legal comments and writes the
build machine's absolute paths into the output. The per-file sources ship
alongside the bundles, so a reviewer can diff one against the other.

`treeshake` is off. Measured on this graph it saves 9 KB of 1126 (0.8%), which
does not pay for the risk of a bundler deciding a module with top-level side
effects is unused.

`test/bundle.test.js` builds the real bundles and evaluates the page one under
jsdom. That test exists because bundling fails silently: the file still parses,
it just evaluates in a different order, or a name collides, or an import cycle
that native ESM resolved with live bindings becomes a temporal dead zone. The
unit suite imports `src/` directly and would never see it.

### 7. `ogCore.js` was injected one round trip behind the content module

`pageContextInit()` throws unless the content script has published a handshake
token on `<html>`, so the 1.1 MB page bundle could not even start downloading
until the content bundle had loaded and evaluated. `main.js` now mints that
token itself and publishes it before injecting anything, and passes it into
`contentContextInit(map, token)`. Both bundles now download side by side, and
either half may initialise first.

### 8. LZString was loaded on every page for a feature almost nobody runs

`libs/lz-string.min.js` was injected on every page load. Its only two call sites
are inside `checkPantrySync()`, which returns immediately unless the user has
configured a pantry key _and_ there is something to sync. It now loads on demand
over an `ogi-lzstring` event, the same way `chart.min.js` already did.

That leaves the boot path at four requests, two of which are ours:

| file                  | context | when                     |
| :-------------------- | :------ | :----------------------- |
| `main.js`             | content | manifest, document_start |
| `ctxcontent/index.js` | content | bundle, document_start   |
| `ogCore.js`           | page    | bundle, document_start   |
| `libs/purify.min.js`  | page    | document_start           |

`purify.min.js` is 22 KB of vendored, already-minified third party. Folding it
into the page bundle would need a CommonJS plugin to unwrap its UMD header and
would put minified code inside an otherwise readable file - not worth it for one
request that runs in parallel with a bundle fifty times its size.

### 9. `start()` was one long synchronous task, so the planet bar painted last

§4 to §8 fixed _when_ the code arrived. This one is about when the user sees it.

`start()` ran ~50 steps in a single synchronous task. A browser cannot paint
anything a task writes to the DOM until that task ends, so the order of the
calls inside it made no visible difference on its own - everything OGI drew
appeared at once, when the last step had finished. And the right planet bar, the
one piece of OGI UI that is on screen on every page, had half its work at the
very bottom of that list: `updateProductionProgress`, `updateSpaceShipsPresence`
and `markLifeforms` ran after `spyTable()`, `betterHighscore()`,
`technoDetail()`, `betterFleetDispatcher()` and two dozen other page-specific
steps. `jumpGate()` and `needsUtil.display()` sat two thirds of the way down.

The bar now has its own method, `renderPlanetBar()`, called first - before
`#migrations()` and the `saveData()` that serialises the whole blob - and
`start()` yields once right after it (`nextPaint()`: `requestAnimationFrame`
then `setTimeout`). The page-specific work resumes in the next task, so the bar
is on screen a frame after DOM ready rather than after all of it.

`start()` is therefore `async` now, and the boot IIFE awaits it so `perf.report()`
still sees the steps that run after the yield.

The planet-bar observer used to hold a second, hand-kept copy of the same call
list; both now go through `renderPlanetBar()`. They had already drifted -
`harvest()`, `activitytimers()` and `quickPlanetList()` were in one and not the
other.

**Also fixed here: an interval leak in `activitytimers()`.** It registered two
`setInterval`s per planet, and the observer re-ran it on every planet-bar
re-render, so a long session accumulated dozens of one-minute timers, each
pinning a detached element the game had already replaced. It is now one ticker
for the whole bar, registered once, walking `#planetList .ogl-timer[data-timer]`.

### 10. The empire refresh only started after the game page had finished loading

The planet bar draws its resource numbers from the cached empire snapshot and
redraws them when the refresh lands (`updateInfo()` → `updateresourceDetail()`).
That refresh was requested from `start()`, i.e. after `DOMContentLoaded`, so the
request left the browser at the moment the game's own page load was already
over. The entire page load was dead time it could have spent in flight, and the
redraw showed up as the planet bar's numbers changing a beat after everything
else.

`startEmpirePrefetch()` now issues it at `document_start`, from the boot IIFE,
before `await domReady()`. `getEmpireInfo()` consumes that promise instead of
issuing its own request.

It is the **same single request**, moved earlier inside the same page load - not
an extra one, which matters for AGENTS.md §4:

- it only fires when the throttle says this page load would refresh anyway. That
  throttle is now one function, `empireRefreshDue()`, shared by the prefetch and
  by `updateEmpireData()`, because two copies of that rule would drift;
- the condition is monotone in time, so "due at `document_start`" still holds at
  `start()` - the prefetch cannot end up unused;
- `takeEmpirePrefetch()` hands it over once, so a later refresh in the same page
  load (the empire and statistics buttons) issues its own request;
- the excluded-page check moved above it, so nothing is requested on the pages
  OGI does not run on;
- no timer, no loop, no auto-refresh, no `cp`, no `accountInfo`.

Only the planets half is prefetched. The moons half needs `a.moonlink` to know
whether the account has a moon at all, and guessing that from the stale cache
would drop moon data for a page load after a moon is built.

### What is left

After this, the boot path is: one classic content script, two bundles and two
small vendored libraries, all requested in the same tick at `document_start`.
The remaining cost is `src/ogCore.js` itself - 740 KB of the 1.13 MB bundle,
65% of it - plus whatever `start()` does synchronously once the DOM is ready.
Cutting that further means splitting the monolith so page-specific code is
`import()`ed only on the pages that need it. That is a refactor, not a
performance tweak, and it wants the profiler numbers below first.

### Measuring it

`src/platform/perf.js` is a profiler that costs one `localStorage.getItem` when off. Turn it on with
`localStorage.setItem("ogi-perf", "1")` (sticky) or `&ogi-perf=1` on the game URL (one load), then
reload. `ogCore.js` prints:

- a timeline: module evaluation, DOM ready, `init()`, `start()`, the DOMPurify wait;
- one row per `start()` step that took more than 0.5 ms (`perf.instrumentMethods`);
- totals for `ogk-data` (hot) and, since the Phase C split below, `ogk-history` (cold): parse
  time, number of writes, time spent in them, and the blob size, for each.

That last table is the one to look at before attacking the store: it answers "how big is the blob
really, and how many of the 82 writes actually happen on this page" with numbers instead of
estimates.

---

## Investigated and deliberately not changed

### Coalescing the store writes — reverted, it breaks a real contract

Every `OGBIData` setter serialises the **whole** blob, and `ogCore.js` calls `saveData()` **82
times**. At ~3 ms per serialisation of a 428 KB blob that is up to **250 ms of pure overhead per
page load** — on paper the single biggest win available.

Deferring the write to a microtask was implemented and then **reverted**. It changes a semantic the
codebase documents and tests explicitly:

```js
OGBIData.sideStalk = [101, 202, 303]; // queues a write
OGBIData.sideStalk.splice(1, 1); // in-place mutation - must NOT persist
```

With synchronous write-through the mutation is not persisted, which is the documented contract
(`CLAUDE.md`, and the `TRAP:` tests in `test/util/OGIData.test.js`). With a deferred flush the
pending write picks up the mutation and persists it — so whether an in-place mutation sticks starts
depending on flush timing. That is a subtle, silent source of half-written state, and it is not
worth 250 ms.

**The safe way to get this win**, this doc concluded, was to reduce the number of `saveData()`
calls rather than to defer them, or to shrink the blob (`spies` dominates it) — see the fix below.

### The blob split (refactoring-new.md Phase C)

`OGBIData` now keeps two blobs, not one: `localStorage["ogk-data"]` (hot — `options`, `empire`,
`markers`, `needs`, `sideStalk`, every progress/timestamp field, everything else) and
`localStorage["ogk-history"]` (cold — `spies`, `expeditions`, `combats`, `harvests`,
`discoveries`, their `*Sums`, `translations`; pure history, written only when a message is
analysed). `spies` alone was most of the 428 KB the section above measured, so the hot half an
established account actually writes 80+ times per page load is now tens of KB, not hundreds.

The external interface is exactly what it was before the split — one `OGBIData.json`, the same ~28
accessors, the same write-through and TRAP contracts — so nothing outside `src/store/OGBIData.js`
changed. Internally, `Save()` also tracks whether the cold half was actually touched since its last
write and skips re-serialising it when not: `updateProductionProgress()` (`ctxpage/empire/production.js`),
the function this section's 250 ms figure was mostly about, never touches a cold field, so its
boot-path `Save()` call is now hot-only automatically - no change needed in that file.

`node scripts/bench.mjs store` reproduces the win against a synthetic 251 KB pre-split blob (the
same shape `docs/testing.md`'s benchmarks use) - not a live-page measurement, but the same
methodology this whole doc is built on:

```
store: Save() serialising the whole pre-split blob (before Phase C)    1052.086 us/op
store: Save() after the split, no cold field touched (Phase C)            4.961 us/op
(Save() speedup after the split: 212.1x)
```

Comfortably past the phase's 5x exit criterion. What is **not** done: an `ogi-perf` before/after
capture on a real, established account's OGame page — that needs a live browser this environment
does not have. The number above is a reproducible lower bound in the same spirit as the rest of
this document, not a replacement for that capture.

### Other candidates checked and left alone

- `FightMessagesAnalyzer` deep-copies `combatsSums` via `JSON.parse(JSON.stringify(...))`, but that
  object is small (per-date sums) and the copy is deliberate — it mutates the copy before storing.
- `OGBIData.empire.find(...)` appears in ~26 places. The empire is a dozen entries, so a linear scan
  is not worth indexing.
- The roadmap modules (`fleetFlight`, `farmEvaluator`, `targetClaims`, `harvestPlanner`) all measure
  in the sub-microsecond to tens-of-microseconds range for realistic inputs. Nothing to do.

---

## Not a performance issue, but found while measuring: a rules violation

`src/ogCore.js` runs a **2-second `setInterval` on the overview page that calls
`location.reload()`** when a resource store fills up.

That is a timer-driven page refresh. `AGENTS.md` §1.3 forbids it outright:

> ❌ Auto refreshing/reloading game page (timer or otherwise).

It predates this work and was left in place — removing it changes a user-facing feature, which is
the maintainers' call, not a performance edit. **It should be removed or changed to something the
player triggers before the next toleration submission.** The two other `location.reload()` calls in
the file are fine: both run from a click handler.
