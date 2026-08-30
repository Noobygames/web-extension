/**
 * The five message analyzers.
 *
 * `docs/testing.md` calls these "the highest-value gap, since these are where most
 * bug reports land". They are page-context classes, and Phase 6 of refactoring.md
 * moved them (and this file) out from under `ctxcontent/` for exactly that reason -
 * that directory otherwise reads as content-context, the one place `chrome.*` is
 * safe to use, and these classes never see it. `setupBrowser()` is called WITHOUT
 * `chrome: true`.
 *
 * Each one implements the same informal interface - `support(tabId)`,
 * optional `clean(force)`, `analyze(messageCallable, tabId)` - and `Messages`
 * dispatches to whichever claims the current tab. The dispatch contract is what the
 * first block covers; after that, one parsing path per analyzer.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../../helpers/globals.js";
import { planetList } from "../../fixtures/ogamePage.js";
import { spyReportRow } from "../../fixtures/spyReport.js";

const browser = setupBrowser({ url: "https://s1-en.ogame.gameforge.com/game/index.php?page=messages" });

// `playerId` is an OGame page global. The analyzers read it to tell an incoming
// transport from an outgoing one, and to find their own combat report.
globalThis.playerId = 12345;

// `localTime` is an OGame page global (server-adjusted "now"), read by
// `DateTime.timeSince()` for the spy table's date column.
globalThis.localTime = Date.now();

const { messagesTabs } = await import("../../../src/ctxpage/messages/index.js");
const OGBIData = (await import("../../../src/store/OGBIData.js")).default;
const ship = (await import("../../../src/game/ship.js")).default;
const SpyMessagesAnalyzer = (await import("../../../src/ctxpage/messages/analyzer/SpyMessagesAnalyzer.js")).default;
const ExpeditionMessagesAnalyzer = (
  await import("../../../src/ctxpage/messages/analyzer/ExpeditionMessagesAnalyzer.js")
).default;
const FightMessagesAnalyzer = (await import("../../../src/ctxpage/messages/analyzer/FightMessagesAnalyzer.js")).default;
const HarvestMessagesAnalyzer = (await import("../../../src/ctxpage/messages/analyzer/HarvestMessagesAnalyzer.js"))
  .default;
const TradeMessagesAnalyzer = (await import("../../../src/ctxpage/messages/analyzer/TradeMessagesAnalyzer.js")).default;

test.after(() => {
  delete globalThis.playerId;
  delete globalThis.localTime;
  delete globalThis.$;
  delete globalThis.ogame;
  browser.cleanup();
});

/**
 * A fresh, empty store for every test - OGBIData is a singleton over localStorage.
 *
 * `playerId` and the spy-table-specific option keys are only read by
 * `SpyMessagesAnalyzer`/`SpyReport`; the other analyzers ignore them.
 */
function resetStore(options = {}) {
  OGBIData.json = {
    playerId: 12345,
    options: {
      standardUnitBase: 0,
      tradeRate: [2.5, 1.5, 1],
      spyTableEnable: true,
      spyTableAppend: false,
      spyFilter: "$",
      spyFret: ship.SmallCargoShip,
      rvalLimit: 1e9,
      rvalSelfLimitPlanet: 1e12,
      rvalSelfLimitMoon: 1e12,
      autoDeleteEnable: false,
      ptreTK: null,
      ...options,
    },
    harvests: {},
    expeditions: {},
    combats: {},
    expeditionSums: {},
    combatsSums: {},
    discoveries: {},
    discoveriesSums: {},
    ships: {
      218: { cargoCapacity: 20000 },
      [ship.SmallCargoShip]: { cargoCapacity: 5000, speed: 10000 },
      [ship.LargeCargoShip]: { cargoCapacity: 25000, speed: 7500 },
      [ship.EspionageProbe]: { cargoCapacity: 5, speed: 5000000 },
      [ship.Pathfinder]: { cargoCapacity: 10000, speed: 12000 },
    },
    universeSettingsTooltip: {
      debrisFactor: 0.3,
      debrisFactorDef: 0.3,
      deuteriumInDebris: false,
      repairFactor: 0.7,
      galaxies: 6,
      systems: 499,
      donutGalaxy: true,
      donutSystem: true,
    },
    empire: [],
    speedFleetWar: 1,
  };
}

/**
 * The page chrome `SpyMessagesAnalyzer` reads from outside the message list itself:
 * somewhere to insert the table before (`#messages .messagePaginator`), and the
 * current planet's coordinates for the "simulator" button (`#planetList`).
 *
 * @param {{trash?: boolean}} [opts] `trash: true` renders the disabled trashcan
 *        button that flips the analyzer into "viewing the trash" mode.
 */
function spyPageChrome({ trash = false } = {}) {
  return `
    ${planetList([{ id: 1, coords: "1:2:3", active: true }])}
    <div id="messages">
      <ul class="messagesHolder"></ul>
      <div class="messagePaginator"></div>
    </div>
    ${trash ? '<div class="messagesTrashcanBtns"><button class="custom_btn" disabled="disabled"></button></div>' : ""}
  `;
}

/** What `Messages` hands an analyzer: a callable returning the current rows. */
const spyCallableOf =
  (...rows) =>
  () =>
    rows;

