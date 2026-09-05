import { createDOM } from "../../ui/dom.js";
import { buildPageOf } from "../../game/technoIds.js";
import { isBuildPage } from "../../ogame/pages.js";
import Translator from "../../format/i18n/translate.js";
import { currentSide, plannedEntriesFor } from "./plans.js";

/**
 * Shows where the planned upgrades are, on the page the player is standing on.
 *
 * A plan made last week is invisible until the plan panel is opened again - nothing on
 * the supplies page says this planet is the one the metal was shipped to. So the left
 * menu marks the build pages that have something planned here, and on those pages the
 * tile gets a frame plus, when more than one level is planned, the level it is heading
 * for. OGame's own tile can only ever show the next one.
 *
 * A chunk, fetched only when `hasPlansOnCurrentSide()` says there is something to draw
 * (see `plans.js`). Reads storage and paints: no request, no game action, and a
 * highlighted menu entry is still OGame's own link (AGENTS.md 1.1, 1.3, 1.5).
 */

const MENU_CLASS = "ogl-planned-menu";
const TILE_CLASS = "ogl-planned-tile";
const BADGE_CLASS = "ogl-planned-target";

/** Matched on the href, not an id: OGame's menu ids have moved between versions. */
function menuLink(component) {
  return document.querySelector(
    `#links a[href*="component=${component}"], .leftmenu a[href*="component=${component}"]`
  );
}

/**
 * Marks each menu entry that has something planned, with how many upgrades.
 *
 * Shipyard and defences never light up: a ship has no level, so it cannot be a plan
 * entry at all. That is the plan store's shape, not an omission here.
 */
function highlightMenu(entries) {
  document.querySelectorAll(`.${MENU_CLASS}`).forEach((element) => {
    element.classList.remove(MENU_CLASS);
    element.removeAttribute("data-ogl-planned");
  });

  const counts = {};
  for (const entry of entries) {
    const page = buildPageOf(entry.technoId);
    if (page) counts[page] = (counts[page] || 0) + 1;
  }

  for (const [page, count] of Object.entries(counts)) {
    const link = menuLink(page);
    if (!link) continue;

    link.classList.add(MENU_CLASS);
    link.setAttribute("data-ogl-planned", String(count));
    // The game's own `title`, not OGBI's hover panel: this has to work on a menu the
    // player may hover before anything of ours is warm.
    link.title = `${Translator.translate(424)} (${count})`;
  }
}

/**
 * Frames every planned technology on the build page being viewed.
 *
 * One level ahead gets no badge: OGame's tile already names the level being built, and
 * repeating it on every planned tile is noise.
 */
function highlightTiles(entries, page) {
  document.querySelectorAll(`.${TILE_CLASS}`).forEach((element) => element.classList.remove(TILE_CLASS));
  document.querySelectorAll(`.${BADGE_CLASS}`).forEach((element) => element.remove());

  for (const entry of entries) {
    if (buildPageOf(entry.technoId) !== page) continue;

    const tile = document.querySelector(`.technology[data-technology="${entry.technoId}"]`);
    if (!tile) continue;

    tile.classList.add(TILE_CLASS);

    const from = Number(entry.from);
    const to = Number(entry.to);

    if (to - from <= 1) continue;

    tile.appendChild(
      createDOM(
        "div",
        { class: `${BADGE_CLASS} tooltip`, title: `${Translator.translate(425)}: ${from} → ${to}` },
        `➜ ${to}`
      )
    );
  }
}

/** Draws both marks for the planet or moon currently selected. */
export function planHighlight() {
  const side = currentSide();
  if (!side) return;

  const entries = plannedEntriesFor(side.coords, side.isMoon);
  const page = new URLSearchParams(window.location.search).get("component");

  highlightMenu(entries);

  if (isBuildPage(page)) highlightTiles(entries, page);
}

/**
 * Redraws after a plan changes, so planning something in the panel lights the menu up
 * without a reload. Called from `ctxpage/upgradePlans/sync.js`, which is chunk-side
 * too, so this costs the entry nothing.
 *
 * Synchronous on purpose. Coalescing the redraws onto a microtask was the obvious way
 * to stop `syncAllNeeds()` repainting once per planet, and it turned every plan write
 * into deferred work that outlives its caller - which every test that syncs a plan then
 * tears its DOM down immediately saw as a ReferenceError from the wrong test. The
 * repaint is suppressed at the loop instead; see `syncAllNeeds()`.
 */
export function refreshPlanHighlight() {
  planHighlight();
}

export default planHighlight;
