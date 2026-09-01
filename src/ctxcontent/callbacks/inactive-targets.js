/**
 * Inactive players near the user's own planets, read out of the universe database the
 * content script already holds (`data-helper.js`: `players.xml` + `universe.xml`).
 *
 * No fetch of its own - `DataHelper.update()` is the single page-load hydration
 * (AGENTS.md 4), this only filters what is already cached. The result is display data
 * for the raid list's radar tab; nothing here dispatches a probe or a fleet
 * (AGENTS.md 1.5.1).
 */

/** Inactive for 7 days ("i") or 28 days ("I") - case-sensitive, they are two flags. */
const INACTIVE_FLAGS = ["i", "I"];

/**
 * Not attackable, so not a farm: "v" vacation mode, "b" banned, "a" admin.
 * A player can carry several flags at once ("vi" = inactive AND on vacation).
 */
const UNATTACKABLE_FLAGS = ["v", "b", "a"];

/**
 * @param {string} status the `status` attribute from players.xml, verbatim
 * @return {boolean}
 */
export function isRaidableInactive(status) {
  const flags = String(status ?? "");
  if (UNATTACKABLE_FLAGS.some((flag) => flags.includes(flag))) return false;

  return INACTIVE_FLAGS.some((flag) => flags.includes(flag));
}

/**
 * @param {import("../data-helper.js").DataHelper} dataHelper
 * @param {Array<number|string>} galaxies galaxies the player owns a planet in; empty means all
 * @return {Array<{playerId: number, name: string, status: string, coords: string, moon: boolean}>}
 *   plain primitives only - a Map or a Document would not survive the content/page bridge.
 */
export function buildInactiveTargets(dataHelper, galaxies = []) {
  const wanted = new Set((galaxies || []).map(String));
  const targets = [];

  Object.entries(dataHelper?.players || {}).forEach(([playerId, player]) => {
    if (!player || !isRaidableInactive(player.status)) return;

    (player.planets || []).forEach((planet) => {
      const coords = planet?.coords;
      if (typeof coords !== "string") return;
      // A planet the galaxy scan marked as gone is not a target any more.
      if (planet.deleted) return;
      if (wanted.size > 0 && !wanted.has(coords.split(":")[0])) return;

      targets.push({
        playerId: Number(playerId),
        name: player.name || "",
        status: player.status || "",
        coords,
        moon: Boolean(planet.moon),
      });
    });
  });

  return targets;
}
