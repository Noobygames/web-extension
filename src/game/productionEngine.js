/**
 * Feature D - high-precision production.
 *
 * Mine output is not "base * level". Plasma, lifeform bonuses, the player and alliance class,
 * officers, crawlers with their overload setting, and the fusion reactor all stack on top, and
 * each is applied at a different point. Getting the ORDER wrong is what makes other tools
 * disagree with the game by a few percent.
 *
 * Order used here, which is the game's:
 *   1. base mine output, scaled by universe speed, position and temperature
 *   2. plasma technology, as a percentage of the BASE output
 *   3. crawlers, as a percentage of the BASE output, capped, overload only for Collector
 *   4. lifeform and class bonuses, as a percentage of the BASE output
 *   5. the planet's energy production factor multiplies the SUM
 *
 * Every bonus in steps 2-4 is a share of the base, not of the running total, so they add before
 * they multiply. Pure arithmetic - no DOM, no network, no game state of its own.
 */

/** Plasma technology, per level, per resource: metal, crystal, deuterium. */
export const PLASMA_BONUS_PER_LEVEL = Object.freeze([0.01, 0.0066, 0.0033]);

/** A Collector may overload crawlers to 150%. */
export const CRAWLER_OVERLOAD_MAX = 1.5;

/** Base crawler output per crawler, per resource. */
export const CRAWLER_BASE_BONUS = 0.0002;

/** Crawler contribution is capped at 50% of base production. */
export const CRAWLER_MAX_BONUS = 0.5;

/** A geologist raises the number of crawlers a planet can usefully hold. */
export const GEOLOGIST_CRAWLER_BONUS = 0.1;

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * How many crawlers actually contribute. Mines support 8 crawlers per combined mine level;
 * anything beyond that sits idle and must not be counted.
 *
 * @param {object} params
 * @param {number[]} params.mineLevels    [metal, crystal, deuterium]
 * @param {number} params.crawlerCount    crawlers parked on the planet
 * @param {boolean} [params.geologist]
 * @return {number}
 */
export function effectiveCrawlers({ mineLevels, crawlerCount, geologist = false }) {
  const mineSum = (mineLevels || []).reduce((sum, level) => sum + Math.max(0, toNumber(level)), 0);
  const supported = Math.floor(mineSum * 8 * (geologist ? 1 + GEOLOGIST_CRAWLER_BONUS : 1));

  return Math.max(0, Math.min(supported, Math.max(0, toNumber(crawlerCount))));
}

/**
 * Crawler production bonus as a share of base output.
 *
 * The overload slider only does anything for a Collector - for every other class the game
 * ignores it, and applying it anyway is a common source of inflated numbers.
 *
 * @param {object} params
 * @param {number} params.crawlers            already limited by effectiveCrawlers()
 * @param {number} [params.overload]          1 .. CRAWLER_OVERLOAD_MAX
 * @param {boolean} [params.isCollector]
 * @param {number} [params.classBonus]        extra crawler efficiency from the Collector class
 * @param {number} [params.lifeformBonus]     extra crawler efficiency from lifeform research
 * @param {number} [params.maxBonus]
 * @return {number} share of base production, never above maxBonus
 */
export function crawlerBonus({
  crawlers,
  overload = 1,
  isCollector = false,
  classBonus = 0,
  lifeformBonus = 0,
  maxBonus = CRAWLER_MAX_BONUS,
}) {
  const count = Math.max(0, toNumber(crawlers));
  if (count === 0) return 0;

  // Overload is a Collector-only setting, and cannot go past 150%.
  const effectiveOverload = isCollector ? Math.min(Math.max(1, toNumber(overload, 1)), CRAWLER_OVERLOAD_MAX) : 1;

  // Both bonuses are additive shares of the crawler's own output.
  const efficiency = 1 + Math.max(0, toNumber(classBonus)) + Math.max(0, toNumber(lifeformBonus));

  return Math.min(count * CRAWLER_BASE_BONUS * effectiveOverload * efficiency, maxBonus);
}

/**
 * Plasma technology bonus as a share of base output.
 *
 * @param {number} plasmaLevel
 * @param {number} resourceIndex  0 metal, 1 crystal, 2 deuterium
 * @return {number}
 */
export function plasmaBonus(plasmaLevel, resourceIndex) {
  const perLevel = PLASMA_BONUS_PER_LEVEL[resourceIndex];
  if (perLevel === undefined) return 0;

  return Math.max(0, toNumber(plasmaLevel)) * perLevel;
}

/**
 * Real hourly production of one resource on one planet.
 *
 * @param {object} params
 * @param {number} params.baseProduction     mine output before any bonus
 * @param {number} params.resourceIndex      0 metal, 1 crystal, 2 deuterium
 * @param {number} [params.plasmaLevel]
 * @param {number} [params.crawlerBonus]     from crawlerBonus(), share of base
 * @param {number} [params.lifeformBonus]    share of base, from lifeform tech
 * @param {number} [params.classBonus]       share of base, from the player class
 * @param {number} [params.allianceBonus]    share of base, from the alliance class
 * @param {number} [params.officerBonus]     share of base, from officers
 * @param {number} [params.geologistBonus]   share of base
 * @param {number} [params.productionFactor] energy satisfaction, 0..1
 * @param {number} [params.baseIncome]       the universe's free income, unaffected by bonuses
 * @return {number} floored, because the game pays whole resources
 */
export function realProduction({
  baseProduction,
  resourceIndex,
  plasmaLevel = 0,
  crawlerBonus: crawler = 0,
  lifeformBonus = 0,
  classBonus = 0,
  allianceBonus = 0,
  officerBonus = 0,
  geologistBonus = 0,
  productionFactor = 1,
  baseIncome = 0,
}) {
  const base = Math.max(0, toNumber(baseProduction));

  // Every bonus is a share of the BASE, so they are summed before being applied once.
  const bonusShare =
    plasmaBonus(plasmaLevel, resourceIndex) +
    Math.max(0, toNumber(crawler)) +
    Math.max(0, toNumber(lifeformBonus)) +
    Math.max(0, toNumber(classBonus)) +
    Math.max(0, toNumber(allianceBonus)) +
    Math.max(0, toNumber(officerBonus)) +
    Math.max(0, toNumber(geologistBonus));

  // Energy shortage scales the mines, but never the universe's free base income.
  const factor = Math.min(Math.max(0, toNumber(productionFactor, 1)), 1);

  return Math.floor(base * (1 + bonusShare) * factor + Math.max(0, toNumber(baseIncome)));
}

/**
 * Per-resource breakdown, for a tooltip that shows where the number came from.
 *
 * @return {{total: number, base: number, plasma: number, crawler: number, lifeform: number, other: number}}
 */
export function productionBreakdown(params) {
  const base = Math.max(0, toNumber(params.baseProduction));
  const factor = Math.min(Math.max(0, toNumber(params.productionFactor, 1)), 1);

  const share = (value) => Math.floor(base * Math.max(0, toNumber(value)) * factor);

  return {
    total: realProduction(params),
    base: Math.floor(base * factor),
    plasma: share(plasmaBonus(params.plasmaLevel, params.resourceIndex)),
    crawler: share(params.crawlerBonus),
    lifeform: share(params.lifeformBonus),
    other: share(
      toNumber(params.classBonus) +
        toNumber(params.allianceBonus) +
        toNumber(params.officerBonus) +
        toNumber(params.geologistBonus)
    ),
  };
}
