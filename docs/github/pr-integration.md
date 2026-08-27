# Open PR integration — result

Companion to [pr-analysis.md](./pr-analysis.md). All 8 open PRs from that snapshot were taken
onto integration branches off `master` @ `6524a86`, with every review item from the analysis
addressed. Nothing was pushed and `master` is untouched apart from one tooling commit.

Every branch: `npm test` green, `node scripts/build-unpacked.mjs chrome` produces a loadable build,
and `src/ogkush.js` carries **no new prettier violations** (master's pre-existing 18 hunks are
unchanged — see the lint note in `CLAUDE.md`).

| PR | Branch | Tests | What had to be fixed |
|---|---|---|---|
| #485 | `fix/pr-485-fleet-movement-timezone` | 179 | double-correction, quotes, `parseInt`, null guards |
| #533 | `feat/pr-533-galaxy-storage` | 191 | author had fixed both review items; tests added |
| #531 | `feat/pr-531-ptre-galaxy-events` | 191 | unhandled bridge rejection, one over-wrapped line |
| #547 | `feat/pr-547-preselection-galaxy-template` | 183 | broken imports, dropped v12 branches, dead code, config migration |
| #546 | `feature/pr-546-remove-historic-players` | 181 | translation id collision with #533 |
| #519 | `feat/pr-519-ghost-spy-p16` | 179 | rebase, 2 conflicts, id collision, formatting |
| #493 | `feature/pr-493-browser-notifications` | 179 | context violation, packaging noise, stray manifest |
| #408 | `feat/pr-408-translations-split` | 185 | redone from scratch — the PR was unmergeable |

`feat/pr-531-ptre-galaxy-events` is stacked on `feat/pr-533-galaxy-storage`, the dependency the
author flagged. Merge #533 first.

---

## Defects found that the analysis did not have

These came out of building the branches rather than reading the diffs.

**#547 would not have loaded at all.** `src/ctxpage/fleetdispatch/templates.js` imported
`../../../util/observer.js` and `../../../util/translate.js`. From
`src/ctxpage/fleetdispatch/` that resolves to a `util/` directory outside `src/`, so the module
throws on import and takes the expedition template feature with it.

**#547 silently dropped v12 support in three places.** The refactor collapsed
`OgamePageData.isAtLeast_13_0_0 ? a : b` to its v13 arm only, losing `#zeuch666`,
`#expeditionFleetOverlay` and the `standardFleets` template list. `CLAUDE.md` requires both
branches until v12 support is dropped deliberately.

**#547 breaks existing users' saved template.** `standardFleetType` is new, so a config written
before this PR has a `standardFleetId` and no type, and the new `templateType === standardFleetType`
guard never matches. `null` is now treated as "either list", with `templateApplied` restored so the
commander pass cannot override an admiral match.

**Three PRs collided on translation id 226**, and #519 additionally renumbered the existing empty
`225` stub, which #546 fills. Final allocation: `#533 → 226`, `#519 → 227, 228`, `#546 → 229, 230, 231`,
`225` left where master has it. A merged table with duplicate keys loses one silently — a JS object
literal keeps whichever came last.

