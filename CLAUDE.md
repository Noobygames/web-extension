# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repo.

## What this is

Ogame Infinity (OGI) — Manifest V3 browser extension (Chrome/Edge/Firefox) injecting features into `https://*.ogame.gameforge.com/game/*`. Plain ES modules, no framework. Sources stay per-file ES modules; the **build** bundles them (rollup, no minification — `scripts/bundle.mjs`), so nothing in `src/` may assume a bundler and nothing may assume its absence either.

## Commands

Prefer `Makefile` — works from PowerShell, cmd, Git Bash (recipes shell out to node scripts, not shell builtins):

```bash
make help            # target list
make install         # npm install
make format          # prettier — run before every commit/PR
make check           # eslint
make test            # unit tests (node:test + jsdom)
make coverage        # tests + per-file coverage table
make dev             # unpacked Chromium/Brave build -> dist/unpacked/chrome
make dev-firefox     # unpacked Firefox build       -> dist/unpacked/firefox
make brave           # make dev + launch Brave with it loaded (throwaway profile)
make build           # release zips via packaging.sh
make clean           # rm -rf dist/
```

Raw npm scripts underneath: `npm run format` (`npx prettier --write **.js`), `npm run check` (`npx eslint **.js`), `./packaging.sh 1.5.3`.

**Tests:** `npm test` runs `node:test` suite in `test/` (jsdom for DOM-dependent modules), also on every push/PR via `.github/workflows/test.yml`. Read `docs/testing.md` before adding tests — harness (`test/helpers/globals.js`) and two non-obvious rules live there: pass `chrome: true` to `setupBrowser()` for content-context modules, omit for page-context ones; use `importFresh()` only for construction tests (wrecks coverage attribution for that file).

Some tests prefixed `KNOWN BUG:` or `TRAP:` assert wrong behaviour on purpose, so fix shows as deliberate change. `docs/testing.md` lists them. Fix one → update test, drop prefix. No plain delete.

Lint note: `npm run check` is **green and gating**. It runs in CI (`.github/workflows/test.yml`, after the tests) and covers `src/`, `test/`, `scripts/`; `.eslintignore` keeps vendored `src/libs/` out. `.eslintrc.cjs` extends `prettier` and must **not** re-enable any stylistic rule (`indent`, `quotes`, `semi`, `linebreak-style`): it used to, those rules fought `prettier/prettier` over the same code, and the resulting 240 phantom errors kept lint permanently red — which is why six real findings sat unnoticed. Line endings are enforced by `.gitattributes` (`eol=lf`) plus Prettier `endOfLine: "lf"`, not by ESLint. Still do NOT run `npm run format` across the tree to clear an unrelated red: a whole-tree reformat as a side effect buries the real diff.

`packaging.sh` is bash + `zip` + `sed -i` (GNU) — on Windows run from Git Bash/WSL (`make build` shells out to `bash`). Publish via GitHub Actions (`.github/workflows/main.yml` → Chrome/Edge via BPP, `deploy_amo.yml` → Firefox via `web-ext`), both `workflow_dispatch` with version input.

**`src/` cannot load as unpacked extension directly** — version placeholders (`0.0.0` in manifest, `__VERSION__` in `src/util/version.js`) need substitution first. Use `make dev` / `make dev-firefox` (`scripts/build-unpacked.mjs`): same stamping + Firefox CSS rewrite as `packaging.sh`, but leaves loadable directory not zip, and strips two store-only manifest keys — `update_url`, and `extension_ids` whitelist inside `web_accessible_resources` (local build has different extension id, whitelist would lock build out). After editing `src/`, re-run `make dev` and reload extension.

`scripts/launch-brave.mjs` (behind `make brave` / `make brave-main` / `make brave-open`) autodetects Brave binary — override with `BRAVE_PATH` — and defaults to throwaway `--user-data-dir` under `dist/.brave-dev-profile`, because already-running Brave would just open tab and drop `--load-extension`. Also passes `--disable-features=DisableLoadExtensionCommandLineSwitch` for Chromium 137+ and `--disable-extensions-except=<build>`; latter because Web Store OGI build would otherwise inject `ogkush.js` into same page and share `localStorage["ogk-data"]` key with local build. Both session-only flags, nothing uninstalled. `--keep-extensions` opts out, `--dry-run` prints command line without spawning.

## Two execution contexts — the core of the architecture

Everything hinges on which context a file runs in. Same repo, same module graph, different capabilities.

