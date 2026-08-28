import * as DOM from "../../util/dom.js";
import { createDOM } from "../../util/dom.js";
import { toFormattedNumber } from "../../util/numbers.js";
import * as Numbers from "../../util/numbers.js";
import * as popupUtil from "../../util/popup.js";
import Translator from "../../util/translate.js";
import OGBIData from "../../util/OGIData.js";
import OgamePageData from "../../util/OgamePageData.js";
import PlayerClass from "../../util/enum/playerClass.js";
import { getOption } from "../conf-options.js";
import { openPlanetList } from "../fleetdispatch/index.js";
import { tooltip } from "../../util/tooltip.js";
import * as needsUtil from "../../util/needs.js";
import Notifier from "../../util/Notifier.js";

/**
 * The small changes OGI makes to pages it does not otherwise own: the extra top-bar
 * links, the mobile navigation arrows, the quick planet list, the debris shortcut and
 * the message cleanup.
 *
 * Lifted out of `OGBeyondInfinity` in Phase 3 of refactoring.md. Not one module in spirit -
 * one file for the leftovers that were too small to justify their own, and each is
 * independent of the others.
 *
 * Compliance note (AGENTS.md 1.7): nothing here hides, moves or restyles the
 * advertisement bar, the shop, the merchant or the officer links.
 */

function topBarUtilities(context) {
  const bar = document.querySelector("#headerBarLinks");
  bar.append(
    DOM.createDOM("span").appendChild(
      DOM.createDOM(
        "a",
        { href: `https://board.${OgamePageData.gameLang}.ogame.gameforge.com/`, target: "_blank" },
        "Board"
      )
    ).parentElement,
    DOM.createDOM("span").appendChild(
      DOM.createDOM(
        "a",
        { href: `https://proxyforgame.com/${OgamePageData.playerLang}/ogame/calc/flight.php`, target: "_blank" },
        "Flight"
      )
    ).parentElement,
    DOM.createDOM("span").appendChild(
      DOM.createDOM("a", { href: `${getOption("simulator")}${OgamePageData.playerLang}`, target: "_blank" }, "Sim")
    ).parentElement,
    DOM.createDOM("span").appendChild(
      DOM.createDOM(
        "a",
        { href: `https://www.mmorpg-stat.eu/base.php?se=1&univers=_${context.universe}`, target: "_blank" },
        "Mmorpg"
      )
    ).parentElement,
    DOM.createDOM("span").appendChild(DOM.createDOM("a", { href: `https://ptre.chez.gg/`, target: "_blank" }, "PTRE"))
      .parentElement
  );

  const [timing] = performance.getEntriesByType("navigation");
  const ping = timing.responseEnd - timing.requestStart;
  let colorClass = "friendly";
  if (ping > 400 && ping < 800) colorClass = "neutral";
  if (ping > 800) colorClass = "hostile";
  bar.parentElement.appendChild(
    DOM.createDOM("span", { class: "ogk-ping" }, "ping").appendChild(
      DOM.createDOM("span", { class: `${colorClass}` }, ` ${Numbers.toFormattedNumber(ping / 1e3, 1)}s`)
    ).parentElement
  );
}