/**
 * Minimal jQuery stand-in for the two things `SpyMessagesAnalyzer#flagDeleted` uses:
 * `$(el).data(key[, value])` and `$(document).on/off("ajaxSuccess", handler)`. Real
 * jQuery is never loaded in this suite - OGame provides it as a page global.
 */
function installJQueryStub() {
  const elementData = new WeakMap();
  const handlers = new Map();

  function $(target) {
    if (target === document) {
      return {
        on(event, handler) {
          if (!handlers.has(event)) handlers.set(event, new Set());
          handlers.get(event).add(handler);
          return this;
        },
        off(event, handler) {
          handlers.get(event)?.delete(handler);
          return this;
        },
      };
    }
    return {
      data(key, value) {
        if (value === undefined) return elementData.get(target)?.[key];
        const existing = elementData.get(target) || {};
        existing[key] = value;
        elementData.set(target, existing);
        return this;
      },
    };
  }

  $._trigger = (event, ...args) => {
    handlers.get(event)?.forEach((handler) => handler(...args));
  };

  globalThis.$ = $;
  return $;
}

/**
 * One message row, in the shape OGame 13 renders it: a `.rawMessageData` element
 * carrying every value as a `data-raw-*` attribute, and a title the analyzers
 * append their label to.
 */
function messageRow(id, raw, { title = "Message" } = {}) {
  const attributes = Object.entries(raw)
    .map(([key, value]) => `data-raw-${key}="${String(value).replaceAll('"', "&quot;")}"`)
    .join(" ");
  const li = document.createElement("li");
  li.className = "msg";
  li.setAttribute("data-msg-id", String(id));
  li.innerHTML = `
    <div class="msgHeadItem"><span class="msgTitle">${title}</span></div>
    <span class="rawMessageData" ${attributes}></span>
    <div class="msgContent"></div>
  `;
  document.body.appendChild(li);
  return li;
}

/** What `Messages` hands an analyzer: a callable returning the current rows. */
const callableOf =
  (...rows) =>
  () =>
    rows;

// --------------------------------------------------------------------------
// Dispatch: which analyzer claims which tab
// --------------------------------------------------------------------------

test("each analyzer claims exactly the tabs it parses, and no two claim the same tab twice", () => {
  const claims = [
    [new SpyMessagesAnalyzer(), [messagesTabs.SPY, messagesTabs.TRASH, messagesTabs.FAVORITES]],
    [new ExpeditionMessagesAnalyzer(), [messagesTabs.EXPEDITION]],
    [new FightMessagesAnalyzer(), [messagesTabs.BATTLE_REPORT]],
    [new HarvestMessagesAnalyzer(), [messagesTabs.COMMON]],
    [new TradeMessagesAnalyzer(), [messagesTabs.GROUP_SHIPPING]],
  ];

  const everyTab = Object.values(messagesTabs);
  for (const [analyzer, supported] of claims) {
    for (const tabId of everyTab) {
      assert.equal(
        analyzer.support(tabId),
        supported.includes(tabId),
        `${analyzer.constructor.name}.support(${tabId})`
      );
    }
  }

  // Spy is the only analyzer that claims more than one tab, and the only overlap in
  // the whole set - two analyzers on one tab would mean both run on every message.
  for (const tabId of everyTab) {
    const claimants = claims.filter(([analyzer]) => analyzer.support(tabId)).length;
    assert.ok(claimants <= 1, `tab ${tabId} is claimed by ${claimants} analyzers`);
  }
});

test("support rejects a tab id that is not in the frozen tab map", () => {
  for (const analyzer of [
    new SpyMessagesAnalyzer(),
    new ExpeditionMessagesAnalyzer(),
    new FightMessagesAnalyzer(),
    new HarvestMessagesAnalyzer(),
    new TradeMessagesAnalyzer(),
  ]) {
    assert.equal(analyzer.support(9999), false);
    assert.equal(analyzer.support(undefined), false);
  }
});

// --------------------------------------------------------------------------
// HarvestMessagesAnalyzer
// --------------------------------------------------------------------------

test("a harvest from position 16 is booked as an expedition and labelled as one", () => {
  resetStore();
  document.body.innerHTML = "";
  const row = messageRow(1001, {
    messagetype: 32,
    targetcoordinates: "1:2:16",
    recycledresources: JSON.stringify({ metal: 1000, crystal: 500, deuterium: 250 }),
    recycleramount: 1,
    totalcapacity: 20000,
    date: "2026-08-27T10:00:00Z",
  });

  new HarvestMessagesAnalyzer().analyze(callableOf(row), messagesTabs.COMMON);

  assert.ok(row.classList.contains("ogk-expedition"));
  assert.deepEqual(OGBIData.expeditionSums["27.08.26"].harvest, [1000, 500, 250]);
  assert.equal(OGBIData.combatsSums["27.08.26"], undefined);
  assert.equal(OGBIData.harvests["1001"].metal, 1000);
  assert.ok(row.querySelector(".msgTitle .ogk-label"), "the standard-unit label was appended");
});

test("a harvest anywhere else is booked against the combat totals", () => {
  resetStore();
  document.body.innerHTML = "";
  const row = messageRow(1002, {
    messagetype: 32,
    targetcoordinates: "1:2:8",
    recycledresources: JSON.stringify({ metal: 10, crystal: 20, deuterium: 30 }),
    recycleramount: 1,
    totalcapacity: 20000,
    date: "2026-08-27T10:00:00Z",
  });

  new HarvestMessagesAnalyzer().analyze(callableOf(row), messagesTabs.COMMON);

  assert.deepEqual(OGBIData.combatsSums["27.08.26"].harvest, [10, 20, 30]);
  assert.equal(OGBIData.expeditionSums["27.08.26"], undefined);
});

