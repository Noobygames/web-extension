import missionType from "../../game/missionType.js";
import planetType from "../../game/planetType.js";

/**
 * The link that opens OGame's own fleet dispatch page with a delivery set up.
 *
 * Compliance (AGENTS.md 1.1, 1.5): this builds a URL and nothing else. Following it
 * is one page load, prefilling one form - the target, the transport mission and, via
 * `oglMode=2`, the missing resources that `betterFleetDispatcher` reads back out of
 * `getNeedsByCoords()`. No fleet is sent here or anywhere downstream; the send button
 * is OGame's own and stays the player's. One click, one action.
 *
 * `cp` is the planet or moon the fleet leaves from - the RSS moon, for the overview
 * panel. It is a normal planet switch inside a link the player clicked, exactly like
 * the construction icons in the planet bar, and never part of a background request
 * (AGENTS.md 4.2). Left out entirely when no source is configured, in which case the
 * fleet leaves from wherever the player already is.
 *
 * @param {string} coords destination, `"1:234:5"`
 * @param {boolean} isMoon whether the destination is the moon at those coordinates
 * @param {number|string} [sourceId] planet/moon id to dispatch from
 * @returns {string} a relative URL, ready for `window.location.href`
 */
export function transportLink(coords, isMoon, sourceId) {
  const parts = String(coords || "").split(":");

  const params = {
    page: "ingame",
    component: "fleetdispatch",
    galaxy: parts[0],
    system: parts[1],
    position: parts[2],
    type: isMoon ? planetType.moon : planetType.planet,
    // Was a literal 1 - OGame's attack mission - which is not a mission you can fly to
    // your own planet, so the dispatcher silently fell back to its own default.
    mission: missionType.TRANSPORT,
    // The prefill branch betterFleetDispatcher.js already has for lock icons.
    oglMode: 2,
  };

  if (sourceId) params.cp = sourceId;

  return `?${new URLSearchParams(params).toString()}`;
}

export default transportLink;