function uvlinks(context) {
  if (context.page !== "messages") {
    return;
  }

  document
    .querySelectorAll(".msg_actions message-footer-actions, .overlayDiv div[data-msg-id] .msg_actions")
    .forEach((elem) => {
      if (elem.querySelector(".ogk-trashsim, .ogk-ogotcha")) return;
      const keyNode = elem.querySelector(".icon_apikey");
      if (!keyNode) return;

      let key = keyNode.getAttribute("title") || keyNode.getAttribute("data-tooltip-title");
      key = key.split("'")[1];

      if (!key.startsWith("sr") && !key.startsWith("cr")) return;

      const isOverlay = !!elem.closest(".overlayDiv");
      let linkButton;
      // Spy rapport
      if (key.startsWith("sr")) {
        if (!isOverlay) {
          linkButton = DOM.createDOM("gradient-button", { sq30: null });
          const button = DOM.createDOM("button", { class: "custom_btn" });
          const buttonDiv = DOM.createDOM("div", {
            class: "ogk-trashsim tooltip",
            target: "_blank",
            title: Translator.translate(170),
          });

          button.appendChild(buttonDiv);
          linkButton.appendChild(button);
        } else {
          linkButton = elem.appendChild(
            DOM.createDOM("div", {
              class: "ogk-trashsim tooltip",
              target: "_blank",
              title: Translator.translate(170),
            })
          );
        }

        const apiTechData = {
          109: { level: OGBIData.json.technology[109] },
          110: { level: OGBIData.json.technology[110] },
          111: { level: OGBIData.json.technology[111] },
          115: { level: OGBIData.json.technology[115] },
          117: { level: OGBIData.json.technology[117] },
          118: { level: OGBIData.json.technology[118] },
          114: { level: OGBIData.json.technology[114] },
        };
        linkButton.addEventListener("click", () => {
          if (!OGBIData.json.options.simulator) {
            popupUtil.popup(
              null,
              DOM.createDOMSanitized("div", { class: "ogl-warning-dialog overmark" }, Translator.translate(169))
            );
          } else {
            const coords = context.current.coords.split(":");
            const json = {
              0: [
                {
                  class: context.playerClass,
                  research: apiTechData,
                  planet: {
                    galaxy: coords[0],
                    system: coords[1],
                    position: coords[2],
                  },
                },
              ],
            };
            const base64 = btoa(JSON.stringify(json));
            window.open(
              `${OGBIData.json.options.simulator}${context.univerviewLang}?SR_KEY=${key}#prefill=${base64}`,
              "_blank"
            );
          }
        });
      }
      // Fight report
      else if (key.startsWith("cr")) {
        if (!isOverlay) {
          linkButton = DOM.createDOM("gradient-button", { sq30: null });
          const button = DOM.createDOM("button", { class: "custom_btn" });
          const buttonDiv = DOM.createDOM("div", { class: "ogk-ogotcha tooltip", title: "Ogotcha" });

          button.appendChild(buttonDiv);
          linkButton.appendChild(button);
        } else {
          linkButton = elem.appendChild(DOM.createDOM("a", { class: "ogk-ogotcha tooltip", title: "Ogotcha" }));
        }

        linkButton.addEventListener("click", () =>
          window.open(
            `https://ogotcha.oplanet.eu/${context.univerviewLang}?CR_KEY=${key}`,
            "_blank",
            `location=yes,scrollbars=yes,status=yes,width=${screen.availWidth},height=${screen.availHeight}`
          )
        );
      }

      elem.appendChild(linkButton);
    });

  setTimeout(() => {
    uvlinks(context);
  }, 100);
}

function cleanupMessages(context) {
  for (let [id, result] of Object.entries(OGBIData.json.expeditions)) {
    if (!result.favorited && new Date() - new Date(result.date) > 5 * 24 * 60 * 60 * 1e3) {
      delete OGBIData.json.expeditions[id];
    }
  }
  for (let [id, result] of Object.entries(OGBIData.json.discoveries)) {
    if (!result.favorited && new Date() - new Date(result.date) > 5 * 24 * 60 * 60 * 1e3) {
      delete OGBIData.json.discoveries[id];
    }
  }
  for (let [id, result] of Object.entries(OGBIData.json.combats)) {
    if (!result.favorited && new Date() - new Date(result.timestamp) > 30 * 24 * 60 * 60 * 1e3) {
      delete OGBIData.json.combats[id];
    }
  }
  for (let [id, result] of Object.entries(OGBIData.json.harvests)) {
    if (new Date() - new Date(result.date) > 5 * 24 * 60 * 60 * 1e3) {
      delete OGBIData.json.harvests[id];
    }
  }
  OGBIData.Save();
}

