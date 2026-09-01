import OGBIData from "./OGBIData.js";

/**
 * The player's own shortlist of farms worth keeping an eye on, kept across sessions.
 *
 * Building and organizing a target list is explicitly allowed (AGENTS.md 1.5.1, "Let me
 * build and organize custom target lists (view only)"); what is forbidden is hanging a
 * probe or fleet action off one. Pinning here writes a row to local storage and nothing
 * else - no request, no dispatch. The raid list renders a pinned row exactly like a
 * radar row: the coordinate links into galaxy view, where the game's own probe icon is.
 */

/** @param {string} coords */
function normalize(coords) {
  return String(coords || "");
}

/** @return {Array<{coords: string, name: string, status: string, moon: boolean, pinnedAt: number}>} */
function getPins() {
  return OGBIData.raidPins || [];
}

/** @param {string} coords */
function isPinned(coords) {
  const key = normalize(coords);
  return getPins().some((pin) => pin.coords === key);
}

/**
 * Idempotent: pinning an already-pinned coordinate refreshes the stored name/status
 * rather than adding a second row.
 *
 * @param {{coords: string, name?: string, status?: string, moon?: boolean}} target
 */
function pinTarget(target) {
  const coords = normalize(target?.coords);
  if (!coords) return getPins();

  const pin = {
    coords,
    name: target.name || "",
    status: target.status || "",
    moon: Boolean(target.moon),
    pinnedAt: Date.now(),
  };

  // Reassign rather than push: OGBIData writes through its setter, so mutating the
  // array it returned would never reach storage (see CLAUDE.md, "Two separate stores").
  OGBIData.raidPins = [...getPins().filter((existing) => existing.coords !== coords), pin];

  return OGBIData.raidPins;
}

/** @param {string} coords */
function unpinTarget(coords) {
  const key = normalize(coords);
  OGBIData.raidPins = getPins().filter((pin) => pin.coords !== key);

  return OGBIData.raidPins;
}

/**
 * @param {{coords: string, name?: string, status?: string, moon?: boolean}} target
 * @return {boolean} whether the target is pinned afterwards
 */
function togglePin(target) {
  if (isPinned(target?.coords)) {
    unpinTarget(target?.coords);
    return false;
  }

  pinTarget(target);
  return true;
}

export { getPins, isPinned, pinTarget, unpinTarget, togglePin };
