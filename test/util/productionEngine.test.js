/**
 * Feature D - high-precision production: bonus stacking order, crawler limits, plasma.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  effectiveCrawlers,
  crawlerBonus,
  plasmaBonus,
  realProduction,
  productionBreakdown,
  CRAWLER_OVERLOAD_MAX,
  CRAWLER_MAX_BONUS,
  CRAWLER_BASE_BONUS,
} from "../../src/game/productionEngine.js";

// --------------------------------------------------------------------------
// effectiveCrawlers
// --------------------------------------------------------------------------

test("crawlers beyond what the mines support do not count", () => {
  // 10+10+10 mine levels support 8 * 30 = 240 crawlers
  assert.equal(effectiveCrawlers({ mineLevels: [10, 10, 10], crawlerCount: 1000 }), 240);
});

test("fewer crawlers than the mines support all count", () => {
  assert.equal(effectiveCrawlers({ mineLevels: [10, 10, 10], crawlerCount: 50 }), 50);
});

test("a geologist raises the supported crawler count by 10%", () => {
  const without = effectiveCrawlers({ mineLevels: [10, 10, 10], crawlerCount: 1000 });
  const with_ = effectiveCrawlers({ mineLevels: [10, 10, 10], crawlerCount: 1000, geologist: true });

  assert.equal(with_, 264);
  assert.ok(with_ > without);
});

test("no mines support no crawlers", () => {
  assert.equal(effectiveCrawlers({ mineLevels: [0, 0, 0], crawlerCount: 100 }), 0);
});

test("missing or negative inputs yield zero rather than NaN", () => {
  assert.equal(effectiveCrawlers({ mineLevels: undefined, crawlerCount: 100 }), 0);
  assert.equal(effectiveCrawlers({ mineLevels: [10, 10, 10], crawlerCount: -5 }), 0);
  assert.equal(effectiveCrawlers({ mineLevels: [10, "x", 10], crawlerCount: 1000 }), 160);
});

// --------------------------------------------------------------------------
// crawlerBonus
// --------------------------------------------------------------------------

test("the crawler bonus scales with the number of crawlers", () => {
  assert.equal(crawlerBonus({ crawlers: 100 }), 100 * CRAWLER_BASE_BONUS);
  assert.equal(crawlerBonus({ crawlers: 0 }), 0);
});

test("the crawler bonus is capped at half the base production", () => {
  assert.equal(crawlerBonus({ crawlers: 100000 }), CRAWLER_MAX_BONUS);
});

test("overload only applies to a Collector", () => {
  const crawlers = 100;

  const collector = crawlerBonus({ crawlers, overload: CRAWLER_OVERLOAD_MAX, isCollector: true });
  const other = crawlerBonus({ crawlers, overload: CRAWLER_OVERLOAD_MAX, isCollector: false });

  assert.equal(other, crawlerBonus({ crawlers }), "a non-Collector's overload slider does nothing");
  assert.ok(collector > other);
  assert.equal(collector, crawlerBonus({ crawlers }) * CRAWLER_OVERLOAD_MAX);
});

test("overload cannot be pushed past 150%", () => {
  const capped = crawlerBonus({ crawlers: 100, overload: 5, isCollector: true });

  assert.equal(capped, 100 * CRAWLER_BASE_BONUS * CRAWLER_OVERLOAD_MAX);
});

test("overload below 100% is treated as 100%", () => {
  assert.equal(crawlerBonus({ crawlers: 100, overload: 0.2, isCollector: true }), 100 * CRAWLER_BASE_BONUS);
});

test("class and lifeform crawler bonuses add rather than multiply each other", () => {
  const result = crawlerBonus({ crawlers: 100, classBonus: 0.5, lifeformBonus: 0.25 });

  assert.ok(Math.abs(result - 100 * CRAWLER_BASE_BONUS * 1.75) < 1e-12);
});

test("a missing lifeform bonus does not silently become 100%", () => {
  // guards the `1 + x || 1` precedence trap: an undefined bonus must mean "no bonus"
  const withUndefined = crawlerBonus({ crawlers: 100, lifeformBonus: undefined });

  assert.equal(withUndefined, 100 * CRAWLER_BASE_BONUS);
});

// --------------------------------------------------------------------------
// plasmaBonus
// --------------------------------------------------------------------------

test("plasma gives 1% metal, 0.66% crystal and 0.33% deuterium per level", () => {
  assert.ok(Math.abs(plasmaBonus(10, 0) - 0.1) < 1e-12);
  assert.ok(Math.abs(plasmaBonus(10, 1) - 0.066) < 1e-12);
  assert.ok(Math.abs(plasmaBonus(10, 2) - 0.033) < 1e-12);
});

test("no plasma research is no bonus", () => {
  assert.equal(plasmaBonus(0, 0), 0);
  assert.equal(plasmaBonus(undefined, 0), 0);
});

test("an unknown resource index contributes nothing instead of NaN", () => {
  assert.equal(plasmaBonus(10, 7), 0);
});

// --------------------------------------------------------------------------
// realProduction
// --------------------------------------------------------------------------

test("with no bonuses production is just the base", () => {
  assert.equal(realProduction({ baseProduction: 10000, resourceIndex: 0 }), 10000);
});

test("bonuses are shares of the base and add before they multiply", () => {
  // 20 plasma = +20% metal, crawlers +10%, lifeform +5% => 1.35x, NOT 1.2*1.1*1.05
  const result = realProduction({
    baseProduction: 10000,
    resourceIndex: 0,
    plasmaLevel: 20,
    crawlerBonus: 0.1,
    lifeformBonus: 0.05,
  });

  assert.equal(result, 13500);
  assert.notEqual(result, Math.floor(10000 * 1.2 * 1.1 * 1.05), "compounding would overstate the number");
});

test("the energy production factor scales the mines", () => {
  const full = realProduction({ baseProduction: 10000, resourceIndex: 0, productionFactor: 1 });
  const half = realProduction({ baseProduction: 10000, resourceIndex: 0, productionFactor: 0.5 });

  assert.equal(half, full / 2);
});

test("a production factor above 1 is clamped - energy surplus does not raise output", () => {
  assert.equal(realProduction({ baseProduction: 10000, resourceIndex: 0, productionFactor: 3 }), 10000);
});

test("the universe base income is added after the factor and is never scaled by it", () => {
  const result = realProduction({
    baseProduction: 10000,
    resourceIndex: 0,
    productionFactor: 0,
    baseIncome: 30,
  });

  assert.equal(result, 30, "a planet with no energy still receives the free base income");
});

test("production is floored, because the game pays whole resources", () => {
  const result = realProduction({ baseProduction: 1000, resourceIndex: 2, plasmaLevel: 1 });

  assert.equal(result, 1003);
  assert.equal(Number.isInteger(result), true);
});

test("class, alliance, officer and geologist bonuses all stack additively", () => {
  const result = realProduction({
    baseProduction: 10000,
    resourceIndex: 0,
    classBonus: 0.25,
    allianceBonus: 0.05,
    officerBonus: 0.02,
    geologistBonus: 0.1,
  });

  assert.equal(result, 14200);
});

test("missing bonuses are treated as zero, never as one", () => {
  const result = realProduction({
    baseProduction: 10000,
    resourceIndex: 0,
    crawlerBonus: undefined,
    lifeformBonus: undefined,
    classBonus: undefined,
  });

  assert.equal(result, 10000);
});

test("a negative base cannot produce a negative output", () => {
  assert.equal(realProduction({ baseProduction: -500, resourceIndex: 0 }), 0);
});

// --------------------------------------------------------------------------
// productionBreakdown
// --------------------------------------------------------------------------

test("the breakdown parts add up to the total", () => {
  const params = {
    baseProduction: 10000,
    resourceIndex: 0,
    plasmaLevel: 20,
    crawlerBonus: 0.1,
    lifeformBonus: 0.05,
    classBonus: 0.25,
  };

  const parts = productionBreakdown(params);

  assert.equal(parts.base + parts.plasma + parts.crawler + parts.lifeform + parts.other, parts.total);
});

test("the breakdown attributes each bonus to the right row", () => {
  const parts = productionBreakdown({
    baseProduction: 10000,
    resourceIndex: 0,
    plasmaLevel: 20,
    crawlerBonus: 0.1,
  });

  assert.equal(parts.base, 10000);
  assert.equal(parts.plasma, 2000);
  assert.equal(parts.crawler, 1000);
  assert.equal(parts.lifeform, 0);
});

test("the breakdown honours the energy factor everywhere", () => {
  const parts = productionBreakdown({
    baseProduction: 10000,
    resourceIndex: 0,
    plasmaLevel: 20,
    productionFactor: 0.5,
  });

  assert.equal(parts.base, 5000);
  assert.equal(parts.plasma, 1000);
});