test("harvest totals accumulate across messages of the same day", () => {
  resetStore();
  document.body.innerHTML = "";
  const rows = [1003, 1004].map((id) =>
    messageRow(id, {
      messagetype: 32,
      targetcoordinates: "1:2:16",
      recycledresources: JSON.stringify({ metal: 100, crystal: 0, deuterium: 0 }),
      recycleramount: 1,
      totalcapacity: 20000,
      date: "2026-08-27T10:00:00Z",
    })
  );

  new HarvestMessagesAnalyzer().analyze(callableOf(...rows), messagesTabs.COMMON);

  assert.equal(OGBIData.expeditionSums["27.08.26"].harvest[0], 200);
});

test("a message of another type is left alone entirely", () => {
  resetStore();
  document.body.innerHTML = "";
  const row = messageRow(1005, { messagetype: 33, targetcoordinates: "1:2:8" });

  new HarvestMessagesAnalyzer().analyze(callableOf(row), messagesTabs.COMMON);

  assert.equal(row.className, "msg", "no class was added");
  assert.deepEqual(OGBIData.harvests, {});
});

test("re-analyzing the same harvest does not double-count it", () => {
  resetStore();
  document.body.innerHTML = "";
  const row = messageRow(1006, {
    messagetype: 32,
    targetcoordinates: "1:2:16",
    recycledresources: JSON.stringify({ metal: 100, crystal: 0, deuterium: 0 }),
    recycleramount: 1,
    totalcapacity: 20000,
    date: "2026-08-27T10:00:00Z",
  });

  const analyzer = new HarvestMessagesAnalyzer();
  analyzer.analyze(callableOf(row), messagesTabs.COMMON);
  analyzer.analyze(callableOf(row), messagesTabs.COMMON);

  assert.equal(OGBIData.expeditionSums["27.08.26"].harvest[0], 100, "the msgId cache held");
  assert.equal(row.querySelectorAll(".msgTitle .ogk-label").length, 2, "but the label is appended again");
});

// --------------------------------------------------------------------------
// TradeMessagesAnalyzer
// --------------------------------------------------------------------------

test("an incoming transport is labelled with a positive standard-unit amount", () => {
  resetStore();
  document.body.innerHTML = "";
  const row = messageRow(2001, {
    messagetype: 33,
    sourceplayerid: 999,
    targetplayerid: 12345,
    cargo: JSON.stringify({ metal: 1000, crystal: 0, deuterium: 0 }),
    date: "2026-08-27T10:00:00Z",
  });

  new TradeMessagesAnalyzer().analyze(callableOf(row), messagesTabs.GROUP_SHIPPING);

  const label = row.querySelector(".msgTitle .ogk-label");
  assert.ok(label);
  assert.equal(label.classList.contains("ogi-negative"), false);
});

test("an outgoing transport is labelled negative", () => {
  resetStore();
  document.body.innerHTML = "";
  const row = messageRow(2002, {
    messagetype: 33,
    sourceplayerid: 12345,
    targetplayerid: 999,
    cargo: JSON.stringify({ metal: 1000, crystal: 0, deuterium: 0 }),
    date: "2026-08-27T10:00:00Z",
  });

  new TradeMessagesAnalyzer().analyze(callableOf(row), messagesTabs.GROUP_SHIPPING);

  assert.ok(row.querySelector(".msgTitle .ogk-label").classList.contains("ogi-negative"));
});

test("a transport between two of your own planets is skipped", () => {
  resetStore();
  document.body.innerHTML = "";
  const row = messageRow(2003, {
    messagetype: 33,
    sourceplayerid: 12345,
    targetplayerid: 12345,
    cargo: JSON.stringify({ metal: 1000, crystal: 0, deuterium: 0 }),
    date: "2026-08-27T10:00:00Z",
  });

  new TradeMessagesAnalyzer().analyze(callableOf(row), messagesTabs.GROUP_SHIPPING);

  assert.equal(row.querySelector(".msgTitle .ogk-label"), null, "moving your own resources is not a trade");
});

test("a trade message needs no store round-trip to get its label", () => {
  // Fixed in refactoring-new.md Phase A.1 #3: this used to compute a `trades` /
  // `tradesSums` pair, then throw both away behind a commented-out write - dead
  // since the commit that introduced this file, `tradesSums` copied the combat-sums
  // shape (`losses`, `wins`, `topCombats`, ...) and never accumulated anything, and
  // nothing anywhere ever read either field. Removed rather than turned on: there
  // was no consumer to turn on for. The visible feature - the standard-unit label -
  // never depended on the store round-trip and is unaffected.
  resetStore();
  document.body.innerHTML = "";
  const row = messageRow(2004, {
    messagetype: 33,
    sourceplayerid: 999,
    targetplayerid: 12345,
    cargo: JSON.stringify({ metal: 1000, crystal: 0, deuterium: 0 }),
    date: "2026-08-27T10:00:00Z",
  });

  new TradeMessagesAnalyzer().analyze(callableOf(row), messagesTabs.GROUP_SHIPPING);

  assert.ok(row.querySelector(".msgTitle .ogk-label"), "the label is still appended");
  assert.equal(OGBIData.json.trades, undefined, "the field is gone, not just empty");
  assert.equal(OGBIData.json.tradesSums, undefined);
});

