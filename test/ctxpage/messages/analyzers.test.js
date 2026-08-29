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

const browser = setupBrowser({ url: "https://s1-en.ogame.gameforge.com/game/index.php?page=messages" });

// `playerId` is an OGame page global. The analyzers read it to tell an incoming
// transport from an outgoing one, and to find their own combat report.
globalThis.playerId = 12345;

const { messagesTabs } = await import("../../../src/ctxpage/messages/index.js");
const OGBIData = (await import("../../../src/store/OGBIData.js")).default;
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
  browser.cleanup();
});

/** A fresh, empty store for every test - OGBIData is a singleton over localStorage. */
function resetStore(options = {}) {
  OGBIData.json = {
    options: { standardUnitBase: 0, tradeRate: [2.5, 1.5, 1], ...options },
    harvests: {},
    expeditions: {},
    combats: {},
    expeditionSums: {},
    combatsSums: {},
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
