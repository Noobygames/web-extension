/**
 * The globals OGame's own page scripts put on `window`, plus the few the browser
 * environment adds that `eslint:recommended` does not know about.
 *
 * Why this file exists: the extension runs inside OGame's page and reads the game's
 * own variables and functions straight off the global scope. To ESLint every one of
 * them looked like a typo, so `no-undef` fired hundreds of times and the real
 * findings drowned in the noise. Listing them here makes `no-undef` useful again -
 * a name that is *not* in this list and not declared locally is now a genuine
 * ReferenceError waiting on whichever page touches it first.
 *
 * Two consumers, one list:
 *   - `.eslintrc.cjs` feeds it to `no-undef`.
 *   - `test/src-references.test.js` uses it as the "provided by the page" set for
 *     its own AST check, which catches the same class of bug in CI.
 *
 * Adding a name here is a claim that the game (or the browser) really provides it.
 * Every entry below was checked against a live OGame 13 server (s282-de, 2026-08-28)
 * with the console snippet in `docs/ogame-globals.md`; the page each one appears on is
 * noted where it is not everywhere. `scripts/list-page-globals.mjs` prints the globals
 * `src/` currently reads, which is how you find what still needs checking.
 *
 * A live page carries ~630 non-standard globals. Only the ones the extension actually
 * reads are listed here, on purpose: a whitelist of everything would let a typo for
 * some unrelated game internal pass the linter.
 *
 * Everything is read-only unless it is in `writable`.
 */

/**
 * Libraries present on the page. jQuery is OGame's own; DOMPurify, Chart and
 * LZString are injected by the extension (`injectScript`, see src/main.js and the
 * `ogi-chart` / `ogi-lzstring` events).
 */
// `jQuery` is the only entry here `src/` does not currently read - it is the same
// object as `$` and shows up the moment anyone writes the long form.
const libraries = ["$", "jQuery", "DOMPurify", "Chart", "LZString"];

/** Not OGame: Firefox gives content scripts this one for cross-compartment objects. */
const firefox = ["cloneInto"];

/**
 * OGame page state - data the game leaves lying around for its own scripts.
 *
 * Not every page defines every one of these. `fleetDispatcher`, `shipsOnPlanet`,
 * `unions` and the two fleet-template arrays only exist on fleetdispatch;
 * `technologyDetails` on the building/research pages; the five highscore names on
 * highscore; `spionageAmount` on overview and fleetdispatch. That is why the reads in
 * `src/` are guarded - see `src/util/shipsData.js` for the pattern.
 */
const gameState = [
  "ogame",
  "playerId",
  "playerName",
  "honorScore",
  "resourcesBar",
  "fleetDispatcher",
  "FleetDispatcher",
  "technologyDetails",
  "shipsOnPlanet",
  "spionageAmount",
  "unions",
  "expeditionFleetTemplates",
  "standardFleetTemplates",
  "LocalizationStrings",
  "highscoreContentUrl",
  "currentCategory",
  "currentType",
  "userWantsFocus",
  "searchPosition",
  "ajaxEventboxURI",
  "localTime",
  "serverTime",
  "timeZoneDiffSeconds",
];

/** OGame page functions. */
const gameFunctions = [
  "ajaxCall",
  "submitForm",
  "fadeBox",
  "showNotification",
  "setNewTokenData",
  "errorBoxDecision",
  "clampInt",
  "formatTime",
  "formatTimeWrapper",
  "getFormatedDate",
  "getFormatedTime",
  "getTooltipSelector",
  "initBuddyRequestForm",
  "removeTooltip",
  "toggleEvents",
];

/**
 * Globals the extension assigns to, not just reads.
 *
 * Every one of these is OGame's own hook being wrapped: the old value is kept and
 * called, then OGBI does its part (see galaxy/index.js, planetbar/index.js,
 * stalk/index.js). `galaxy` and `system` are the exception - the game's `submitForm`
 * reads them as the two coordinate inputs, so stalk.js sets them to those elements.
 * `planet` is the same story: OGBI's copy of the game's `jumpgateDone` assigns the
 * target moon id to it, exactly as the game's own handler does.
 */
const writable = [
  "planet",
  "displayContentGalaxy",
  "renderContentGalaxy",
  "doExpedition",
  "initHighscoreContent",
  "openJumpgate",
  "jumpgateDone",
  "galaxy",
  "system",
  "timeDiff",
  "token",
];

const readonly = [...libraries, ...firefox, ...gameState, ...gameFunctions];

module.exports = {
  readonly,
  writable,
  /** Every name, in the shape ESLint's `globals` option wants. */
  eslintGlobals: Object.fromEntries([
    ...readonly.map((name) => [name, "readonly"]),
    ...writable.map((name) => [name, "writable"]),
  ]),
  /** Every name, flat - what the reference test wants. */
  all: [...readonly, ...writable],
};