|       | Content context                                             | Page context                                                    |
| ----- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| Entry | `src/main.js` → dynamic import of `src/ctxcontent/index.js` | `src/ogkush.js` (injected as `type="module"`)                   |
| Dirs  | `src/ctxcontent/**`                                         | `src/ogkush.js`, `src/ctxpage/**`                               |
| Has   | `chrome.*` APIs, `chrome.storage.local`, cross-origin fetch | OGame's DOM and page globals (`DOMPurify`, `LZString`, `Chart`) |

Boot chain: `main.js` (content script, `document_start`) does **not** wait for `DOMContentLoaded`. It applies the cached wide-layout classes to `<html>`, mints the bridge token and publishes it on `<html>`, then fires everything off at once: `injectScript()` for `libs/purify.min.js` and `ogkush.js`, plus a dynamic import of `ctxcontent/index.js` whose `main(callbackToken)` registers the callbacks and loads/refreshes the universe `DataHelper`. Nothing waits on anything else. `libs/lz-string.min.js` and `libs/chart.min.js` are **not** on the boot path: both are injected on demand over the `ogi-lzstring` / `ogi-chart` events, from `ensureLZString()` and the chart code respectively. `ogkush.js` awaits DOMContentLoaded itself (`domReady()` in the bottom IIFE) before touching DOM. Three consequences worth knowing:

- **No module in the page graph may read DOM at module-evaluation time** — `<head>` is still empty then. `OgamePageData`, `translate.js` (`currentLanguage()`), `popup.js` (`getPlayerClass()`), `flying.js` (`hasLifeforms()`) were made lazy for exactly this, and `needs.js` defers its observer. Adding an eager `document.querySelector` at top level of a page-context module silently breaks it.
- **The bridge token is minted in `main.js`, not in `service.callbackEvent.js`.** `pageContextInit()` throws without a token on `<html>`, which used to force `ogkush.js` to be injected only after the content module had loaded. `main.js` now creates it (`createCallbackToken()` has a hand-copied twin there — classic content script, cannot import) and passes it into `contentContextInit(map, token)`, so the 1.1 MB page bundle and the content bundle download side by side. Either half may initialise first; `pageContextInit()` still replaces the published token with `"1"`, and the content half no longer reads the dataset when it was handed a token.
- **Bundling is part of the build.** `make dev` / `make build` run `scripts/bundle.mjs` (rollup, `treeshake: false`, no minification) which collapses `ogkush.js` (69 modules, 1.15 MB, 7 levels deep) and `ctxcontent/index.js` into one file each. `OGI_NO_BUNDLE=1 make dev` skips it. `test/bundle.test.js` builds the real bundles and evaluates the page one, because a bundler breaks module evaluation order silently and no other test would notice.

- **`start()` is `async` and yields once.** It draws the right planet bar first (`renderPlanetBar()`, the same list the planet-bar observer runs), then `await nextPaint()`, then everything page-specific. Reason: a browser paints nothing a task wrote until the task ends, so before the yield all ~50 steps landed on screen together. Keep planet-bar work in `renderPlanetBar()` and everything else after the yield; the boot IIFE awaits `start()` so `perf.report()` still sees the later steps.
- **The empire refresh is prefetched at `document_start`** (`startEmpirePrefetch()` in `ogkush.js`, consumed once by `getEmpireInfo()` via `takeEmpirePrefetch()`). Same single background call, moved ahead of the game's page load, gated by `empireRefreshDue()` — the one copy of the throttle, shared with `updateEmpireData()`. Do not add a second copy of that rule and do not prefetch anything else from there: AGENTS.md §4 allows this only because the call count per page load is unchanged.

`src/background.js` (481 lines) is the service worker and the only part of the extension that outlives a page: Chrome unloads it between events, so all state round-trips through `chrome.storage.local["ogi-notifications"]`. It registers three listeners — `runtime.onMessage` (raise / schedule / cancel / sync a notification), `alarms.onAlarm` (fire a scheduled one), `notifications.onClicked` (focus or open the right OGame tab). Covered by `test/background.test.js` (81%), which drives it through those listeners because the module has no exports.

Startup profiler: `src/util/perf.js`. Off and free by default; `localStorage.setItem("ogi-perf", "1")` (or `&ogi-perf=1` in the URL) makes `ogkush.js` print a console table of every boot phase, every `start()` step over 0.5 ms, and the `ogk-data` parse/write totals. See `docs/performance.md`.

`src/util/**` shared by both contexts; util must not assume `chrome.*` exists. `src/util/runContext.js` (`isPluginContext()`, `injectScript()`) is the guard.