**#493 repeated the context violation that blocks #531.** `ctxcontent/index.js` imported
`util/Notifier.js`, which pulls `OGIData` — the page's `localStorage` singleton — and `Translator`
into the content script. The sync result now returns over an `ogi-notification-sync-rep` event
(`cloneInto`'d on Firefox), matching how `ogi-players` / `ogi-filter` already reply.

**#531's `setTeamKey` bridge calls had no rejection handler.** `pageContextRequest` rejects when the
content script reports `success === false`; both call sites were floating promises. The PR already
handles this for its `galaxyInfo` call.

---

## Per-PR notes

### #485 — fleet movement timezone

The reviewer was right, and here is why: `timezoneDiff` is `localOffset − serverOffset`, and
`getFormatedDate()` renders a unix timestamp in the browser's local timezone. Every other call site
in `ogkush.js` follows `timeZoneChange = options.timeZone ? 0 : timezoneDiff` and *subtracts*; this
PR did the inverse. Since `data-arrival-time` / `data-end-time` are unix timestamps, formatting them
is already the whole correction — adding the diff pushes the display an hour further.

The reversal-tooltip path is different and the PR was right there: those are wall-clock *components*
in server time, read back as browser-local by `new Date(y, m, d, …)`, so they genuinely need the diff.

The PR's undeclared rewrite of the return-timer loop was kept and documented. The 2× rate is not a
bug: the tooltip states when the fleet would be home if reversed *now*, so each second outbound adds
a second of flight back. Recomputing from wall-clock instead of incrementing per tick also fixes
drift in throttled background tabs.

### #533 / #531 — galaxy storage and PTRE events

Both review items were already resolved on the branches by the time they were fetched: internal
fields are stripped before the blob is persisted (`_galaxyFlushTimer`, `_galaxySnapshot`,
`_lastFlushError`, plus `galaxyStorage` itself so a manual reset is not resurrected), the flush
reports serialize and `chrome.runtime.lastError` failures with the payload size, and
`data-helper.js` no longer imports `OGIData` — the PTRE key is pushed in from the page over the
callback-event bridge.

`test/ctxcontent/galaxy.storage.test.js` is new: the coordinate index, the 15-slot materialisation
of a touched system, all three skip conditions, malformed coordinates, that the flush lands in
`ogi-galaxy-<UNIVERSE>` and not the universe blob, and that the debounce clears its timer id.
`getPlanets()` changed shape from a `Map` to `{planets, planetList, timestamp}`, which broke three
existing tests — updated, plus two new ones pinning the flat list and the timestamp the rebuild
gates on.

Still not fixed, and still true: this adds a second large `chrome.storage.local` key that the
`X / 5 Mb` label in issue #532 does not count. #531 does add a "Storage size" readout to the PTRE
settings section, which covers the galaxy key specifically.

### #546 — remove historic players

The `OGIData` persistence concern from the analysis is not an issue: the PR already uses
copy → `splice` → reassign, which is what the write-through setter requires. Removal commits
immediately and undo restores at the recorded index, so navigating away mid-undo leaves the player
removed rather than losing a pending write — documented in the code and covered by two tests,
including a `TRAP:` one for the in-place-mutation footgun.

The analysis's suggestion to extract the deletion/undo logic into its own module was **not** done.
`stalk.js` grows to ~836 lines; splitting it is a reasonable follow-up but adds merge risk here for
no functional gain.

### #519 — ghost spy P16

Rebased. Three conflict decisions:

- `OgamePageData.js` — union. The PR's coordinate/donut getters sit next to `isAtLeast_13_0_0`
  instead of replacing it, the `meta` lookups are null-guarded, and `currentPositionType` uses the
  shared `planetType` enum rather than literal `1`/`3`, which is what #545's v13 work reads.
- `customMissions()` — master's stricter `shipsOnPlanet?.find(x => x.number > 0)` guard kept, the
  PR's `getMissionClass` helper taken.
- Custom spy route — the PR's P16 branch kept alongside master's stale-target comment.

Compliance: this only prefills the game's own fleetdispatch inputs. It is not direct probing
(no `miniFleet`, no `sendFleet`), and the player still dispatches — same shape as the custom-mission
target prefill already on master.

### #493 — browser notifications

Compliance was checked before any code was written, because "notifications that fire when all tabs
are closed" reads like `AGENTS.md` §1.4. It is the allowed case: every notification is registered by
the player clicking a bell on one specific fleet, which is §1.4's own example. `background.js` makes
no server calls, so no polling and no galaxy-view activity. One thing to be aware of rather than a
violation: clicking the bell on an outbound return-based mission also arms the return leg of that
same fleet.

MV3 persistence checked and correct — `onMessage`, `onAlarm` and `onClicked` each call
`InitializeFromStorageAsync()` first, so no module-level state is trusted across worker wakeups.

Cleanups: `packaging.sh` reverted (every hunk only deleted blank lines and it dropped the trailing
newline), `src/manifestv2.json` deleted (nothing referenced it), `"type": "module"` dropped from the
service worker entry (`background.js` has no `import`/`export`), and a commented-out debug
`Notifier.Notify` call removed from `start()`.

**Not a code issue, but a release decision:** `alarms` and `notifications` are new store permissions.
They trigger a fresh review round on Chrome, Edge and AMO, and existing users see a permission prompt
on update.

The analysis suggested splitting this into three PRs. It was integrated whole — splitting it is a
process call for the maintainers, and the branch is easier to split from than the original was.

### #408 — translations split

The PR could not be merged and was not merged. It replaces the `Translator` class with a bare
`translate()` function, breaking every call site; it deletes a 1988-line table that is now 2347
lines; and its `createDOMFromString` helper references an undefined variable. The split was redone
against current `master` instead, which is what the analysis recommends.

What lands keeps the `Translator` class and its entire runtime layer untouched, and moves only the
static tables:

- `src/util/translations/{de,en,es,fr,tr,br}.json`, ~10 KB each. `translate.js` goes 2347 → 140 lines.
- Loaded from `import.meta.url`, not PR #408's `data-base-uri` attribute on the injected script tag.
  It resolves to `chrome-extension://` or `moz-extension://` by itself, works unchanged in both
  contexts, and needs no change to `runContext.js` or either manifest — `util/*` is already in
  `web_accessible_resources`, and the glob covers the nested directory.
- Top-level `await`, so `translate()` stays synchronous for every call site. The read is from the
  extension package: no OGame traffic, no activity.
- English is loaded alongside the player's language when they differ. The old table stored
  `undefined` per language and fell back to English per key; the split files omit those keys, so the
  fallback moved into the lookup. A failed load degrades to `""` rather than taking the page down
  through the top-level `await`.

`scripts/split-translations.mjs` is the extractor, wired up as `make translations` and
`make translations-check`. `test/util/translations.test.js` compares every id in every language
against the pre-split table read from git, so the move is provably lossless.

Side effect: `translate.js` is now prettier-clean, one file off the pre-existing red list.

---

## What was not done

- **Nothing was pushed**, no PRs were opened or commented on upstream, and `master` was not
  fast-forwarded onto any branch.
- **No browser verification.** Every branch builds and its tests pass, but none of it was exercised
  against a live OGame page. The DOM-facing parts — #547's template preselection, #519's P16 inputs,
  #493's bell — are unverified beyond static checks.
- **#546's suggested `stalk.js` module split** and **#493's suggested three-way PR split** were
  skipped, both for the reasons above.
- **Issue #532** (`X / 5 Mb` ignoring `chrome.storage.local`) is still open. Pairing it with #533
  remains a good idea.

One tooling commit was made directly on `master` (`chore(tooling)`): the previously uncommitted
Makefile, test harness, build scripts, lint config and docs. Integration branches need a stable base
that can run `npm test` and `prettier`, and a staged rename in the working tree blocked every branch
switch. It is a local commit and can be reordered or dropped freely.
