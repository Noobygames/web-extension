import OGBIData from "../../store/OGBIData.js";
import { createDOM, createSVG } from "../../ui/dom.js";
import { toFormattedNumber } from "../../format/numbers.js";
import planetType from "../../game/planetType.js";
import { tooltip } from "../../ui/tooltip.js";
import OGBIObserver from "../../platform/observer.js";
import flying from "../../ogame/fleetMovements.js";
import Translator from "../../format/i18n/translate.js";
import { loadChunk } from "../../platform/loadChunk.js";

const needs = {
  ...OGBIData.needs,
};

const obs = new OGBIObserver();

/**
 * The extension's own read of what is currently in flight, refreshed every time
 * `display()` runs and used only to net cargo already en route out of the lock
 * icons below.
 *
 * Deliberately not `OGBIData.json.flying`. `eventBox()` (ctxpage/eventbox) owns
 * that field: it is the persisted snapshot eventBox() diffs the current event box
 * against to notice an own fleet arriving, and it is meant to survive untouched
 * from the moment this page loads until eventBox() runs its own diff, once. This
 * used to write straight into it - `display()` fires off the `#eventboxContent`
 * mutation observer below, which resolves as a microtask and so almost always ran
 * before eventBox()'s 10ms poll got there, replacing the cross-navigation baseline
 * with a same-navigation snapshot before eventBox() ever compared them. The diff
 * always found no difference, and an own fleet arriving stopped crediting its
 * cargo. Phase 6 of refactoring.md.
 */
let currentFlying = null;

/**
 * The same snapshot, read on demand.
 *
 * `display()` is not the only entry point: `setNeeds()` redraws an icon straight from
 * the upgrade-plan sync, which happens on build pages where the event box may not have
 * been observed yet. That path used to see an empty `currentFlying` and colour the icon
 * as if nothing was in flight, so the same planet showed red or green depending on
 * which of the two ran first. Reading it here keeps one answer for both.
 */
function flyingNow() {
  if (currentFlying) return currentFlying;
  // No event box yet means no answer, not "nothing flying" - don't memoize that.
  if (!document.getElementById("eventContent")) return {};

  currentFlying = flying();

  return currentFlying;
}

export function display() {
  if (document.getElementById("eventboxLoading").style.display === "block") return;

  currentFlying = flying();
  document.querySelectorAll(".smallplanet").forEach((planet) => {
    const coords = planet.querySelector(".planet-koords")?.textContent;

    if (!coords) return;

    displayLocksByCoords(coords, false);

    if (planet.querySelector(".moonlink")) displayLocksByCoords(coords, true);
  });
}

// Deferred instead of registered at module evaluation: `ogCore.js` is injected at
// `document_start` so its module graph loads in parallel with the game's page parse,
// and `#eventboxContent` does not exist yet at that point. OGBIObserver silently
// ignores a null element, so an eager call would just drop the observer.
function observeEventBox() {
  obs(document.getElementById("eventboxContent"), display, { subtree: false });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", observeEventBox, { once: true });
} else {
  observeEventBox();
}

function getNeedsResourceByCoords(coords, isMoon) {
  const planetFound = getPlanetByCoords(coords);

  if (planetFound === null) return;

  const needsTarget = isMoon ? needs?.[planetFound.id]?.moon : needs?.[planetFound.id]?.planet;

  // A planet with nothing recorded at all threw here (`Object.values(undefined)`).
  // Never reached before: every caller checked the bucket first, and the dispatch page
  // only asked about a target that already had a lock. The upgrade-plan overview walks
  // every planet in the empire, so it does reach it.
  if (!needsTarget) return;

  if (Object.values(needsTarget).reduce((total, resource) => total + resource, 0) === 0) return;

  return needsTarget;
}