**Aborting requests.** Every `fetch` the extension makes takes `pageSignal()` from `src/util/abort.js` — one controller per page load, aborted on `pagehide`. Never write `window.onbeforeunload = () => controller.abort()`: that property is a single slot, six modules were assigning it, and each assignment disarmed the previous one. A test in `test/util/abort.test.js` fails if the pattern comes back. Because OGame navigates on every view change, aborts are the normal case, not a failure: `isAbortError()` / `ignoreAbort()` for local handling, and `suppressAbortRejections()` (called once per context) drops the `Uncaught (in promise) AbortError` noise — but only while the page is actually leaving, so a real error still shows.

### Crossing the boundary

Preferred: typed bridge in `src/util/service.callbackEvent.js`. Content script calls `contentContextInit({command: {action: fn}})` (see `ctxcontent/index.js`); page calls `pageContextInit()` once then `await pageContextRequest(command, action, ...args)`. Commands today: `ptre.galaxy`, `messages.expeditionType`. Promise **rejects** (with `ResponseCallbackEvent`) when `success === false` — always `try/catch`. Docs: `docs/service.callbackEvent.md`, `docs/context.content.commands.md`.

Legacy: hand-rolled `CustomEvent` request/reply pairs still used — `ogi-players`/`ogi-players-rep`, `ogi-filter`/`ogi-filter-rep`, plus fire-and-forget `ogi-chart`, `ogi-clear`, `ogi-notification`. New cross-context calls use bridge, not new event pairs.

Firefox: any object passed content script → page must go through `cloneInto(obj, document.defaultView)`. Bridge does it for you; legacy listeners do it inline with `navigator.userAgent.indexOf("Firefox")` check.

### Two separate stores

- Page context: `src/util/OGIData.js` — singleton over `localStorage["ogk-data"]`. Every setter writes through immediately, so `OGIData.options = {...}` persists but `OGIData.options.foo = 1` does **not** (mutating returned object skips setter; reassign, or call `OGIData.Save()`). The write-through is deliberate and load-bearing — see `docs/performance.md` for why deferring it was tried and reverted.
- Boot mirror: `localStorage["ogi-layout"]` — three wide-layout switches only, written by `ctxpage/wide-layout.js` on every apply and read by `main.js` at `document_start`. Exists because `ogk-data` is far too large to parse before first paint. Keep it in step if a fourth switch is added.
- Content context: `chrome.storage.local`, keyed per universe — `<UNIVERSE>` (serialized `DataHelper`), `ogi-scanned-<universe>`, and `<universe>-<key>-information` via `ctxcontent/services/universe.storage.js`.

## Key structures

`src/ogkush.js` is **no longer the monolith** — Phase 3 of `refactoring.md` took it from 19k lines to ~1.8k. What is left is the boot sequence: `class OGInfinity` with `constructor`/`init`/`start`, the ~40 methods that are still page wiring, and the bottom IIFE that constructs `OGInfinity` and `Messages`, waits for `DOMPurify` and calls `ogKush.start()`. Everything else lives under `src/ctxpage/**` (stats, fleetdispatch, galaxy, planetbar, empire, empireOverview, settings, technoDetail, keyboard, eventbox, stalk, pantry, pageTweaks) and `src/util/**`. New features go there and get wired in — never appended to `ogkush.js`.

**How a page module gets its state.** An extracted module never receives the `OGInfinity` instance; it takes a plain `context` object built by one of the controller's `…Context()` methods (`fleetContext()`, `galaxyContext()`, `empireContext()`, …). A `context` that carries a bound method or the instance itself defeats the whole cut, and `test/ogkush.construction.test.js` fails on it. Where a module genuinely has to hand work back — the loading gate around `updateInfo()`, `flyingFleet()`, the `keyboardActionSkip` setter — the context carries a callback, not a method reference.

**Four traps the extraction hit, all silent.** `test/ctxpage/module-wiring.test.js` and `test/ogkush.wiring.test.js` exist because none of these fail a build, a lint or a bundle:
1. A module function named after an OGame page global **shadows it for the whole module** — `fleetDispatcher` had to become `initFleetDispatcher` or the entire dispatch page would have been dead.
2. Inside a classic `function` assigned onto one of OGame's objects (`technologyDetails.show`, `FleetDispatcher.prototype.submitFleet2`), `this` is **that object**. Rewriting `this.x` to `context.x` there changes what the code reads.
3. A constant left behind in `ogkush.js` is a `ReferenceError` on first use.
4. A module nobody imports simply never runs; the tell is the bundle getting smaller.