// --------------------------------------------------------------------------
// ExpeditionMessagesAnalyzer / FightMessagesAnalyzer
// --------------------------------------------------------------------------

test("ExpeditionMessagesAnalyzer ignores messages that are not expeditions or discoveries", () => {
  resetStore();
  document.body.innerHTML = "";
  const row = messageRow(3001, { messagetype: 32, targetcoordinates: "1:2:16" });

  new ExpeditionMessagesAnalyzer().analyze(callableOf(row), messagesTabs.EXPEDITION);

  assert.deepEqual(OGBIData.expeditions, {});
  assert.deepEqual(OGBIData.discoveries, {});
});

/** A complete expedition combat report, with every attribute the parser reads. */
function expeditionFightRow(id, { winner = "defender", destroyed = 3 } = {}) {
  return messageRow(id, {
    coords: "1:2:16",
    hashcode: "abc",
    timestamp: 1756288800,
    date: "2026-08-27T10:00:00Z",
    defenderspaceobject: JSON.stringify({
      coordinates: { galaxy: 1, system: 2, position: 16 },
      type: "planet",
      owner: { id: 12345 },
    }),
    result: JSON.stringify({ winner }),
    combatrounds: JSON.stringify([{ fleets: [{ technologies: [{ technologyId: 204, destroyedTotal: destroyed }] }] }]),
  });
}

test("an expedition fight is booked with its losses and marked as an expedition", () => {
  resetStore();
  document.body.innerHTML = "";
  const row = expeditionFightRow(4001);

  new FightMessagesAnalyzer().analyze(callableOf(row), messagesTabs.BATTLE_REPORT);

  assert.ok(row.classList.contains("ogk-expedition"));
  assert.equal(OGBIData.combats["4001"].win, true, "the defender winning is a win for the player");
  assert.equal(OGBIData.combats["4001"].draw, false);
  assert.deepEqual(OGBIData.combats["4001"].losses, { 204: 3 });
  assert.deepEqual(OGBIData.expeditionSums["27.08.26"].losses, { 204: 3 });
});

test("an expedition fight nobody won is recorded as a draw, not a loss", () => {
  resetStore();
  document.body.innerHTML = "";

  new FightMessagesAnalyzer().analyze(
    callableOf(expeditionFightRow(4002, { winner: "none" })),
    messagesTabs.BATTLE_REPORT
  );

  assert.equal(OGBIData.combats["4002"].draw, true);
  assert.equal(OGBIData.combats["4002"].win, false);
});

test("an already-known expedition fight is re-labelled without being counted again", () => {
  resetStore();
  document.body.innerHTML = "";
  const row = expeditionFightRow(4003);
  const analyzer = new FightMessagesAnalyzer();

  analyzer.analyze(callableOf(row), messagesTabs.BATTLE_REPORT);
  analyzer.analyze(callableOf(row), messagesTabs.BATTLE_REPORT);

  assert.deepEqual(OGBIData.expeditionSums["27.08.26"].losses, { 204: 3 }, "losses were not doubled");
});

test("a message without combat data no longer blanks the rest of the battle-report tab", () => {
  // Fixed in refactoring-new.md Phase A.2 #5: neither `#getExpeditionFight()` nor
  // `#getFight()` filters on `data-raw-messagetype` - both look only at coordinates
  // and hashcode - so anything else on that tab used to reach a parser that did
  // `JSON.parse(null).owner`, and the TypeError escaped `analyze()`. Every message
  // after the odd one in the same pass was silently skipped, so one odd row blanked
  // the whole tab. The real fix (a `data-raw-messagetype` filter, like harvest and
  // trade both have) needs OGame's actual combat-report type id, which is not
  // available here; the safe fix that does not require guessing it is to isolate
  // each message's parse, so one failure cannot take its neighbours down with it.
  resetStore();
  document.body.innerHTML = "";
  const odd1 = messageRow(4004, { coords: "1:2:8", hashcode: "abc" });
  const good = expeditionFightRow(4005);
  const odd2 = messageRow(4006, { coords: "1:2:9", hashcode: "def" });

  assert.doesNotThrow(() =>
    new FightMessagesAnalyzer().analyze(callableOf(odd1, good, odd2), messagesTabs.BATTLE_REPORT)
  );

  // The expedition pass runs first and books its report regardless of what happens
  // later. The point of this test is odd2: if the first bad message still aborted
  // the loop, odd2 would never even be attempted, and there would be no way to tell
  // the difference from here - so both odd messages having been skipped, rather than
  // just the first, is what proves the pass kept going.
  assert.ok(OGBIData.combats["4005"], "the expedition report was booked");
  assert.equal(OGBIData.combats["4004"], undefined, "the first odd message could not be parsed");
  assert.equal(OGBIData.combats["4006"], undefined, "the second odd message was still reached and also skipped");
});

test("a spy flight that never came back carries no report and is skipped", () => {
  resetStore();
  document.body.innerHTML = "";
  const noReturn = messageRow(4006, { coords: "1:2:8", hashcode: "" });

  new FightMessagesAnalyzer().analyze(callableOf(noReturn), messagesTabs.BATTLE_REPORT);

  assert.deepEqual(OGBIData.combats, {});
});

