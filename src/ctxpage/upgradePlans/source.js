import OGBIData from "../../store/OGBIData.js";
import { getOption } from "../conf-options.js";
import planetType from "../../game/planetType.js";

/**
 * Where a transport for an upgrade plan leaves from - the player's RSS moon.
 *
 * Defaults to the bank the collect feature already uses (`options.collect.target`),
 * because on most accounts that is the same place; `useCollectTarget: false` switches
 * to the coordinates stored under `options.upgradePlanSource`.
 */

/**
 * @returns {{galaxy: number, system: number, position: number, type: number}|null}
 */
function configuredCoordinates() {
  const source = getOption("upgradePlanSource") || {};
  const target = source.useCollectTarget ? getOption("collect")?.target : source;

  if (!target || !target.galaxy || !target.system || !target.position) return null;

  return {
    galaxy: Number(target.galaxy),
    system: Number(target.system),
    position: Number(target.position),
    type: Number(target.type) || planetType.planet,
  };
}

/**
 * The source as the fleet link needs it: an id for `cp` plus its coordinates.
 *
 * Returns null when nothing is configured or when the configured coordinates are not
 * one of the player's own planets any more - in which case the fleet link simply
 * carries no `cp` and the transport leaves from wherever the player is standing.
 *
 * @returns {{id: number, coords: string, isMoon: boolean}|null}
 */
export function supplySource() {
  const target = configuredCoordinates();
  if (!target) return null;

  const coords = `${target.galaxy}:${target.system}:${target.position}`;
  const isMoon = target.type === planetType.moon;

  for (const planet of OGBIData.empire || []) {
    if (String(planet.coordinates || "").replace(/[[\]]/g, "") !== coords) continue;

    const id = isMoon ? planet.moon?.id : planet.id;

    return id ? { id, coords, isMoon } : null;
  }

  return null;
}