**Testing `ogkush.js`.** The module exports `OGInfinity` **for tests only** — nothing imports it at runtime, and `test/bundle.test.js` asserts it stays the only export of the page bundle. `test/ogkush.construction.test.js` builds it from a page fixture and checks the contexts it hands out; importing the module runs its boot IIFE, so that file's `setupBrowser()` URL uses `component=intro`, one of the three pages the IIFE bails out on before touching the DOM or the network. The constructor's DOM reads live in `src/util/pageContext.js` (`readPageContext` / `stripCoordinateBrackets`, 100% covered) — that seam is what makes `new OGInfinity()` possible in a test at all. Page fixtures: `test/fixtures/ogamePage.js`.

**Message analyzers.** `src/ctxpage/messages/index.js` (`class Messages`) observes messages component, dispatches to array of analyzers. Each analyzer implements informal interface `support(tabId) → bool`, `clean(force)`, `analyze(messageCallable, tabId)`. Tab ids come from frozen `messagesTabs` map in that file. Analyzer implementations live under `src/ctxcontent/services/analyzer/` despite running in **page** context — directory name misleading; new analyzer = drop class there, push into `#analyzers`.

`src/ctxpage/messages-analyzer/index.js` is the older path, still **live**: `analyzer()` guards with `if (this.page !== "messages") return;` and `ogkush.js` calls it via `ctxMessageAnalyzer.call(this)`. It is **scheduled for deletion** — see the header comment in that file for the evidence and the one thing that has to move first (the `.msg_date` timezone rewrite, which no analyzer class covers). Until then, note that both paths accumulate into the same `OGIData.expeditionSums` / `OGIData.combats` keys and disagree on the shape of `harvest` (`[0,0]` here vs `[0,0,0]` in `HarvestMessagesAnalyzer`). Do not add features to the old path, and do not delete it before its tests exist.

**Two DOM builders, on purpose.** `util/dom.js` exports `createDOM` (content set as `textContent`, adds `dropdownInitialized` to `<select>`) and `createDOMSanitized` (content set as `innerHTML` through `DOMPurify`, renders a numeric `0`, no select marker). The second was `OGInfinity.createDOM()` until the Phase 1 cut and has ~52 call sites. They are not interchangeable: swapping one for the other either escapes markup that was meant to render, or renders markup that was meant to be escaped. `test/util/dom-and-wait.test.js` pins all three differences.

**OGame version: 13 and later only.** v12 support was dropped in Phase 2 of `refactoring.md`. All 34 `OgamePageData.isAtLeast_13_0_0` forks are collapsed to their v13 branch — write the v13 selector and nothing else; do NOT reintroduce a second branch. `src/util/OgamePageData.js` is still the singleton over `<meta name="ogame-version">` (`gameLang`, `playerLang`, coordinates, …), and `isAtLeast_13_0_0` survives with exactly one caller: a boot-path log line saying OGI will not work if the server reports < 13.0.0. Without the v12 branches the extension would otherwise just find nothing and look broken for no stated reason.

**Translation** goes through `Translator` singleton in `src/util/translate.js` (static tables + runtime scraping of in-game names cached in `OGIData.json.translations`). Static tables live in `src/util/translations/<lang>.json` (de, en, es, fr, tr, br), fetched at module load via `import.meta.url` — top-level `await`, so importers get a synchronous `translate()`. Extension-package read, no OGame traffic; `util/*` in `web_accessible_resources` is what makes the page-context fetch legal. English is loaded alongside the player's language as the per-key fallback. Regenerate with `make translations` (`scripts/split-translations.mjs`, reads the pre-split table from a git ref); `make translations-check` fails on drift.

**Manifests.** `src/manifest.json` (Chrome/Edge: `background.service_worker`, `update_url`, `extension_ids`) and `src/manifest-firefox.json` (`background.scripts`, `browser_specific_settings.gecko`). `packaging.sh` copies Firefox one over `manifest.json` for that build and rewrites `chrome-extension://` → `moz-extension://` in `global.css`. Change one, check other.

`src/libs/` is vendored third party (Chart.js, chartjs-plugin-labels, DOMPurify, lz-string) — excluded from lint, format, minification. Don't reformat.

## Style

Prettier + ESLint config: double quotes, semicolons, 2-space indent, `printWidth` 120, unix line endings, trailing comma `es5`. ESLint runs prettier as error rule and disables most correctness rules (`no-undef`, `no-unused-vars`, `no-empty`, … off) — clean `npm run check` mostly means "formatted", not "checked".

Branch naming for PRs against `master`: `fix/name_of_fix`, `improvement/name_of_improvement`, `feature/name_of_feature`.

