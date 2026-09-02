/**
 * Bashing-rule counter - the pure half (src/game/bashing.js).
 *
 * The rule being encoded: at most `bashlimit` attacks (6 by default, 20 in some
 * universes) per planet OR moon per rolling 24h window; espionage and interplanetary
 * missiles are exempt, moon destruction is not.
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
  countsForBashing,
  formatBashCountdown,
  pruneBashLog,
  recordBashAttack,
} from "../../src/game/bashing.js";

const NOW = Date.UTC(2026, 0, 2, 12, 0, 0);
const hoursAgo = (hours) => NOW - hours * 3600000;

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
  const log = { "1:2:3": [hoursAgo(30), hoursAgo(23), hoursAgo(1)] };

  assert.equal(bashStatus(log, "1:2:3", NOW).count, 2);
});

test("an attack exactly 24h old has aged out", () => {
  const log = { "1:2:3": [NOW - BASH_WINDOW_MS] };

  assert.equal(bashStatus(log, "1:2:3", NOW).count, 0);
});

test("resetAt is 24h after the oldest attack still in the window", () => {
  const oldest = hoursAgo(20);
  const log = { "1:2:3": [oldest, hoursAgo(2)] };

  const status = bashStatus(log, "1:2:3", NOW);
  assert.equal(status.resetAt, oldest + BASH_WINDOW_MS);
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
  const log = { "1:2:3": Array.from({ length: 7 }, (_, i) => hoursAgo(i + 1)) };

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
// writing
// --------------------------------------------------------------------------

test("recording appends and keeps the list sorted", () => {
  const log = {};

  recordBashAttack(log, "1:2:3", hoursAgo(2));
  recordBashAttack(log, "1:2:3", hoursAgo(5));

  assert.deepEqual(log["1:2:3"], [hoursAgo(5), hoursAgo(2)]);
});

test("recording prunes the window first, so the log cannot grow without bound", () => {
  const log = { "1:2:3": [hoursAgo(48), hoursAgo(30)] };

  recordBashAttack(log, "1:2:3", NOW);

  assert.deepEqual(log["1:2:3"], [NOW]);
});

test("pruning drops keys that ran empty and reports whether anything changed", () => {
  const log = { "1:2:3": [hoursAgo(48)], "4:5:6": [hoursAgo(1)] };

  assert.equal(pruneBashLog(log, NOW), true);
  assert.deepEqual(Object.keys(log), ["4:5:6"]);
  assert.equal(pruneBashLog(log, NOW), false, "a second prune has nothing to do");
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
