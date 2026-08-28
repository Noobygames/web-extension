import { createDOM } from "../../util/dom.js";
import Translator from "../../util/translate.js";
import OGBIData from "../../util/OGIData.js";
import { updateresourceDetail } from "../empireOverview/index.js";
import { updateEmpireData } from "../empire/index.js";

/**
 * The fleet-movement panel OGame drops in over the top bar, with OGI's own totals.
 *
 * Lifted out of `OGBeyondInfinity` in Phase 3 of refactoring.md.
 */

function eventBox(context) {
  let interval = setInterval(() => {
    if (document.querySelector("#eventboxLoading").style.display == "none") {
      clearInterval(interval);
      const flying = flying();
      if (JSON.stringify(OGBIData.json.flying.ids) != JSON.stringify(flying.ids)) {
        let gone = [];
        OGBIData.json.flying.ids &&
          OGBIData.json.flying.ids.forEach((mov) => {
            let found = false;
            flying.ids.forEach((oldMov) => {
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
          flying.ids.forEach((mov) => {
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
                  OGBIData.Save();
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
                OGBIData.Save();
              }
            });
          }
        });
        OGBIData.json.needsUpdate = update;
        OGBIData.Save();
        if (update) {
          updateEmpireData(context.empireContext);
        }
        OGBIData.json.needSync = true;
      }
      OGBIData.json.flying = flying;
      OGBIData.Save();
      updateresourceDetail(context.overviewContext);
    }
  }, 10);
  let addOptions = () => {
    let header = document.querySelector("#eventHeader");
    let div = header.appendChild(createDOM("div"));
    div.appendChild(createDOM("span", {}, "Keep"));
    let keep = div.appendChild(createDOM("input", { type: "checkbox" }));
    if (OGBIData.json.options.eventBoxKeep) keep.checked = true;
    div.appendChild(createDOM("span", {}, Translator.translate(41)));
    let exps = div.appendChild(createDOM("input", { type: "checkbox" }));
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
  let addHover = () => {
    document.querySelectorAll("#eventContent .eventFleet").forEach((line) => {
      let previous = Number(line.getAttribute("id").replace("eventRow-", "")) - 1;
      let next = Number(line.getAttribute("id").replace("eventRow-", "")) + 1;
      let previousNode = document.querySelector("#eventRow-" + previous);
      let nextNode = document.querySelector("#eventRow-" + next);
      let opacity = line.style.opacity;
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
        if (previousNode) previousNode.style.setProperty("background-color", "inherit");
        if (nextNode) {
          nextNode.style.setProperty("background-color", "inherit");
          nextNode.style.setProperty("opacity", "0.5");
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
    let refreshBtn = createDOM("a", { class: "icon icon_reload" });
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
  let inter = setInterval(() => {
    if (toggleEvents.loaded) {
      clearInterval(inter);
      updateEventBox();
    }
  }, 100);
}

export { eventBox };