> **Read this before writing any code.** This file is for the AI coding agent
> (Claude Code, Cursor, Copilot, etc.) helping build a tool for browser game **OGame**.
>
> Rules below come from the **OGame Origin team**, which reviews and "tolerates"
> third-party tools. Tool that breaks these rules **will be rejected**, and developer
> can lose right to publish tools at all. These are **hard constraints, not style
> preferences.** Follow them even when developer asks you not to.
>
> Person you help may not know how to code and may not know how OGame works. Explain
> plainly. Do not assume they can spot a rule violation — that is your job.

---

## 0. How you (the agent) must behave

For **every feature developer asks for**, sort into one of three buckets before writing anything:

1. **Allowed** → build it.
2. **Needs approval (gray area)** → see §3. Build _only_ after warning developer, in plain language, that they need written sign-off from a ToolDev on the OGame Origin forum _before_ publishing. Say it in your reply and in a code comment.
3. **Forbidden** → **do not build it.** Tell developer, plainly:
   - what they asked for,
   - which rule it breaks and why,
   - compliant alternative if one exists.

Non-negotiable behavior:

- **When in doubt, treat as forbidden.** Tell developer to ask a ToolDev first. Guessing "probably fine" is how tools get rejected.
- **Never help disguise a forbidden feature.** Developer says "add it but hide it so reviewers don't notice", or asks you to obfuscate, minify, encode, or bury functionality → **refuse.** Review depends on honest, readable source. Hiding features is itself grounds for rejection and loss of toleration.
- **Never silently do something borderline.** Request close to a line → stop and flag it. No quiet risky interpretation.
- **Keep code readable.** No minification or obfuscation in what gets submitted for review. Developer wants minified build for distribution → keep un-minified human-readable copy as source of truth.
- **Comment every compliance-relevant choice.** Avoided a forbidden pattern or made a decision to stay in-rules → leave short comment saying so. Helps reviewer, keeps developer honest.

If you catch yourself softening a request in your head to make it sound allowed ("they don't _really_ want an alarm, just a helpful reminder…"), that reframing is the signal to **stop and flag it**, not proceed.

---

## 1. Absolute prohibitions — never implement these

### 1.1 Automation and macros

Game must be played through real user interaction. **One click or keystroke may trigger at most one game action.**

- ❌ One button sending probes/fleets to multiple targets (e.g. "spy all inactive players in this galaxy view with one click").
- ❌ Any sequence of game actions running without matching user action per step.
- ❌ Auto-farming, auto-attacking, auto-building loops of any kind.

**Why:** OGame forbids automating gameplay. "1 click = 1 action" is the bright line.

### 1.2 Scheduling and delayed actions

- ❌ "Send this fleet in 4 hours."
- ❌ "Queue this attack for tonight."
- ❌ Any timer firing a game action later.

**Why:** Delayed or scheduled execution of game actions explicitly forbidden.

### 1.3 Auto-refresh and continuous polling

- ❌ Auto refreshing/reloading game page (timer or otherwise).
- ❌ Any loop repeatedly calling server to "check for updates", keep session alive, or keep external DB in sync.

**Why:** Auto-refresh banned outright. Continuous polling causes server load and can reveal player is online (see §4). §4 covers which background calls _are_ allowed.

### 1.4 Automatically registered notifications and alarms

Line here: **who registered the notification, and how.**

**Forbidden — notifications the _tool_ registers automatically:**

- ❌ Tool watches for in-game events on its own and alerts player — e.g. auto alarm on incoming attacks, finished buildings/research, fleet arrivals.
- ❌ Any auto-registered alarm: sound, browser/desktop notification, email, **webhook, or Discord ping.**

**Allowed — notifications the _player_ registers manually, one at a time:**

- ✅ Player explicitly opts in for one specific event. Example: player sends fleet, then clicks "notify me" icon next to _that_ fleet. Player chose it, per instance — tool did not register automatically.
- ✅ Immediate UI feedback confirming action user just took, e.g. "Settings saved". Not an event alarm at all.

**Why:** Auto-registered alarms designed to alert player to in-game events (especially while away/inactive) are prohibited. Per-event notification set by hand is not automatic — fine.

> Edge case: _manually_ registered notification pushing to external service (Discord, email, webhook) so it reaches player while away is closer to the line than on-page notice. Build on-page version by default; have developer confirm external-channel version with a ToolDev before shipping.

### 1.5 Drastic shortcuts, alternative UIs, and lobby bypass

- ❌ Collapsing several page loads or clicks into single action to skip normal game flow.
- ❌ Alternative UI replacing how game is played.
- ❌ Bypassing lobby / logging in directly, or otherwise circumventing official game flow.

