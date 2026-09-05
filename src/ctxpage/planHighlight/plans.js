import OGBIData from "../../store/OGBIData.js";

/**
 * Reading the raw upgrade plans, cheaply enough for the page entry.
 *
 * Split from `index.js` for the bundle budget: the drawing side needs `buildPageOf()`
 * and the page list, which cost about 4 KB in the entry, and the entry has none to
 * spare (`test/bundle.test.js`). This half answers "is there anything planned here at
 * all" for ~1 KB, and `ogCore.js` only fetches the chunk when the answer is yes - so a
 * player with no plans pays nothing.
 *
 * Never `store/upgradePlans.js`: that one prices plans and pulls in the ~93 KB of cost
 * tables. The stored shape is plain data and is read directly.
 */

/** Strips the brackets `OGBIData.empire` stores coordinates with. */
function bareCoords(coords) {
  return String(coords || "").replace(/[[\]]/g, "");
}

/**
 * The planet or moon the player is looking at, read off the planet bar.
 *
 * Read here rather than passed in, so `refreshPlanHighlight()` can redraw after a plan
 * changes without the plan panel having to carry a page context around.
 *
 * @returns {{coords: string, isMoon: boolean}|null}
 */
export function currentSide() {
  const active = document.querySelector("#planetList .active") || document.querySelector("#planetList .planetlink");
  const row = active?.parentNode;
  const coords = bareCoords(row?.querySelector(".planet-koords")?.textContent);

  if (!coords) return null;

  return { coords, isMoon: !!row.querySelector(".moonlink.active") };
}

/**
 * The planned upgrades for one side. Entries with nothing left to build are dropped.
 *
 * @param {string} coords
 * @param {boolean} isMoon
 * @returns {{technoId: number, from: number, to: number}[]}
 */
export function plannedEntriesFor(coords, isMoon) {
  const wanted = bareCoords(coords);
  if (!wanted) return [];

  for (const bucket of Object.values(OGBIData.upgradePlans || {})) {
    if (bareCoords(bucket?.coords) !== wanted) continue;

    const side = isMoon ? bucket.moon : bucket.planet;
    if (!Array.isArray(side?.entries)) return [];

    return side.entries.filter((entry) => Number(entry?.to) > Number(entry?.from));
  }

  return [];
}

/** The gate `ogCore.js` uses to decide whether the drawing chunk is worth fetching. */
export function hasPlansOnCurrentSide() {
  const side = currentSide();

  return !!side && plannedEntriesFor(side.coords, side.isMoon).length > 0;
}