// --------------------------------------------------------------------------
// SpyMessagesAnalyzer
// --------------------------------------------------------------------------

test("SpyMessagesAnalyzer.clean rebuilds the table unless append mode says otherwise", () => {
  resetStore({ spyTableAppend: false });
  document.body.innerHTML = '<table class="ogl-spyTable"><tr><td>stale</td></tr></table>';

  new SpyMessagesAnalyzer().clean(false);

  assert.equal(document.querySelector(".ogl-spyTable"), null, "the stale table was removed");
});

test("SpyMessagesAnalyzer.clean keeps the table in append mode, but a forced clean still wins", () => {
  resetStore({ spyTableAppend: true });
  document.body.innerHTML = '<table class="ogl-spyTable"><tr><td>keep</td></tr></table>';

  new SpyMessagesAnalyzer().clean(false);
  assert.ok(document.querySelector(".ogl-spyTable"), "append mode leaves the accumulated table alone");

  new SpyMessagesAnalyzer().clean(true);
  assert.equal(document.querySelector(".ogl-spyTable"), null);
});

test("the spy table lists claimed reports and skips a report about the player's own planet", () => {
  resetStore();
  document.body.innerHTML = spyPageChrome();
  const enemyReport = spyReportRow(9401, {
    targetPlayerId: 99999,
    loot: "25%",
    metal: 100000,
    crystal: 50000,
    deuterium: 20000,
  });
  const ownReport = spyReportRow(9402, { targetPlayerId: 12345 }); // matches OGBIData.playerId

  new SpyMessagesAnalyzer().analyze(spyCallableOf(enemyReport, ownReport), messagesTabs.SPY);

  const rows = document.querySelectorAll(".ogl-spyTable tbody tr");
  assert.equal(rows.length, 1, "the player's own report never enters the farm table");
  assert.equal(rows[0].getAttribute("data-report-id"), "9401");
});

test("the table is built hidden, with no body at all, when spyTableEnable is off", () => {
  resetStore({ spyTableEnable: false });
  document.body.innerHTML = spyPageChrome();
  const report = spyReportRow(9403, { targetPlayerId: 99999 });

  new SpyMessagesAnalyzer().analyze(spyCallableOf(report), messagesTabs.SPY);

  const table = document.querySelector(".ogl-spyTable");
  assert.ok(table.classList.contains("ogl-hidden"));
  assert.equal(table.querySelector("tbody"), null, "the analyzer returns before ever reading the reports");
});

test("reports sort by gain, highest first, under the default $ filter", () => {
  resetStore({ spyFilter: "$" });
  document.body.innerHTML = spyPageChrome();
  // loot is fixed at 25%, so renta is driven by metal alone: 25000, 50000, 12500.
  const mid = spyReportRow(9501, { targetPlayerId: 99999, loot: "25%", metal: 100000 });
  const highest = spyReportRow(9502, { targetPlayerId: 99999, loot: "25%", metal: 200000 });
  const lowest = spyReportRow(9503, { targetPlayerId: 99999, loot: "25%", metal: 50000 });

  new SpyMessagesAnalyzer().analyze(spyCallableOf(mid, highest, lowest), messagesTabs.SPY);

  const order = [...document.querySelectorAll(".ogl-spyTable tbody tr")].map((tr) => tr.getAttribute("data-report-id"));
  assert.deepEqual(order, ["9502", "9501", "9503"]);
});

test("clicking a column header re-sorts by that column and persists the choice", () => {
  resetStore({ spyFilter: "$" });
  document.body.innerHTML = spyPageChrome();
  const lowFleet = spyReportRow(9511, { targetPlayerId: 99999, fleetFilter: "x", fleetValue: "100" });
  const highFleet = spyReportRow(9512, { targetPlayerId: 99999, fleetFilter: "x", fleetValue: "999999" });

  new SpyMessagesAnalyzer().analyze(spyCallableOf(lowFleet, highFleet), messagesTabs.SPY);

  document.querySelector('.ogl-spyTable thead th[data-filter="FLEET"]').click();

  assert.equal(OGBIData.options.spyFilter, "FLEET", "the choice is persisted, not just applied in memory");
  const order = [...document.querySelectorAll(".ogl-spyTable tbody tr")].map((tr) => tr.getAttribute("data-report-id"));
  assert.deepEqual(order, ["9512", "9511"], "FLEET sorts highest fleet first");
});

test("row numbers still track sort order when a second page of messages arrives in append mode", () => {
  // Was a bug: re-sorting reordered every row in the DOM, but only ever set the "#"
  // cell on a row the first time it was created - a row reused from an earlier
  // analyze() call kept whatever number it got back then, even after moving.
  resetStore({ spyTableAppend: true, spyFilter: "FLEET" });
  document.body.innerHTML = spyPageChrome();
  const analyzer = new SpyMessagesAnalyzer();
  const first = spyReportRow(9601, { targetPlayerId: 99999, fleetFilter: "x", fleetValue: "100" });
  analyzer.analyze(spyCallableOf(first), messagesTabs.SPY);

  const second = spyReportRow(9602, { targetPlayerId: 99999, fleetFilter: "x", fleetValue: "999999" });
  // A second page of messages arriving in append mode - not a header click, so the
  // table is never torn down. #9602 has to sort ahead of #9601, and the row numbers
  // have to move with them.
  analyzer.analyze(spyCallableOf(first, second), messagesTabs.SPY);

  const rows = [...document.querySelectorAll(".ogl-spyTable tbody tr")];
  assert.deepEqual(
    rows.map((tr) => tr.getAttribute("data-report-id")),
    ["9602", "9601"],
    "FLEET sorts highest first"
  );
  assert.deepEqual(
    rows.map((tr) => tr.cells[0].textContent),
    ["1", "2"],
    "the # column follows the sorted order, not the order the rows were created in"
  );
});

