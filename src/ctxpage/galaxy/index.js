import { createDOM } from "../../util/dom.js";
import * as stalkUtil from "../../util/stalk.js";
import Translator from "../../util/translate.js";
import OGBIData from "../../util/OGBIData.js";
import markerui from "../../util/markerui.js";
import highlight from "../../util/highlightTarget.js";
import { renderPlanet } from "./renderPlanet.js";

/**
 * Galaxy view: the per-row tooltips and markers, the activity read-out, the target
 * claims shared through PTRE, the stalk overlay and the target list.
 *
 * Lifted out of `OGBeyondInfinity` in Phase 3 of refactoring.md.
 *
 * Compliance note (AGENTS.md 1.5.1): nothing in here attaches a direct-probe action to
 * a coordinate. The target list shows coordinates and links into galaxy view, where
 * the game's own probe icon is; `probingWarning()` in the settings module is the
 * notice explaining why those icons are inert elsewhere.
 *
 * The galaxy view itself - the per-row markers, tooltips, activity read-out and PTRE
 * claims - moved to `galaxyView.js` in Phase 5 of refactoring.md, because it only runs
 * on `component=galaxy` and this file does not. What is left is what other pages reach
 * for: the target-list overlay behind the sidebar button, the stalk links that
 * `ctxpage/stalk` uses, and `getMarkedPlayers()`.
 */

function generateHiscoreLink(context, playerid) {
  const url = new URLSearchParams({
    page: "ingame",
    component: "highscore",
    searchRelId: playerid,
  });

  return `?${url.toString()}`;
}

