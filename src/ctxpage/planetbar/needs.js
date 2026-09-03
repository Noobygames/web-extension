import OGBIData from "../../store/OGBIData.js";
import { createDOM } from "../../ui/dom.js";
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
let currentFlying = {};

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
// and `#eventboxContent` does not exist yet at that point. OGIObserver silently
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

  const flyingTarget = isMoon ? currentFlying.planets?.[coords]?.moon : currentFlying.planets?.[coords]?.planet;

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

  displayLocks(isMoon ? planetFound.moon : planetFound, isMoon);
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

  const planet = isMoon ? planetFound.moon : planetFound;

  displayLocks(planet, isMoon);
}

function displayLocks(planet, isMoon) {
  const planetId = planet?.planetID || planet.id;

  if (!planetId) return;

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

  const icon = createLockIcon(planet, isMoon);
  if (icon) element.appendChild(icon);

  const sidePlanetDiv = document.querySelector("div#cutty") || document.querySelector("div#norm");

  sidePlanetDiv.querySelectorAll(".ogl-sideLockRemove").forEach((e) => e.remove());

  if (sidePlanetDiv.querySelector(".ogl-sideLock")) {
    const deleteAllEmpty = createDOM("button", {
      class: "ogl-sideLockRemove tooltip",
      title: Translator.translate(338),
    });
    const deleteAllFilled = createDOM("button", {
      class: "ogl-sideLockRemove ogl-sideLockRemoveFilled tooltip",
      title: Translator.translate(339),
    });
    sidePlanetDiv.append(deleteAllEmpty, deleteAllFilled);
    const deleteAll = (condition) => {
      for (const key in needs) {
        const need = needs[key];
        const needPlanet = getNeedsByCoords(needs[key].coords, false);
        const needMoon = getNeedsByCoords(needs[key].coords, true);

        if (needMoon && condition(needMoon)) {
          needs[key].moon = {};
          clearPlan(need.coords, true);
          displayLocks(getPlanetByCoords(need.coords).moon, true);
        }

        if (needPlanet && condition(needPlanet)) {
          needs[key].planet = {};
          clearPlan(need.coords, false);
          displayLocks(getPlanetByCoords(need.coords), false);
        }

        if (typeof needs[key]?.moon?.metal === "undefined" && typeof needs[key]?.planet?.metal === "undefined") {
          delete needs[key];
        }
      }

      if (!document.querySelector("#planetList .ogl-sideLock")) {
        sidePlanetDiv.querySelectorAll("button.ogl-sideLockRemove").forEach((button) => button.remove());
      }

      OGBIData.needs = needs;
    };

    deleteAllEmpty.addEventListener("click", () => {
      deleteAll((missing) => Object.values(missing).reduce((total, resource) => total + resource, 0) !== 0);
    });
    deleteAllFilled.addEventListener("click", () => {
      deleteAll((missing) => Object.values(missing).reduce((total, resource) => total + resource, 0) === 0);
    });
  }
}

function createLockIcon(planet, isMoon) {
  const planetId = planet?.planetID || planet.id;
  const btn = createDOM("button", { class: "ogl-sideLock tooltip tooltipClose tooltipLeft" });

  if (isMoon) {
    btn.classList.add("ogl-moonLock");
  }

  const coords = planet.coordinates.replace(/(\[|\])/g, "");
  const needsTarget = getNeedsByCoords(coords, isMoon);

  if (typeof needsTarget?.metal === "undefined") return;

  const filled = needsTarget.metal === 0 && needsTarget.crystal === 0 && needsTarget.deuterium === 0;

  if (filled) {
    btn.classList.add("ogl-sideLockFilled");
  }

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
    displayLocks(planet, isMoon);

    const sidePlanetDiv = document.querySelector("div#cutty") || document.querySelector("div#norm");
    if (!document.querySelector("#planetList .ogl-sideLock")) {
      sidePlanetDiv.querySelectorAll("button.ogl-sideLockRemove").forEach((button) => button.remove());
    }
  });

  btn.addEventListener("mouseover", () => {
    tooltip(btn, tooltipContent, false, { left: true });
  });

  btn.addEventListener("click", () => {
    const coords = planet.coordinates.replace(/(\[|\])/g, "").split(":");
    const fleetLink = new URLSearchParams({
      page: "ingame",
      component: "fleetdispatch",
      galaxy: coords[0],
      system: coords[1],
      position: coords[2],
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
