/**
 * The five message analyzers.
 *
 * `docs/testing.md` calls these "the highest-value gap, since these are where most
 * bug reports land". They are page-context classes despite living under
 * `ctxcontent/` (see the directory-name note in refactoring.md Phase 6), so
 * `setupBrowser()` is called WITHOUT `chrome: true`.
 *
 * Each one implements the same informal interface - `support(tabId)`,
 * optional `clean(force)`, `analyze(messageCallable, tabId)` - and `Messages`
 * dispatches to whichever claims the current tab. The dispatch contract is what the
 * first block covers; after that, one parsing path per analyzer.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const browser = setupBrowser({ url: "https://s1-en.ogame.gameforge.com/game/index.php?page=messages" });

// `playerId` is an OGame page global. The analyzers read it to tell an incoming
// transport from an outgoing one, and to find their own combat report.
globalThis.playerId = 12345;

const { messagesTabs } = await import("../../src/ctxpage/messages/index.js");
const OGIData = (await import("../../src/util/OGIData.js")).default;
const SpyMessagesAnalyzer = (await import("../../src/ctxcontent/services/analyzer/SpyMessagesAnalyzer.js")).default;
const ExpeditionMessagesAnalyzer = (
  await import("../../src/ctxcontent/services/analyzer/ExpeditionMessagesAnalyzer.js")
).default;
const FightMessagesAnalyzer = (await import("../../src/ctxcontent/services/analyzer/FightMessagesAnalyzer.js")).default;
const HarvestMessagesAnalyzer = (await import("../../src/ctxcontent/services/analyzer/HarvestMessagesAnalyzer.js"))
  .default;
const TradeMessagesAnalyzer = (await import("../../src/ctxcontent/services/analyzer/TradeMessagesAnalyzer.js")).default;

test.after(() => {
  delete globalThis.playerId;
  browser.cleanup();
});

/** A fresh, empty store for every test - OGIData is a singleton over localStorage. */
function resetStore(options = {}) {
  OGIData.json = {
    options: { standardUnitBase: 0, tradeRate: [2.5, 1.5, 1], ...options },
    harvests: {},
    trades: {},
    expeditions: {},
    combats: {},
    expeditionSums: {},
    combatsSums: {},
    tradesSums: {},
    discoveries: {},
    discoveriesSums: {},
    ships: { 218: { cargoCapacity: 20000 } },
  };
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
  assert.deepEqual(OGIData.expeditionSums["27.08.26"].harvest, [1000, 500, 250]);
  assert.equal(OGIData.combatsSums["27.08.26"], undefined);
  assert.equal(OGIData.harvests["1001"].metal, 1000);
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

  assert.deepEqual(OGIData.combatsSums["27.08.26"].harvest, [10, 20, 30]);
  assert.equal(OGIData.expeditionSums["27.08.26"], undefined);
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

  assert.equal(OGIData.expeditionSums["27.08.26"].harvest[0], 200);
});

test("a message of another type is left alone entirely", () => {
  resetStore();
  document.body.innerHTML = "";
  const row = messageRow(1005, { messagetype: 33, targetcoordinates: "1:2:8" });

  new HarvestMessagesAnalyzer().analyze(callableOf(row), messagesTabs.COMMON);

  assert.equal(row.className, "msg", "no class was added");
  assert.deepEqual(OGIData.harvests, {});
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

  assert.equal(OGIData.expeditionSums["27.08.26"].harvest[0], 100, "the msgId cache held");
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

test("KNOWN BUG: TradeMessagesAnalyzer computes trades and then throws them away", () => {
  // Both writes back to the store are commented out (`/*OGIData.trades = trades;*/`
  // and the same for `tradesSums`), and no other module writes either key - the
  // legacy analyzer does not handle transports at all. So `OGIData.trades` stays
  // empty forever, the msgId cache one line above it can never hit, and the label
  // is recomputed on every render. The trade statistics have no source of data.
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

  assert.deepEqual(OGIData.trades, {}, "nothing was persisted");
  assert.deepEqual(OGIData.tradesSums, {});
});

// --------------------------------------------------------------------------
// ExpeditionMessagesAnalyzer / FightMessagesAnalyzer
// --------------------------------------------------------------------------

test("ExpeditionMessagesAnalyzer ignores messages that are not expeditions or discoveries", () => {
  resetStore();
  document.body.innerHTML = "";
  const row = messageRow(3001, { messagetype: 32, targetcoordinates: "1:2:16" });

  new ExpeditionMessagesAnalyzer().analyze(callableOf(row), messagesTabs.EXPEDITION);

  assert.deepEqual(OGIData.expeditions, {});
  assert.deepEqual(OGIData.discoveries, {});
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
  assert.equal(OGIData.combats["4001"].win, true, "the defender winning is a win for the player");
  assert.equal(OGIData.combats["4001"].draw, false);
  assert.deepEqual(OGIData.combats["4001"].losses, { 204: 3 });
  assert.deepEqual(OGIData.expeditionSums["27.08.26"].losses, { 204: 3 });
});

test("an expedition fight nobody won is recorded as a draw, not a loss", () => {
  resetStore();
  document.body.innerHTML = "";

  new FightMessagesAnalyzer().analyze(
    callableOf(expeditionFightRow(4002, { winner: "none" })),
    messagesTabs.BATTLE_REPORT
  );

  assert.equal(OGIData.combats["4002"].draw, true);
  assert.equal(OGIData.combats["4002"].win, false);
});

test("an already-known expedition fight is re-labelled without being counted again", () => {
  resetStore();
  document.body.innerHTML = "";
  const row = expeditionFightRow(4003);
  const analyzer = new FightMessagesAnalyzer();

  analyzer.analyze(callableOf(row), messagesTabs.BATTLE_REPORT);
  analyzer.analyze(callableOf(row), messagesTabs.BATTLE_REPORT);

  assert.deepEqual(OGIData.expeditionSums["27.08.26"].losses, { 204: 3 }, "losses were not doubled");
});

test("KNOWN BUG: one message without combat data aborts the whole battle-report pass", () => {
  // Neither `#getExpeditionFight()` nor `#getFight()` filters on
  // `data-raw-messagetype` - they look only at the coordinates and the hashcode. So
  // anything else on that tab reaches a parser that does `JSON.parse(null).owner` or
  // `JSON.parse(null).pop()`, and the TypeError escapes `analyze()`. Every message
  // after it in the same pass is skipped, so one odd row blanks the whole tab.
  // The harvest and trade analyzers both filter on the message type first.
  resetStore();
  document.body.innerHTML = "";
  const odd = messageRow(4004, { coords: "1:2:8", hashcode: "abc" });
  const good = expeditionFightRow(4005);

  assert.throws(
    () => new FightMessagesAnalyzer().analyze(callableOf(odd, good), messagesTabs.BATTLE_REPORT),
    TypeError
  );

  // analyze() runs the expedition pass first and the ordinary-combat pass second, so
  // the damage is order-dependent: the expedition report was already booked, and
  // everything the second pass would have done is lost without a trace.
  assert.ok(OGIData.combats["4005"], "the expedition pass had already finished");
  assert.equal(OGIData.combats["4004"], undefined, "the pass that threw booked nothing");
});

test("a spy flight that never came back carries no report and is skipped", () => {
  resetStore();
  document.body.innerHTML = "";
  const noReturn = messageRow(4006, { coords: "1:2:8", hashcode: "" });

  new FightMessagesAnalyzer().analyze(callableOf(noReturn), messagesTabs.BATTLE_REPORT);

  assert.deepEqual(OGIData.combats, {});
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
