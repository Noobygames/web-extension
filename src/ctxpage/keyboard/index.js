import { toFormattedNumber, fromFormattedNumber } from "../../util/numbers.js";
import OGBIData from "../../util/OGIData.js";
import ogiMode from "../../util/enum/ogiMode.js";
import debounce from "../../util/debounce.js";

/**
 * The keyboard shortcuts: planet and moon navigation, the resource fillers, the
 * dispatch actions.
 *
 * Lifted out of `OGBeyondInfinity` in Phase 3 of refactoring.md. Every shortcut still maps
 * to one action - AGENTS.md 1.1 requires that, and nothing here batches or defers.
 */

function keyboardActions(context) {
  let closeDialog = () => {
    let overlay = document.querySelector(".ogl-dialogOverlay.ogl-active");
    let btn =
      document.querySelector(".ogl-dialog .btn_blue.save") ||
      document.querySelector(".ogl-dialog .btn_blue") ||
      document.querySelector(".ogl-dialog .close-tooltip");
    if (overlay) {
      btn.click();
      return true;
    }
    return false;
  };
  const avoidIn = ["chat_box_textarea", "markItUpEditor", "textBox", "textInput"];
  document.addEventListener("keydown", (event) => {
    if (avoidIn.some((avoidInClass) => document.activeElement.classList.contains(avoidInClass))) return;
    if (event.key == "Escape") {
      if (OGBIData.json.welcome) return;
      closeDialog();
    }
    if (context.page == "galaxy") {
      if (document.activeElement.getAttribute("type") == "search") {
        return;
      }
      if (event.key == " " || event.key == "Enter") {
        if (document.querySelector(".refreshPhalanxLink")) {
          document.querySelector(".refreshPhalanxLink").click();
        } else {
          submitForm();
        }
      }
    }
    if (!$(document.activeElement).is("input") && (event.ctrlKey || event.metaKey) && event.key == "ArrowDown") {
      let planetList = document.querySelectorAll('[id^="planet-"]');
      let active = 0;
      let isMoon = 0;
      let idList = [];
      planetList.forEach((planet, index) => {
        idList.push([
          planet.id.split("-")[1],
          planet.querySelector(".moonlink") ? planet.querySelector(".moonlink").href.split("cp=")[1] : null,
        ]);
        if (planet.classList.contains("hightlightMoon")) {
          isMoon = 1;
          active = index;
        }
        if (planet.classList.contains("hightlightPlanet")) {
          active = index;
        }
      });

      let nextIndex = active + 1 < idList.length ? active + 1 : 0;
      let nextId = idList[nextIndex][isMoon];
      if (isMoon) {
        if (document.querySelectorAll(".moonlink").length == 1) return;
        while (!idList[nextIndex][isMoon]) {
          nextIndex = nextIndex + 1 < idList.length ? nextIndex + 1 : 0;
        }
      }
      let url = new URL(window.location.href);
      url.searchParams.delete("cp");
      url.searchParams.append("cp", nextId);

      event.preventDefault();
      event.stopPropagation();
      window.location.href = url;
    }
    if (!$(event.target).is("input") && (event.ctrlKey || event.metaKey) && event.key == "ArrowUp") {
      let planetList = document.querySelectorAll('[id^="planet-"]');
      let active = 0;
      let isMoon = 0;
      let idList = [];
      planetList.forEach((planet, index) => {
        idList.push([
          planet.id.split("-")[1],
          planet.querySelector(".moonlink") ? planet.querySelector(".moonlink").href.split("cp=")[1] : null,
        ]);
        if (planet.classList.contains("hightlightMoon")) {
          isMoon = 1;
          active = index;
        }
        if (planet.classList.contains("hightlightPlanet")) {
          active = index;
        }
      });

      let nextIndex = active > 0 ? active - 1 : idList.length - 1;
      let nextId = idList[nextIndex][isMoon];
      if (isMoon) {
        if (document.querySelectorAll(".moonlink").length == 1) return;
        while (!idList[nextIndex][isMoon]) {
          nextIndex = nextIndex > 0 ? nextIndex - 1 : idList.length - 1;
        }
      }
      let url = new URL(window.location.href);
      url.searchParams.delete("cp");
      url.searchParams.append("cp", nextId);
      event.preventDefault();
      event.stopPropagation();
      window.location.href = url;
    }
    if ((event.ctrlKey || event.metaKey) && event.key == "ArrowRight") {
      let planetList = document.querySelectorAll('[id^="planet-"]');
      let active = 0;
      let isMoon = 0;
      let idList = [];
      planetList.forEach((planet, index) => {
        idList.push([
          planet.id.split("-")[1],
          planet.querySelector(".moonlink") ? planet.querySelector(".moonlink").href.split("cp=")[1] : null,
        ]);
        if (planet.classList.contains("hightlightMoon")) {
          isMoon = 1;
          active = index;
        }
        if (planet.classList.contains("hightlightPlanet")) {
          active = index;
        }
      });
      if (isMoon || !idList[active][1]) return;
      let nextId = idList[active][1];

      let url = new URL(window.location.href);
      url.searchParams.delete("cp");
      url.searchParams.append("cp", nextId);

      event.preventDefault();
      event.stopPropagation();
      window.location.href = url;
    }
    if ((event.ctrlKey || event.metaKey) && event.key == "ArrowLeft") {
      let planetList = document.querySelectorAll('[id^="planet-"]');
      let active = 0;
      let isMoon = 0;
      let idList = [];
      planetList.forEach((planet, index) => {
        idList.push([
          planet.id.split("-")[1],
          planet.querySelector(".moonlink") ? planet.querySelector(".moonlink").href.split("cp=")[1] : null,
        ]);
        if (planet.classList.contains("hightlightMoon")) {
          isMoon = 1;
          active = index;
        }
        if (planet.classList.contains("hightlightPlanet")) {
          active = index;
        }
      });
      if (!isMoon) return;
      let nextId = idList[active][0];

      let url = new URL(window.location.href);
      url.searchParams.delete("cp");
      url.searchParams.append("cp", nextId);

      event.preventDefault();
      event.stopPropagation();
      window.location.href = url;
    }
  });
  let actionSkip = () => {
    // KNOWN BUG: `keyboardActionSkip` has no writer any more. Its only one was
    // `autoHarvest()`, which had no caller at all and was removed in Phase 3 of
    // refactoring.md. Reaching this branch - it needs `oglMode=autoharvest` or
    // `oglMode=5` in the URL, which only an old saved link still produces -
    // navigates to the string "undefined". Nothing changed here when the dead
    // method went; the branch was already unreachable in any useful sense.
    // Fixing it means deciding whether the auto-harvest mode is coming back.
    if (context.mode == ogiMode.AUTOHARVEST || context.mode == ogiMode.UNKNOWN_NB_5) {
      window.location.href = context.keyboardActionSkip;
      return;
    }
    let nextElement = context.current.planet.nextElementSibling || document.querySelectorAll(".smallplanet")[0];
    if (context.current.isMoon && !nextElement.querySelector(".moonlink")) {
      do {
        nextElement = nextElement.nextElementSibling || document.querySelectorAll(".smallplanet")[0];
      } while (!nextElement.querySelector(".moonlink"));
    }
    let cp;
    if (context.current.isMoon) {
      cp = new URL(nextElement.querySelector(".moonlink").href).searchParams.get("cp");
    } else {
      cp = new URL(nextElement.querySelector(".planetlink").href).searchParams.get("cp");
    }
    let url = new URL(window.location.href);
    url.searchParams.delete("cp");
    url.searchParams.set("cp", cp);
    window.location.href = url.href;
  };
  if (context.page == "fleetdispatch") {
    document.addEventListener("keydown", (event) => {
      if (avoidIn.some((avoidInClass) => document.activeElement.classList.contains(avoidInClass))) return;
      if (fleetDispatcher.currentPage == "fleet1") {
        if (document.querySelector("#fleetTemplatesEdit")) {
          if (document.querySelector("#fleetTemplatesEdit").classList.contains("overlayDiv")) return;
        }
        const input = document.querySelector("#systemInput");
        if (document.activeElement == input || document.activeElement.tagName == "BODY") {
          if (!fleetDispatcher.loading) {
            if (event.key == "ArrowUp") {
              input.value = Number(input.value) + 1;
              fleetDispatcher.updateTarget();
              fleetDispatcher.fetchTargetPlayerData();
            }
            if (event.key == "ArrowDown") {
              input.value = Number(input.value) - 1;
              fleetDispatcher.updateTarget();
              fleetDispatcher.fetchTargetPlayerData();
            }
          }
        }
        if (document.activeElement.tagName != "INPUT" && !!document.querySelector("#continueToFleet2")) {
          if (event.ctrlKey && ["1", "2", "3", "4", "5"].includes(event.key)) {
            //prevent default action from browser
            event.preventDefault();
            const customMissionButton = document.querySelector(`.ogk-customMission.ogk-customMission-${event.key}`);
            if (customMissionButton) customMissionButton.click();
          }
          if (event.key.toUpperCase() == "E") {
            document.querySelector(".ogl-expedition").click();
            document.querySelector("#continueToFleet2").click();
          }
          if (event.key.toUpperCase() == "C") {
            document.querySelector(".ogl-collect").click();
            document.querySelector("#continueToFleet2").click();
          }
          if (event.key.toUpperCase() == "N") document.querySelector("#resetall").click();
          if (event.key.toUpperCase() == "A") document.querySelector("#sendall").click();
          if (event.key.toUpperCase() == "M") document.querySelector("span.select-most").click();
        }
      } else if (fleetDispatcher.currentPage == "fleet2") {
        if (event.key.toUpperCase() == "A") document.querySelector("#loadAllResources img").click();
        if (event.key.toUpperCase() == "M" && !event.shiftKey)
          document.querySelector("#loadAllResources .select-most").click();
        if (event.key.toUpperCase() == "N") document.querySelector("#loadAllResources .send_none").click();
        if (event.key.toUpperCase() == "P" && event.shiftKey) document.querySelector("#pbutton").click();
        if (event.key.toUpperCase() == "M" && event.shiftKey) document.querySelector("#mbutton").click();
        if (event.key.toUpperCase() == "D" && event.shiftKey) document.querySelector("#dbutton").click();
        if (event.key.toUpperCase() == "X" && document.querySelector("#button1.on"))
          document.querySelector("#missionButton1").click(); // attack
        if (event.key.toUpperCase() == "X" && event.altKey && document.querySelector("#button2.on"))
          document.querySelector("#missionButton2").click(); // ACS attack
        if (event.key.toUpperCase() == "T" && document.querySelector("#button3.on"))
          document.querySelector("#missionButton3").click(); // transport
        if (event.key.toUpperCase() == "D" && document.querySelector("#button4.on"))
          document.querySelector("#missionButton4").click(); // deployment
        if (event.key.toUpperCase() == "H" && document.querySelector("#button5.on"))
          document.querySelector("#missionButton5").click(); // hold (ACS defend)
        if (event.key.toUpperCase() == "S" && document.querySelector("#button6.on"))
          document.querySelector("#missionButton6").click(); // espionage
        if (event.key.toUpperCase() == "C" && document.querySelector("#button7.on"))
          document.querySelector("#missionButton7").click(); // colonisation
        if (event.key.toUpperCase() == "R" && document.querySelector("#button8.on"))
          document.querySelector("#missionButton8").click(); // recycle debris field
        if (event.key.toUpperCase() == "X" && event.ctrlKey && document.querySelector("#button9.on"))
          document.querySelector("#missionButton9").click(); // moon destruction
        if (event.key.toUpperCase() == "E" && document.querySelector("#button15.on"))
          document.querySelector("#missionButton15").click(); // expedition
      }
    });

    // TODO: make throttle class for reuse it?
    let throttleTime = 0;
    const throttle = (throttleFn, intervalInMs) => {
      if (Date.now() > throttleTime + intervalInMs) {
        throttleTime = Date.now();
        throttleFn();
      }
    };

    document.addEventListener("keydown", (event) => {
      if (avoidIn.some((avoidInClass) => document.activeElement.classList.contains(avoidInClass))) return;
      if (event.key == "Enter") {
        event.preventDefault();
        event.stopPropagation();
        throttle(() => {
          if (fleetDispatcher.currentPage == "fleet1") {
            document.querySelector("#continueToFleet2").click();
          } else if (fleetDispatcher.currentPage == "fleet2") {
            fleetDispatcher.speedPercent = document
              .querySelector("div#mission .ogl-fleetSpeed")
              .querySelector(".ogl-active")
              .getAttribute("data-step");
            document.querySelector("#sendFleet").click();
          }
        }, 650);
      }
    });
  }
}

