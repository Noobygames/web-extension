import OGBIData from "../store/OGBIData.js";

/**
 * OGame's ship table, as the game publishes it on the fleet-dispatch page.
 *
 * The table lives on the dispatcher instance the game builds
 * (`fleetDispatcher.fleetHelper.shipsData`), so it only exists on pages that build a
 * dispatcher, and only once the game's own inline script has run. Reading that chain
 * unguarded is what turned one missing global into a `TypeError` thrown out of
 * `OGBeyondInfinity.start()`, which cancels every remaining boot step - the rebuilt
 * dispatch UI included. Every read goes through here instead.
 *
 * Read-only access to data already on the page the player opened: no request, no
 * activity signal (AGENTS.md 4).
 *
 * @returns {Record<string, any> | undefined} the ship table, or undefined when the
 *   page has none.
 */
export function getShipsData() {
  if (typeof fleetDispatcher === "undefined") return undefined;
  return fleetDispatcher?.fleetHelper?.shipsData;
}

/**
 * One ship's cached cargo capacity, or 0 when the table has never been filled in.
 *
 * The cache (`OGBIData.ships`) is only ever written on a fleet-dispatch page, because
 * that is the only page that builds a dispatcher - see `getShipsData()` above and
 * `ctxpage/fleetdispatch/shipData.js`. `OGBeyondInfinity.init()` seeds it as `{}`, so
 * on every other page it stays `{}` until the player has opened the dispatcher once.
 *
 * The message analyzers ask whether espionage probes carry cargo (a universe setting)
 * and were reading `OGBIData.ships[ship.EspionageProbe].cargoCapacity` straight, which
 * is a `TypeError` on that empty table - and the messages page is one a player can
 * easily reach first, on a fresh install or after a settings reset. The whole spy
 * table then failed to draw.
 *
 * 0 is the right answer to fall back on: it means "no probe cargo", which is both the
 * common universe setting and the layout every analyzer already handles.
 *
 * @param {string|number} shipId
 * @returns {number}
 */
export function cargoCapacityOf(shipId) {
  return Number(OGBIData.ships?.[shipId]?.cargoCapacity) || 0;
}

export default getShipsData;
