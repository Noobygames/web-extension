/**
 * Bashing-rule counter - the pure half (src/game/bashing.js).
 *
 * The rule being encoded: at most `bashlimit` attacks (6 by default, 20 in some
 * universes) per planet OR moon per rolling 24h window; espionage and interplanetary
 * missiles are exempt, moon destruction is not.
 *
 * The log has two feeds - the fleet-dispatch hook at launch, and battle reports the
 * player opens - so most of what is pinned here is that one attack cannot be counted
 * twice, and that an attack sent from another device still lands.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  BASH_WINDOW_MS,
  DEFAULT_BASH_LIMIT,
  bashKey,
  bashKeyFromTarget,
  bashLevel,
  bashStatus,
  confirmBashAttack,
  countsForBashing,
  entriesFor,
  formatBashCountdown,
  pruneBashLog,
  recordBashAttack,
} from "../../src/game/bashing.js";

const NOW = Date.UTC(2026, 0, 2, 12, 0, 0);
const hoursAgo = (hours) => NOW - hours * 3600000;
/** A launch-time entry - no battle report behind it yet. */
const at = (hours) => ({ t: hoursAgo(hours) });
/** An entry confirmed by a battle report. */
const confirmed = (hours, ref) => ({ t: hoursAgo(hours), ref });

// --------------------------------------------------------------------------
// keys - a planet and its moon are separate targets under the rule
// --------------------------------------------------------------------------

test("planet and moon on the same coordinates get separate keys", () => {
  assert.equal(bashKey("1:2:3", false), "1:2:3");
  assert.equal(bashKey("1:2:3", true), "1:2:3:M");
  assert.notEqual(bashKey("1:2:3", false), bashKey("1:2:3", true));
});

test("OGame's target type maps onto those keys - 3 is the moon, 1 and 2 are not", () => {
  assert.equal(bashKeyFromTarget("1:2:3", 1), "1:2:3");
  assert.equal(bashKeyFromTarget("1:2:3", "3"), "1:2:3:M");
  assert.equal(bashKeyFromTarget("1:2:3", 2), "1:2:3");
});

// --------------------------------------------------------------------------
// which missions count
// --------------------------------------------------------------------------

test("attack, ACS attack and moon destruction count; spy and missile do not", () => {
  assert.equal(countsForBashing(1), true, "attack");
  assert.equal(countsForBashing(2), true, "ACS attack");
  assert.equal(countsForBashing(9), true, "moon destruction");

  assert.equal(countsForBashing(6), false, "espionage is exempt by rule");
  assert.equal(countsForBashing(10), false, "interplanetary missiles are exempt by rule");
  assert.equal(countsForBashing(3), false, "transport");
  assert.equal(countsForBashing(15), false, "expedition");
});

test("mission ids arriving as strings still count", () => {
  assert.equal(countsForBashing("1"), true);
});

// --------------------------------------------------------------------------
// the rolling window
// --------------------------------------------------------------------------

test("only attacks inside the 24h window count", () => {
  const log = { "1:2:3": [at(30), at(23), at(1)] };

  assert.equal(bashStatus(log, "1:2:3", NOW).count, 2);
});

test("an attack exactly 24h old has aged out", () => {
  const log = { "1:2:3": [{ t: NOW - BASH_WINDOW_MS }] };

  assert.equal(bashStatus(log, "1:2:3", NOW).count, 0);
});

test("resetAt is 24h after the oldest attack still in the window", () => {
  const oldest = hoursAgo(20);
  const log = { "1:2:3": [{ t: oldest }, at(2)] };

  assert.equal(bashStatus(log, "1:2:3", NOW).resetAt, oldest + BASH_WINDOW_MS);
});

test("an untouched target has no count and no reset time", () => {
  const status = bashStatus({}, "9:9:9", NOW);

  assert.equal(status.count, 0);
  assert.equal(status.resetAt, null);
  assert.equal(status.level, "none");
});

// --------------------------------------------------------------------------
// the limit is per universe, not hardcoded
// --------------------------------------------------------------------------

test("the limit defaults to 6 but a universe value wins", () => {
  const log = { "1:2:3": Array.from({ length: 7 }, (_, i) => at(i + 1)) };

  assert.equal(bashStatus(log, "1:2:3", NOW).limit, DEFAULT_BASH_LIMIT);
  assert.equal(bashStatus(log, "1:2:3", NOW).level, "limit");

  const generous = bashStatus(log, "1:2:3", NOW, 20);
  assert.equal(generous.limit, 20);
  assert.equal(generous.remaining, 13);
  assert.equal(generous.level, "ok");
});

test("a nonsense limit falls back to the rule default instead of dividing by nothing", () => {
  assert.equal(bashStatus({}, "1:2:3", NOW, 0).limit, DEFAULT_BASH_LIMIT);
  assert.equal(bashStatus({}, "1:2:3", NOW, NaN).limit, DEFAULT_BASH_LIMIT);
});

test("levels: last attack before the limit warns, the limit itself is red", () => {
  assert.equal(bashLevel(0, 6), "none");
  assert.equal(bashLevel(1, 6), "ok");
  assert.equal(bashLevel(4, 6), "ok");
  assert.equal(bashLevel(5, 6), "warn");
  assert.equal(bashLevel(6, 6), "limit");
  assert.equal(bashLevel(9, 6), "limit");
});

// --------------------------------------------------------------------------
// writing at launch
// --------------------------------------------------------------------------

