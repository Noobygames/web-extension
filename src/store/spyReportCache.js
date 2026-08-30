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
 * @param {import("../ctxpage/messages/analyzer/Object/SpyReport.js").SpyReport} report
 */
function recordSpyReport(report) {
  const cache = OGBIData.spyReportCache || {};
  const key = cacheKey(report.coords, report.planetTargetType);
  const timestamp = report.cleanDate.getTime();

  // Never let an older report (e.g. scrolling through inbox history) overwrite a
  // more recent scan already cached for the same spot.
  if (cache[key] && cache[key].timestamp >= timestamp) return;

  cache[key] = {
    playerName: report.name,
    status: report.status,
    timestamp,
    activity: report.activity,
    metal: report.metal,
    crystal: report.crystal,
    deut: report.deut,
    total: report.total,
    fleet: report.fleet,
    defense: report.defense,
  };

  OGBIData.spyReportCache = cache;
}

function getSpyReport(coords, planetTargetType) {
  return (OGBIData.spyReportCache || {})[cacheKey(coords, planetTargetType)] ?? null;
}

export { recordSpyReport, getSpyReport };
