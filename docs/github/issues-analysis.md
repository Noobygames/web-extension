# Open Issues — Analysis

Upstream repository: [`ogame-infinity/web-extension`](https://github.com/ogame-infinity/web-extension)
Snapshot date: **2026-08-27** · `master` @ `6524a86`

**Scope:** all **16 open issues**. Closed items (54 issues, 469 PRs) were not analysed individually; they were only consulted where an open issue links to one.

Every issue below was checked against the current `master` working tree, not just against its own description. Verdicts carry file/line evidence so they can be re-verified.

---

## Linked-PR summary

The core question — _does an issue have a PR, and does that PR fix it?_ — has a blunt answer here:

|                                          | Count                                     |
| ---------------------------------------- | ----------------------------------------- |
| Open issues with **any** linked PR       | **2** of 16                               |
| Linked PR **merged**                     | **0**                                     |
| Linked PR **closed unmerged**            | **2** (#132 → issue #131, #33 → issue #4) |
| Open issues referenced by an **open** PR | **0**                                     |

Detail:

| Issue                                                                                       | Linked PR                                                        | PR state                          | Does it fix the issue?                                                                                                    |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [#131](https://github.com/ogame-infinity/web-extension/issues/131) `ogi-players` race       | [#132](https://github.com/ogame-infinity/web-extension/pull/132) | closed 2022-12-06, **not merged** | Would have addressed it (waits for `DataHelper.loading === false`), but it was never merged and the bug is still present. |
| [#4](https://github.com/ogame-infinity/web-extension/issues/4) universeview links for `.us` | [#33](https://github.com/ogame-infinity/web-extension/pull/33)   | closed 2021-02-16, **not merged** | Irrelevant now — the problem was fixed later by a different change (`UNIVERSVIEW_LANGS`). The issue is stale-open.        |

The 8 open PRs reference no issue at all; the only `#`-reference in any open PR body is PR #531 → PR #533 (a dependency between two PRs). See [pr-analysis.md](./pr-analysis.md).

---

## Overview

Status legend: **CONFIRMED** = reproduced in code · **STILL VALID** = mechanism still present · **FIXED** = resolved in master, issue should be closed · **NOT IMPLEMENTED** = valid feature request, no code · **STALE** = cannot be assessed as written · **META** = not a code issue.

| #                                                               | Title                                              | Opened     | Type    | Linked PR       | Status                                  |
| --------------------------------------------------------------- | -------------------------------------------------- | ---------- | ------- | --------------- | --------------------------------------- |
| [532](#532--storage-size-label-ignores-extension-storage)       | Storage size label ignores extension storage       | 2026-08-03 | bug     | —               | **CONFIRMED**                           |
| [470](#470--click-on-ship-resources-too-fast-leads-to-an-error) | Click on ship resources too fast leads to an error | 2025-04-09 | bug     | —               | **PLAUSIBLE**, not reproduced           |
| [268](#268--ptre-sync-target-list-across-team)                  | [PTRE] Sync target list across Team                | 2023-11-26 | feature | —               | **NOT IMPLEMENTED**                     |
| [169](#169--roadmapfeature-recommendation)                      | Roadmap / Feature-Recommendation                   | 2023-03-30 | process | —               | **META**, partly answered               |
| [140](#140--balanced-exploration-send)                          | Balanced exploration send                          | 2022-12-31 | feature | —               | **NOT IMPLEMENTED** (partly superseded) |
| [131](#131--ogi-players-fires-before-datahelper-is-ready)       | `ogi-players` fires before DataHelper ready        | 2022-12-05 | bug     | #132 (unmerged) | **STILL VALID**                         |
| [118](#118--alliance-members-table)                             | Alliance members table                             | 2022-11-04 | feature | —               | **NOT IMPLEMENTED**                     |
| [50](#50--wrong-production-calculation-and-average-mine-levels) | Wrong production calculation / mine levels         | 2021-07-21 | bug     | —               | **STALE**                               |
| [32](#32--sensor-phalanx-range)                                 | Sensor Phalanx Range                               | 2021-01-11 | feature | —               | **NOT IMPLEMENTED**                     |
| [30](#30--alliance-stats)                                       | Alliance Stats                                     | 2021-01-11 | feature | —               | **NOT IMPLEMENTED**, deprioritised      |
| [23](#23--fleet-movement-layout)                                | Fleet Movement Layout                              | 2021-01-06 | bug     | —               | **STALE**, not reproducible             |
| [13](#13--fly-time--profitminute-column-in-spy-table)           | Fly-time / profit-per-minute column in spy table   | 2021-01-05 | feature | —               | **NOT IMPLEMENTED**                     |
| [12](#12--setting-for-the-rentability-ratio)                    | Setting for the rentability-ratio                  | 2021-01-05 | feature | —               | **LIKELY FIXED**                        |
| [8](#8--mark-favorited-reports-in-the-spy-table)                | Mark favorited reports in the spy table            | 2021-01-05 | feature | —               | **GROUNDWORK ONLY**                     |
| [7](#7--add-players-and-all-their-planets-as-targets)           | Add players (and all planets) as targets           | 2021-01-05 | feature | —               | **WORKAROUND EXISTS**                   |
| [4](#4--universeview-links-for-us-servers)                      | universeview links for `.us` servers               | 2021-01-05 | bug     | #33 (unmerged)  | **FIXED** — close                       |

**Recommended closes:** #4 (fixed), #12 (verify, then close), #23 (not reproducible), #50 (stale), #169 (convert to discussion). That would cut the open-issue count from 16 to 11.

---

## Bugs

### #532 — Storage size label ignores extension storage

_bug · opened 2026-08-03 by GeGeGM · no linked PR_

**Status: CONFIRMED.** The reported code is unchanged.

`getLocalStorageSize()` at `src/ogCore.js:14651` iterates `window.localStorage` only:

```js
for (var x in localStorage) {
  var amount = localStorage[x].length / 1024 / 1024;
  if (x == "ogk-data") {
    ogi += amount;
  } else {
    other += amount;
  }
}
```

The result is rendered as `${size.total} / 5 Mb` at `src/ogCore.js:14994`. Everything the content script stores — the per-universe `DataHelper` blob, `ogi-scanned-<universe>`, and the `<universe>-<key>-information` keys written by `src/ctxcontent/services/universe.storage.js` — lives in `chrome.storage.local` and is invisible to this counter.

**Not mentioned in the issue, and arguably worse than the wrong label:** the same number drives an automatic purge. `src/ogCore.js:1691-1693`:

```js
let storage = this.getLocalStorageSize();
if (storage.total > 4.5) {
  this.purgeLocalStorage();
```

So the threshold that triggers data deletion is computed from an incomplete measurement, and `purgeLocalStorage()` (`src/ogCore.js:14671`) likewise only clears `localStorage`. A user whose real footprint is dominated by `chrome.storage.local` never trips the purge; a user with unrelated page-local keys trips it early.

**Interaction with open PRs:** PR #533 adds another `chrome.storage.local` key (`ogi-galaxy-<UNIVERSE>`) holding a full coordinate-indexed universe snapshot. It widens the gap this issue describes. Fixing #532 is cheap (`chrome.storage.local.getBytesInUse`, surfaced over the callback-event bridge) and should ideally land with or before #533.

---

### #470 — Click on ship resources too fast leads to an error

_opened 2025-04-09 by Nightmaster · no linked PR · no comments_

**Status: PLAUSIBLE, not reproduced.** The reporter themselves could not reproduce it reliably.

The stack trace is entirely inside OGame's own bundle (`calcConsumption` → `getConsumption` → `hasEnoughFuel` → `refreshNavigationFleet2` → `fetchTargetPlayerData`), failing on `shipData is null`. Nothing in the trace is OGI code, so this is not proof of an OGI defect on its own.

What makes OGI a credible contributor: it calls into the same dispatcher imperatively, and does so during page setup rather than in response to user input.

- `src/ogCore.js:13322-13333` — `selectShips()` calls `fleetDispatcher.selectShip(...)` then `fleetDispatcher.refresh()`.
- `src/ogCore.js:13335-13345` — `preselectShips()` loops `shipsOnPlanet` and calls `selectShips()` **and** `fleetDispatcher.refresh()` again per ship, so a planet with N ship types triggers up to 2N refreshes back to back.
- `preselectShips()` runs from `start()` (`src/ogCore.js:1653`), i.e. while OGame's own async `fetchTargetPlayerData` may still be in flight.

`fleetDispatcher` is referenced ~370 times across `ogCore.js`, so an exhaustive audit is out of scope here.

**Recommended next step:** ask the reporter for the OGame version and whether the extension being disabled makes it disappear; then instrument `preselectShips()` to bail out when `fleetDispatcher.fleetHelper.shipsData` is not yet populated. The redundant `refresh()` inside the `preselectShips()` loop (one per ship, on top of the one already inside `selectShips()`) is worth removing regardless.

---

### #131 — `ogi-players` fires before DataHelper is ready

_opened 2022-12-05 by 4x10m · linked PR #132 (**closed, not merged**)_

**Status: STILL VALID.** This is the one issue where a PR existed, was correct in spirit, and was dropped.

The reporter's diagnosis: `DataHelper.getPlayer()` runs while `this.loading === true` and `this.players` is undefined. All three parts of that still hold on master.

1. `this.players` is assigned **only at the end** of `update()` — `src/ctxcontent/data-helper.js:283` — after four network fetches resolve.
2. `getPlayer()` dereferences it without a guard — `src/ctxcontent/data-helper.js:80`:
   ```js
   let player = this.players[id]; // TypeError if update() has not finished
   ```
3. The content-script listener guards on the wrong condition — `src/ctxcontent/index.js:59-63`:
   ```js
   window.addEventListener("ogi-players", function (evt) {
     wait.waitFor(() => dataHelper).then(() => { ... dataHelper.getPlayer(evt.detail.id) ... });
   ```
   `waitFor(() => dataHelper)` only waits for the _object reference_ to exist. In `processData()` (`src/ctxcontent/index.js:26-47`) `dataHelper = universes[UNIVERSE]` is assigned synchronously right after `update()` is _called_, not after it resolves. So `dataHelper` becomes truthy while `loading` is still `true`.

The cached path (`main()` restoring the blob from `chrome.storage.local` via `Object.assign`) usually hides this, which matches the reporter's "not systematic but almost" — it bites on first run per universe and after a cache clear.

**Fix, per the issue's own "clean hand" option:** make the listener wait on load completion, and harden the accessor:

```js
wait.waitFor(() => dataHelper && !dataHelper.loading && dataHelper.players);
```

plus an early return in `getPlayer()` when `this.players?.[id]` is missing. Note `update()` returns early when `loading` is true (`data-helper.js:229`), so a `hasLoaded` flag set in the `finally` block is more robust than watching `loading` alone.

---

### #50 — Wrong production calculation and average mine levels

_opened 2021-07-21 by Efraid · no linked PR_

**Status: STALE — cannot be assessed as written.** The report is five years old, consists of 13 screenshots with no numbers in text, and predates lifeforms entirely.

The production code has been substantially rewritten since: `src/ogCore.js` now folds in `json.lifeformBonus.productionBonus` and per-planet `lifeformPlanetBonus[...].productionBonus` in every production path (e.g. `src/ogCore.js:1990`, `:2033`, `:2313`, `:2493`, `:2528`), plus a class/officer/item bonus layer that did not exist in 2021.

Whether a discrepancy still exists is an open question, but nothing in the original report can be used to verify it today.

**Recommendation:** close as stale with a request for a fresh report against OGame v13, stating expected vs. shown numbers as text.

---

### #23 — Fleet Movement Layout

_bug · opened 2021-01-06 by alexisfasquel · no linked PR_

**Status: STALE — not reproducible.** Three separate people failed to reproduce it in the thread (tritens twice, kursion in 2022 who attributed it to "Dark edition"), and the original reporter stated they were relaying someone else's report and had no account to test with.

The screenshot link is on a Discord CDN and has long since expired. The fleet-movement DOM has been reworked for OGame v13 in the meantime (`OgamePageData.isAtLeast_13_0_0` branches).

**Recommendation:** close. Note that open PR #485 touches the same page, but for timezone handling — it neither fixes nor affects this layout complaint.

---

### #4 — universeview links for `.us` servers

_bug · opened 2021-01-05 by rteuwens · linked PR #33 (**closed, not merged**)_

**Status: FIXED in master — recommend closing.**

The issue: the language segment of the TrashSim/Ogotcha URL was taken from the server hostname, producing `https://trashsim.universeview.be/us?...` for `.us` servers instead of `/en`.

Current code does the lookup the issue asked for. `src/ogCore.js:168` defines `UNIVERSVIEW_LANGS` (`en, cs, es, fr, de, da, hr, it, hu, nl, pl, pt, ro, ru, sk, sv, tr, …`), and `src/ogCore.js:1548-1552` resolves the segment from the page's declared game language with an `en` fallback:

```js
if (UNIVERSVIEW_LANGS.includes(OgamePageData.gameLang)) {
  this.univerviewLang = OgamePageData.gameLang;
} else {
  this.univerviewLang = "en";
}
```

`OgamePageData.gameLang` reads `<meta name="ogame-language">` (`src/util/OgamePageData.js:4`), which is `en` on `.us` servers — exactly the mapping the issue requested. It is consumed at `src/ogCore.js:4652` (TrashSim), `:4673` (Ogotcha), `:3511` and `:14229`.

PR #33 ("Temp fix") was closed unmerged in 2021; the fix landed independently.

**Caveat:** christiankm's follow-up in the same thread is a _different_ symptom (only one TrashSim button on Edge/Windows, invalid URL). That was never confirmed and involves a suspected extension conflict. If it still matters it deserves its own issue rather than keeping #4 open.

---

## Feature requests

### #268 — [PTRE] Sync target list across Team

_feature request, improvements · opened 2023-11-26 by GeGeGM · no linked PR_

**Status: NOT IMPLEMENTED.** No occurrence of `api_sync_target_list` or any target-sync endpoint anywhere in `src/`. The PTRE integration that does exist (`src/util/service.ptre.js`, `src/util/ptre.js`) covers galaxy scan push and player/report sync only.

The issue is unusually actionable: it specifies the endpoint, method, payload shape and response contract, and the reporter states the server side is already live. It also raises a design point that still needs a decision — a per-target "keep private" flag so fleeters can withhold targets from the team push.

**Interaction with open PRs:** PR #531 reworks PTRE galaxy live-event notifications. Same subsystem, different feature — it does **not** close this issue.

---

### #140 — Balanced exploration send

_opened 2022-12-31 by KongGal · no linked PR_

**Status: NOT IMPLEMENTED as requested; the follow-up comment is implemented.**

Requested: divide available cargo ships by the number of _free expedition slots_, so repeated clicks send evenly sized fleets.

Current behaviour (`src/ogCore.js:11470-11505`) sizes a **single** expedition: it computes the minimum cargo ships needed to reach `maxExpeditionPoints`, then tops up to `maxResources * options.expedition.limitCargo`, falls back to the other cargo type when one runs short, and can apply a fleet template. Nothing in that path reads the number of free expedition slots, so ship count per send does not scale with how many slots remain.

morganpizzini's 2024 comment ("let me choose which cargo type") **is** covered: `options.expedition.cargoShip` selects 202 vs 203 and is honoured at `src/ogCore.js:11485-11487`.

**Recommendation:** keep open, but narrow the title to the slot-division part and note the ship-type half as done.

---

### #118 — Alliance members table

_opened 2022-11-04 by adaamz · no linked PR_

**Status: NOT IMPLEMENTED.** No alliance-member tooltip exists in galaxy view.

Partial groundwork is there: `src/ctxcontent/helpers/universe.alliances.js` fetches alliance data and `DataHelper.update()` attaches `[TAG] Name` to each player (`src/ctxcontent/data-helper.js:260-266`). The reverse mapping the feature needs (alliance → member list, sorted by score) is not built, but it can be derived from the existing `players` map without new network calls.

---

### #32 — Sensor Phalanx Range

_feature request · opened 2021-01-11 by F1S1C0 · no linked PR_

**Status: NOT IMPLEMENTED.** The only phalanx-related code is a refresh-link click at `src/ogCore.js:13910-13911` and the building name in the tech table / translations. No range calculation, no display in the building detail view.

The formula is trivial (`level² - 1` systems), so this is a small, self-contained addition — a good first contribution. Note the linked screenshot is on an expired Discord CDN URL.

---

### #30 — Alliance Stats

_feature request · opened 2021-01-11 by PlumbLeech · no linked PR_

**Status: NOT IMPLEMENTED, and explicitly deprioritised** by christiankm in the thread ("can't see that it has that much value compared to the time it takes to make it"). Nothing has changed since 2021.

The reporter later pointed at [CerealOgameStats](https://github.com/EliasGrande/CerealOgameStats) as a reference implementation. Overlaps with #118 — both want alliance-level aggregation over the same `DataHelper.players` data.

**Recommendation:** decide once for #30 + #118 together: either build one alliance module or close both.

---

### #13 — Fly-time / profit-per-minute column in spy table

_feature request · opened 2021-01-05 by christiankm · no linked PR_

**Status: NOT IMPLEMENTED.**

Current spy-table columns (`src/ctxcontent/services/analyzer/SpyMessagesAnalyzer.js:163-207`): `#`, `Date (*)`, `Coords`, `Name (+)`, `Gain`, `Fleet`, `Def`, cargo, colours, `Actions`. Sortable keys are `DATE`, `COORDS`, `$`, `FLEET`, `DEF` (`SpyMessagesAnalyzer.js:318-329`, persisted as `options.spyFilter`).

Neither flight time nor a profit-rate column exists. Both inputs are available client-side — `src/util/flying.js` and `src/util/calcNeededShips.js` already do the distance/duration maths for other views — so this is mostly table plumbing plus one new sort key.

---

### #12 — Setting for the rentability-ratio

_feature request · opened 2021-01-05 by christiankm · no linked PR_

**Status: LIKELY FIXED — verify, then close.**

Two configurable knobs now exist that together cover what the request appears to ask for:

- `options.rvalLimit` — minimum target rentability, editable in settings (`src/ogCore.js:14872` renders the input, `:15341` writes it back), default `1e6` (`src/ctxpage/conf-options.js:60`), consumed throughout the spy table (`SpyMessagesAnalyzer.js:437`, `:453`, `:636`, `:716`) and in `ogCore.js:13232`/`:13252`. Translations exist ("Minimal target rentability to be considered as interesting", `src/util/translate.js:1390`).
- `options.tradeRate` — the metal/crystal/deuterium ratio used to normalise values (`src/ctxpage/conf-options.js`, default `[2.5, 1.5, 1, 0]`).

The original screenshot has expired, so which of the two the reporter meant cannot be confirmed from the issue text alone.

**Recommendation:** confirm with the reporter (or on Discord) that `rvalLimit` + `tradeRate` cover the request, then close.

---

### #8 — Mark favorited reports in the spy table

_feature request, improvements · opened 2021-01-05 by christiankm · no linked PR_

**Status: GROUNDWORK ONLY — the data is parsed, nothing renders it.**

The request has two parts; neither ships.

1. **Show a star for favorited reports.** `SpyReport` parses the flag — `src/ctxcontent/services/analyzer/Object/SpyReport.js:115` sets `this._isFavorited = message.querySelector(".icon_favorited")`, exposed via the getter at `:98`. A repo-wide grep for `isFavorited` returns **only those three lines in that one file** — `SpyMessagesAnalyzer` never reads it, so no column, icon or class is emitted. (Other analyzers do persist a `favorited` field: `ExpeditionMessagesAnalyzer.js:401`, `FightMessagesAnalyzer.js:116`/`:255`.)
2. **Protect favorited reports from the trash button.** Not implemented. The delete path (`SpyMessagesAnalyzer.js:621`, `:638`, `deleteReports()` at `:837`) pushes rows to `reportsToDelete` with no favorite check.

Part 1 is a few lines given the parsed getter. Part 2 is the one that actually removes the reported pain — accidental deletion of favorited targets — and is worth doing together with it.

Loosely related: `ogCore.js:5512`/`:5517` already exempt `favorited` items from the 5-day auto-cleanup, so the "favorites are protected" principle exists elsewhere in the codebase.

---

### #7 — Add players (and all their planets) as targets

_feature request · opened 2021-01-05 by christiankm · no linked PR_

**Status: WORKAROUND EXISTS, core request not implemented.**

kursion's 2022 comment points at the pin icon + sideStalk panel, which covers "follow this player" and is live (`src/util/stalk.js`, `OGBIData.playerMarkers`).

The literal request — adding a player so **all** their planets enter the target list, and stay in sync as they colonise or move — is not implemented. `options.targetList` and the target list UI (`src/ogCore.js:3952-3955`, `:4696-4723`) are keyed by `data-coords`, i.e. per planet, with no player-level entity and no re-sync on planet changes.

Worth noting for the design: PR #533 (open) introduces a coordinate-indexed `galaxyStorage`, which would make "has this player's planet set changed?" cheap to answer. If #7 is ever built, it should land after that.

---

## Process

### #169 — Roadmap/Feature-Recommendation

_opened 2023-03-30 by awarkentin88 · no linked PR_

**Status: META — not a code issue.** Three questions, answered by ThomasWolf94 in-thread in 2023. Current state of each:

| Ask                                                      | Status today                                                                                                                                                                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add a `development` branch between features and `master` | Not adopted. `master` is still the only long-lived branch; branch conventions (`fix/`, `improvement/`, `feature/`) are documented in `readme.md`. The maintainer's stated reason: a shared integration branch makes it harder to attribute a regression to a feature. |
| Publish a roadmap / gate features                        | No public roadmap. Feature toggles do exist — `src/ctxpage/conf-options.js` carries ~40 user-settable options, so most additions can be switched off.                                                                                                                 |
| Guide for running the extension locally                  | **Now answered.** `Makefile` + `scripts/build-unpacked.mjs` produce a loadable build (`make dev`, `make brave`); see the _Local development_ section of `readme.md`. This was the concrete blocker for the would-be contributor in 2023.                              |

The bug-vs-feature prioritisation complaint is a judgement call for the maintainers, not something that can be resolved in the tracker.

**Recommendation:** answer the "run it locally" part with a link to the new readme section and convert the rest to a GitHub Discussion, or close.

---

## How this was produced

```bash
R=ogame-infinity/web-extension
gh issue list -R $R -s open -L 100 --json number,title,body,labels,createdAt,author,comments,url
gh api "repos/$R/issues/<N>/timeline?per_page=100" --paginate   # cross-referenced PRs per issue
```

Cross-references were taken from the GitHub timeline API (`cross-referenced` / `connected` events) and cross-checked against `#`-references and `fixes|closes|resolves #N` patterns in every open PR body. Each issue was then verified against the working tree at `6524a86`; the file/line references above are from that commit.