function targetList(context, show) {
  let renderTagetList = () => {
    let galaxy = OGBIData.json.targetTabs.g == -1 ? false : true;
    let system = OGBIData.json.targetTabs.s == -1 ? false : true;
    let div = createDOM("div", { class: "ogl-target-list" });
    let header = div.appendChild(createDOM("div", { class: "ogk-controls" }));
    let markers = header.appendChild(createDOM("div"));
    ["red", "orange", "yellow", "green", "blue", "violet", "gray", "brown"].forEach((color) => {
      let toggle = createDOM("div", { class: "tooltip ogl-toggle", title: Translator.translate(40) });
      toggle.setAttribute("data-toggle", color);
      markers.appendChild(toggle);
      if (!OGBIData.json.options.hiddenTargets[color]) toggle.classList.add("ogl-active");
      toggle.addEventListener("click", () => {
        OGBIData.json.options.hiddenTargets[color] = OGBIData.json.options.hiddenTargets[color] ? false : true;
        OGBIData.Save();
        if (OGBIData.json.options.hiddenTargets[color]) toggle.classList.remove("ogl-active");
        else toggle.classList.add("ogl-active");
        content.querySelectorAll(`[data-marked="${color}"]`).forEach((planet) => {
          if (OGBIData.json.options.hiddenTargets[color]) planet.classList.add("ogl-colorHidden");
          else planet.classList.remove("ogl-colorHidden");
        });
        checkEmpty(galaxy, system);
      });
    });
    let filterTabs = header.appendChild(createDOM("div", { class: "ogl-tabList", style: "margin-bottom: 5px;" }));
    let tabG = filterTabs.appendChild(createDOM("div", { class: "ogl-tab" + (!galaxy ? " ogl-active" : "") }, "Gs"));
    tabG.addEventListener("click", () => {
      if (OGBIData.json.targetTabs.g == -1) {
        OGBIData.json.targetTabs.g = 0;
        galaxy = true;
        OGBIData.Save();
        tabG.classList.remove("ogl-active");
      } else {
        OGBIData.json.targetTabs.g = -1;
        galaxy = false;
        OGBIData.Save();
        let active = header.querySelector(".ogl-tab[data-galaxy].ogl-active");
        if (active) active.classList.remove("ogl-active");
        document.querySelectorAll("a.ogl-galaxyHidden").forEach((target) => {
          target.classList.remove("ogl-galaxyHidden");
        });
        tabG.classList.add("ogl-active");
      }
      checkEmpty(galaxy, system);
    });
    let tabS = filterTabs.appendChild(createDOM("div", { class: "ogl-tab" + (!system ? " ogl-active" : "") }, "Ss"));
    tabS.addEventListener("click", () => {
      if (OGBIData.json.targetTabs.s == -1) {
        OGBIData.json.targetTabs.s = 0;
        system = true;
        OGBIData.Save();
        tabS.classList.remove("ogl-active");
      } else {
        OGBIData.json.targetTabs.s = -1;
        system = false;
        OGBIData.Save();
        let active = header.querySelector(".ogl-tab[data-system].ogl-active");
        if (active) active.classList.remove("ogl-active");
        document.querySelectorAll("a.ogl-systemHidden").forEach((target) => {
          target.classList.remove("ogl-systemHidden");
        });
        tabS.classList.add("ogl-active");
      }
      checkEmpty(galaxy, system);
    });
    let content = div.appendChild(
      createDOM("div", {
        class: "ogl-dialogContainer ogl-stalkContainer",
        style: "max-height: 400px; overflow: hidden",
      })
    );
    let galaxyTabList = header.appendChild(createDOM("div", { class: "ogl-tabList ogl-galaxyTabList" }));
    let systemTabList = header.appendChild(createDOM("div", { class: "ogl-tabList ogl-systemTabList" }));
    let planetList = content.appendChild(createDOM("div", { class: "ogl-stalkPlanets" }));
    header.appendChild(createDOM("hr"));
    let checkEmpty = (galaxy, system) => {
      for (let g = 1; g <= 10; g++) {
        if (galaxy) {
          let children = content.querySelector(`[data-galaxy="${g}"]:not(.ogl-colorHidden)`);
          if (children) header.querySelector(`.ogl-tab[data-galaxy="${g}"]`).classList.remove("ogl-isEmpty");
          else header.querySelector(`.ogl-tab[data-galaxy="${g}"]`).classList.add("ogl-isEmpty");
        } else {
          header.querySelector(`.ogl-tab[data-galaxy="${g}"]`).classList.add("ogl-isEmpty");
        }
      }
      for (let s = 0; s < step * 10; s += step) {
        if (system) {
          let children = content.querySelector(
            `[data-galaxy="${OGBIData.json.targetTabs.g}"][data-system="${s}"]:not(.ogl-colorHidden)`
          );
          if (children) header.querySelector(`.ogl-tab[data-system="${s}"]`).classList.remove("ogl-isEmpty");
          else header.querySelector(`.ogl-tab[data-system="${s}"]`).classList.add("ogl-isEmpty");
        } else {
          header.querySelector(`.ogl-tab[data-system="${s}"]`).classList.add("ogl-isEmpty");
        }
      }
    };
    for (let coords in OGBIData.json.markers) {
      if (OGBIData.json.markers[coords] == "") {
        delete OGBIData.json.markers[coords];
        context.markedPlayers = getMarkedPlayers(context, OGBIData.json.markers);
      }
    }
    let keys = Object.keys(OGBIData.json.markers).sort((a, b) => {
      let coordsA = a
        .split(":")
        .map((x) => x.padStart(3, "0"))
        .join("");
      let coordsB = b
        .split(":")
        .map((x) => x.padStart(3, "0"))
        .join("");
      return coordsA - coordsB;
    });
    let step = 50;
    for (let i = 0; i < step * 10; i += step) {
      let sTab = systemTabList.appendChild(createDOM("div", { class: "ogl-tab", "data-system": i }, i));
      if (OGBIData.json.targetTabs.s == i && system) sTab.classList.add("ogl-active");
      sTab.addEventListener("click", (event) => {
        if (!system) return;
        header.querySelectorAll(".ogl-tab[data-system].ogl-active").forEach((e) => e.classList.remove("ogl-active"));

        event.target.classList.add("ogl-active");
        content.querySelectorAll("[data-system]").forEach((planet) => {
          planet.classList.add("ogl-systemHidden");
          if (planet.getAttribute("data-system") == i) {
            planet.classList.remove("ogl-systemHidden");
          }
          OGBIData.json.targetTabs.s = i;
        });
        OGBIData.Save();
      });
    }
    for (let i = 1; i <= 10; i++) {
      let gTab = galaxyTabList.appendChild(createDOM("div", { class: "ogl-tab", "data-galaxy": i }, "G" + i));
      if (OGBIData.json.targetTabs.g == i && galaxy) gTab.classList.add("ogl-active");
      if (OGBIData.json.targetTabs.g == 0) gTab.click();
      gTab.addEventListener("click", (event) => {
        if (!galaxy) return;
        header.querySelectorAll(".ogl-tab[data-galaxy]").forEach((e) => e.classList.remove("ogl-active"));
        event.target.classList.add("ogl-active");
        content.querySelectorAll("[data-galaxy]").forEach((planet) => {
          planet.classList.add("ogl-galaxyHidden");
          if (planet.getAttribute("data-galaxy") == i) {
            planet.classList.remove("ogl-galaxyHidden");
          }
        });
        OGBIData.json.targetTabs.g = i;
        OGBIData.Save();
        checkEmpty(galaxy, system);
      });
    }
    keys.forEach((coords) => {
      if (OGBIData.json.markers[coords]) {
        let a = renderPlanet(context, coords, false, false, OGBIData.json.markers[coords].moon);
        let splitted = coords.split(":");
        a.setAttribute("data-coords", coords);
        a.setAttribute("data-galaxy", splitted[0]);
        a.setAttribute("data-system", Math.floor(splitted[1] / step) * step);
        if (OGBIData.json.options.hiddenTargets[OGBIData.json.markers[coords].color]) {
          a.classList.add("ogl-colorHidden");
        }
        if (galaxy) {
          if (OGBIData.json.targetTabs.g != splitted[0]) {
            a.classList.add("ogl-galaxyHidden");
          }
        }
        if (system) {
          if (OGBIData.json.targetTabs.s != Math.floor(splitted[1] / step) * step) {
            a.classList.add("ogl-systemHidden");
          }
        }
        planetList.appendChild(a);
      }
      setTimeout(() => {
        $(content).mCustomScrollbar({ theme: "ogame" });
      }, 100);
    });
    checkEmpty(galaxy, system);
    return div;
  };
  if (show) {
    document.querySelector("#planetList").style.display = "none";
    document.querySelector("#countColonies").style.display = "none";
    document.querySelector("#rechts").children[0].appendChild(renderTagetList());
  } else {
    let list = document.querySelector(".ogl-target-list");
    if (list) {
      list.remove();
      document.querySelector("#planetList").style.display = "block";
      document.querySelector("#countColonies").style.display = "block";
    }
  }
}

function addMarkerUI(_context, coords, parent, id, _moon) {
  markerui.add(coords, parent, id);
}

function stalk(sender, player, delay) {
  stalkUtil.stalk(sender, player, delay);
}

function highlightTarget(context) {
  if (context.page != "galaxy") return;
  let coords;
  if (context.highlighted) {
    coords = context.highlighted.split(":");
  } else {
    coords = [
      context.rawURL.searchParams.get("galaxy") || 0,
      context.rawURL.searchParams.get("system") || 0,
      context.rawURL.searchParams.get("position") || 0,
    ];
    coords.join(":");
  }

  highlight(coords);
}

function getMarkedPlayers(context, markerList) {
  let playerList = [];

  if (markerList) {
    Object.keys(markerList).forEach(function (key) {
      const id = parseInt(markerList[key].id);
      if (playerList.indexOf(id) == -1) {
        playerList.push(id);
      }
    });
    return playerList;
  }
  return [];
}

export { targetList, getMarkedPlayers, highlightTarget, stalk, addMarkerUI, generateHiscoreLink };
