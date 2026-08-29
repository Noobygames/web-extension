import OGBIData from "../../store/OGBIData.js";
import { createDOM } from "../../ui/dom.js";
import { toFormattedNumber } from "../../format/numbers.js";
import planetType from "../../game/planetType.js";
import { tooltip } from "../../ui/tooltip.js";
import OGBIObserver from "../../platform/observer.js";
import flying from "../../ogame/fleetMovements.js";
import Translator from "../../format/i18n/translate.js";

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

export function append(coords, isMoon, resources) {
  const planetFound = getPlanetByCoords(coords);

  if (planetFound === null) return;

  const needsTarget = getNeedsResourceByCoords(coords, isMoon);

  const metal = Math.max((needsTarget?.metal || 0) + (resources?.metal || 0), 0);
  const crystal = Math.max((needsTarget?.crystal || 0) + (resources?.crystal || 0), 0);
  const deuterium = Math.max((needsTarget?.deuterium || 0) + (resources?.deuterium || 0), 0);

  if (isMoon) {
    needs[planetFound.id].moon = {
      metal,
      crystal,
      deuterium,
    };
  } else {
    needs[planetFound.id].planet = {
      metal,
      crystal,
      deuterium,
    };
  }

  OGBIData.needs = needs;
}

export function lock(coords, isMoon, needed) {
  const planetFound = getPlanetByCoords(coords);

  if (planetFound === null) return;

  const planet = isMoon ? planetFound.moon : planetFound;
  const planetId = planet?.planetID || planet.id;

  if (!needs[planetId]) {
    needs[planetId] = {
      planetId,
      coords,
      moon: {},
      planet: {},
    };
  }

  append(coords, isMoon, needed);

  displayLocks(planet, isMoon);
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
    const deleteAllEmpty = createDOM("button", { class: "ogl-sideLockRemove tooltip" });
    const deleteAllFilled = createDOM("button", { class: "ogl-sideLockRemove ogl-sideLockRemoveFilled tooltip" });
    sidePlanetDiv.append(deleteAllEmpty, deleteAllFilled);
    const deleteAll = (condition) => {
      for (const key in needs) {
        const need = needs[key];
        const needPlanet = getNeedsByCoords(needs[key].coords, false);
        const needMoon = getNeedsByCoords(needs[key].coords, true);

        if (needMoon && condition(needMoon)) {
          needs[key].moon = {};
          displayLocks(getPlanetByCoords(need.coords).moon, true);
        }

        if (needPlanet && condition(needPlanet)) {
          needs[key].planet = {};
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
      OGBIData.needs[planetId].planet = {};
    } else {
      OGBIData.needs[planetId].moon = {};
    }

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
      mission: 1,
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
