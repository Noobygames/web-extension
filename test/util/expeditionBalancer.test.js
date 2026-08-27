/**
 * Feature C - splitting the cargo on a planet evenly across the free expedition slots.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { openExpeditionSlots, balanceShips, planExpeditionFleets } from "../../src/util/expeditionBalancer.js";

// --------------------------------------------------------------------------
// openExpeditionSlots
// --------------------------------------------------------------------------

test("free slots are the expedition maximum minus what is already flying", () => {
  assert.equal(openExpeditionSlots({ maxExpeditions: 4, activeExpeditions: 1 }), 3);
  assert.equal(openExpeditionSlots({ maxExpeditions: 4, activeExpeditions: 4 }), 0);
});

test("more expeditions flying than the maximum reports zero, never a negative number", () => {
  assert.equal(openExpeditionSlots({ maxExpeditions: 2, activeExpeditions: 5 }), 0);
});

test("fleet slots cap the expedition slots", () => {
  // three expedition slots free, but only one fleet slot left to fly them in
  assert.equal(
    openExpeditionSlots({ maxExpeditions: 4, activeExpeditions: 1, maxFleets: 11, activeFleets: 10 }),
    1,
    "an expedition still costs a fleet slot"
  );
});

test("plenty of fleet slots leaves the expedition limit in charge", () => {
  assert.equal(openExpeditionSlots({ maxExpeditions: 3, activeExpeditions: 0, maxFleets: 11, activeFleets: 0 }), 3);
});

test("no fleet slots at all means nothing can be sent", () => {
  assert.equal(openExpeditionSlots({ maxExpeditions: 4, activeExpeditions: 0, maxFleets: 11, activeFleets: 11 }), 0);
});

test("unknown or malformed counts degrade to zero rather than NaN", () => {
  assert.equal(openExpeditionSlots({}), 0);
  assert.equal(openExpeditionSlots({ maxExpeditions: undefined, activeExpeditions: undefined }), 0);
  assert.equal(openExpeditionSlots({ maxExpeditions: "4", activeExpeditions: "1" }), 3);
});

// --------------------------------------------------------------------------
// balanceShips
// --------------------------------------------------------------------------

test("ships are split evenly across the open slots", () => {
  const result = balanceShips(120, 3);

  assert.equal(result.perFleet, 40);
  assert.equal(result.fleets, 3);
  assert.equal(result.used, 120);
  assert.equal(result.remainder, 0);
});

test("the split floors, so no fleet asks for ships the planet does not have", () => {
  const result = balanceShips(100, 3);

  assert.equal(result.perFleet, 33);
  assert.equal(result.used, 99);
  assert.equal(result.remainder, 1, "the leftover stays on the planet");
});

test("one open slot takes everything", () => {
  assert.equal(balanceShips(57, 1).perFleet, 57);
});

test("no open slots proposes nothing and keeps every ship home", () => {
  const result = balanceShips(500, 0);

  assert.equal(result.perFleet, 0);
  assert.equal(result.fleets, 0);
  assert.equal(result.remainder, 500);
});

test("no ships proposes nothing", () => {
  assert.deepEqual(balanceShips(0, 4), { perFleet: 0, fleets: 0, used: 0, remainder: 0 });
});

test("fewer ships than slots fills what it can rather than proposing zero-ship fleets", () => {
  const result = balanceShips(2, 5);

  // 2/5 floors to 0, which would be a useless proposal
  assert.equal(result.perFleet, 0);
  assert.equal(result.remainder, 2);
});

test("a maximum caps each fleet and leaves the rest behind", () => {
  const result = balanceShips(300, 3, { maximumPerFleet: 50 });

  assert.equal(result.perFleet, 50);
  assert.equal(result.used, 150);
  assert.equal(result.remainder, 150);
});

test("a minimum fills fewer expeditions properly instead of several thin ones", () => {
  // 60 ships over 4 slots is 15 each, below a 25-ship minimum
  const result = balanceShips(60, 4, { minimumPerFleet: 25 });

  assert.equal(result.perFleet, 25);
  assert.equal(result.fleets, 2, "two proper expeditions beat four underfilled ones");
  assert.equal(result.used, 50);
  assert.equal(result.remainder, 10);
});

test("a minimum nothing can satisfy proposes no fleet at all", () => {
  const result = balanceShips(10, 4, { minimumPerFleet: 25 });

  assert.equal(result.perFleet, 0);
  assert.equal(result.fleets, 0);
  assert.equal(result.remainder, 10);
});

test("the minimum never proposes more fleets than there are open slots", () => {
  const result = balanceShips(1000, 2, { minimumPerFleet: 25 });

  assert.equal(result.fleets, 2);
});

test("a comfortable split ignores the minimum entirely", () => {
  const result = balanceShips(400, 4, { minimumPerFleet: 25 });

  assert.equal(result.perFleet, 100);
  assert.equal(result.fleets, 4);
});

// --------------------------------------------------------------------------
// planExpeditionFleets
// --------------------------------------------------------------------------

test("the full plan combines the slot count and the split", () => {
  const plan = planExpeditionFleets({
    maxExpeditions: 4,
    activeExpeditions: 1,
    availableShips: 150,
    maxFleets: 11,
    activeFleets: 2,
  });

  assert.equal(plan.openSlots, 3);
  assert.equal(plan.perFleet, 50);
  assert.equal(plan.used, 150);
});

test("a player with every expedition already flying is proposed nothing", () => {
  const plan = planExpeditionFleets({ maxExpeditions: 3, activeExpeditions: 3, availableShips: 500 });

  assert.equal(plan.openSlots, 0);
  assert.equal(plan.perFleet, 0);
});

test("the plan honours both bounds at once", () => {
  const plan = planExpeditionFleets({
    maxExpeditions: 5,
    activeExpeditions: 0,
    availableShips: 90,
    minimumPerFleet: 25,
    maximumPerFleet: 40,
  });

  // 90/5 = 18, under the minimum, so fill three proper fleets instead
  assert.equal(plan.perFleet, 25);
  assert.equal(plan.fleets, 3);
});
