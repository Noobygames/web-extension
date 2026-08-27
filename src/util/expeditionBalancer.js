/**
 * Feature C - balanced expedition dispatch.
 *
 * A static "send 50 large cargos" preset either overfills the first expedition and leaves the
 * later slots empty, or spreads too thin. Dividing the cargo actually parked on the planet by the
 * slots actually free gives every expedition the same share.
 *
 * Pure arithmetic over numbers the fleetdispatch page already exposes. It computes a ship count
 * to pre-fill one form with; it does not send anything, and it does not know how to.
 */

/**
 * Expedition slots the player can still use right now.
 *
 * Both limits apply: expedition slots (Astrophysics) and total fleet slots (Computer tech).
 * Having three expedition slots free is worthless with no fleet slot to fly them in.
 *
 * @param {object} params
 * @param {number} params.maxExpeditions      slots from Astrophysics
 * @param {number} params.activeExpeditions   expeditions currently in flight
 * @param {number} [params.maxFleets]         total fleet slots
 * @param {number} [params.activeFleets]      fleets currently in flight
 * @return {number} never negative
 */
export function openExpeditionSlots({ maxExpeditions, activeExpeditions, maxFleets, activeFleets }) {
  const expeditionRoom = Math.max(0, toCount(maxExpeditions) - toCount(activeExpeditions));

  if (maxFleets === undefined || maxFleets === null) return expeditionRoom;

  const fleetRoom = Math.max(0, toCount(maxFleets) - toCount(activeFleets));

  return Math.min(expeditionRoom, fleetRoom);
}

function toCount(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * Splits the available ships evenly across the open slots.
 *
 * Floor, not round: rounding up would ask for ships the planet does not have, and the last
 * expedition would silently fall short. The remainder simply stays home.
 *
 * @param {number} availableShips
 * @param {number} openSlots
 * @param {object} [options]
 * @param {number} [options.minimumPerFleet]  do not propose a fleet smaller than this
 * @param {number} [options.maximumPerFleet]  cap, e.g. the points needed for the top expedition tier
 * @return {{perFleet: number, fleets: number, used: number, remainder: number}}
 */
export function balanceShips(availableShips, openSlots, options = {}) {
  const ships = toCount(availableShips);
  const slots = toCount(openSlots);

  if (ships === 0 || slots === 0) return { perFleet: 0, fleets: 0, used: 0, remainder: ships };

  let perFleet = Math.floor(ships / slots);

  const maximum = toCount(options.maximumPerFleet);
  if (maximum > 0) perFleet = Math.min(perFleet, maximum);

  const minimum = toCount(options.minimumPerFleet);
  if (minimum > 0 && perFleet < minimum) {
    // Too thin to be worth sending everywhere: fill fewer expeditions properly instead of
    // sending several fleets that all underperform.
    const affordable = Math.floor(ships / minimum);

    if (affordable === 0) return { perFleet: 0, fleets: 0, used: 0, remainder: ships };

    const fleets = Math.min(slots, affordable);

    return { perFleet: minimum, fleets, used: minimum * fleets, remainder: ships - minimum * fleets };
  }

  return { perFleet, fleets: slots, used: perFleet * slots, remainder: ships - perFleet * slots };
}

/**
 * Full plan for the current planet.
 *
 * @param {object} params - openExpeditionSlots params plus:
 * @param {number} params.availableShips
 * @param {number} [params.minimumPerFleet]
 * @param {number} [params.maximumPerFleet]
 * @return {{openSlots: number, perFleet: number, fleets: number, used: number, remainder: number}}
 */
export function planExpeditionFleets({
  maxExpeditions,
  activeExpeditions,
  maxFleets,
  activeFleets,
  availableShips,
  minimumPerFleet,
  maximumPerFleet,
}) {
  const openSlots = openExpeditionSlots({ maxExpeditions, activeExpeditions, maxFleets, activeFleets });
  const balance = balanceShips(availableShips, openSlots, { minimumPerFleet, maximumPerFleet });

  return { openSlots, ...balance };
}