function quickPlanetList(context) {
  if (context.page == "fleetdispatch" && fleetDispatcher) {
    if (!document.querySelector("#shortcuts .dropdown")) return;
    let btn = document.querySelector("#shortcuts span").appendChild(createDOM("btn", { class: "ogl-quickBtn" }, "-"));
    let container = createDOM("div", { class: "ogl-dialogContainer ogl-quickLinks" });
    container.addEventListener("click", (event) => {
      if (!event.target.href) {
        event.stopPropagation();
        event.preventDefault();
      }
    });
    btn.addEventListener("click", () => {
      let container = openPlanetList(context.fleetContext, (planet) => {
        fleetDispatcher.targetPlanet = planet;
        fleetDispatcher.refreshTarget();
        fleetDispatcher.updateTarget();
        document.querySelector(".ogl-dialogOverlay").classList.remove("ogl-active");
      });
      popupUtil.popup(false, container);
    });
  }
}

function checkDebris(context) {
  // TODO: reuse code?, hide debris image with css?, complete align style with regular debris?
  if (context.page === "galaxy") {
    FPSLoop(context, "checkDebris");
    document.querySelectorAll(".cellDebris").forEach((element) => {
      let debris = element.querySelector(".ListLinks");
      if (!debris || !debris.classList.contains("ogl-debrisReady")) {
        element.classList.remove("ogl-active");
      }
      if (debris && !debris.classList.contains("ogl-debrisReady")) {
        debris.classList.add("ogl-debrisReady");
        let total = 0;
        const frag = document.createDocumentFragment();
        let i = 0;
        debris.querySelectorAll(".debris-content").forEach((resources) => {
          const value = Numbers.fromFormattedNumber(resources.textContent.replace(/(\D*)/, ""));
          total += value;

          let classResources = ["ogl-metal", "ogl-crystal", "ogl-deut"];
          frag.appendChild(
            DOM.createDOM("div", { class: classResources[i++] }, Numbers.toFormattedNumber(value, null, true))
          );
        });
        element.querySelector(".microdebris").appendChild(frag);
        if (total > OGBIData.json.options.rvalLimit) {
          element.classList.add("ogl-active");
        }
      }
    });
    const debris16 = document.querySelector(".expeditionDebrisSlotBox #expeditionDebris");
    if (debris16 && !debris16.classList.contains("ogl-done")) {
      debris16.classList.add("ogl-done");
      const div = DOM.createDOM("div", { class: "cellDebris microdebris debris_1" });
      let total = 0;
      let i = 0;
      let classResources = ["ogl-metal", "ogl-crystal", "ogl-deut"];
      debris16.querySelectorAll(".ListLinks li.debris-content").forEach((element) => {
        const value = Numbers.fromFormattedNumber(element.textContent.replace(/(\D*)/, ""));
        total += value;
        div.appendChild(
          DOM.createDOM("div", { class: classResources[i++] }, Numbers.toFormattedNumber(value, null, true))
        );
      });
      debris16.replaceChildren(div);
      if (total > OGBIData.json.options.rvalLimit) {
        debris16.classList.add("ogl-active");
      }
    }
  }
}

function FPSLoop(context, callbackAsString, params) {
  setTimeout(() => {
    requestAnimationFrame(() => this[callbackAsString](params));
  }, 1e3 / 20);
}

