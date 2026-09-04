/**
 * OGame's economy score.
 *
 * One point per 1000 units of metal, crystal and deuterium put into something - the
 * same rule for a building level, a research level, a ship and a defence. Energy,
 * population and food buy no points, so only the first three entries are read.
 */

/** Resources that have to be spent for one point. */
export const RESOURCES_PER_POINT = 1000;

/**
 * @param {Array<number|string>} cost `[metal, crystal, deuterium]`, longer arrays welcome
 * @returns {number} the score it is worth, fractions included
 */
export function pointsFor(cost) {
  if (!Array.isArray(cost)) return 0;

  let spent = 0;

  for (const index of [0, 1, 2]) {
    const amount = Number(cost[index]);
    if (Number.isFinite(amount)) spent += amount;
  }

  return spent / RESOURCES_PER_POINT;
}

export default pointsFor;
