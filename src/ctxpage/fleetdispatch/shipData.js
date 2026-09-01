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
import ship from "../../game/ship.js";
import PlayerClass from "../../game/playerClass.js";

const logger = getLogger("fleetdispatch");

/** Trading ships eligible for the Miner class cargo bonus. */
const TRADING_SHIPS = [ship.SmallCargoShip, ship.LargeCargoShip];

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
 * `baseCargoCapacity` is exactly that - base, before either bonus OGame applies on
 * top of it. Storing it unmodified as `cargoCapacity` (as this used to) is what made
 * every cargo suggestion in the extension (needed-cargo-ships counts, expedition cargo
 * fill, the empire-overview transport totals, farm-target ship recommendations) read
 * low the moment a player had any Hyperspace Technology or was Miner class - both are
 * common, so the wrong number was the common case, not an edge case.
 *
 * The two bonuses do not share a scale, confirmed against a live serverData.xml:
 * `cargoHyperspaceTechMultiplier` is a percentage-per-level integer (`5`, meaning 5%
 * per level - divide by 100), while `minerBonusIncreasedCargoCapacityForTradingShips`
 * is already a fraction (`0.25`, meaning +25% - used as-is). Treating both the same
 * way silently produces a second wrong number instead of fixing the first.
 *
 * @param {Record<string, {name: string, baseCargoCapacity: number, speed: number,
 *   fuelConsumption: number}>} shipsData
 * @param {object} [bonus]
 * @param {number} [bonus.hyperspaceTechLevel] player's Hyperspace Technology level (id 114)
 * @param {number} [bonus.cargoHyperspaceTechMultiplier] percent-per-level cargo bonus from server settings
 * @param {number} [bonus.playerClass] `game/playerClass.js` value
 * @param {number} [bonus.minerCargoBonus] Miner class trading-ship cargo bonus, as a fraction
 * @returns {{shipNames: Record<string, string>, ships: Record<string, object>}}
 */
export function mapShipsData(
  shipsData,
  { hyperspaceTechLevel = 0, cargoHyperspaceTechMultiplier = 0, playerClass, minerCargoBonus = 0 } = {}
) {
  const shipNames = {};
  const ships = {};

  for (const id in shipsData) {
    shipNames[shipsData[id].name] = id;

    let cargoCapacity =
      shipsData[id].baseCargoCapacity * (1 + (hyperspaceTechLevel * cargoHyperspaceTechMultiplier) / 100);
    if (playerClass === PlayerClass.MINER && TRADING_SHIPS.includes(Number(id))) {
      cargoCapacity *= 1 + minerCargoBonus;
    }

    ships[id] = {
      name: shipsData[id].name,
      cargoCapacity: Math.floor(cargoCapacity),
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
 * Hyperspace Technology's level is read from this same `apiTechData` batch rather than
 * from the already-stored `OGBIData.json.technology` - the dispatcher hands both the
 * ship table and the tech list over together, so the freshest level is the one sitting
 * right here, not last visit's cached copy. `OGBIData.json.technology` is only the
 * fallback for the (rare) case this particular batch does not carry id 114.
 *
 * @param {object} shipsData the game's ship table
 * @param {ArrayLike<ArrayLike<number>>} [apiTechData] the game's researched-technology pairs (index-access only, see `getApiTechData`)
 * @param {number} [playerClass] `game/playerClass.js` value, for the Miner cargo bonus
 */
function storeShipData(shipsData, apiTechData, playerClass) {
  const hyperspaceTechLevel =
    apiTechData?.find((tech) => Number(tech[0]) === 114)?.[1] ?? OGBIData.json.technology?.[114] ?? 0;
  const cargoHyperspaceTechMultiplier = Number(OGBIData.json.cargoHyperspaceTechMultiplier) || 0;
  const minerCargoBonus = Number(OGBIData.json.trashsimSettings?.minerBonusIncreasedCargoCapacityForTradingShips) || 0;

  const { shipNames, ships } = mapShipsData(shipsData, {
    hyperspaceTechLevel,
    cargoHyperspaceTechMultiplier,
    playerClass,
    minerCargoBonus,
  });

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
 * @param {{waitFor?: typeof wait.waitFor, playerClass?: number}} [deps] `waitFor` is a
 *   seam for tests (the poll is `util/wait.js` in production); `playerClass` is
 *   `game/playerClass.js` value, needed for the Miner cargo bonus.
 * @returns {Promise<boolean>} whether the table was found and stored
 */
export async function cacheShipData({ waitFor = wait.waitFor, playerClass } = {}) {
  const immediate = readyShipsData();
  if (immediate) {
    storeShipData(immediate, getApiTechData(), playerClass);
    return true;
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

  storeShipData(readyShipsData(), getApiTechData(), playerClass);
  return true;
}

export default cacheShipData;