**Why:** OGame meant to be played through UI the game provides. Tools bypassing core gameplay loops (fleet dispatch, building selection, login) get no exceptions.

#### 1.5.1 Direct probing — the most common violation here

"**Direct probing**" = sending espionage probes _immediately_, without player going through normal fleet-dispatch flow — typically by calling on-page `sendFleet` function or `miniFleet` endpoint (`index.php?page=ingame&component=fleetdispatch&action=miniFleet&asJson=1`) yourself.

**Vanilla game already allows** direct probing from exactly two places: **galaxy view**, and **spy reports already in player's inbox**. Your tool may not add direct probing anywhere else. Required flow for probing new target always: **click coordinate → land in galaxy view → click game's own probe icon.**

- ❌ Showing player's planets/moons with "probe now" icon next to each coordinate. (Forbidden **whether or not** list sits inside galaxy view.)
- ❌ Pulling all inactive players from API, listing them, letting player direct-probe those targets.
- ❌ Letting player build custom target lists and direct-probe from the list.
- ✅ Overview of spy reports **already in player's inbox**, direct probe on each — game already permits direct probing from inbox spy reports.

**Important — displaying data is fine; the direct probe isn't.** Showing all of a player's coordinates, or letting player build and organize custom target lists, is **allowed**. Forbidden part = attaching direct-probe action to those coordinates or lists. Show data, then send player through game's own galaxy-view probe flow.

**Why:** Attaching direct probing to your own lists/overviews shortcuts fleet-dispatch flow and circumvents game UI — drastic shortcut.

### 1.6 Imitating Dark Matter / premium features

- ❌ Recreating features normally requiring **Dark Matter** (premium currency). Classic example: **imitating Commander's building/construction queue.**

**Why:** Imitating paid features strictly prohibited. Feature exists only behind Dark Matter or Officer → may not rebuild it free.

### 1.7 Blocking or altering monetization and legal content

- ❌ Hiding, obscuring, resizing, moving off-screen, changing opacity of, or swapping images of: banners, top advertisement bar, premium/monetization content, footer, or menu items **Merchant, Recruit Officers, Shop**.

**Why:** Tools may not block or alter monetization or legally required content, in any way — including sneaky CSS tricks.

### 1.8 Paywalls, fees, and injected advertising

- ❌ Charging money for tool. ❌ Locking features behind "premium" tier.
- ❌ Requiring paid third-party subscription (e.g. Patreon-only access).
- ❌ Injecting your own ads into game.

**Why:** All forbidden.

✅ **Allowed:** optional donation button, or link to `hero.li`.

### 1.9 Silent scraping of private data

- ❌ Quietly collecting user's private data — messages, exact fleet compositions, session tokens, precise activity times — and sending to external server or DB **without user's explicit, informed consent.**

**Why:** Covert exfiltration of private data forbidden. Feature sends _any_ data off user's machine → user must clearly know and agree, and (see §5) tool very likely needs toleration.

---

## 2. If asked for something forbidden — say this kind of thing

Template for your reply (adapt, keep plain):

> "I can't build that. OGame's rules forbid **[short reason, e.g. sending notifications for in-game events]**, and tools doing this get rejected by the review team. What I _can_ do instead is **[compliant alternative, or 'nothing — this whole idea isn't allowed']**. If you think there's an exception for your case, ask a ToolDev on the OGame Origin forum before we build it."

Don't bury refusal in bullet points or hedge it. State clearly, then move to what _is_ possible.

---

## 3. Gray areas — build ONLY after the developer gets ToolDev approval

Evaluated case-by-case by Origin team, must be **explicitly approved by a ToolDev before publishing**. You may prototype, but tell developer loudly approval comes first — and never let them imitate a premium feature in the process.

- **Batching repetitive, non-tactical actions on developer's _own_ planets** — e.g. queuing several shipyard or defense orders. _May_ be allowed as quality-of-life, but only with sign-off, and must **not** imitate Commander's building queue (§1.6).
- **Pure comfort / convenience features** touching game UI or flow. Sometimes allowed, sometimes not — ToolDev decides. Anything shortcutting a core gameplay loop gets _no_ exception.

When implementing one, add comment:
`// GRAY AREA: requires ToolDev approval before publishing — see AGENTS.md §3`
and repeat warning in your reply.

---

## 4. Background calls and network discipline (easy to get wrong)

This section prevents the most common accidental violations. Read it even if feature seems harmless.