function listenKeyboard(context) {
  if (context.page == "fleetdispatch") {
    document.querySelectorAll('form[name="shipsChosen"] input').forEach((i) => i.classList.add("ogl-formatInput"));
  }
  let listener = context.isMobile ? "input" : "keyup";
  window.addEventListener(listener, (e) => {
    const element = document.activeElement;
    if (!element) return;

    /**
     * Make sure that the debounce from fleetDispatcher.updateMissions
     * does not conflict with us.
     */
    if (window.fleetDispatcher) {
      fleetDispatcher.NO_UPDATE_MISSIONS = true;
    }

    // Bind arrow up and down to add or subscract for ogl-formatInput
    if (
      element.classList &&
      (element.classList.contains("ogl-formatInput") || element.classList.contains("checkThousandSeparator"))
    ) {
      if (context.isMobile) {
        if (e.data === "K" || e.data === "k" || e.data === "0k") {
          element.value = toFormattedNumber(1000);
        } else {
          let value = fromFormattedNumber(element.value.replace("k", "000")) || 0;
          element.value = toFormattedNumber(value);
        }
      } else {
        if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key.toUpperCase() === "K") {
          const value = fromFormattedNumber(element.value.replace("k", "")) || 0;
          const add = e.ctrlKey ? 100 : e.shiftKey ? 10 : 1;
          let factor;
          if (e.key === "ArrowUp") element.value = toFormattedNumber(value + add);
          if (e.key === "ArrowDown") element.value = toFormattedNumber(Math.max(value - add, 0));
          if (e.key.toUpperCase() === "K") {
            factor = value > 0 && element.classList.contains("checkThousandSeparator") ? 1 : 1000;
            element.value = toFormattedNumber((value || 1) * factor);
          }
        }
      }
    }
    debounce(() => {
      if (window.fleetDispatcher) {
        fleetDispatcher.NO_UPDATE_MISSIONS = false;
      }
    }, 500);
  });
}

export { keyboardActions, listenKeyboard };
