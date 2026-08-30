import OGBIData from "./OGBIData.js";

/**
 * Local cache of espionage report snapshots, keyed by coords + planet/moon so a
 * planet and its moon (same coordinates) don't overwrite each other. Fed by every
 * espionage message the player already has in their own inbox (SpyMessagesAnalyzer);
 * nothing here triggers a probe or any network request - it only remembers reports
 * the player already received, for display on hover in galaxy view.
 */
function cacheKey(coords, planetTargetType) {
  return `${coords}#${planetTargetType}`;
}

/**
 * Metal/crystal/deuterium per hour, derived from the two most recent snapshots of the
 * same spot - not from building levels, which the compact espionage row never carries
 * (only the full report page does, and that is a separate fetch this feature does not
 * make). A negative delta means resources left the planet between the two scans (a
 * harvest, an attack, the target spending them) rather than production, so that pair
 * is skipped instead of poisoning the estimate with a nonsense rate.
 *
 * @param {{timestamp: number, metal: number, crystal: number, deut: number, productionPerHour: object|null}} [previous]
 * @param {import("../ctxpage/messages/analyzer/Object/SpyReport.js").SpyReport} report
 * @returns {{metal: number, crystal: number, deut: number} | null}
 */
function estimateProduction(previous, report) {
  if (!previous) return null;

  const hours = (report.cleanDate.getTime() - previous.timestamp) / 3600000;
  if (hours <= 0) return previous.productionPerHour ?? null;

  const deltaMetal = report.metal - previous.metal;
  const deltaCrystal = report.crystal - previous.crystal;
  const deltaDeut = report.deut - previous.deut;
  if (deltaMetal < 0 || deltaCrystal < 0 || deltaDeut < 0) return previous.productionPerHour ?? null;

  return {
    metal: deltaMetal / hours,
    crystal: deltaCrystal / hours,
    deut: deltaDeut / hours,
  };
}

/**
 * @param {import("../ctxpage/messages/analyzer/Object/SpyReport.js").SpyReport} report
 */
function recordSpyReport(report) {
  const cache = OGBIData.spyReportCache || {};
  const key = cacheKey(report.coords, report.planetTargetType);
  const timestamp = report.cleanDate.getTime();
  const previous = cache[key];

  // Never let an older report (e.g. scrolling through inbox history) overwrite a
  // more recent scan already cached for the same spot.
  if (previous && previous.timestamp >= timestamp) return;

  cache[key] = {
    coords: report.coords,
    planetTargetType: report.planetTargetType,
    playerName: report.name,
    status: report.status,
    statusCssClass: report.statusCssClass,
    timestamp,
    activity: report.activity,
    metal: report.metal,
    crystal: report.crystal,
    deut: report.deut,
    total: report.total,
    loot: report.loot,
    fleet: report.fleet,
    defense: report.defense,
    productionPerHour: estimateProduction(previous, report),
  };

  OGBIData.spyReportCache = cache;
}

function getSpyReport(coords, planetTargetType) {
  return (OGBIData.spyReportCache || {})[cacheKey(coords, planetTargetType)] ?? null;
}

/** Every cached report, for the raid list to filter and sort - order not guaranteed. */
function getAllSpyReports() {
  return Object.values(OGBIData.spyReportCache || {});
}

/**
 * Where a cached report's resources probably are now, extrapolated from
 * `productionPerHour` - not from the target's storage levels, which the compact
 * espionage row never carries, so there is no honest cap to apply. Returns null when
 * there is no rate to extrapolate from yet (a report seen only once).
 *
 * @param {ReturnType<typeof recordSpyReport>[string]} report a value from the cache
 * @returns {{metal: number, crystal: number, deut: number} | null}
 */
function estimateResourcesNow(report) {
  if (!report.productionPerHour) return null;

  const hoursSince = (Date.now() - report.timestamp) / 3600000;
  if (hoursSince <= 0) return null;

  return {
    metal: Math.max(0, report.metal + report.productionPerHour.metal * hoursSince),
    crystal: Math.max(0, report.crystal + report.productionPerHour.crystal * hoursSince),
    deut: Math.max(0, report.deut + report.productionPerHour.deut * hoursSince),
  };
}

export { recordSpyReport, getSpyReport, getAllSpyReports, estimateResourcesNow };