**What "a background call" is here:** request _your tool_ sends to game server on its own (`fetch`/XHR to game endpoint), separate from page the player loaded by clicking. Reading data _already on a page the player opened_ is not a background call, not restricted by this section.

**What "activity" means in OGame:** activity is signal other players see. Whenever player interacts with own planet or moon, game marks that position recently active, and **other players see it in galaxy view** — star for very recent activity, or number counting minutes since (up to ~1 hour). Attackers read it to judge whether target is online now. Background call to game produces same activity signal. So ill-timed or repeated background call can broadcast player is online — or make them look online while away — which normal play would not do at that moment.

With that in mind:

- **OGame is not a single-page app.** Tool can make background calls only while player genuinely active in game with page loaded — never in background while logged out or away.
- **Every background call produces activity — no activity-free one exists.** That's why the timing rules below exist.
- **Permitted:** background calls may fire **on page load** — player navigates, game page loads. **Never** on timer, loop, deferred schedule, auto-refresh, and never continuously once page finished loading. (Same as §1.3.)
- **Strongly recommended (do this):** don't re-fetch on every page load. **Hydrate all data your tool needs once, at login**, then **keep state current by reading the DOM** as player navigates normally. Pages player opens already contain fresh data to read — reading what's on the page is not a background call, adds no activity. Lightest-footprint design, the one reviewers want; login is natural moment because logging in already produces activity.

### 4.1 The `accountInfo` endpoint — do not poll it

- **Heavy, full-account snapshot** (officers, per-planet production, buffs, buildings/ships/defense per planet and moon, etc.).
- Calling it **refreshes highscore for everything across all planets at once** — dead giveaway player is personally online and refreshing.
- ❌ Never poll `accountInfo` to keep external DB or UI "fresh."
- ✅ Already returns per-planet data for **all** planets in one response — read **once**, filter client-side. No repeated calls needed for cross-planet data.

### 4.2 The `cp` (change planet) parameter — never in background calls

- `cp=<planetId>` means "change planet". **Mutates session's active planet** — real state change, not read-time filter. Later call without `cp` returns whatever planet `cp` last set.
- ❌ Never send `cp` in background/automated call. Changing planets without matching user click is forbidden background state mutation.
- ✅ Read-only needs: don't switch planets at all — use single `accountInfo` response, filter client-side (see §4.1).

---

## 5. Does this tool even need toleration?

Tell developer which case they're in.

**Needs toleration (submit for review before publishing):**

- Anything running on or inside OGame page: browser extensions, userscripts, add-ons, injected UI.
- Any external server/tool/DB receiving, storing, or evaluating **live data scraped from the game** (galaxy databases, activity trackers, spy-report aggregators). _Both_ scraping script and receiving server get reviewed.
- **Any auto-fill or scrape script** pulling data from game — even if it only feeds an otherwise-standalone calculator. Script itself needs toleration.

**Does NOT need toleration:**

- Standalone calculators/simulators (web tool, spreadsheet, desktop app) using **only manually entered data** (e.g. user pastes report) **or data from official OGame API** (§6).

**Doesn't cleanly fit "does not need toleration" → assume it needs toleration** and tell developer to submit (or ask a ToolDev) before publishing. Do not publish browser extensions to stores before toleration granted.

---

## 6. API and data access

- **Use community proxy for API calls. Do not hardcode or request private API key.** Route through:
  ```
  https://ogapi.faw-kes.de/
  ```
  No permission is needed to use the proxy. Private keys are reserved for a few
  established tools with special needs and require a separate application — not
  relevant for a new tool.
- **Public OGame API** (per universe; swap the `sX-XX` part for the target server;
  append `?toJson=1` for JSON instead of XML):
  `highscore.xml`, `players.xml`, `alliances.xml`, `universe.xml`,
  `serverData.xml`, `playerData.xml`, `localization.xml`, `universes.xml`, and the
  lobby-wide server list at `https://lobby.ogame.gameforge.com/api/servers`.
  These update on fixed schedules (hourly to weekly), so there is **no reason to
  poll them frequently** — cache the result and respect the update interval.
- **Report/statistics endpoints and other non-public API** need the proxy (or, by
  exception, a private key) and the report's own API string from the in-game "API"
  button. Do not invent endpoints or credentials.

Entity ID ranges, endpoint quirks, and other deep game mechanics live in the Origin
team's domain notes — if you need one and don't have it, ask the developer to get it
from a ToolDev rather than guessing.

---

## 7. Before you say "done" — self-audit

Run this checklist and report the results to the developer. It maps to the
compliance declaration every submission must sign.

