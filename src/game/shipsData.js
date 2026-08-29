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

export default getShipsData;