test("clicking a sort header does not revert an option changed after the table was built", () => {
  // Was a bug: the click handler closed over an OGBIData.options snapshot taken when
  // the header was built, then wrote that whole snapshot back on click - silently
  // undoing any other option changed in the meantime (this table can live across many
  // analyze() calls in append mode, so "in the meantime" could be a while).
  resetStore({ spyFilter: "$", spyFret: ship.SmallCargoShip });
  document.body.innerHTML = spyPageChrome();
  const report = spyReportRow(9611, { targetPlayerId: 99999, fleetFilter: "x", fleetValue: "100" });

  new SpyMessagesAnalyzer().analyze(spyCallableOf(report), messagesTabs.SPY);

  // Something else changes spyFret after the table (and its header click handlers)
  // were built - e.g. the player picked a different cargo ship.
  OGBIData.options = { ...OGBIData.options, spyFret: ship.LargeCargoShip };

  document.querySelector('.ogl-spyTable thead th[data-filter="FLEET"]').click();

  assert.equal(
    OGBIData.options.spyFret,
    ship.LargeCargoShip,
    "a stale options snapshot from table-build time must not overwrite a later change"
  );
});

test("a report with unreadable fleet/defense data gets a 'No data' label and danger styling", () => {
  // Was a KNOWN BUG: the danger check compared against the literal "No Data"
  // (capital D) while SpyReport.js only ever produces "No data" (lowercase d), so
  // the comparison never matched and the report - arguably the riskiest kind, since
  // the player has no idea what is actually there - looked identical to a report
  // that revealed 0 fleet and 0 defense. The cell also rendered blank rather than
  // the "No data" label, since toFormattedNumber("No data", ...) returns undefined
  // for non-numeric input. Fixed by matching the real sentinel string and by
  // special-casing it before formatting.
  resetStore();
  document.body.innerHTML = spyPageChrome();
  const report = spyReportRow(9521, { targetPlayerId: 99999, fleetFilter: "-", defenseFilter: "-" });

  new SpyMessagesAnalyzer().analyze(spyCallableOf(report), messagesTabs.SPY);

  const row = document.querySelector('.ogl-spyTable tbody tr[data-report-id="9521"]');
  assert.equal(row.cells[6].textContent, "No data");
  assert.ok(row.cells[6].classList.contains("ogl-care"), "unknown fleet gets the warning class");
  assert.equal(row.cells[7].textContent, "No data");
  assert.ok(row.cells[7].classList.contains("ogl-danger"), "unknown defense gets the warning class");
});

test("the gain column is flagged ogl-good only once the loot clears the configured limit", () => {
  resetStore({ rvalLimit: 20000 });
  document.body.innerHTML = spyPageChrome();
  const above = spyReportRow(9531, { targetPlayerId: 99999, loot: "25%", metal: 100000 }); // renta 25000
  const below = spyReportRow(9532, { targetPlayerId: 99999, loot: "25%", metal: 20000 }); // renta 5000

  new SpyMessagesAnalyzer().analyze(spyCallableOf(above, below), messagesTabs.SPY);

  const aboveRow = document.querySelector('.ogl-spyTable tbody tr[data-report-id="9531"]');
  const belowRow = document.querySelector('.ogl-spyTable tbody tr[data-report-id="9532"]');
  assert.ok(aboveRow.cells[4].classList.contains("ogl-good"));
  assert.equal(belowRow.cells[4].classList.contains("ogl-good"), false);
});

test("the fleet and defense columns are flagged once their debris-adjusted value clears the limit", () => {
  resetStore({ rvalLimit: 1000 });
  document.body.innerHTML = spyPageChrome();
  // debrisFactor 0.3: 10000 -> 3000 (over), 100 -> 30 (under). defense compares directly to 0.
  const risky = spyReportRow(9541, {
    targetPlayerId: 99999,
    fleetFilter: "x",
    fleetValue: "10000",
    defenseFilter: "x",
    defenseValue: "500",
  });
  const safe = spyReportRow(9542, {
    targetPlayerId: 99999,
    fleetFilter: "x",
    fleetValue: "100",
    defenseFilter: "0",
  });

  new SpyMessagesAnalyzer().analyze(spyCallableOf(risky, safe), messagesTabs.SPY);

  const riskyRow = document.querySelector('.ogl-spyTable tbody tr[data-report-id="9541"]');
  const safeRow = document.querySelector('.ogl-spyTable tbody tr[data-report-id="9542"]');
  assert.ok(riskyRow.cells[6].classList.contains("ogl-care"), "debris value clears the limit");
  assert.ok(riskyRow.cells[7].classList.contains("ogl-danger"), "defense is positive");
  assert.equal(safeRow.cells[6].classList.contains("ogl-care"), false);
  assert.equal(safeRow.cells[7].classList.contains("ogl-danger"), false);
});

