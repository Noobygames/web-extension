/**
 * Caching OGame's own ship table and researched-technology list off the fleet
 * dispatcher.
 *
 * This used to sit inline at the top of `OGBeyondInfinity.start()` and read
 * `fleetDispatcher.fleetHelper.shipsData` at that one fixed moment. It was first an
 * unguarded chain, which threw out of `start()` and cancelled every later boot step;
 * the guard that replaced it stopped the crash but turned the problem into a warning
 * on every fleet-dispatch page load - "shipsData missing - keeping cached ship data" -
 * because the moment is wrong, not the property.
 *
 * What the code says about it: `fleetDispatcher` itself is there - `initFleetDispatcher`
 * reads `fleetDispatcher.shipsOnPlanet` a few steps later and works - and every other
 * `fleetHelper` read in this repo happens inside a click handler or a fleet-sent
 * callback, long after boot. So the one read that runs at boot is also the only one
 * that fails, which points at the moment rather than at the property.
 *
 * That was inferred from the code, not watched on a live page, so the timeout branch
 * below names which link of the chain was actually missing. If a game update ever
 * moves or renames the property, waiting will not help and the log will say so
 * instead of repeating the same ambiguous line.
 *
 * Either way there is no fixed point in `start()` that is safe: the table is taken
 * when it appears rather than at a moment picked in advance.
 *
 * On a page that already has it - the common case once the game is warm - the fast
 * path below stores it synchronously and nothing waits.
 *
 * Compliance note (AGENTS.md 4): this reads data the game already put on the page the
 * player opened. No request, no `cp`, no activity signal, and the poll below watches a
 * local object rather than the server.
 */
import OGBIData from "../../store/OGBIData.js";
import { getShipsData } from "../../game/shipsData.js";
import { getLogger } from "../../platform/logger.js";
import * as wait from "../../platform/wait.js";

const logger = getLogger("fleetdispatch");

/**
 * OGame's researched-technology pairs, as the dispatcher publishes them.
 *
 * Same lifetime as the ship table, so it is taken in the same pass. Each entry is
 * index-accessible (`tech[0]`/`tech[1]`) but not a real, iterable `Array` - destructuring
 * one (`[id]`) throws "object is not iterable" on a live page, so read it by index only.
 *
 * @returns {ArrayLike<ArrayLike<number>> | undefined}
 */
function getApiTechData() {
  if (typeof fleetDispatcher === "undefined") return undefined;
  return fleetDispatcher?.apiTechData;
}

/**
 * Turns the game's ship table into the two shapes the store keeps.
 *
 * Split out from the write so the mapping can be tested without a store: the
 * name-to-id direction is what `messages-analyzer` and the cargo helpers look up, and
 * getting it backwards is invisible until a message fails to parse.
 *
 * **The capacity is taken from the game verbatim. Nothing is multiplied onto it.**
 *
 * `baseCargoCapacity` is not the base, whatever the name says - it is the final
 * per-ship capacity with every bonus already in it. A `shipsData` batch captured off a
 * live account (the fixture in `ctxpage/empireOverview/tables.js`) settles it: small
 * cargo 7250, large cargo 36250, recycler 29000, pathfinder 14500, death star
 * 1 450 000 - every one of them exactly OGame's published base times 1.45, that
 * account's Hyperspace Technology 9. The true bases are in the `baseFuelCapacity`
 * field beside them (5000 for a small cargo, 25000 for a large one).
 *
 * This used to apply the Hyperspace and Miner bonuses on top, which counted them
 * twice: at Hyperspace 11 a large cargo was stored at 61 787 instead of 39 863, so
 * "how many cargos do I need for 2 000 000" answered 33 where the real answer was 51 -
 * and the player found out from OGame's own red overload bar. `cargoCapacity` is
 * preferred over `baseCargoCapacity` because it is the field the dispatcher's own
 * `getCargoCapacity()` sums; in every batch seen so far the two are identical.
 *
 * Anything the extension has not been taught - lifeform cargo bonuses, class bonuses,
 * whatever a future update adds - therefore lands in the number for free, because the
 * number is the game's own.
 *
 * @param {Record<string, {name: string, cargoCapacity?: number, baseCargoCapacity: number,
 *   speed: number, fuelConsumption: number}>} shipsData
 * @returns {{shipNames: Record<string, string>, ships: Record<string, object>}}
 */
export function mapShipsData(shipsData) {
  const shipNames = {};
  const ships = {};

  for (const id in shipsData) {
    shipNames[shipsData[id].name] = id;

    const capacity = Number(shipsData[id].cargoCapacity ?? shipsData[id].baseCargoCapacity);

    ships[id] = {
      name: shipsData[id].name,
      cargoCapacity: Number.isFinite(capacity) ? Math.floor(capacity) : 0,
      speed: shipsData[id].speed,
      fuelConsumption: shipsData[id].fuelConsumption,
    };
  }

  return { shipNames, ships };
}