export function getNeedsByCoords(coords, isMoon) {
  const planetFound = getPlanetByCoords(coords);

  if (planetFound === null) return;

  const planet = isMoon ? planetFound.moon : planetFound;
  const needsTarget = getNeedsResourceByCoords(coords, isMoon);

  if (needsTarget === undefined) return;

  const inFlight = flyingNow();
  const flyingTarget = isMoon ? inFlight.planets?.[coords]?.moon : inFlight.planets?.[coords]?.planet;

  const metal = Math.max((needsTarget?.metal || 0) - (planet?.metal || 0) - (flyingTarget?.metal || 0), 0);
  const crystal = Math.max((needsTarget?.crystal || 0) - (planet?.crystal || 0) - (flyingTarget?.crystal || 0), 0);
  const deuterium = Math.max(
    (needsTarget?.deuterium || 0) - (planet?.deuterium || 0) - (flyingTarget?.deuterium || 0),
    0
  );

  return {
    metal,
    crystal,
    deuterium,
  };
}

/** @param {{metal?: number, crystal?: number, deuterium?: number}} [side] */
function sumOf(side) {
  return (side?.metal || 0) + (side?.crystal || 0) + (side?.deuterium || 0);
}

/**
 * Sets what one side is short of, and redraws its icon.
 *
 * A derived value now: `store/upgradePlans.js` holds the upgrades the player planned
 * and `ctxpage/upgradePlans/sync.js` prices them and calls this. Replaces
 * `lock()`/`append()`, which added to a running total nobody could break down again,
 * and which disagreed about the key - `lock()` created the bucket under the moon's own
 * id, `append()` wrote to the planet's.
 *
 * @param {string} coords
 * @param {boolean} isMoon
 * @param {{metal?: number, crystal?: number, deuterium?: number}} resources
 */
export function setNeeds(coords, isMoon, resources) {
  const planetFound = getPlanetByCoords(coords);

  if (planetFound === null) return;

  const planetId = planetFound.id;

  if (!needs[planetId]) {
    needs[planetId] = {
      planetId,
      coords,
      moon: {},
      planet: {},
    };
  }

  const side = {
    metal: Math.max(0, Math.round(resources?.metal || 0)),
    crystal: Math.max(0, Math.round(resources?.crystal || 0)),
    deuterium: Math.max(0, Math.round(resources?.deuterium || 0)),
  };

  needs[planetId][isMoon ? "moon" : "planet"] = side;

  // A plan that has been built asks for nothing, and a zero row is not "nothing" - it
  // is a row that survives every reload and slowly fills the store with one entry per
  // planet the player ever planned on. Once both sides are empty the whole bucket goes,
  // which is also what makes `getNeedsByCoords()` answer undefined again.
  if (sumOf(needs[planetId].planet) === 0 && sumOf(needs[planetId].moon) === 0) {
    delete needs[planetId];
  }

  OGBIData.needs = needs;

  displayLocks(planetFound, isMoon);
}

/**
 * Deletes the plan a lock icon stands for, not just the cached total.
 *
 * The plan itself needs the cost tables, which are chunk-side (see `setNeeds` above),
 * so this reaches for them on demand. The caller has already cleared the cache, which
 * is what makes the icon disappear straight away; without this the next sync would
 * price the plan again and bring it back.
 */
function clearPlan(coords, isMoon) {
  loadChunk("upgradePlans", () => import("../upgradePlans/sync.js")).then((module) =>
    module?.clearPlanFor(coords, isMoon)
  );
}

export function displayLocksByCoords(coords, isMoon) {
  const planetFound = getPlanetByCoords(coords);

  if (planetFound === null) return;

  displayLocks(planetFound, isMoon);
}

/**
 * Draws (or removes) one side's icon on the planet row.
 *
 * Takes the **parent planet**, never the moon object, for both halves of the lookup.
 * It used to take whichever object the side stood for and derive the id from
 * `planet?.planetID || planet.id`, but the moons in `OGBIData.empire` come out of the
 * empire endpoint's own moon list and carry only their own `id` - so a moon resolved to
 * the moon's id, `#planet-<moonId>` matched nothing and `needs[moonId]` was undefined
 * (the cache is keyed by the planet). Moon locks simply never appeared.
 *
 * @param {object} planetFound entry from `OGBIData.empire`
 * @param {boolean} isMoon which side of it to draw
 */
