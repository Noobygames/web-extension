import { createDOM } from "../../ui/dom.js";
import Translator from "../../format/i18n/translate.js";
import OGBIData from "../../store/OGBIData.js";
import { updateresourceDetail } from "../empireOverview/index.js";
import { updateEmpireData } from "../empire/index.js";
import flying from "../../ogame/fleetMovements.js";
import * as wait from "../../platform/wait.js";
import { getLogger } from "../../platform/logger.js";

const logger = getLogger("eventBox");

/**
 * The fleet-movement panel OGame drops in over the top bar, with OGI's own totals.
 *
 * Lifted out of `OGBeyondInfinity` in Phase 3 of refactoring.md.
 */

function eventBox(context) {
  // wait.waitFor(), not an unguarded setInterval: the old poll had no timeout, so a
  // page where #eventboxLoading never reaches display:none (element missing, OGame
  // markup changed) polled forever, once every 10ms, for the rest of the page's
  // life. refactoring-new.md Phase A.4 #10.
  wait
    .waitFor(() => document.querySelector("#eventboxLoading").style.display == "none", 10)
    .then(async () => {
      const currentFlying = flying();
      if (JSON.stringify(OGBIData.json.flying.ids) != JSON.stringify(currentFlying.ids)) {
        let gone = [];
        OGBIData.json.flying.ids &&
          OGBIData.json.flying.ids.forEach((mov) => {
            let found = false;
            currentFlying.ids.forEach((oldMov) => {
              if (mov.id == oldMov.id) {
                found = true;
              }
            });
            if (!found) {
              gone.push(mov);
            }
          });
        let added = [];
        OGBIData.json.flying.ids &&
          currentFlying.ids.forEach((mov) => {
            let found = false;
            OGBIData.json.flying.ids.forEach((oldMov) => {
              if (mov.id == oldMov.id) {
                found = true;
              }
            });
            if (!found) {
              added.push(mov);
            }
          });
        let update = false;
        added.forEach((movement) => {
          if (movement.type != 6 || (movement.metal && movement.metal + movement.crystal + movement.deuterium != 0)) {
            update = true;
          }
        });
        gone.forEach((movement) => {
          if (
            movement.own &&
            (movement.type == 4 || (movement.type == 3 && movement.back)) &&
            new Date(movement.arrival) < new Date()
          ) {
            let arrival = movement.back ? movement.origin : movement.dest;
            let coords = "[" + arrival.slice(0, -1) + "]";
            OGBIData.empire.forEach((planet) => {
              if ((arrival.slice(-1) == "M" && planet.moon) || arrival.slice(-1) != "M") {
                let object = arrival.slice(-1) == "M" ? planet.moon : planet;
                if (object.coordinates == coords) {
                  for (let id in movement.fleet) object[id] += movement.fleet[id];
                }
              }
            });
          }
          if (
            movement.metal + movement.crystal + movement.deuterium != 0 &&
            (movement.type != 6 || (movement.type == 6 && movement.back)) &&
            new Date(movement.arrival) < new Date()
          ) {
            let arrival = movement.back ? movement.origin : movement.dest;
            let coords = "[" + arrival.slice(0, -1) + "]";
            OGBIData.empire.forEach((planet) => {
              if ((arrival.slice(-1) == "M" && planet.moon) || arrival.slice(-1) != "M") {
                let object = arrival.slice(-1) == "M" ? planet.moon : planet;
                if (object.coordinates == coords) {
                  if (movement.metal) object.metal += movement.metal;
                  if (movement.crystal) object.crystal += movement.crystal;
                  if (movement.deuterium) object.deuterium += movement.deuterium;
                  if (!OGBIData.json.options.lessAggressiveEmpireAutomaticUpdate) {
                    update = true;
                  } else {
                    object.invalidate = true;
                    updateresourceDetail(context.overviewContext);
                  }
                }
              }
            });
          }
        });
        // The setter's write-through persists the arrival bookkeeping done above.
        OGBIData.needsUpdate = update;
        if (update) {
          // Awaited, not fire-and-forget: refactoring-new.md Phase A.4 #11 - a
          // rejection here used to be an unobserved promise rejection instead of
          // reaching the .catch() this .then() chain already has below.
          await updateEmpireData(context.empireContext);
        }
        OGBIData.json.needSync = true;
      }
      OGBIData.json.flying = currentFlying;
      OGBIData.Save();
      updateresourceDetail(context.overviewContext);
    })
    .catch((error) => logger.error("#eventboxLoading never finished loading", error));
  let addOptions = () => {
    let header = document.querySelector("#eventHeader");
    let div = header.appendChild(createDOM("div"));
    div.appendChild(createDOM("span", {}, Translator.translate(347)));
    let keep = div.appendChild(createDOM("input", { type: "checkbox" }));
    if (OGBIData.json.options.eventBoxKeep) keep.checked = true;
    div.appendChild(
      createDOM("span", { class: "tooltip", title: Translator.translate(416) }, Translator.translate(41))
    );
    let exps = div.appendChild(
      createDOM("input", { type: "checkbox", class: "tooltip", title: Translator.translate(416) })
    );
    if (OGBIData.json.options.eventBoxExps) exps.checked = true;
    keep.addEventListener("change", () => {
      OGBIData.json.options.eventBoxKeep = keep.checked;
      OGBIData.Save();
    });
    exps.addEventListener("change", () => {
      OGBIData.json.options.eventBoxExps = exps.checked;
      OGBIData.Save();
      context.expeditionImpact(exps.checked);
    });
  };
  let addColors = () => {
    document.querySelectorAll(".eventFleet, .allianceAttack").forEach((line) => {
      let origin = line.querySelector(".coordsOrigin a");
      let dest = line.querySelector(".destCoords a");
      let mission = line.getAttribute("data-mission-type");
      let debrisD = line.querySelector(".destFleet .tf");
      let moonD = line.querySelector(".destFleet .moon");
      if (mission == 3 || mission == 16 || mission == 18 || mission == 5 || mission == 7) {
        origin && origin.classList.add("ogk-coords-neutral");
        dest.classList.add("ogk-coords-neutral");
      } else {
        dest.classList.add("ogk-coords-hostile");
        origin && origin.classList.add("ogk-coords-hostile");
      }
      if (debrisD) {
        dest.classList.add("ogk-coords-debris");
      } else if (moonD) {
        dest.classList.add("ogk-coords-moon");
      } else if (dest.textContent.trim().split(":")[2] == "16]" || mission == 18) {
        dest.classList.add("ogk-coords-expedition");
      } else {
        dest.classList.add("ogk-coords-planet");
      }
      let debrisO = line.querySelector(".originFleet .tf");
      let moonO = line.querySelector(".originFleet .moon");
      if (debrisO) {
        origin && origin.classList.add("ogk-coords-debris");
      } else if (moonO) {
        origin && origin.classList.add("ogk-coords-moon");
      } else {
        origin && origin.classList.add("ogk-coords-planet");
      }
      context.planetList.forEach((planet) => {
        let coords = planet.querySelector(".planet-koords").textContent;
        if (origin && coords == origin.textContent.trim().slice(1, -1)) {
          if (
            coords == context.current.coords &&
            ((context.current.isMoon && moonO) || (!context.current.isMoon && !moonO))
          ) {
            origin && origin.classList.add("ogk-current-coords");
          } else {
            origin && origin.classList.add("ogk-own-coords");
          }
        }
        if (coords == dest.textContent.trim().slice(1, -1)) {
          if (
            coords == context.current.coords &&
            ((context.current.isMoon && moonD) || (!context.current.isMoon && !moonD))
          ) {
            dest.classList.add("ogk-current-coords");
          } else {
            dest.classList.add("ogk-own-coords");
          }
        }
      });
    });
  };
  let changeSpy = () => {
    document.querySelectorAll("#eventContent .sendProbe a").forEach((elem) => {
      let params = new URL(elem.href).searchParams;
      elem.href = "#";
      elem.setAttribute(
        "onClick",
        `sendShipsWithPopup(6,${params.get("galaxy")},${params.get("system")},${params.get("position")},${params.get(
          "planetType"
        )},${OGBIData.json.spyProbes}); return false;`
      );
    });
  };
  // Original opacity per row, read once - needed to restore a neighbor row
  // (not just the hovered one) to its own value instead of a wrong one.
  let originalOpacity = (node) => {
    if (node.dataset.oglOrigOpacity === undefined) node.dataset.oglOrigOpacity = node.style.opacity;
    return node.dataset.oglOrigOpacity;
  };
  let addHover = () => {
    document.querySelectorAll("#eventContent .eventFleet").forEach((line) => {
      let previous = Number(line.getAttribute("id").replace("eventRow-", "")) - 1;
      let next = Number(line.getAttribute("id").replace("eventRow-", "")) + 1;
      let previousNode = document.querySelector("#eventRow-" + previous);
      let nextNode = document.querySelector("#eventRow-" + next);
      let opacity = originalOpacity(line);
      line.addEventListener("mouseover", () => {
        line.style.setProperty("background-color", "#353535", "important");
        line.style.setProperty("opacity", "1", "important");
        if (previousNode) {
          previousNode.style.setProperty("background-color", "#353535", "important");
          previousNode.style.setProperty("opacity", "1");
        }
        if (nextNode) {
          nextNode.style.setProperty("opacity", "1");
          nextNode.style.setProperty("background-color", "#353535", "important");
        }
      });
      line.addEventListener("mouseout", () => {
        line.style.setProperty("background-color", "inherit");
        if (previousNode) {
          previousNode.style.setProperty("background-color", "inherit");
          previousNode.style.setProperty("opacity", originalOpacity(previousNode));
        }
        if (nextNode) {
          nextNode.style.setProperty("background-color", "inherit");
          nextNode.style.setProperty("opacity", originalOpacity(nextNode));
        }
        line.style.setProperty("opacity", opacity, "important");
      });
    });
  };
  let changeTimeZone = () => {
    document.querySelectorAll("#eventContent .eventFleet").forEach((line) => {
      let timeZoneChange = OGBIData.json.options.timeZone ? 0 : OGBIData.json.timezoneDiff;
      let arrival = new Date((line.getAttribute("data-arrival-time") - timeZoneChange) * 1e3);
      arrival = arrival.getTime();
      if (line.querySelector(".arrivalTime")) {
        line.querySelector(".arrivalTime").textContent = getFormatedDate(arrival, "[H]:[i]:[s]");
      }
    });
  };
  let updateEventBox = () => {
    changeTimeZone();
    changeSpy();
    addColors();
    addOptions();
    addHover();
    addRefreshButton();
    context.expeditionImpact(OGBIData.json.options.eventBoxExps);
  };
  let addRefreshButton = () => {
    let refreshBtn = createDOM("a", { class: "icon icon_reload", title: Translator.translate(23) });
    $("#eventHeader").prepend(refreshBtn);
    refreshBtn.addEventListener("click", () => {
      $.get(
        ajaxEventboxURI.replace("&asJson=1", ""),
        (data) => {
          $("#eventListWrap").replaceWith(data);
          updateEventBox();
        },
        "text"
      );
    });
  };
  if (OGBIData.json.options.eventBoxKeep) {
    toggleEvents.loaded = true;
    document.querySelector("#eventboxContent").style.display = "block";
  }
  // Same fix as the poll at the top of this function: bounded, not an unguarded
  // setInterval. `toggleEvents` is OGame's own eventbox toggle object
  // (config/ogame-globals.cjs) - `.loaded` flips once the game's own script has
  // finished loading the panel, which is genuinely out of this extension's control
  // and therefore exactly the kind of wait that needs a timeout.
  wait
    .waitFor(() => toggleEvents.loaded, 100)
    .then(() => updateEventBox())
    .catch((error) => logger.error("OGame's own eventbox never finished loading", error));
}

export { eventBox };
