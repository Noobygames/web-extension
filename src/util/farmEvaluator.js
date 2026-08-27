/**
 * Feature A - farm evaluation: how much a spy-report target is actually worth per hour,
 * rather than how much loot it happens to hold.
 *
 * A fat target three galaxies away is worth less than a thin one next door, and the absolute
 * "Gain" column cannot show that. Profit per hour is `loot / roundTrip`, so the ranking accounts
 * for the flight the player has to pay for.
 *
 * Pure computation over data the page already carries. Nothing here fetches anything, and nothing
 * here dispatches anything - the result is a number to sort a table by.
 */
import { distance, roundTripDuration } from "./fleetFlight.js";

const SECONDS_PER_HOUR = 3600;

/**
 * @param {number} loot          resources actually lootable (SpyReport.renta)
 * @param {number} roundTripSeconds
 * @return {number} resources per hour, 0 when the trip is impossible or instantaneous
 */
export function profitPerHour(loot, roundTripSeconds) {
  if (!(loot > 0)) return 0;
  if (!(roundTripSeconds > 0) || !Number.isFinite(roundTripSeconds)) return 0;

  return (loot / roundTripSeconds) * SECONDS_PER_HOUR;
}

/**
 * Picks the origin that reaches the target fastest. A player farms from whichever planet is
 * closest, so evaluating against the nearest origin is what matches how the fleet is actually sent.
 *
 * @param {{galaxy: number, system: number, position: number}} target
 * @param {Array<{galaxy: number, system: number, position: number}>} origins
 * @param {object} universe
 * @return {{origin: object, distance: number}|null} null when there is no origin to fly from
 */
export function nearestOrigin(target, origins, universe = {}) {
  let best = null;

  (origins || []).forEach((origin) => {
    if (!origin) return;
    const dist = distance(origin, target, universe);
    if (best === null || dist < best.distance) best = { origin, distance: dist };
  });

  return best;
}

/**
 * Full evaluation of one target.
 *
 * @param {object} params
 * @param {{galaxy: number, system: number, position: number}} params.target
 * @param {Array<object>} params.origins        the player's own planets/moons
 * @param {number} params.loot                  lootable resources
 * @param {number} params.shipSpeed             slowest cargo in the intended fleet
 * @param {number} [params.speedPercent]
 * @param {number} [params.fleetSpeedFactor]
 * @param {object} [params.universe]
 * @return {{distance: number, durationSeconds: number, profitPerHour: number, origin: object|null}}
 */
export function evaluateTarget({
  target,
  origins,
  loot,
  shipSpeed,
  speedPercent = 1,
  fleetSpeedFactor = 1,
  universe = {},
}) {
  const nearest = nearestOrigin(target, origins, universe);

  if (!nearest) {
    return { distance: Infinity, durationSeconds: Infinity, profitPerHour: 0, origin: null };
  }

  const durationSeconds = roundTripDuration({
    distance: nearest.distance,
    shipSpeed,
    speedPercent,
    fleetSpeedFactor,
  });

  return {
    origin: nearest.origin,
    distance: nearest.distance,
    durationSeconds,
    profitPerHour: profitPerHour(loot, durationSeconds),
  };
}

/**
 * Sorts a list of already-evaluated reports, best first. Targets that cannot be reached
 * (no origin, no ship speed) sort last rather than disappearing.
 */
export function byProfitPerHour(a, b) {
  return (b?.profitPerHour ?? 0) - (a?.profitPerHour ?? 0);
}