function displayLocks(planetFound, isMoon) {
  const planetId = planetFound?.id;

  if (!planetId) return;

  const target = isMoon ? planetFound.moon : planetFound;

  if (!target) return;

  const element = document.querySelector(`#planetList #planet-${planetId}`);

  if (!element) return;

  const planetNeeds = needs[planetId];

  const selector = isMoon ? ".ogl-moonLock" : ":not(.ogl-moonLock)";

  element.querySelectorAll(`.ogl-sideLock${selector}`).forEach((e) => e.remove());

  if (
    !planetNeeds ||
    (typeof planetNeeds?.moon?.metal === "undefined" && typeof planetNeeds?.planet?.metal === "undefined")
  ) {
    return;
  }

  const icon = createLockIcon(planetFound, isMoon);
  if (icon) element.appendChild(icon);
}

/**
 * How far along one side's savings goal is, 0..1.
 *
 * Summed across all three resources rather than per resource: the icon is 16px and has
 * one bar, and "80% of the way there" is the question it answers. A side with nothing
 * planned counts as done, so it never draws a permanently empty bar.
 */
function fundedShare(coords, isMoon) {
  const planned = getNeedsResourceByCoords(coords, isMoon);
  const total = sumOf(planned);

  if (total <= 0) return 1;

  const missing = sumOf(getNeedsByCoords(coords, isMoon));

  return Math.min(1, Math.max(0, 1 - missing / total));
}

/**
 * A stack of three coins, as one path with three subpaths. The old icon was OGame's own
 * padlock sprite recoloured with `hue-rotate`, which read as "locked" rather than
 * "saving up for something" and could only ever be two colours.
 */
const COIN_STACK =
  "M8 1.2c3.31 0 6 1.07 6 2.4S11.31 6 8 6 2 4.93 2 3.6 4.69 1.2 8 1.2z " +
  "M2 5.5v2.3c0 1.33 2.69 2.4 6 2.4s6-1.07 6-2.4V5.5c-1.24 1.05-3.5 1.6-6 1.6S3.24 6.55 2 5.5z " +
  "M2 9.7v2.3c0 1.33 2.69 2.4 6 2.4s6-1.07 6-2.4V9.7c-1.24 1.05-3.5 1.6-6 1.6S3.24 10.75 2 9.7z";

/**
 * The glyph, filled from the bottom to `share` of its height.
 *
 * Inline SVG rather than a `mask-image`/`background-image` data URI on purpose: OGame's
 * CSP governs images the stylesheet pulls in, and inline SVG is markup, so nothing here
 * depends on `data:` being allowed. It also lets the fill level be a real clip instead
 * of three hard-coded steps.
 *
 * @param {number} share 0..1
 * @param {string} uid unique per planet and side - the clip path needs an id
 */
function createLockGlyph(share, uid) {
  const svg = createSVG("svg", { viewBox: "0 0 16 16", width: "16", height: "16", class: "ogl-sideLock-glyph" });
  const clipId = `ogl-lockFill-${uid}`;
  const height = Math.max(0, Math.min(16, 16 * share));

  const clip = svg.appendChild(createSVG("defs")).appendChild(createSVG("clipPath", { id: clipId }));
  clip.appendChild(createSVG("rect", { x: "0", y: String(16 - height), width: "16", height: String(height) }));

  svg.appendChild(createSVG("path", { class: "ogl-sideLock-empty", d: COIN_STACK }));
  svg
    .appendChild(createSVG("g", { "clip-path": `url(#${clipId})` }))
    .appendChild(createSVG("path", { class: "ogl-sideLock-fill", d: COIN_STACK }));
  // Drawn last and stroke-only: at 0% the shape would otherwise be flat grey and the
  // state colour - the thing the player is meant to read - would not be on screen.
  svg.appendChild(createSVG("path", { class: "ogl-sideLock-outline", d: COIN_STACK }));

  return svg;
}

