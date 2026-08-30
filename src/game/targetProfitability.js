/**
 * How much a spied target is worth per hour, from data the page already holds.
 *
 * Split out of `SpyMessagesAnalyzer.js` so the spy-table "Profit/h" column and the
 * galaxy-view raid list (`ctxpage/galaxy/raidList.js`) share one formula instead of
 * two copies that can quietly drift apart - the same duplication pattern that caused
 * the cargo-capacity bug fixed earlier in `ctxpage/fleetdispatch/shipData.js`.
 *
 * Pure computation over `OGBIData`. Nothing here fetches or dispatches anything.
 */
import OGBIData from "../store/OGBIData.js";
import { evaluateTarget } from "./farmEvaluator.js";

/**
 * @param {string} raw "g:s:p", optionally bracketed (`[g:s:p]`)
 * @returns {{galaxy: number, system: number, position: number} | null}
 */
export function parseCoords(raw) {
  const parts = String(raw || "")
    .replace(/[[\]]/g, "")
    .split(":");
  if (parts.length !== 3) return null;

  const [galaxy, system, position] = parts.map(Number);
  if ([galaxy, system, position].some((n) => !Number.isFinite(n))) return null;

  return { galaxy, system, position };
}

/**
 * Own planets as flight origins, plus the universe geometry and the currently
 * configured farm ship the distance/fuel formula needs.
 *
 * @returns {{origins: Array<object>, shipSpeed: number, fleetSpeedFactor: number,
 *   cargoCapacity: number, fuelConsumption: number, universe: object}}
 */
export function flightContext() {
  const origins = [];
  (OGBIData.empire || []).forEach((planet) => {
    // a moon shares its planet's coordinates, so it adds no separate origin
    const parsed = parseCoords(planet.coordinates);
    if (parsed) origins.push(parsed);
  });

  const json = OGBIData.json;
  const settings = json.universeSettingsTooltip || {};

  // The cargo configured for the spy table decides the flight time, so the estimate
  // matches the fleet the player would actually send rather than some notional ship.
  const chosen = (json.ships || {})[OGBIData.options.spyFret];

  return {
    origins,
    shipSpeed: Number(chosen?.speed) || 0,
    fleetSpeedFactor: Number(json.speedFleetWar) || 1,
    cargoCapacity: Number(chosen?.cargoCapacity) || 0,
    fuelConsumption: Number(chosen?.fuelConsumption) || 0,
    universe: {
      galaxies: settings.galaxies,
      systems: settings.systems,
      donutGalaxy: settings.donutGalaxy,
      donutSystem: settings.donutSystem,
    },
  };
}

/**
 * Full flight evaluation for one target.
 *
 * @param {string} coords "g:s:p"
 * @param {number} loot lootable resources
 * @param {ReturnType<typeof flightContext>} [context] pass a context built once per
 *   table/list build to avoid recomputing it per row.
 */
export function estimateTarget(coords, loot, context = flightContext()) {
  const target = parseCoords(coords);
  if (!target) return { profitPerHour: 0, durationSeconds: Infinity, origin: null, distance: Infinity };

  return evaluateTarget({
    target,
    origins: context.origins,
    loot,
    shipSpeed: context.shipSpeed,
    fleetSpeedFactor: context.fleetSpeedFactor,
    universe: context.universe,
    cargoCapacity: context.cargoCapacity,
    fuelConsumption: context.fuelConsumption,
  });
}
