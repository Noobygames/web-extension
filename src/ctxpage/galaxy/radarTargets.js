/**
 * The raid list's "radar" source: inactive players in the galaxies the player owns a
 * planet in, taken from the public-API snapshot the content script already caches
 * (`ctxcontent/callbacks/inactive-targets.js`).
 *
 * These targets have never been spied, so there is no loot figure and deliberately no
 * estimated profit/hour - only distance and flight time, which is what actually decides
 * whether a farm is worth looking at. Ranking them by an invented loot number would be a
 * guess dressed up as data; `spyReportCache.js` says the same about building levels.
 *
 * Display only: a row's coordinate is a link into galaxy view, where the player clicks
 * the game's own probe icon. No probe or fleet action is attached here (AGENTS.md 1.5.1),
 * and loading costs no request of its own (AGENTS.md 4).
 */
import dataHelper from "../../integrations/dataHelper.js";
import OGBIData from "../../store/OGBIData.js";
import { getLogger } from "../../platform/logger.js";
import { getAllSpyReports } from "../../store/spyReportCache.js";
import { flightContext, estimateTarget, parseCoords } from "../../game/targetProfitability.js";

const logger = getLogger("radarTargets");

/**
 * One bridge call per page load, memoized. The raid list can be opened and closed any
 * number of times; re-asking would add nothing, the content script's snapshot does not
 * change while the page is up.
 */
let pending = null;

/** Galaxies the player has a planet in - the radar looks no further. */
function ownGalaxies() {
  const galaxies = new Set();

  (OGBIData.empire || []).forEach((planet) => {
    const parsed = parseCoords(planet.coordinates);
    if (parsed) galaxies.add(parsed.galaxy);
  });

  return [...galaxies];
}

/** Coordinates that already have a cached report, plus the player's own planets. */
function knownCoords() {
  const known = new Set();

  getAllSpyReports().forEach((entry) => known.add(entry.coords));
  (OGBIData.empire || []).forEach((planet) => known.add(planet.coordinates));

  return known;
}

/**
 * Every radar target, nearest flight first. Unreachable ones (no own planet, no farm
 * ship configured) sort last rather than disappearing - same rule as `byProfitPerHour`.
 */
function byFlightTime(a, b) {
  const durationDelta = a.durationSeconds - b.durationSeconds;
  if (Number.isFinite(durationDelta) && durationDelta !== 0) return durationDelta;

  return a.distance - b.distance;
}

/**
 * @returns {Promise<Array<{target: object, distance: number, durationSeconds: number}>>}
 *   empty when the bridge call fails - the raid list still has to open.
 */
export function loadRadarTargets() {
  if (pending) return pending;

  const galaxies = ownGalaxies();

  pending = dataHelper
    .getInactiveTargets(galaxies)
    .then((targets) => {
      const skip = knownCoords();
      const context = flightContext();

      return (targets || [])
        .filter((target) => !skip.has(target.coords))
        .map((target) => {
          // Loot is unknown, so the profit/h this returns is 0 by construction and is
          // not read; only the flight figures are.
          const { distance, durationSeconds } = estimateTarget(target.coords, 0, context);
          return { target, distance, durationSeconds };
        })
        .sort(byFlightTime);
    })
    .catch((err) => {
      logger.warn("radar targets unavailable", err);
      return [];
    });

  return pending;
}

/** Test seam: drops the memoized call so the next load asks again. */
export function resetRadarTargets() {
  pending = null;
}