function createLockIcon(planetFound, isMoon) {
  const planetId = planetFound.id;
  const target = isMoon ? planetFound.moon : planetFound;
  const btn = createDOM("button", { class: "ogl-sideLock tooltip tooltipClose tooltipLeft" });

  if (isMoon) {
    btn.classList.add("ogl-moonLock");
  }

  const coords = String(target.coordinates || planetFound.coordinates).replace(/(\[|\])/g, "");
  const needsTarget = getNeedsByCoords(coords, isMoon);

  if (typeof needsTarget?.metal === "undefined") return;

  const filled = needsTarget.metal === 0 && needsTarget.crystal === 0 && needsTarget.deuterium === 0;
  const share = filled ? 1 : fundedShare(coords, isMoon);
  const percent = Math.round(share * 100);

  // Three states, not two. Red against amber against green is what makes the bar
  // readable at 16px; the exact share drives how high the coin stack is filled.
  if (filled) {
    btn.classList.add("ogl-sideLockFilled");
  } else if (percent > 0) {
    btn.classList.add("ogl-sideLockPartial");
  }

  btn.appendChild(createLockGlyph(share, `${planetId}-${isMoon ? "moon" : "planet"}`));

  const tooltipContent = createDOM("div");
  tooltipContent.appendChild(createDOM("div", { style: "width: 75px" }, Translator.translate(39)));
  tooltipContent.appendChild(createDOM("hr"));
  tooltipContent.appendChild(
    createDOM("div", { class: "ogl-metal" }, toFormattedNumber(Math.max(0, needsTarget.metal), null, true))
  );
  tooltipContent.appendChild(
    createDOM("div", { class: "ogl-crystal" }, toFormattedNumber(Math.max(0, needsTarget.crystal), null, true))
  );
  tooltipContent.appendChild(
    createDOM("div", { class: "ogl-deut" }, toFormattedNumber(Math.max(0, needsTarget.deuterium), null, true))
  );
  tooltipContent.appendChild(
    createDOM("div", { class: "ogl-sideLock-progress" }, `${Translator.translate(417)}: ${percent}%`)
  );
  tooltipContent.appendChild(createDOM("hr"));

  const deleteBtn = tooltipContent.appendChild(createDOM("div", { style: "width: 75px;", class: "icon icon_against" }));
  deleteBtn.addEventListener("click", () => {
    if (!isMoon) {
      needs[planetId].planet = {};
    } else {
      needs[planetId].moon = {};
    }

    clearPlan(coords, isMoon);
    OGBIData.needs = needs;
    OGBIData.needSync = true;
    document.querySelector(".ogl-tooltip .close-tooltip").click();
    displayLocks(planetFound, isMoon);
  });

  btn.addEventListener("mouseover", () => {
    tooltip(btn, tooltipContent, false, { left: true });
  });

  btn.addEventListener("click", () => {
    const parts = coords.split(":");
    const fleetLink = new URLSearchParams({
      page: "ingame",
      component: "fleetdispatch",
      galaxy: parts[0],
      system: parts[1],
      position: parts[2],
      type: isMoon ? planetType.moon : planetType.planet,
      // Transport. Was a literal 1, OGame's attack - not a mission you can fly to your
      // own planet. A number, like `oglMode`: the entry has no room for another import.
      mission: 3,
      oglMode: 2,
    });

    window.location.href = `?${fleetLink.toString()}`;
  });

  return btn;
}

function getPlanetByCoords(coords) {
  for (const planet of OGBIData.empire) {
    if (planet.coordinates === `[${coords}]`) return planet;
  }

  return null;
}
