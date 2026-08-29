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
import { distance, roundTripDuration, roundTripFuel } from "./fleetFlight.js";

const SECONDS_PER_HOUR = 3600;

/**
 * @param {number} netLoot        resources actually lootable, after fuel cost
 * @param {number} roundTripSeconds
 * @return {number} resources per hour, 0 when the trip is impossible, instantaneous, or costs
 *                   more fuel than it brings back
 */
export function profitPerHour(netLoot, roundTripSeconds) {
  if (!(netLoot > 0)) return 0;
  if (!(roundTripSeconds > 0) || !Number.isFinite(roundTripSeconds)) return 0;

  return (netLoot / roundTripSeconds) * SECONDS_PER_HOUR;
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
 * @param {number} [params.cargoCapacity]        the chosen ship's cargo hold - lets the fleet
 *                                                size, and therefore its fuel bill, scale with
 *                                                how much there actually is to carry
 * @param {number} [params.fuelConsumption]       the chosen ship's fuelConsumption stat
 * @return {{distance: number, durationSeconds: number, profitPerHour: number, origin: object|null,
 *           shipCount: number, fuelCost: number, netLoot: number}}
 */
export function evaluateTarget({
  target,
  origins,
  loot,
  shipSpeed,
  speedPercent = 1,
  fleetSpeedFactor = 1,
  universe = {},
  cargoCapacity = 0,
  fuelConsumption = 0,
}) {
  const nearest = nearestOrigin(target, origins, universe);

  if (!nearest) {
    return {
      distance: Infinity,
      durationSeconds: Infinity,
      profitPerHour: 0,
      origin: null,
      shipCount: 0,
      fuelCost: 0,
      netLoot: 0,
    };
  }

  const durationSeconds = roundTripDuration({
    distance: nearest.distance,
    shipSpeed,
    speedPercent,
    fleetSpeedFactor,
  });

  // At least one ship even for a trivial loot amount - an empty fleet cannot fly out to
  // find that out. Loot that does not need the full hold still burns fuel for however
  // many ships are actually sent.
  //
  // The 107/100 margin matches calcNeededShips({moreFret: true, ...}), the formula that
  // sizes the fleet shown to the player (SpyReport.js's pt/gt/pf/pb). Without it this
  // function under-counts by one ship against what the recommendation actually sends,
  // so the fuel bill (and therefore profit/h) was computed for a smaller fleet than the
  // one the player is told to dispatch.
  const shipCount = cargoCapacity > 0 ? Math.max(1, Math.ceil(((loot / cargoCapacity) * 107) / 100)) : 0;
  const fuelCost = roundTripFuel({
    shipCount,
    baseConsumption: fuelConsumption,
    distance: nearest.distance,
    speedPercent,
  });
  const netLoot = Math.max(0, loot - fuelCost);

  return {
    origin: nearest.origin,
    distance: nearest.distance,
    durationSeconds,
    shipCount,
    fuelCost,
    netLoot,
    profitPerHour: profitPerHour(netLoot, durationSeconds),
  };
}

/**
 * Sorts a list of already-evaluated reports, best first. Targets that cannot be reached
 * (no origin, no ship speed) sort last rather than disappearing.
 */
export function byProfitPerHour(a, b) {
  return (b?.profitPerHour ?? 0) - (a?.profitPerHour ?? 0);
}