function utilities(context) {
  document.querySelectorAll("#resources .tooltipHTML, #commandercomponent .tooltipHTML").forEach((e) => {
    e.classList.add("tooltipBottom");
  });
  if (context.page == "fleetdispatch") {
    // fleet speed selector in page fleet 2
    document.querySelector(".percentageBarWrapper").classList.add("ogl-hidden");
    const slider = DOM.createDOM("div", {
      class: "ogl-fleetSpeed",
      style: "margin-top: 10px; margin-left: 10px; margin-right: 10px; display: flex; grid-column: 1/3;",
    });
    if (context.playerClass == PlayerClass.WARRIOR) {
      slider.append(
        DOM.createDOM("div", { "data-step": "0.5", style: "width: 31px;" }, "5"),
        DOM.createDOM("div", { "data-step": "1", style: "width: 31px;" }, "10"),
        DOM.createDOM("div", { "data-step": "1.5", style: "width: 31px;" }, "15"),
        DOM.createDOM("div", { "data-step": "2", style: "width: 31px;" }, "20"),
        DOM.createDOM("div", { "data-step": "2.5", style: "width: 31px;" }, "25"),
        DOM.createDOM("div", { "data-step": "3", style: "width: 31px;" }, "30"),
        DOM.createDOM("div", { "data-step": "3.5", style: "width: 31px;" }, "35"),
        DOM.createDOM("div", { "data-step": "4", style: "width: 31px;" }, "40"),
        DOM.createDOM("div", { "data-step": "4.5", style: "width: 31px;" }, "45"),
        DOM.createDOM("div", { "data-step": "5", style: "width: 31px;" }, "50"),
        DOM.createDOM("div", { "data-step": "5.5", style: "width: 31px;" }, "55"),
        DOM.createDOM("div", { "data-step": "6", style: "width: 31px;" }, "60"),
        DOM.createDOM("div", { "data-step": "6.5", style: "width: 31px;" }, "65"),
        DOM.createDOM("div", { "data-step": "7", style: "width: 31px;" }, "70"),
        DOM.createDOM("div", { "data-step": "7.5", style: "width: 31px;" }, "75"),
        DOM.createDOM("div", { "data-step": "8", style: "width: 31px;" }, "80"),
        DOM.createDOM("div", { "data-step": "8.5", style: "width: 31px;" }, "85"),
        DOM.createDOM("div", { "data-step": "9", style: "width: 31px;" }, "90"),
        DOM.createDOM("div", { "data-step": "9.5", style: "width: 31px;" }, "95"),
        DOM.createDOM("div", { class: "ogl-active", "data-step": "10", style: "width: 31px;" }, "100")
      );
    } else {
      slider.append(
        DOM.createDOM("div", { "data-step": "1", style: "width: 62px;" }, "10"),
        DOM.createDOM("div", { "data-step": "2", style: "width: 62px;" }, "20"),
        DOM.createDOM("div", { "data-step": "3", style: "width: 62px;" }, "30"),
        DOM.createDOM("div", { "data-step": "4", style: "width: 62px;" }, "40"),
        DOM.createDOM("div", { "data-step": "5", style: "width: 62px;" }, "50"),
        DOM.createDOM("div", { "data-step": "6", style: "width: 62px;" }, "60"),
        DOM.createDOM("div", { "data-step": "7", style: "width: 62px;" }, "70"),
        DOM.createDOM("div", { "data-step": "8", style: "width: 62px;" }, "80"),
        DOM.createDOM("div", { "data-step": "9", style: "width: 62px;" }, "90"),
        DOM.createDOM("div", { class: "ogl-active", "data-step": "10", style: "width: 62px;" }, "100")
      );
    }
    document.querySelector('div[id="mission"]').appendChild(slider);

    $(".ogl-fleetSpeed div").on("click", (event) => {
      $(".ogl-fleetSpeed div").removeClass("ogl-active");
      fleetDispatcher.speedPercent = event.target.getAttribute("data-step");
      $(`.ogl-fleetSpeed div[data-step="${fleetDispatcher.speedPercent}"]`).addClass("ogl-active");
    });
    $(".ogl-fleetSpeed div").on("mouseover", (event) => {
      fleetDispatcher.speedPercent = event.target.getAttribute("data-step");
      fleetDispatcher.refresh();
    });
    $(".ogl-fleetSpeed div").on("mouseout", (event) => {
      fleetDispatcher.speedPercent = slider.querySelector(".ogl-active").getAttribute("data-step");
      fleetDispatcher.refresh();
    });

    const data = fleetDispatcher.fleetHelper.shipsData;
    for (const id in data) {
      const tooltipDiv = DOM.createDOM("div", { class: "ogl-fleetInfo" }, data[id].name);
      tooltipDiv.append(
        DOM.createDOM("hr"),
        DOM.createDOM("div", {}, Translator.translate(47)).appendChild(
          DOM.createDOM("span", {}, toFormattedNumber(data[id].baseCargoCapacity, 0))
        ).parentElement,
        DOM.createDOM("div", {}, Translator.translate(48)).appendChild(
          DOM.createDOM("span", {}, toFormattedNumber(data[id].speed, 0))
        ).parentElement,
        DOM.createDOM("div", {}, Translator.translate(49)).appendChild(
          DOM.createDOM("span", {}, toFormattedNumber(data[id].fuelConsumption, 0))
        ).parentElement
      );
      const ship = document.querySelector(`.technology[data-technology="${id}"]`);
      if (ship) {
        ship.addEventListener("ontouchstart" in document.documentElement ? "touchstart" : "mouseenter", () => {
          tooltip(ship, tooltipDiv, true);
        });
        ship._tippy.disable();
      }
    }
  }
  if (context.page == "movement") {
    const allRemainingFleets = Array.from(document.querySelectorAll(".fleetDetails"))
      .map((fleet) => {
        const fleetId = Number(fleet.getAttribute("id").replace("fleet", ""));
        const type = parseInt(fleet.getAttribute("data-mission-type"));
        const isBack = !fleet.querySelector(".reversal a");
        return [fleetId, type, isBack];
      })
      .filter(([fleetId, type, isBack]) => Notifier.IsFleetMissionNotifiable(type));

    Notifier.CleanObsoleteFleetsNotifications(allRemainingFleets);

    let lastFleetId = -1;
    let lastFleetBtn;
    document.querySelectorAll(".fleetDetails").forEach((fleet) => {
      let id = Number(fleet.getAttribute("id").replace("fleet", ""));
      if (id > lastFleetId && fleet.querySelector(".reversal a")) {
        lastFleetId = id;
        lastFleetBtn = fleet.querySelector(".reversal a");
      }

      // The game prints .absTime / .nextabsTime in the server timezone. When the OGI timezone
      // option is on the user wants their own local timezone, so re-render both from the epoch
      // attributes -- getFormatedDate() formats a unix timestamp in the browser's local timezone.
      // No timezoneDiff is added here on purpose: data-arrival-time / data-end-time are unix
      // timestamps and therefore already carry the correct instant. Adding the diff on top
      // double-corrects and pushes the display one offset too far (review of PR #485).
      if (OGBIData.json.options.timeZone) {
        const absTime = fleet.querySelector(".absTime");
        const nextAbsTime = fleet.querySelector(".nextabsTime");
        const openCloseDetails = fleet.querySelector(".openCloseDetails");

        if (absTime && openCloseDetails) {
          const arrivalTime = fleet.getAttribute("data-arrival-time") * 1e3;
          const endTime = openCloseDetails.getAttribute("data-end-time") * 1e3;

          if (nextAbsTime) {
            // Outgoing leg: .absTime is the next event, .nextabsTime the return
            absTime.textContent = getFormatedDate(endTime, "[G]:[i]:[s] ");
            nextAbsTime.textContent = getFormatedDate(arrivalTime, "[G]:[i]:[s] ");
          } else {
            // Return flight: only one time left to show
            absTime.textContent = getFormatedDate(arrivalTime, "[G]:[i]:[s] ");
          }
        }
      }

      // parseInt: Notifier.IsFleetMissionNotifiable / IsFleetReturnBasedMission compare against
      // numeric MissionType values, and the attribute is a string.
      let type = parseInt(fleet.getAttribute("data-mission-type"));
      let originCoords = fleet.querySelector(".originCoords").textContent;
      const isOriginMoon = !!fleet.querySelector(".originData .moon");
      OGBIData.empire.forEach((planet) => {
        if (planet.coordinates == originCoords) {
          fleet.querySelector(".timer").classList.add("friendly");
          fleet.querySelector(".nextTimer") && fleet.querySelector(".nextTimer").classList.add("friendly");
        }
      });
      fleet.appendChild(createDOM("a", { class: `ogl-mission-icon ogl-mission-${type}` }));
      let fleetInfo = fleet.querySelector(".fleetinfo");
      let values = fleetInfo ? fleetInfo.querySelectorAll("td.value") : [];
      let fleetCount = Array.from(values)
        .slice(0, context.hasLifeforms ? -4 : -3)
        .reduce((total, element) => total + Numbers.fromFormattedNumber(element.textContent), 0);
      // to get 1 ship in discoveries, as it does not have ".fleetinfo"
      fleetCount = Math.max(1, fleetCount);
      const destCoords = fleet.querySelector(".destinationCoords a").textContent;
      const isDestMoon = !!fleet.querySelector(".destinationData .moon");
      const reversal = fleet.querySelector(".reversal a");
      if (reversal) {
        reversal.addEventListener("click", () => {
          needsUtil.displayLocksByCoords(destCoords.slice(1, -1), isDestMoon);
        });
      }
      let details = fleet.appendChild(createDOM("div", { class: "ogk-fleet-detail" }));
      details.appendChild(
        createDOM(
          "div",
          { class: "ogk-ships-count" },
          toFormattedNumber(fleetCount, null, true) + " " + Translator.translate(64)
        )
      );
      const backButton = fleet.querySelector(".reversal a");
      let isBack = false;
      if (backButton) {
        let back = backButton.title || backButton.getAttribute("data-tooltip-title");
        let splitted = back.split("|")[1].replace("<br>", "/").replace(/:|\./g, "/").split("/");
        let backDate = {
          year: splitted[2],
          month: splitted[1],
          day: splitted[0],
          h: splitted[3],
          m: splitted[4],
          s: splitted[5],
        };

        // Unlike the .absTime attributes above, these components come from the reversal tooltip as
        // wall-clock text in the *server* timezone. new Date(y, m, d, ...) reads them as browser-local,
        // so the resulting instant is off by timezoneDiff whenever the two zones differ. With the OGI
        // timezone option on the user wants local time, so the diff has to be added back here.
        const timeZoneChangeReverse = OGBIData.json.options.timeZone ? OGBIData.json.timezoneDiff : 0;
        const baseTime =
          new Date(backDate.year, backDate.month - 1, backDate.day, backDate.h, backDate.m, backDate.s).getTime() +
          timeZoneChangeReverse * 1e3;

        let content = details.appendChild(createDOM("div", { class: "ogl-date" }));

        // The tooltip states when the fleet would be home if it reversed *now*. Every second spent
        // flying outbound adds one more second of flight back, so the reversal ETA moves 2s per 1s of
        // real time. Recomputed from wall-clock rather than incremented per tick, so a throttled
        // background tab (which drops setInterval firings) no longer makes the display drift behind.
        const realStart = Date.now();

        const updateTimer = () => {
          const virtualElapsed = (Date.now() - realStart) * 2;
          content.textContent = getFormatedDate(baseTime + virtualElapsed, "[d].[m].[y] - [G]:[i]:[s] ");
        };

        updateTimer();
        setInterval(updateTimer, 500);
      } else {
        isBack = true;
      }

      if (Notifier.IsFleetMissionNotifiable(type)) {
        const convertToDate = (timeString) => {
          const [datePart, timePart] = timeString.split(" ");
          const [dayPart, monthPart, yearPart] = datePart.split(".");
          const formatedDate = `${yearPart}-${monthPart}-${dayPart}`;
          return new Date(`${formatedDate}T${timePart}`);
        };

        let eventDate = convertToDate(fleet.querySelector(".timer").getAttribute("data-tooltip-title"));

        const notifyMeButton = fleet.appendChild(createDOM("button", { class: "notify-me-button" }));

        if (Notifier.IsFleetArrivalNotificationScheduled(id, isBack)) {
          notifyMeButton.classList.add("active");
        }

        notifyMeButton.addEventListener("click", () => {
          if (!Notifier.IsFleetArrivalNotificationScheduled(id, isBack)) {
            if (isBack)
              Notifier.ScheduleFleetArrivalNotification(id, originCoords, isOriginMoon, type, isBack, eventDate);
            else Notifier.ScheduleFleetArrivalNotification(id, destCoords, isDestMoon, type, isBack, eventDate);

            if (!isBack && fleet.querySelector(".nextTimer") && Notifier.IsFleetReturnBasedMission(type)) {
              //if fleet type is a return based like transport or harvest, then also preshot the return notification
              eventDate = convertToDate(fleet.querySelector(".nextTimer").getAttribute("data-tooltip-title"));
              Notifier.ScheduleFleetArrivalNotification(id, originCoords, isOriginMoon, type, true, eventDate);
            }

            if (!notifyMeButton.classList.contains("active")) notifyMeButton.classList.add("active");
          } else {
            Notifier.CancelFleetArrivalScheduledNotification(id, isBack);

            if (!isBack && Notifier.IsFleetReturnBasedMission(type)) {
              //if fleet type is a return based like transport or harvest, then cancel also the return notification
              Notifier.CancelFleetArrivalScheduledNotification(id, true);
            }
            // remove active class from button
            if (notifyMeButton.classList.contains("active")) notifyMeButton.classList.remove("active");
          }
        });

        if (backButton) {
          backButton.addEventListener("click", () => {
            Notifier.CancelFleetArrivalScheduledNotification(id, isBack);
            if (!isBack) {
              // if fleet type is a return based like transport or harvest, then cancel also the return notification
              Notifier.CancelFleetArrivalScheduledNotification(id, true);
            }
          });
        }
      }
    });
    if (lastFleetBtn) {
      lastFleetBtn.style.filter = "hue-rotate(180deg) saturate(150%)";
      const backLast = DOM.createDOM("span", { class: "reload ogl-backLast" });
      const backLastIcon = DOM.createDOM("a", { class: "dark_highlight_tablet" });
      backLastIcon.append(
        DOM.createDOM("span", { class: "icon icon_link" }),
        DOM.createDOM("span", {}, " " + Translator.translate(172))
      );
      backLast.appendChild(backLastIcon);
      document.querySelector(".fleetStatus").appendChild(backLast);
      backLast.addEventListener("click", () => {
        lastFleetBtn.click();
      });
    }
  }
}

function navigationArrows(context) {
  if (context.isMobile && OGBIData.json.options.navigationArrows) {
    let navPanel = document.querySelector("#links").appendChild(createDOM("div", { class: "ogk-navPanel" }));
    let left = navPanel.appendChild(createDOM("div", { class: "galaxy_icons ogk-nav left" }));
    left.addEventListener("click", () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", ctrlKey: "true" }))
    );
    let right = navPanel.appendChild(createDOM("div", { class: "galaxy_icons ogk-nav right" }));
    right.addEventListener("click", () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", ctrlKey: "true" }))
    );
    let up = navPanel.appendChild(createDOM("div", { class: "galaxy_icons ogk-nav up" }));
    up.addEventListener("click", () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", ctrlKey: "true" }))
    );
    let down = navPanel.appendChild(createDOM("div", { class: "galaxy_icons ogk-nav down" }));
    down.addEventListener("click", () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", ctrlKey: "true" }))
    );
  }
}

export { utilities, uvlinks, topBarUtilities, navigationArrows, quickPlanetList, checkDebris, cleanupMessages };