test("the cargo column carries a ship count per cargo type and links to the one currently chosen", () => {
  resetStore({ spyFret: ship.SmallCargoShip });
  document.body.innerHTML = spyPageChrome();
  // Same numbers as the SpyReport calcNeededShips test: pt=10, gt=2, pf=5.
  const report = spyReportRow(9551, {
    targetPlayerId: 99999,
    loot: "25%",
    metal: 100000,
    crystal: 50000,
    deuterium: 20000,
  });

  new SpyMessagesAnalyzer().analyze(spyCallableOf(report), messagesTabs.SPY);

  const shipCell = document.querySelector('.ogl-spyTable tbody tr[data-report-id="9551"] .ogl-cargo-choice');
  assert.equal(shipCell.getAttribute(`data-ship-${ship.SmallCargoShip}`), "10");
  assert.equal(shipCell.getAttribute(`data-ship-${ship.LargeCargoShip}`), "2");
  assert.equal(shipCell.getAttribute(`data-ship-${ship.Pathfinder}`), "5");
  assert.ok(shipCell.querySelector("a").getAttribute("href").includes(`am${ship.SmallCargoShip}=10`));
});

test("switching the preselected cargo ship refreshes Gewinn/h instead of leaving it frozen", () => {
  // Was a bug: the cargo-choice click only refreshed the per-row send-fleet link/capacity,
  // never the flight context #flightOf()/#flightContext() cache Gewinn/h reads from - so
  // switching from Small Cargo to Large Cargo (very different speed) left every row's
  // profit/hour computed against whichever ship was selected when the table was first built.
  resetStore({ spyFret: ship.SmallCargoShip });
  document.body.innerHTML = spyPageChrome();
  OGBIData.empire = [{ coordinates: "1:5:3" }]; // an origin, so #flightOf() has something to fly from
  const report = spyReportRow(9571, { targetPlayerId: 99999, loot: "25%", metal: 1000000 });

  new SpyMessagesAnalyzer().analyze(spyCallableOf(report), messagesTabs.SPY);

  // Gain and Gewinn/h share the same "ogl-lootable" class - Gewinn/h is the second one
  // in each row, right after Gain.
  const perHourOf = () =>
    document.querySelectorAll('.ogl-spyTable tbody tr[data-report-id="9571"] .ogl-lootable')[1].textContent;

  const cargoHeader = document.querySelector(".ogl-spyTable thead th .ogl-fleet-ship");
  cargoHeader.parentElement.dispatchEvent(new window.Event("mouseover"));
  const smallCargoPerHour = perHourOf();

  document
    .querySelector(`.ogl-tooltip .ogl-fleet-ship[data-ship="${ship.LargeCargoShip}"]`)
    .dispatchEvent(new window.Event("click", { bubbles: true }));

  assert.equal(OGBIData.options.spyFret, ship.LargeCargoShip, "the choice itself is persisted");
  const largeCargoPerHour = perHourOf();

  // Small (speed 10000) and Large Cargo (speed 7500) fly the same distance at different
  // speeds, so a frozen cache would show the exact same number twice.
  assert.notEqual(smallCargoPerHour, largeCargoPerHour);
});

test("the options bar toggles table visibility, append mode and auto-delete, and persists each choice", () => {
  resetStore({ spyTableEnable: true, spyTableAppend: false, autoDeleteEnable: false });
  document.body.innerHTML = spyPageChrome();
  const report = spyReportRow(9561, { targetPlayerId: 99999 });

  new SpyMessagesAnalyzer().analyze(spyCallableOf(report), messagesTabs.SPY);

  const table = document.querySelector(".ogl-spyTable");
  assert.equal(table.classList.contains("ogl-hidden"), false);

  document.querySelector(".ogl-tableOptions .icon_eye").click();
  assert.equal(OGBIData.options.spyTableEnable, false);
  assert.ok(table.classList.contains("ogl-hidden"));

  document.querySelector(".ogl-tableOptions .icon_plus").click();
  assert.equal(OGBIData.options.spyTableAppend, true);

  document.querySelector(".ogl-tableOptions .icon_trash").click();
  assert.equal(OGBIData.options.autoDeleteEnable, true);
  // Toggling auto-delete forces a clean(true) + reload, which rebuilds the table
  // from the same cached message list rather than leaving it torn down.
  assert.ok(document.querySelector(".ogl-spyTable"), "the table was rebuilt after the reload");
});

test("on the trash tab, a restore button replaces the delete button", () => {
  resetStore();
  document.body.innerHTML = spyPageChrome({ trash: true });
  const report = spyReportRow(9571, { targetPlayerId: 99999 });

  new SpyMessagesAnalyzer().analyze(spyCallableOf(report), messagesTabs.TRASH);

  assert.equal(document.querySelector(".ogl-spyTable tbody button.icon_trash"), null);
  assert.ok(document.querySelector(".ogl-spyTable tbody button.icon_restore"));
});

