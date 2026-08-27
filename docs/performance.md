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
