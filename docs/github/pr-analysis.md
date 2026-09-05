# Open Pull Requests — Analysis

Upstream repository: [`ogame-infinity/web-extension`](https://github.com/ogame-infinity/web-extension)
Snapshot date: **2026-08-27** · `master` @ `6524a86` (merge of #538, 2026-08-20)

**Scope:** all **8 open PRs**. The 469 closed PRs were not analysed individually.

Companion document: [issues-analysis.md](./issues-analysis.md).

---

## Overview

| PR                                                                 | Title                        | Author        | Opened     | Size                 | Git state               | Reviews                        | Closes an issue? |
| ------------------------------------------------------------------ | ---------------------------- | ------------- | ---------- | -------------------- | ----------------------- | ------------------------------ | ---------------- |
| [#547](#547--featpreselection-galaxy-template)                     | Preselection galaxy template | Bishop341-B   | 2026-08-20 | +162/−73, 6 files    | MERGEABLE / **BLOCKED** | none                           | no               |
| [#546](#546--featureremove-historic-players)                       | Remove historic players      | sersanor      | 2026-08-19 | +396/−31, 3 files    | MERGEABLE / **BLOCKED** | none                           | no               |
| [#533](#533--featstorage-create-new-dedicated-galaxy-storage)      | Dedicated galaxy storage     | GeGeGM        | 2026-08-03 | +223/−16, 5 files    | MERGEABLE / **BLOCKED** | **CHANGES_REQUESTED**          | no               |
| [#531](#531--featptre-rework-galaxy-live-events-notifications)     | PTRE galaxy live events      | GeGeGM        | 2026-07-31 | +610/−150, 5 files   | MERGEABLE / **BLOCKED** | changes requested (as comment) | no               |
| [#519](#519--ghost-spy-p16-for-custom-missions)                    | Ghost spy P16                | fjsjp         | 2026-04-06 | +292/−22, 4 files    | **CONFLICTING / DIRTY** | none                           | no               |
| [#493](#493--featureadd-browser-notifications)                     | Browser notifications        | fjsjp         | 2025-08-20 | +1071/−62, 14 files  | **CONFLICTING / DIRTY** | none                           | no               |
| [#485](#485--fix-times-to-respect-timezone-in-fleet-movement-page) | Timezone in fleet movement   | edgardmessias | 2025-07-25 | +36/−7, 1 file       | MERGEABLE / **BLOCKED** | 3× COMMENTED, unaddressed      | no               |
| [#408](#408--feattranslations-split)                               | Split translations to JSON   | guideloince   | 2024-07-12 | +1555/−1988, 9 files | **CONFLICTING / DIRTY** | none                           | no               |

`BLOCKED` here means the branch merges cleanly but repository policy withholds the merge — it is **not** a technical conflict. The exact rule is not publicly readable (`repos/.../branches/master/protection` returns 404 without admin rights, and no rulesets are exposed); ThomasWolf94 stated in issue #169 that two approving reviews are required, which matches what the queue looks like.

### Headline findings

1. **No open PR closes any open issue.** Not one PR body contains a `fixes`/`closes`/`resolves` reference. The only `#`-reference across all eight is PR #531 → PR #533, a dependency between two PRs. The issue tracker and the PR queue are effectively disjoint.
2. **Review capacity is the bottleneck, not code quality.** Five of eight PRs are `MERGEABLE` and sitting on zero or stale approvals. Only two PRs (#533, #485) ever received substantive review feedback, and #485 has had none since 2025-08-14.
3. **Three PRs have rotted into conflicts** (#519, #493, #408) — 5, 12 and 25 months old respectively. #408 is past the point where rebasing is cheaper than rewriting.
4. **#533 → #531 is the only ordered chain** and #533 is blocked on requested changes, so both are stuck behind one review round.

### Suggested order of attack

| Priority | PR                       | Why                                                                                                                                |
| -------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1        | **#485**                 | 1 file, +36/−7, concrete review feedback already written down. Cheapest merge in the queue — but see the correctness caveat below. |
| 2        | **#533** → then **#531** | Unblocks the only dependency chain. Two specific, small review items on #533; #531 has one architectural violation to fix.         |
| 3        | **#547**, **#546**       | Independent, recent, clean. Just need reviewers.                                                                                   |
| 4        | **#519**                 | Maintainer already pinged the author on 2026-08-18. Needs a rebase decision before review time is spent.                           |
| 5        | **#493**                 | Large and cross-cutting (background worker, both manifests, packaging). Worth doing, but should be split.                          |
| 6        | **#408**                 | Recommend closing and reopening as a fresh PR against current `translate.js`.                                                      |

---

## #547 — Feat/preselection galaxy template

_Bishop341-B · opened 2026-08-20 · +162/−73 across 6 files · MERGEABLE / BLOCKED · no reviews yet_

**What it does:** carries expedition fleet-template preselection from the fleetdispatch page over to the galaxy page. The template must be flagged "use for expedition" via the OGBI mx selectors, must be of _admiral_ type, and requires the "use standard fleet" option to be enabled.

**Files:** new `src/ctxpage/fleetdispatch/templates.js` (+54), `src/ogCore.js` (+50/−66 — net shrink, so logic moved out of the monolith), `src/util/OgamePageData.js` (+37/−7), `src/util/dom.js` (+14, a helper for OGame's custom `<select>` elements), `src/ctxpage/conf-options.js` (+1), `src/global.css` (+6).

**Assessment:** structurally the healthiest PR in the queue — it _removes_ net lines from `ogCore.js` and puts new code in `src/ctxpage/`, which is the direction the codebase should be moving. The `dom.js` helper for OGame's custom selects is reusable beyond this feature.

**Review points:**

- The author states outright that the officers state added to `OgamePageData` is _"finally not needed in the PR, but useful for later"_. That is dead code by the author's own description (+37 lines in a shared singleton). Either a consumer lands in this PR or it should be dropped and reintroduced when something uses it.
- The feature is gated behind three preconditions (template flagged for expedition, admiral type, standard-fleet option on). Worth confirming the failure mode when only some hold — silent no-op vs. a visible hint.

**Relation to issues:** none. Adjacent to #140 (expedition sending) but does not address slot-balanced fleets.

---

## #546 — Feature/remove historic players

_sersanor · opened 2026-08-19 · +396/−31 across 3 files · MERGEABLE / BLOCKED · no reviews yet_

**What it does:** lets users delete players from the historic (stalk) list, with a temporary undo element; adds deletion from a player's detail page; adds an active-planet counter next to player names on that page.

**Files:** `src/util/stalk.js` (+246/−18), `src/global.css` (+119/−5), `src/util/translate.js` (+31/−8).

**Assessment:** self-contained, one subsystem, no cross-context concerns — `stalk.js` runs in the page context and the PR does not touch `ctxcontent/`. The 246 added lines land in a 572-line file, so `stalk.js` grows by ~40%; worth a look at whether the deletion/undo logic warrants its own module.

**Review points:**

- Undo via "temporary element" implies transient DOM state. Behaviour on page navigation before the undo window expires should be checked (deletion committed or silently lost?).
- Deletion presumably mutates `OGBIData.playerMarkers` / the stalk store. `OGBIData` setters write through on assignment but **not** on in-place mutation (see `src/util/OGBIData.js`) — a `delete obj[key]` on a getter result does not persist. Worth verifying explicitly.

**Relation to issues:** none. Touches the same sideStalk feature that kursion offered as a workaround in issue #7, but does not implement player-as-target.

---

## #533 — feat(storage): create new dedicated galaxy storage

_GeGeGM · opened 2026-08-03, updated 2026-08-15 · +223/−16 across 5 files · MERGEABLE / BLOCKED · **CHANGES_REQUESTED** (SergioFloresG, 2026-08-05)_

**What it does:** adds `galaxyStorage`, a coordinate-indexed snapshot of the universe (`galaxy > system > position`) built from `universe.xml`, persisted under a dedicated `chrome.storage.local` key `ogi-galaxy-<UNIVERSE>`. Turns "who owns `2:5:96`?" from an iteration over every player's planet list into an `O(1)` lookup. Empty positions are kept as `-1` so slot presence is meaningful. Rebuild is gated on an API timestamp bump plus the presence of a PTRE team key.

**Files:** `src/ctxcontent/data-helper.js` (+158/−13), `src/ctxcontent/index.js` (+29), `src/ctxcontent/helpers/universe.planets.js` (+17/−3), `src/ogCore.js` (+11), `src/util/translate.js` (+8).

**Assessment:** the design is sound and correctly placed — it lives in the content context where `chrome.storage.local` belongs, rather than in the page-context `ogk-data` blob. It is the base for #531.

**Outstanding review items (both from SergioFloresG, both still open):**

1. `src/ctxcontent/index.js:62` — `tempSaveData = { ...universes[UNIVERSE] }` copies **all** enumerable properties, so an internal `_galaxyFlushTimer` would be serialised into the persisted blob. Internal fields must be stripped before writing. _(This spread predates the PR — it is existing code at `ctxcontent/index.js:35` on master — but the PR is what introduces a timer field for it to catch.)_
2. `src/ctxcontent/data-helper.js` — writes a potentially very large object to `chrome.storage.local` with no quota or error handling. A full universe snapshot at 15 positions × systems × galaxies is not small; `chrome.storage.local` has a per-extension quota and the write can reject.

**Relation to issues:** does **not** fix issue #532, and makes its symptom worse — #532 is precisely that the `X / 5 Mb` label ignores `chrome.storage.local`, and this PR adds another large key there. Fixing #532 alongside this PR (via `chrome.storage.local.getBytesInUse`) would be a natural pairing, and item 2 above needs a quota story anyway.

---

## #531 — feat(ptre): rework galaxy live events notifications

_GeGeGM · opened 2026-07-31, updated 2026-08-15 · +610/−150 across 5 files · MERGEABLE / BLOCKED · changes requested via comment (SergioFloresG, 2026-08-14)_

**What it does:** rebuilds PTRE galaxy reporting on top of `galaxyStorage`. `scan()` diffs incoming galaxy rows against the stored system state and emits only changed slots; first visit of a system force-emits all 15 positions; positions flipping occupied → empty flag the prior owner's coord as deleted. Also fixes own-planet row detection in the galaxy scan, and adds settings-UI touches (enabled/disabled badge for the PTRE team key, input reveal on focus).

**Files:** `src/ctxcontent/data-helper.js` (+333/−81), `src/ogCore.js` (+198/−64), `src/ctxcontent/index.js` (+54/−2), `src/ctxcontent/helpers/universe.planets.js` (+17/−3), `src/util/translate.js` (+8).

**⚠ Hard dependency:** the author flags it explicitly — the branch is rebased onto `feat/galaxy_storage` and **must not be merged before #533**, which provides the `galaxyStorage` field, its storage key, and the `flushGalaxyStorage()` / `scheduleGalaxyStorageFlush()` helpers this PR consumes.

**Outstanding review item — architectural, must be fixed:**

SergioFloresG's comment identifies a context violation. The PR imports `OGBIData` into `src/ctxcontent/data-helper.js`, which runs in the **content script**:

```js
import OGIBData from "../util/OGBIData.js";
const ptreKeyPresent = !!(OGIBData.options && OGBIData.options.ptreTK);
```

`OGBIData` is a singleton over the page context's `localStorage["ogk-data"]`. Instantiating it in the content script creates a second, independent singleton reading a different storage partition — it will not see the user's real options. The PTRE key must reach the content script through the callback-event bridge (`src/util/service.callbackEvent.js`) or be passed as a call argument instead. The reviewer notes the removal belongs in base PR #533.

**Relation to issues:** does **not** close issue #268 (PTRE target-list sync). Same PTRE subsystem, different endpoint and feature.

---

## #519 — Ghost spy P16 for custom missions

_fjsjp · opened 2026-04-06, updated 2026-08-18 · +292/−22 across 4 files · **CONFLICTING / DIRTY** · no reviews_

**What it does:** adds a ghost-spy mission targeting position 16, `−`/`+` buttons for faster system selection (shown only for custom spy P16), and display of empty/inactive systems. Demo video attached to the PR.

**Files:** `src/ogCore.js` (+196/−16), `src/global.css` (+48/−6), `src/util/OgamePageData.js` (+32), `src/util/translate.js` (+16).

**Assessment:** stalled for ~5 months and now conflicting with `master`. Maintainer blag001 pinged the author on 2026-08-18 — _"Where are we on that one @fjsjp ?"_ — with no answer at the time of this snapshot.

**Review points:**

- Needs a rebase before any review effort is spent; the `ogCore.js` hunks are the likeliest conflict source given how much has landed there since April.
- `+32` lines in `OgamePageData` — that singleton is shared by everything and is the OGame-version compatibility gate. Additions there deserve extra scrutiny (see also #547, which adds `+37` to the same file).
- P16 handling interacts with `src/util/enum/planetType.js` and the v13 coordinate work merged in #545 (`fix: v13 SAC position and planetType`, in `master` since 2026-08-20). That merge is a plausible source of both the conflict and a semantic overlap.

**Recommendation:** ask the author to rebase or hand the branch over; if neither happens, close with a note so the work is findable.

---

## #493 — Feature/add browser notifications

_fjsjp · opened 2025-08-20, updated 2026-01-22 · +1071/−62 across 14 files · **CONFLICTING / DIRTY** · no reviews_

**What it does:** real browser notifications (Chrome and Firefox) that fire even when all OGame tabs are closed, as long as the browser runs and the user has logged into the universe. Adds a bell toggle to the fleet-movement view.

**Files:** `src/background.js` (+476/−10), new `src/util/Notifier.js` (+220), `src/util/translate.js` (+144/−5), `src/ogCore.js` (+120/−33), new `src/manifestv2.json` (+37), `src/ctxcontent/index.js` (+17/−2), `src/util/OGBIData.js` (+16), `src/global.css` (+21), new `src/util/enum/NotificationPriority.js` (+7), two SVG assets, both manifests, and `packaging.sh`.

**Assessment:** the most ambitious PR in the queue and the one with the widest blast radius. `background.js` today is 15 lines whose only job is turning `{type: "notification"}` runtime messages into `chrome.notifications`; this turns it into a 490-line scheduler. That is a legitimate feature — but it changes the extension's runtime model, not just a page.

**Concrete manifest/packaging changes worth calling out:**

```diff
  "background": {
-   "service_worker": "background.js"
+   "service_worker": "background.js",
+   "type": "module"
  },
- "permissions": ["storage"],
+ "permissions": ["storage", "alarms", "notifications"],
```

Same permission change in `manifest-firefox.json`.

**Review points:**

- **New store permissions.** `notifications` and `alarms` trigger a fresh review round in the Chrome Web Store, AMO and the Edge add-ons store, and users see a new permission prompt on update. That is a release-planning decision, not just a code review.
- **`src/manifestv2.json` (new, +37).** A third manifest alongside `manifest.json` and `manifest-firefox.json`. `packaging.sh` currently only knows about two, and nothing in the PR's packaging diff wires the third one in. Its purpose needs stating — an unreferenced manifest is worse than none.
- **`packaging.sh` diff is pure noise.** Every hunk deletes blank lines, and the file loses its trailing newline (`\ No newline at end of file`). None of it relates to notifications. This churn should be reverted out of the PR.
- **Persistence.** MV3 service workers are killed aggressively; "works with all tabs closed" depends entirely on `chrome.alarms` being the wake source and all state living in `chrome.storage`. Any module-level variable in `background.js` is lost between wakeups. This deserves explicit review.
- **Size.** Splittable into (a) manifest/permissions + `Notifier.js` + background scheduler, (b) the fleet-movement bell UI, (c) translations. Reviewing 1071 lines across the context boundary in one pass is why this has sat for a year.

**Relation to issues:** none linked. Nothing in the open issue list requests this.

---

## #485 — fix: times to respect timezone in fleet movement page

_edgardmessias · opened 2025-07-25, updated 2025-08-14 · +36/−7 in 1 file · MERGEABLE / BLOCKED · 3× COMMENTED (Bishop341-B, 2025-08-14), unaddressed since_

**What it does:** applies `json.timezoneDiff` to the absolute arrival/return times on the fleet-movement page when the OGBI timezone option is enabled.

**Assessment:** smallest PR in the queue and the closest to mergeable — but the review found a real correctness problem, and the author has not responded in over a year.

**Outstanding review items (Bishop341-B):**

1. **Correctness (the blocker).** The reviewer compared three OGBI versions side by side and reports that `data-end-time` and `data-arrival-time` _already_ carry the corrected time when the OGBI timezone option is on. Applying `timezoneDiff` again in this hunk double-corrects and re-breaks the display. Their proposed workaround is to read the attributes without re-applying the diff, until someone finds where that correction actually happens. Screenshots in the PR thread show the published version has the movement page off by −1h, and this PR overshoots.
2. **Style — double quotes.** The PR uses single quotes (`fleet.querySelector('.absTime')`); the repo enforces double quotes via ESLint (`quotes: ["error", "double"]` in `.eslintrc.js`). `npm run format` fixes this.
3. **Style — line length.** One comment should move to its own preceding line; the repo's `printWidth` is 120 (`.prettierrc`).
4. `parseInt()` on the attributes is considered unnecessary by the reviewer.

**Undeclared scope change worth flagging in review:** beyond the timezone fix, the PR rewrites the return-timer loop. The old code incremented a stored timestamp by `1e3` per tick; the new code recomputes from wall-clock elapsed time and doubles it:

```js
const virtualElapsed = realElapsed * 2; // For each second to arrive, we need to add 2 seconds to the back time
```

That is a behaviour change (and arguably a separate bug fix — the old loop drifts whenever the timer is throttled in a background tab). It is not mentioned in the PR description, which is empty.

**Relation to issues:** touches the same page as issue #23 (fleet movement layout) but addresses times, not layout. Does not fix #23.

**Recommendation:** highest value per review-minute in the queue, _if_ the author returns or someone adopts the branch. Items 2–4 are mechanical; item 1 needs the double-correction question settled first.

---

## #408 — feat(translations): split

_guideloince · opened 2024-07-12, updated 2024-07-14 · +1555/−1988 across 9 files · **CONFLICTING / DIRTY** · no reviews_

**What it does:** extracts the hard-coded translation tables out of `src/util/translate.js` (−1988 lines) into six per-language JSON files (`br`, `de`, `en`, `es`, `fr`, `tr`, 256 lines each), loaded at runtime. Adds small helpers to `src/util/dom.js` (+9) and `src/util/runContext.js` (+2).

**Assessment:** the right idea, two years too late to land as-is.

- `translate.js` on master is now **2347 lines** — the second-largest file in the repo after `ogCore.js`. The PR was written against a 1988-line version. Roughly 350 lines of translations have been added since (including by PRs still open, e.g. #493 adds +144 and #546 adds +31), all of which would have to be migrated by hand.
- The module also gained runtime behaviour the PR predates: `Translator` is now a singleton that scrapes in-game names at runtime and caches them in `OGBIData.json.translations`, with `InitializeLFNames()` fetching lifeform settings pages. A JSON-file split has to coexist with that dynamic layer.
- Loading JSON at runtime raises a packaging question: the files must be listed in `web_accessible_resources` if fetched from the page context, and `packaging.sh` currently minifies `*.js` only.

**Recommendation:** close with thanks and a pointer, and redo the split against current `master` as a fresh PR. Rebasing a −1988-line deletion across two years of edits to the same file is a worse use of time than re-deriving it — the mechanical part (table → JSON) is scriptable.

---

## Cross-cutting notes

**Two PRs touch `src/util/OgamePageData.js`** (#547 +37, #519 +32). That singleton is the OGame-version compatibility gate (`isAtLeast_13_0_0`) used across the messages layer. Whichever lands first will conflict with the other; worth coordinating rather than discovering at merge time.

**Two PRs touch `src/ctxcontent/data-helper.js` heavily** (#533 +158, #531 +333) — but they are a deliberate chain, not a collision.

**Three PRs add translations** (#493 +144, #546 +31, #519 +16) to a file that PR #408 wants to delete. #408's viability shrinks with each of them.

**The context split is the recurring review theme.** #531's blocking review is a page-context module imported into the content script; #533's is internal state leaking into a persisted blob. Both are consequences of the two-context architecture described in `CLAUDE.md` and `docs/service.callbackEvent.md`. A short contributor checklist in the PR template ("does this import `OGBIData` outside the page context?") would catch both classes early.

---

## How this was produced

```bash
R=ogame-infinity/web-extension
gh pr list -R $R -s open -L 100 \
  --json number,title,body,author,createdAt,updatedAt,isDraft,mergeable,mergeStateStatus,additions,deletions,changedFiles
gh api "repos/$R/pulls/<N>/files?per_page=100"    # per-file diffstat and patches
gh api "repos/$R/pulls/<N>/reviews"               # review verdicts
gh api "repos/$R/pulls/<N>/comments"              # inline review comments
gh api "repos/$R/issues/<N>/comments"             # PR conversation
```

Issue linkage was determined from `fixes|closes|resolves #N` patterns and bare `#N` references in every PR body, cross-checked against the `cross-referenced` timeline events of all 16 open issues. Code claims were verified against the working tree at `6524a86`.