test("clicking delete queues exactly that report, hides its row and sends its id through flagDeleted", (t) => {
  resetStore();
  document.body.innerHTML = spyPageChrome();
  const report = spyReportRow(9601, { targetPlayerId: 99999, fleetFilter: "0", defenseFilter: "0" });

  installJQueryStub();
  let capturedIds;
  globalThis.ogame = {
    messages: {
      flagDeleted: (fakeBtn) => {
        capturedIds = globalThis.$(fakeBtn).data("messageId");
      },
    },
  };

  new SpyMessagesAnalyzer().analyze(spyCallableOf(report), messagesTabs.SPY);
  const row = document.querySelector('.ogl-spyTable tbody tr[data-report-id="9601"]');

  // #flagDeleted() leaves a real 10s safety-net setTimeout pending until the server
  // confirms - mock it so the click below schedules a fake timer instead of a real
  // one that would otherwise keep the process (and this test's now-torn-down
  // browser globals) alive for a real 10 seconds after the test ends.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    row.querySelector("button.icon_trash").click();

    assert.deepEqual(capturedIds, ["9601"]);
    assert.ok(row.classList.contains("hide"), "the row is hidden optimistically, before any server confirmation");
  } finally {
    t.mock.timers.reset();
  }
});

test("a server-confirmed delete also removes the native message list item", (t) => {
  resetStore();
  document.body.innerHTML = spyPageChrome();
  const report = spyReportRow(9602, { targetPlayerId: 99999, fleetFilter: "0", defenseFilter: "0" });
  document.querySelector(".messagesHolder").appendChild(report); // real messages live under .messagesHolder

  const $ = installJQueryStub();
  globalThis.ogame = {
    messages: {
      flagDeleted: (fakeBtn) => {
        $(fakeBtn).data("messageId"); // real ogame.messages.flagDeleted reads it; we don't need the value here
      },
    },
  };

  new SpyMessagesAnalyzer().analyze(spyCallableOf(report), messagesTabs.SPY);

  // #flagDeleted() leaves a real 10s safety-net setTimeout pending regardless of
  // whether $._trigger("ajaxSuccess", ...) below logically settles it - settling
  // only short-circuits the callback body, it does not clearTimeout() the handle,
  // so mock it too or the process waits out the real 10s before this file can exit.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  document.querySelector(".ogl-spyTable tbody button.icon_trash").click();

  assert.ok(document.querySelector(".messagesHolder .msg[data-msg-id='9602']"), "not removed before confirmation");

  $._trigger(
    "ajaxSuccess",
    {},
    { responseJSON: { status: "success" } },
    { url: "index.php?page=ingame&component=fleetdispatch&action=flagDeleted&asJson=1", data: "messageIds[]=9602" }
  );

  assert.equal(
    document.querySelector(".messagesHolder .msg[data-msg-id='9602']"),
    null,
    "ogame.messages.flagDeleted only cleans up a single-id selector, so the analyzer removes the batch itself"
  );
  t.mock.timers.reset();
});

test("a flagDeleted call that throws synchronously reverts the optimistic hide", () => {
  resetStore();
  document.body.innerHTML = spyPageChrome();
  const report = spyReportRow(9603, { targetPlayerId: 99999, fleetFilter: "0", defenseFilter: "0" });

  installJQueryStub();
  globalThis.ogame = {
    messages: {
      flagDeleted: () => {
        throw new Error("boom");
      },
    },
  };

  new SpyMessagesAnalyzer().analyze(spyCallableOf(report), messagesTabs.SPY);
  const row = document.querySelector('.ogl-spyTable tbody tr[data-report-id="9603"]');

  assert.doesNotThrow(() => row.querySelector("button.icon_trash").click());
  assert.equal(row.classList.contains("hide"), false, "the failed delete was undone rather than left misleading");
});

test("auto-delete queues a report below the limit without any click, in the same batch delete path", (t) => {
  resetStore({ autoDeleteEnable: true, rvalLimit: 100000 });
  document.body.innerHTML = spyPageChrome();
  // fleet/defense 0, loot 1% of 1000 = renta 10 - well under the 100000 limit.
  const report = spyReportRow(9701, {
    targetPlayerId: 99999,
    fleetFilter: "0",
    defenseFilter: "0",
    loot: "1%",
    metal: 1000,
  });

  installJQueryStub();
  let capturedIds;
  globalThis.ogame = {
    messages: {
      flagDeleted: (fakeBtn) => {
        capturedIds = globalThis.$(fakeBtn).data("messageId");
      },
    },
  };

  // auto-delete fires #flagDeleted() during analyze() itself, leaving a real 10s
  // safety-net setTimeout pending - mock it so it doesn't keep the process alive
  // for a real 10 seconds after this test's browser globals are torn down.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    new SpyMessagesAnalyzer().analyze(spyCallableOf(report), messagesTabs.SPY);

    assert.deepEqual(capturedIds, ["9701"], "queued and sent without the player clicking anything");
    const row = document.querySelector('.ogl-spyTable tbody tr[data-report-id="9701"]');
    assert.ok(row.classList.contains("hide"));
  } finally {
    t.mock.timers.reset();
  }
});

test("#ptreSpy is a no-op when no PTRE team key is configured", () => {
  resetStore({ ptreTK: null });
  document.body.innerHTML = spyPageChrome();
  const report = spyReportRow(9801, { targetPlayerId: 12345 }); // would match playerId if ptreSpy ran

  assert.doesNotThrow(() => new SpyMessagesAnalyzer().analyze(spyCallableOf(report), messagesTabs.SPY));
  assert.equal(OGBIData.spies, undefined, "nothing was ever written - the guard returns before touching it");
});
