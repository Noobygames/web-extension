/**
 * Flight distance and duration between two coordinates.
 *
 * These are OGame's own formulas. They are kept in one place, isolated from any DOM, so the
 * numbers can be checked against the game (and by a ToolDev) without reading through UI code:
 *
 *   different galaxy    -> 20000 * galaxyDelta
 *   different system    ->  2700 + 95 * systemDelta
 *   different position  ->  1000 +  5 * positionDelta
 *   same position       ->     5          (planet <-> moon or debris field)
 *
 *   duration = (10 + (35000 / speedSlider) * sqrt(distance * 10 / shipSpeed)) / fleetSpeedFactor
 *              with speedSlider on the game's own 10..100 scale
 *
 * Nothing here talks to the network or the DOM: every input comes from data the page already
 * carries (universe settings from serverData.xml, ship speeds from fleetDispatcher.fleetHelper).
 */

/** Wrapping distance on a donut axis: going "the other way round" can be shorter. */
function axisDelta(a, b, size, isDonut) {
  const direct = Math.abs(a - b);
  if (!isDonut || !size) return direct;

  return Math.min(direct, size - direct);
}

/**
 * @param {{galaxy: number, system: number, position: number}} origin
 * @param {{galaxy: number, system: number, position: number}} target
 * @param {{galaxies?: number, systems?: number, donutGalaxy?: boolean, donutSystem?: boolean}} universe
 * @return {number} distance in OGame's own unit
 */
export function distance(origin, target, universe = {}) {
  const galaxyDelta = axisDelta(origin.galaxy, target.galaxy, universe.galaxies, universe.donutGalaxy);
  if (galaxyDelta !== 0) return 20000 * galaxyDelta;

  const systemDelta = axisDelta(origin.system, target.system, universe.systems, universe.donutSystem);
  if (systemDelta !== 0) return 2700 + 95 * systemDelta;

  const positionDelta = Math.abs(origin.position - target.position);
  if (positionDelta !== 0) return 1000 + 5 * positionDelta;

  // Same slot: planet <-> moon, or planet <-> its own debris field
  return 5;
}

/**
 * One-way flight time in seconds.
 *
 * @param {object} params
 * @param {number} params.distance         from distance()
 * @param {number} params.shipSpeed        speed of the SLOWEST ship in the fleet, drive tech included
 * @param {number} [params.speedPercent]   fleet speed slider, 0..1 (1 = 100%)
 * @param {number} [params.fleetSpeedFactor] universe fleet speed (json.speedFleetWar and friends)
 * @return {number} seconds, or Infinity when the fleet cannot move
 */
export function flightDuration({ distance: dist, shipSpeed, speedPercent = 1, fleetSpeedFactor = 1 }) {
  if (!(shipSpeed > 0) || !(speedPercent > 0) || !(fleetSpeedFactor > 0)) return Infinity;

  // speedPercent arrives as a fraction; the formula wants the slider as 10..100.
  return (10 + (35000 / (speedPercent * 100)) * Math.sqrt((dist * 10) / shipSpeed)) / fleetSpeedFactor;
}

/**
 * Round trip: out and back. Holding time is not included - a farming run does not hold.
 * @return {number} seconds
 */
export function roundTripDuration(params) {
  return flightDuration(params) * 2;
}

/**
 * Compact duration for a tooltip: "45s", "12m 30s", "2h 05m".
 * Anything unreachable renders as an em dash rather than "NaNm".
 */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";

  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(rest).padStart(2, "0")}s`;

  return `${rest}s`;
}
