/**
 * Feature B - save-flight / auto-harvest planning.
 *
 * Answers, per planet: how much is worth moving to the bank, how many cargos that needs, whether
 * the planet actually has them, and how much capacity would be wasted by flying anyway. The
 * "capacity waste" half is the point - sending 40 large cargos to move 12k resources is the
 * mistake this is meant to make visible before the fleet leaves.
 *
 * Pure computation. It plans; it does not dispatch. Each planet is planned on its own so the
 * player still sends one fleet per click - there is deliberately no "harvest everything" result
 * that could be wired to a single button.
 */

/** Cargo ships, slowest-but-roomiest first: large cargo, pathfinder, small cargo. */
export const CARGO_SHIP_IDS = Object.freeze([203, 219, 202]);

const RESOURCES = Object.freeze(["metal", "crystal", "deuterium"]);

function toAmount(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * Resources actually worth moving: what is on the planet, minus what the player wants left behind.
 *
 * @param {{metal: number, crystal: number, deuterium: number}} available
 * @param {{metal?: number, crystal?: number, deuterium?: number}} [keep]
 * @return {{metal: number, crystal: number, deuterium: number, total: number}}
 */
export function transportableResources(available, keep = {}) {
  const result = { metal: 0, crystal: 0, deuterium: 0, total: 0 };

  RESOURCES.forEach((resource) => {
    const amount = Math.max(0, toAmount(available?.[resource]) - toAmount(keep?.[resource]));
    result[resource] = amount;
    result.total += amount;
  });

  return result;
}

/**
 * Fills the requested capacity from the ships the planet actually has, roomiest type first.
 *
 * @param {number} requiredCapacity
 * @param {Object<number, number>} availableShips  ship id -> count on this planet
 * @param {Object<number, number>} capacities      ship id -> capacity of ONE ship
 * @param {number[]} [shipOrder]
 * @return {{ships: Object<number, number>, capacity: number, shortfall: number}}
 */
export function selectCargos(requiredCapacity, availableShips = {}, capacities = {}, shipOrder = CARGO_SHIP_IDS) {
  const ships = {};
  let capacity = 0;

  shipOrder.forEach((id) => {
    if (capacity >= requiredCapacity) return;

    const perShip = toAmount(capacities[id]);
    const owned = toAmount(availableShips[id]);
    if (perShip <= 0 || owned <= 0) return;

    const stillNeeded = requiredCapacity - capacity;
    const wanted = Math.min(owned, Math.ceil(stillNeeded / perShip));

    ships[id] = wanted;
    capacity += wanted * perShip;
  });

  return { ships, capacity, shortfall: Math.max(0, requiredCapacity - capacity) };
}

/**
 * Plans one planet's harvest.
 *
 * @param {object} params
 * @param {{metal: number, crystal: number, deuterium: number}} params.resources
 * @param {Object<number, number>} params.availableShips
 * @param {Object<number, number>} params.capacities
 * @param {object} [params.keep]
 * @param {number} [params.minimumTotal]  do not bother flying for less than this
 * @return {{
 *   send: object, ships: object, shipCount: number, capacity: number,
 *   usedCapacity: number, wastedCapacity: number, shortfall: number,
 *   feasible: boolean, worthwhile: boolean
 * }}
 */
export function planPlanetHarvest({ resources, availableShips, capacities, keep, minimumTotal = 0 }) {
  const send = transportableResources(resources, keep);
  const { ships, capacity, shortfall } = selectCargos(send.total, availableShips, capacities);

  const shipCount = Object.values(ships).reduce((sum, count) => sum + count, 0);
  // Only what actually flies counts as used; the rest of the hold is the waste to warn about.
  const usedCapacity = Math.min(send.total, capacity);

  return {
    send,
    ships,
    shipCount,
    capacity,
    usedCapacity,
    wastedCapacity: Math.max(0, capacity - usedCapacity),
    shortfall,
    feasible: send.total > 0 && shortfall === 0,
    worthwhile: send.total >= minimumTotal && send.total > 0,
  };
}

/**
 * Plans every planet except the bank itself, and reports the fleet-slot cost of doing so.
 *
 * The result is a list of independent per-planet plans. It is deliberately NOT a single
 * dispatchable action: the player sends one fleet per planet, one click each.
 *
 * @param {object} params
 * @param {Array<object>} params.planets  each: {id, name, coordinates, resources, ships}
 * @param {string} params.bankCoordinates
 * @param {Object<number, number>} params.capacities
 * @param {object} [params.keep]
 * @param {number} [params.minimumTotal]
 * @return {{plans: Array<object>, totals: object}}
 */
export function planHarvest({ planets, bankCoordinates, capacities, keep, minimumTotal = 0 }) {
  const plans = [];

  (planets || []).forEach((planet) => {
    if (!planet) return;
    if (planet.coordinates === bankCoordinates) return; // the bank does not ship to itself

    const plan = planPlanetHarvest({
      resources: planet.resources,
      availableShips: planet.ships,
      capacities,
      keep,
      minimumTotal,
    });

    if (!plan.worthwhile) return;

    plans.push({ ...plan, planet });
  });

  const totals = plans.reduce(
    (acc, plan) => ({
      resources: acc.resources + plan.send.total,
      ships: acc.ships + plan.shipCount,
      wastedCapacity: acc.wastedCapacity + plan.wastedCapacity,
      shortfall: acc.shortfall + plan.shortfall,
      flights: acc.flights + 1,
    }),
    { resources: 0, ships: 0, wastedCapacity: 0, shortfall: 0, flights: 0 }
  );

  return { plans, totals };
}
