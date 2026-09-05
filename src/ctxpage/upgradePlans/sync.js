import OGBIData from "../../store/OGBIData.js";
import { setNeeds } from "../planetbar/needs.js";
import { clearSide, migrateFromNeeds, reconcile, totalsFor } from "../../store/upgradePlans.js";
import { refreshPlanHighlight } from "../planHighlight/index.js";

/**
 * The seam between the upgrade plans and the lock icons in the planet bar.
 *
 * The plans are structured (technology, from level, to level) and pricing them needs
 * the cost tables; the planet bar only ever shows three numbers per side. So the plans
 * live in `OGBIData.upgradePlans` and their priced total is cached in `OGBIData.needs`,
 * which is all the planet bar reads.
 *
 * That split is not taste. `test/bundle.test.js` caps the page entry - the file every
 * OGame page loads - at 512 000 bytes and it is already within a kilobyte of it, while
 * `gameFormulas.js` plus `buildingInfo.js` and `researchInfo.js` come to ~93 KB. This
 * module and everything it imports are chunk-side, reached only from the build pages
 * and from the plan panel, so the entry never pays for them.
 *
 * The practical consequence: the cache is refreshed when a chunk that uses it runs, not
 * on every page load. Building something changes a level, and building something means
 * being on a build page, which loads `technoDetail` - so in practice the icons are
 * refreshed at exactly the moment a plan can have gone out of date.
 */

/** Coordinates without the brackets `OGBIData.empire` stores them with. */
function bareCoords(planet) {
  return String(planet?.coordinates || "").replace(/[[\]]/g, "");
}

/**
 * Recomputes one side's total from its plan and writes it into the planet bar's cache,
 * redrawing that side's icon.
 *
 * @param {string} coords
 * @param {boolean} isMoon
 */
export function syncNeeds(coords, isMoon) {
  setNeeds(coords, isMoon, totalsFor(coords, isMoon));
  // The menu and tile marks come off the same plans and would otherwise stay as they
  // were until the next page load - so planning an upgrade in the panel, or clearing
  // one, would leave the wrong menu entry lit.
  if (!syncingAll) refreshPlanHighlight();
}

/**
 * Set while `syncAllNeeds()` is looping.
 *
 * The loop calls `syncNeeds()` once per planet and once per moon, and the marks it
 * redraws are the same on every pass - so without this the panel opening on a 40-planet
 * account walked the menu and the whole technology grid eighty times for one result.
 */
let syncingAll = false;

/**
 * The same for every planet and moon in the empire.
 *
 * Needed because a plan can go out of date on a planet the player is not standing on -
 * research finishing raises an account-wide level everywhere at once - and because the
 * panel shows all of them side by side.
 */
export function syncAllNeeds() {
  syncingAll = true;

  try {
    for (const planet of OGBIData.empire || []) {
      const coords = bareCoords(planet);
      if (!coords) continue;

      syncNeeds(coords, false);
      if (planet.moon) syncNeeds(coords, true);
    }
  } finally {
    syncingAll = false;
  }

  refreshPlanHighlight();
}

/**
 * What a chunk-side entry point should call once: carry any pre-plan locks over, drop
 * the upgrades that have since been built, and refresh the cache the planet bar reads.
 *
 * Cheap and safe to call repeatedly - the migration runs once for the life of the
 * account and `reconcile()` writes nothing when nothing has changed. Reads local
 * storage only; no request of any kind (AGENTS.md 1.3, 4).
 */
export function refreshPlans() {
  migrateFromNeeds();
  reconcile();
  syncAllNeeds();
}

/**
 * Deletes one side's plan and refreshes the cache behind it. The planet bar's delete
 * buttons reach for this through `loadChunk`, since the plan lives where the cost
 * tables are.
 */
export function clearPlanFor(coords, isMoon) {
  clearSide(coords, isMoon);
  syncNeeds(coords, isMoon);
}