test("recording appends and keeps the list sorted", () => {
  const log = {};

  recordBashAttack(log, "1:2:3", hoursAgo(2));
  recordBashAttack(log, "1:2:3", hoursAgo(5));

  assert.deepEqual(log["1:2:3"], [at(5), at(2)]);
});

test("recording prunes the window first, so the log cannot grow without bound", () => {
  const log = { "1:2:3": [at(48), at(30)] };

  recordBashAttack(log, "1:2:3", NOW);

  assert.deepEqual(log["1:2:3"], [{ t: NOW }]);
});

test("pruning drops keys that ran empty and reports whether anything changed", () => {
  const log = { "1:2:3": [at(48)], "4:5:6": [at(1)] };

  assert.equal(pruneBashLog(log, NOW), true);
  assert.deepEqual(Object.keys(log), ["4:5:6"]);
  assert.equal(pruneBashLog(log, NOW), false, "a second prune has nothing to do");
});

// --------------------------------------------------------------------------
// battle reports - the half that survives playing from another device
// --------------------------------------------------------------------------

test("a report for an attack this browser never sent is added", () => {
  const log = {};

  assert.equal(confirmBashAttack(log, "1:2:3", hoursAgo(2), "hash-a", NOW), true);
  assert.deepEqual(log["1:2:3"], [confirmed(2, "hash-a")]);
  assert.equal(bashStatus(log, "1:2:3", NOW).count, 1);
});

test("the same report parsed again changes nothing - re-opening the tab cannot inflate the count", () => {
  const log = {};

  confirmBashAttack(log, "1:2:3", hoursAgo(2), "hash-a", NOW);

  assert.equal(confirmBashAttack(log, "1:2:3", hoursAgo(2), "hash-a", NOW), false);
  assert.equal(bashStatus(log, "1:2:3", NOW).count, 1);
});

test("a report confirms the launch record instead of counting the attack twice", () => {
  const log = {};

  recordBashAttack(log, "1:2:3", hoursAgo(5));
  confirmBashAttack(log, "1:2:3", hoursAgo(4), "hash-a", NOW);

  assert.equal(bashStatus(log, "1:2:3", NOW).count, 1);
  assert.deepEqual(log["1:2:3"], [confirmed(4, "hash-a")]);
});

test("two attacks in flight, one report - the count stays at two", () => {
  const log = {};

  recordBashAttack(log, "1:2:3", hoursAgo(6));
  recordBashAttack(log, "1:2:3", hoursAgo(5));
  confirmBashAttack(log, "1:2:3", hoursAgo(3), "hash-a", NOW);

  const status = bashStatus(log, "1:2:3", NOW);
  assert.equal(status.count, 2);
  assert.equal(status.confirmed, 1);
  assert.equal(status.pending, 1);
});

test("a report cannot consume a launch record made after the battle", () => {
  const log = {};

  recordBashAttack(log, "1:2:3", hoursAgo(1));
  confirmBashAttack(log, "1:2:3", hoursAgo(3), "hash-a", NOW);

  assert.equal(bashStatus(log, "1:2:3", NOW).count, 2, "different attacks, both counted");
});

test("a report older than the window is ignored rather than resurrected", () => {
  const log = {};

  assert.equal(confirmBashAttack(log, "1:2:3", hoursAgo(30), "hash-old", NOW), false);
  assert.deepEqual(log, {});
});

test("a report without a usable hashcode or timestamp is ignored", () => {
  const log = {};

  assert.equal(confirmBashAttack(log, "1:2:3", hoursAgo(2), "", NOW), false);
  assert.equal(confirmBashAttack(log, "1:2:3", NaN, "hash-a", NOW), false);
  assert.deepEqual(log, {});
});

test("a moon report does not confirm a launch record aimed at the planet", () => {
  const log = {};

  recordBashAttack(log, bashKey("1:2:3", false), hoursAgo(5));
  confirmBashAttack(log, bashKey("1:2:3", true), hoursAgo(4), "hash-a", NOW);

  assert.equal(bashStatus(log, bashKey("1:2:3", false), NOW).count, 1);
  assert.equal(bashStatus(log, bashKey("1:2:3", true), NOW).count, 1);
});

// --------------------------------------------------------------------------
// the bare-timestamp shape an earlier build wrote
// --------------------------------------------------------------------------

test("a log of bare timestamps still reads and counts", () => {
  const log = { "1:2:3": [hoursAgo(2), hoursAgo(1)] };

  assert.deepEqual(entriesFor(log, "1:2:3"), [at(2), at(1)]);
  assert.equal(bashStatus(log, "1:2:3", NOW).count, 2);
  assert.equal(bashStatus(log, "1:2:3", NOW).pending, 2);
});

test("pruning rewrites the bare-timestamp shape into entries", () => {
  const log = { "1:2:3": [hoursAgo(30), hoursAgo(1)] };

  assert.equal(pruneBashLog(log, NOW), true);
  assert.deepEqual(log["1:2:3"], [at(1)]);
});

// --------------------------------------------------------------------------
// countdown formatting
// --------------------------------------------------------------------------

test("the countdown reads in hours and minutes, never negative", () => {
  assert.equal(formatBashCountdown(4 * 3600000 + 12 * 60000), "4h 12m");
  assert.equal(formatBashCountdown(12 * 60000), "12m");
  assert.equal(formatBashCountdown(30000), "<1m");
  assert.equal(formatBashCountdown(0), "0m");
  assert.equal(formatBashCountdown(-5000), "0m");
});