/**
 * Writes both tables with a single store write.
 *
 * `shipNames` has no accessor of its own, so it is set on the batch and the `ships`
 * setter's write-through persists the pair - the rule from Phase 4 of refactoring.md.
 * The technology list joins the same batch when the dispatcher carries one.
 *
 * The technology levels still come out of `apiTechData` - the dispatcher hands the
 * ship table and the tech list over together, so this batch carries the freshest
 * levels there are. They no longer touch the cargo capacity, which the game reports
 * bonus-included (see `mapShipsData`); they are stored because the rest of the
 * extension reads them.
 *
 * @param {object} shipsData the game's ship table
 * @param {ArrayLike<ArrayLike<number>>} [apiTechData] the game's researched-technology pairs (index-access only, see `getApiTechData`)
 */
function storeShipData(shipsData, apiTechData) {
  const { shipNames, ships } = mapShipsData(shipsData);

  OGBIData.json.shipNames = shipNames;
  apiTechData?.forEach((tech) => {
    OGBIData.json.technology[tech[0]] = tech[1];
  });
  OGBIData.ships = ships;
}

/**
 * Whether the dispatcher's table is usable, as opposed to merely present.
 *
 * An empty object is truthy, and the game builds `fleetHelper` before it has filled
 * the table in. Treating `{}` as "found" would store zero ships over a perfectly good
 * cached copy - the one outcome this whole module exists to avoid, arrived at through
 * the success path instead of the failure path.
 *
 * @returns {object | undefined} the table, or undefined when there is nothing in it
 */
function readyShipsData() {
  const shipsData = getShipsData();
  if (!shipsData || Object.keys(shipsData).length === 0) return undefined;
  return shipsData;
}

/**
 * Which link of `fleetDispatcher.fleetHelper.shipsData` was missing.
 *
 * @returns {string} a short phrase for the warning below
 */
function describeDispatcher() {
  if (typeof fleetDispatcher === "undefined") return "no fleetDispatcher on the page";
  if (!fleetDispatcher.fleetHelper) return "fleetDispatcher has no fleetHelper";
  if (!fleetDispatcher.fleetHelper.shipsData) return "fleetHelper has no shipsData";
  return "shipsData is empty";
}

/**
 * Caches the ship table, waiting for the dispatcher to publish it if it has not yet.
 *
 * Fire-and-forget from `start()`: nothing on the boot path needs the table in the same
 * task, and the previous visit's copy stays readable until the new one lands. If the
 * table never appears the cached copy is kept rather than wiped - a fleet-dispatch page
 * with no ship data at all would leave the cargo helpers with nothing to divide by.
 *
 * @param {{waitFor?: typeof wait.waitFor}} [deps] `waitFor` is a seam for tests (the
 *   poll is `util/wait.js` in production).
 * @returns {Promise<boolean>} whether the table was found and stored
 */
/**
 * `storeShipData()`, but a throw ends up as a logged warning instead of an uncaught
 * rejection out of `cacheShipData()`. Callers (`ogCore.js`) fire `cacheShipData()`
 * without awaiting or catching it, on purpose - nothing on the boot path needs the
 * table in the same task - so an unguarded throw here had nowhere to land except the
 * console as "Uncaught (in promise)", once per page load, for as long as whatever
 * shape triggered it kept recurring. Same fallback as the timeout branch below: keep
 * the previous visit's cached tables rather than lose them to a shape this file has
 * not seen yet.
 *
 * @returns {boolean} whether the table was actually stored
 */
function tryStoreShipData(shipsData, apiTechData) {
  try {
    storeShipData(shipsData, apiTechData);
    return true;
  } catch (error) {
    logger.warn("storeShipData failed on an unexpected shape - keeping cached ship data", error);
    return false;
  }
}

export async function cacheShipData({ waitFor = wait.waitFor } = {}) {
  const immediate = readyShipsData();
  if (immediate) {
    return tryStoreShipData(immediate, getApiTechData());
  }

  try {
    await waitFor(() => readyShipsData() !== undefined);
  } catch {
    // waitFor rejects on its own timeout. That is not an error worth a stack trace:
    // it means this page never built a dispatcher far enough, and the cached tables
    // from the last visit are still the best answer available.
    //
    // The message names which link of the chain was missing when the wait gave up.
    // The reason is not pedantry: "the table arrives late" and "the property moved in
    // a game update" produce the same silence, and only the first is fixed by waiting.
    // Whoever reads this line next should not have to guess which one they have.
    logger.warn(`ship data unavailable after waiting (${describeDispatcher()}) - keeping cached ship data`);
    return false;
  }

  return tryStoreShipData(readyShipsData(), getApiTechData());
}

export default cacheShipData;
