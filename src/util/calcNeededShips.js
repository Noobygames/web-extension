import * as Numbers from "./numbers.js";
import OGBIData from "./OGIData.js";

/**
 * How many cargo ships are needed to move a pile of resources.
 *
 * Called four times per spy report while a message list renders, so it is on a hot path.
 * Two things it must NOT do, both of which it used to:
 *
 *  - re-parse localStorage["ogk-data"]. That blob reaches a few hundred KB on an established
 *    account, and JSON.parse of it costs milliseconds - per call. OGIData already holds the
 *    parsed object in memory, so it is read from there instead.
 *  - read the resource bar when the caller already passed an explicit amount. The three
 *    querySelector calls and their number parsing were discarded in that case, and they made
 *    the function throw on pages that have no resource bar.
 */
export function calcNeededShips(options) {
  options = options || {};

  const json = OGBIData.json || {};

  let resources = options.resources;

  // Only touch the DOM when the caller did not say how much to move.
  if (resources === undefined || resources === null) {
    resources =
      Numbers.fromFormattedNumber(document.querySelector("#resources_metal").textContent) +
      Numbers.fromFormattedNumber(document.querySelector("#resources_crystal").textContent) +
      Numbers.fromFormattedNumber(document.querySelector("#resources_deuterium").textContent);
  }

  const type = options.fret || json.options.fret;
  const fret = json.ships[type].cargoCapacity;

  let total = resources / fret;
  if (options.moreFret) total *= 107 / 100;

  return Math.ceil(total);
}
