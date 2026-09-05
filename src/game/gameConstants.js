/**
 * The scalar game constants: officer and technology bonuses, position multipliers,
 * technology-id groupings, and the expedition point value of every ship.
 *
 * Lifted verbatim out of `ogCore.js` in Phase 3 of refactoring.md.
 *
 * `CRAWLER_OVERLOAD_MAX` is NOT redefined here. `util/productionEngine.js` already
 * exported it, and a second copy of a number that has to agree is exactly the kind of
 * duplication this phase exists to remove - so it is re-exported from there.
 */
export { CRAWLER_OVERLOAD_MAX } from "./productionEngine.js";

export const SHIP_EXPEDITION_POINTS = {
  202: 20,
  203: 60,
  204: 20,
  205: 50,
  206: 135,
  207: 300,
  208: 150,
  209: 80,
  210: 5,
  211: 375,
  213: 550,
  214: 45000,
  215: 350,
  218: 700,
  219: 115,
};

export const SUPPLIES_TECHID = [1, 2, 3, 4, 12, 22, 23, 24];
export const FACILITIES_TECHID = [14, 15, 21, 31, 33, 34, 36, 44, 41, 42, 43];
export const IONTECHNOLOGY_BONUS = 0.04;
export const PLASMATECH_BONUS = [0.01, 0.0066, 0.0033];
export const ENGINEER_ENERGY_BONUS = 0.1;
export const GEOLOGIST_CRAWLER_BONUS = 0.1;
export const GEOLOGIST_RESOURCE_BONUS = 0.1;
export const OFFICER_ENERGY_BONUS = 0.02;
export const OFFICER_RESOURCE_BONUS = 0.02;
export const TRADER_ENERGY_BONUS = 0.05;
export const TRADER_RESOURCE_BONUS = 0.05;
export const METAL_GENERAL_INCOMING = 30;
export const CRYSTAL_GENERAL_INCOMING = 15;
export const METAL_POS_BONUS = [1, 1, 1, 1, 1, 1.17, 1.23, 1.35, 1.23, 1.17, 1, 1, 1, 1, 1];
export const CRYSTAL_POS_BONUS = [1.4, 1.3, 1.2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
export const MAX_CRAWLERS_PER_MINE = 8;

/**
 * Expedition tiers. All three are indexed by the same tier number, which is derived
 * from the player's total points, so they have to stay the same length and in the same
 * order.
 */
export const EXPEDITION_EXPEDITION_POINTS = [200, 2500, 6000, 9000, 12000, 15000, 18000, 21000, 25000];
export const EXPEDITION_MAX_RESOURCES = [4e4, 5e5, 12e5, 18e5, 24e5, 3e6, 36e5, 42e5, 5e6];
export const EXPEDITION_TOP1_POINTS = [1e4, 1e5, 1e6, 5e6, 25e6, 5e7, 75e6, 1e8];
