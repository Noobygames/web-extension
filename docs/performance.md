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
re-parsing data `OGIData` already held parsed in memory.

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

Replaced by one delegated capture-phase listener (`src/util/stageForUpdate.js`). No polling at all,
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
dynamically import the content module, and only then did that module inject `ogkush.js`. So the
browser began fetching, parsing and compiling **69 module files, 1.15 MB** at the moment the game
page was already finished — all of it serial, in front of the first OGI pixel. That is the "vanilla
UI is done, then a second or two of nothing, then the extension appears" the users describe.

Now `main.js` runs its work at `document_start`:

| step                      | before                          | after                                          |
| :------------------------ | :------------------------------ | :--------------------------------------------- |
| wide-layout classes       | in `start()`, after module load | `document_start`, from the `ogi-layout` mirror |
| `lz-string` + `DOMPurify` | after DOMContentLoaded          | `document_start`                               |
| content module import     | after DOMContentLoaded          | `document_start`                               |
| `ogkush.js` + 69 modules  | after DOMContentLoaded          | one module round trip after `document_start`   |

`ogkush.js` is a dynamically inserted script, so it is _async_, not deferred: it now loads in
parallel with the game's own page load and waits for `DOMContentLoaded` itself before it touches
anything (`domReady()` in the bottom IIFE). That in turn required every page-context module to stop
reading the DOM at module-evaluation time — `<head>` is still empty at `document_start`. Made lazy:
`OgamePageData` (all getters), `translate.js#currentLanguage()`, `popup.js#getPlayerClass()`,
`flying.js#hasLifeforms()`; `needs.js` defers its observer registration.

`ogkush.js` deliberately stays **last** in the injection order: `pageContextInit()` throws unless
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

### Measuring it

`src/util/perf.js` is a profiler that costs one `localStorage.getItem` when off. Turn it on with
`localStorage.setItem("ogi-perf", "1")` (sticky) or `&ogi-perf=1` on the game URL (one load), then
reload. `ogkush.js` prints:

- a timeline: module evaluation, DOM ready, `init()`, `start()`, the DOMPurify wait;
- one row per `start()` step that took more than 0.5 ms (`perf.instrumentMethods`);
- totals for `ogk-data`: parse time, number of writes, time spent in them, and the blob size.

That last table is the one to look at before attacking the store: it answers "how big is the blob
really, and how many of the 82 writes actually happen on this page" with numbers instead of
estimates.

---

## Investigated and deliberately not changed

### Coalescing the store writes — reverted, it breaks a real contract

Every `OGIData` setter serialises the **whole** blob, and `ogkush.js` calls `saveData()` **82
times**. At ~3 ms per serialisation of a 428 KB blob that is up to **250 ms of pure overhead per
page load** — on paper the single biggest win available.

Deferring the write to a microtask was implemented and then **reverted**. It changes a semantic the
codebase documents and tests explicitly:

```js
OGIData.sideStalk = [101, 202, 303]; // queues a write
OGIData.sideStalk.splice(1, 1); // in-place mutation - must NOT persist
```

With synchronous write-through the mutation is not persisted, which is the documented contract
(`CLAUDE.md`, and the `TRAP:` tests in `test/util/OGIData.test.js`). With a deferred flush the
pending write picks up the mutation and persists it — so whether an in-place mutation sticks starts
depending on flush timing. That is a subtle, silent source of half-written state, and it is not
worth 250 ms.

**The safe way to get this win** is to reduce the number of `saveData()` calls rather than to defer
them, or to shrink the blob (`spies` dominates it). Both are larger changes that need their own
review; neither is a mechanical edit.

### Other candidates checked and left alone

- `FightMessagesAnalyzer` deep-copies `combatsSums` via `JSON.parse(JSON.stringify(...))`, but that
  object is small (per-date sums) and the copy is deliberate — it mutates the copy before storing.
- `OGIData.empire.find(...)` appears in ~26 places. The empire is a dozen entries, so a linear scan
  is not worth indexing.
- The roadmap modules (`fleetFlight`, `farmEvaluator`, `targetClaims`, `harvestPlanner`) all measure
  in the sub-microsecond to tens-of-microseconds range for realistic inputs. Nothing to do.

---

## Not a performance issue, but found while measuring: a rules violation

`src/ogkush.js` runs a **2-second `setInterval` on the overview page that calls
`location.reload()`** when a resource store fills up.

That is a timer-driven page refresh. `AGENTS.md` §1.3 forbids it outright:

> ❌ Auto refreshing/reloading game page (timer or otherwise).

It predates this work and was left in place — removing it changes a user-facing feature, which is
the maintainers' call, not a performance edit. **It should be removed or changed to something the
player triggers before the next toleration submission.** The two other `location.reload()` calls in
the file are fine: both run from a click handler.
