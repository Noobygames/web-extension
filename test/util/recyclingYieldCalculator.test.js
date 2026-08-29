/**
 * `RecyclingYieldCalculator` — the `includeDeut` switch a caller drives with
 * `OGBIData.universeSettingsTooltip.deuteriumInDebris`.
 *
 * Companion to `test/ogcore.serverSettings.test.js`, which pins the actual bug
 * (that flag came out `true` on every universe). This file pins the half of the
 * contract that lives here: with the switch off, deuterium is zeroed regardless
 * of what the fleet or defence would otherwise yield; with it on, deuterium comes
 * through like metal and crystal.
 */
import test from "node:test";
import assert from "node:assert/strict";

import RecyclingYieldCalculator from "../../src/game/recyclingYieldCalculator.js";
import ship from "../../src/game/ship.js";
import defence from "../../src/game/defence.js";

// Recycler and Gauss Cannon (game/shipCosts.js, game/defenceCosts.js) both
// cost non-zero deuterium, so they are enough to prove the switch actually zeroes it
// rather than the cost happening to be zero already.
const RECYCLER = ship.Recycler;
const GAUSS_CANNON = defence.GaussCannon;

test("includeDeut=false zeroes deuterium even though metal and crystal still yield", () => {
  const yieldResult = RecyclingYieldCalculator.CalculateRecyclingYieldFleet({ [RECYCLER]: 1 }, 0.5, false);

  assert.equal(yieldResult.deut, 0);
  assert.ok(yieldResult.metal > 0, "metal should still be non-zero");
  assert.ok(yieldResult.crystal > 0, "crystal should still be non-zero");
});

test("includeDeut=true yields deuterium proportional to the recycling rate", () => {
  const full = RecyclingYieldCalculator.CalculateRecyclingYieldFleet({ [RECYCLER]: 1 }, 1, true);
  const half = RecyclingYieldCalculator.CalculateRecyclingYieldFleet({ [RECYCLER]: 1 }, 0.5, true);

  assert.ok(full.deut > 0, "deuterium should be non-zero when the switch is on");
  assert.equal(half.deut, full.deut / 2);
});

test("the same switch applies to defence, not just fleet", () => {
  const withoutDeut = RecyclingYieldCalculator.CalculateRecyclingYieldDefence({ [GAUSS_CANNON]: 10 }, 0.5, false);
  const withDeut = RecyclingYieldCalculator.CalculateRecyclingYieldDefence({ [GAUSS_CANNON]: 10 }, 0.5, true);

  assert.equal(withoutDeut.deut, 0);
  assert.ok(withDeut.deut > 0, "deuterium should be non-zero when the switch is on");
});
