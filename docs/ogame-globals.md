# OGame's page globals

The extension runs inside OGame's own page and reads the game's variables and functions
straight off the global scope — `fleetDispatcher`, `resourcesBar`, `submitForm`,
`LocalizationStrings` and about fifty more. To a linter every one of those looks like a
typo.

That was the state of things: `no-undef` reported **678 errors**, all but a handful of
them the game's own globals, and the real findings were invisible in the noise. Two
genuine ReferenceErrors were sitting in that pile the whole time (see
[What it caught immediately](#what-it-caught-immediately)).

## One list, two consumers

[`config/ogame-globals.cjs`](../config/ogame-globals.cjs) holds the names, split into
`readonly` and `writable`. It is read by:

- **`.eslintrc.cjs`** → `globals`, which is what makes `no-undef` usable.
- **`test/src-references.test.js`** → its "provided by the page" set, the AST check that
  runs in CI.

Keeping them in one file is the point: when the two lists were separate they drifted,
and a name could pass one check while failing the other.

`writable` is the smaller half — globals the extension *assigns* to, not just reads.
Every one is an OGame hook being wrapped (`displayContentGalaxy`, `openJumpgate`,
`doExpedition`, …): keep the old value, call it, then do OGI's part. `galaxy`, `system`
and `planet` are the exception — the game's own scripts read those as state, and OGI
sets them the same way the game does.

## The list is deliberately not "every global on the page"

A live OGame 13 page carries roughly **630** non-standard globals: game classes, jQuery
plugins, Babel helper functions. Only the ones `src/` actually reads are listed. A
whitelist of all 630 would let a typo for some unrelated game internal sail through
`no-undef`, which is the exact failure mode this is meant to end.

## Checking a name against a live page

Adding a name to the config is a claim that the game provides it. Verify before you add.
Open the game page in question and paste this into the console — it diffs `window`
against a fresh iframe, so only what the page added shows up:

```js
const f = document.createElement("iframe");
f.style.display = "none";
document.body.appendChild(f);
const clean = new Set(Object.getOwnPropertyNames(f.contentWindow));
f.remove();
const extra = Object.getOwnPropertyNames(window).filter((n) => !clean.has(n));
console.log(extra.length, extra.sort());
```

To check specific names instead:

```js
["fleetDispatcher", "planet", "technologyDetails"].forEach((n) => console.log(n, n in window ? typeof window[n] : "MISSING"));
```

**Globals are page-specific.** Every entry in the config was verified on s282-de
(OGame 13, 2026-08-28), and where a name exists is not uniform:

| Page                  | Only defined there                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `fleetdispatch`       | `fleetDispatcher`, `shipsOnPlanet`, `unions`, `standardFleetTemplates`, `expeditionFleetTemplates` |
| `galaxy`              | `galaxy`, `system`                                                                                |
| `highscore`           | `highscoreContentUrl`, `currentCategory`, `currentType`, `userWantsFocus`, `searchPosition`       |
| supplies / research   | `technologyDetails`                                                                               |
| overview, fleetdispatch | `planet`, `spionageAmount`                                                                      |

Which is why the reads are guarded rather than assumed — `src/util/shipsData.js` is the
pattern to copy. An unguarded read of a page-specific global throws out of whatever is
calling it; when that caller is `OGBeyondInfinity.start()`, the rest of the boot never runs.

Three names in the config are never on an OGame page: `DOMPurify`, `Chart` and
`LZString` are injected by the extension itself (`injectScript`, plus the `ogi-chart` /
`ogi-lzstring` events), and `cloneInto` is Firefox's content-script helper.

## Finding what still needs a home

```bash
make globals        # or: node scripts/list-page-globals.mjs
```

prints every global `src/` reads, with up to three places it is read, `W` when the code
assigns to it, and `NEW` when it is not in the config yet. The tail says which listed
names are currently unused.

## What it caught immediately

Two real bugs surfaced the moment `no-undef` could be read:

- `src/ctxpage/overview/OverviewPage.js` — `#updatePlanetOverviewDisplay()` read a
  `planet` that only existed in its caller's scope. Every call threw: swallowed by
  `MakePrettierOverview`'s `catch` on the initial call, uncaught on the toggle click.
- `src/ctxpage/planetbar/index.js` — `planet` genuinely *is* an OGame global there
  (OGI's copy of the game's `jumpgateDone`), it was simply missing from the list.

`test/src-references.test.js` cannot find the first one and never will: it treats a
binding anywhere in a file as declared, so the caller's `planet` covers the callee. That
over-approximation is what keeps it free of false alarms — ESLint's real scope analysis
is the half that catches this class of bug, which is the other reason the list matters.