- [ ] **No automation:** every game action is triggered by one distinct user
      action (1 click = 1 action).
- [ ] **No scheduling / delayed actions.**
- [ ] **No auto-refresh** of the game page.
- [ ] **No continuous polling loops, timers, or deferred calls.**
- [ ] **Background calls fire only on page load** — never on a timer, loop, deferred
      schedule, or auto-refresh. (Recommended: hydrate once at login, then track
      changes from the DOM. Every background call produces galaxy-view activity.)
- [ ] **No `accountInfo` polling; no `cp` in background calls.**
- [ ] **No automatically registered alarms / notifications / webhooks / Discord pings** for in-game events. (Player-set, per-event notifications fine.)
- [ ] **No direct probing** attached to coordinate displays or custom target lists; new targets go through game's galaxy-view probe flow. (Direct probe on inbox spy-report overview OK.)
- [ ] **No alternative UI, drastic shortcuts, or lobby bypass.**
- [ ] **No imitation of Dark Matter / premium features** (e.g. Commander queue).
- [ ] **Monetization and legal content untouched** (ads, banners, footer, Merchant, Recruit Officers, Shop).
- [ ] **No fees, paywalls, paid subscriptions, or injected ads.**
- [ ] **No data leaves user's machine without explicit, informed consent;** if any does, tool flagged as needing toleration.
- [ ] **API calls go through community proxy;** public API results cached, not polled.
- [ ] **Source is readable** — not minified or obfuscated — and compliance-relevant choices commented.
- [ ] **Gray-area features flagged** as needing ToolDev approval before publishing.
- [ ] **Toleration status stated:** does this tool need review submission? (§5)

Any box unchecked → say so plainly, tell developer what to fix or who to ask.

---

## 8. Quick reference — common requests → verdict

| Developer asks for…                                             | Verdict                               |
| --------------------------------------------------------------- | ------------------------------------- |
| "Auto-alarm me on Discord whenever I'm attacked"                | ❌ Forbidden (§1.4)                   |
| "Automatically notify me when any building finishes"            | ❌ Forbidden (§1.4)                   |
| "'Notify me' icon the player clicks on a fleet they just sent"  | ✅ Allowed (§1.4)                     |
| "Auto-send my fleet at 2 AM"                                    | ❌ Forbidden (§1.2)                   |
| "One button to spy every inactive player in this galaxy"        | ❌ Forbidden (§1.1)                   |
| "Probe-now icon next to each coordinate in a player overview"   | ❌ Forbidden (§1.5.1)                 |
| "Custom target list with a direct-probe button on each entry"   | ❌ Forbidden (§1.5.1)                 |
| "Auto-find inactives from the API and let me direct-probe them" | ❌ Forbidden (§1.5.1)                 |
| "Show a player's full coordinate list (no probe button)"        | ✅ Allowed (§1.5.1)                   |
| "Let me build and organize custom target lists (view only)"     | ✅ Allowed (§1.5.1)                   |
| "Overview of the spy reports in my inbox, direct-probe on each" | ✅ Allowed (§1.5.1)                   |
| "Auto-refresh the game to keep me logged in / catch attacks"    | ❌ Forbidden (§1.3)                   |
| "Poll the server every minute to update my galaxy database"     | ❌ Forbidden (§1.3, §4)               |
| "Add a slick building queue like the Commander's"               | ❌ Forbidden (§1.6)                   |
| "Hide the shop button and ads to clean up the UI"               | ❌ Forbidden (§1.7)                   |
| "Charge €3/month for premium features"                          | ❌ Forbidden (§1.8)                   |
| "Replace the whole game with my nicer interface"                | ❌ Forbidden (§1.5)                   |
| "Log in directly and skip the lobby"                            | ❌ Forbidden (§1.5)                   |
| "Secretly send everyone's activity times to my server"          | ❌ Forbidden (§1.9)                   |
| "Queue several defense orders on my own planet at once"         | ⚠️ Gray — needs ToolDev approval (§3) |
| "Show a 'settings saved' confirmation"                          | ✅ Allowed (§1.4)                     |
| "Add a donation button / link to hero.li"                       | ✅ Allowed (§1.8)                     |
| "Calculator where I paste a report and it does the math"        | ✅ Allowed, no toleration needed (§5) |
| "Read the public API once and show a highscore summary"         | ✅ Allowed via proxy, cache it (§6)   |

---

_This file and a request conflict, or request not covered here → stop, tell developer to ask a ToolDev on the OGame Origin forum before building. Full rules: "Forbidden features", "Tool Submission Guidelines", "API Access Process" threads on that forum._
