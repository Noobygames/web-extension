import * as DOM from "../../ui/dom.js";
import { createDOM, createSVG } from "../../ui/dom.js";
import { toFormattedNumber, fromFormattedNumber } from "../../format/numbers.js";
import * as popupUtil from "../../ui/popup.js";
import Translator from "../../format/i18n/translate.js";
import OGBIData from "../../store/OGBIData.js";
import OgamePageData from "../../ogame/pageData.js";
import VERSION from "../../platform/version.js";
import { getOption, setOption } from "../conf-options.js";
import { applyWideLayout, normalizeZoomFactor } from "../wide-layout.js";
import { keepOnPlanetDialog } from "../fleetdispatch/keepOnPlanet.js";
import { getLocalStorageSize, purgeLocalStorage } from "../../store/usage.js";
import { pageContextRequest } from "../../platform/bridge.js";

/**
 * The settings dialog, the first-run welcome popup, and the notice explaining why the
 * direct-probe icons are inert.
 *
 * Lifted out of `OGBeyondInfinity` in Phase 3 of refactoring.md. `this.json` became
 * `OGBIData.json`; the two page facts the dialog reads - whether the commander is
 * active and which universe this is - arrive as an explicit `context`.
 *
 * `probingWarning()` used to live here too. It moved to `./probingWarning.js` in
 * Phase 5: its only caller is `galaxy/renderPlanet.js`, which is core code, so a
 * 26-line popup was keeping this entire file in the boot bundle.
 *
 * `getLocalStorageSize()` and `purgeLocalStorage()` came along because the storage row
 * of the dialog is their only caller.
 */

function welcome(context) {
  let container = createDOM("div", { class: "ogk-welcome" });
  let head = container.appendChild(createDOM("div", { class: "ogk-header" }));
  head.appendChild(createDOM("h1", {}, "Welcome "));
  head.appendChild(createDOM("div", { class: "ogk-logo" }));
  container.appendChild(createDOM("p", {}, "Ogame Beyond Infinity will hopefully bring some new joy playing OGame!"));
  container.appendChild(
    DOM.createDOMSanitized(
      "p",
      {},
      // Two claims, both accurate on purpose (AGENTS.md 5): the toleration in the linked
      // thread was granted to the upstream extension and does not transfer to a fork by
      // itself, so it is named as upstream's. Ours is stated as what it is - a goal.
      "<strong class='friendly'>Note</strong>: Ogame Beyond Infinity is a fork of Ogame Infinity, which is officially tolerated by Ogame (<a href='https://board.en.ogame.gameforge.com/index.php?thread/819842-ogame-infinity-extension/' target='_blank'>Origin board</a>). We are working towards our own toleration: every feature here is built against the Origin team's rules, so we are confident of getting there."
    )
  );
  if (!context.commander) {
    container.appendChild(
      DOM.createDOMSanitized(
        "p",
        { class: "neutral" },
        "<strong>Reminder: </strong>The commander officier will bring improved empire features (seriously, try it :)."
      )
    );
  }
  container.appendChild(
    DOM.createDOMSanitized(
      "p",
      {},
      "If you see a bug or have a feature request please report to discord 🙏 <a href='https://discord.gg/Z7MDHmk' target='_blank'>Link</a> also in the setting page. <span class='overmark'> Be advised that using multiple addons/script might generate conflicts. </span>"
    )
  );
  let shortcutsDiv = container.appendChild(
    createDOM(
      "p",
      {
        class: "ogk-tips friendly",
        style: "display: flex;justify-content: space-between;font-size: revert",
      },
      "Oh, and here are some quick tips: "
    )
  );
  let ctrl = shortcutsDiv.appendChild(
    createDOM(
      "div",
      {
        style: "width: auto;display: flex;margin-right: 60px;color: white;margin-top: 5px;",
      },
      "Shortcuts with"
    )
  );
  if (!context.commander && "fr".indexOf(OgamePageData.gameLang) == -1) {
    ctrl.style.top = "272px";
  } else if (!context.commander) {
    ctrl.style.top = "240px";
  } else if ("fr".indexOf(OgamePageData.gameLang) == -1) {
    ctrl.style.top = "244px";
  }
  let keyHelp = container.appendChild(createDOM("div", { class: "ogk-keyhelp" }));
  let ctrlKey = DOM.createDOMSanitized(
    "div",
    {
      style: "display: flex; width: 80px;margin-left: 10px;margin-top: -2px;",
    },
    '\n      <div style="margin-right: 7px" class="ogl-keyboard">cmd/ctrl</div>\n      +\n      <div style="margin-left: 5px" class="ogl-keyboard">?</div>\n    '
  );
  ctrl.appendChild(ctrlKey);
  keyHelp.appendChild(createDOM("div", { class: "ogl-option ogl-overview-icon" }));
  keyHelp.appendChild(createDOM("div", {}, "Open the resources panel"));
  keyHelp.appendChild(createDOM("div"));
  keyHelp.appendChild(createDOM("div", { class: "ogl-option ogl-search-icon" }));
  keyHelp.appendChild(createDOM("div", {}, "Open the player search"));
  keyHelp.appendChild(createDOM("div"));
  keyHelp.appendChild(createDOM("div", { class: "ogl-option ogl-statistics-icon" }));
  keyHelp.appendChild(createDOM("div", {}, "Open the statistics panel"));
  keyHelp.appendChild(createDOM("div"));
  keyHelp.appendChild(createDOM("div", { class: "ogl-option ogl-empire-icon" }));
  keyHelp.appendChild(createDOM("div", {}, "Open the empire view"));
  keyHelp.appendChild(createDOM("div"));
  keyHelp.appendChild(createDOM("div", { class: "ogl-option ogl-targetIcon" }));
  keyHelp.appendChild(createDOM("div", {}, "Open the target list"));
  keyHelp.appendChild(createDOM("div"));
  keyHelp.appendChild(createDOM("div", { class: "ogl-option ogl-syncOption" }));
  keyHelp.appendChild(createDOM("div", {}, "Settings"));
  container.appendChild(
    DOM.createDOMSanitized(
      "p",
      { class: "ogk-thanks" },
      "Finally, let's thanks <strong>Mr NullNan</strong> for the initial work!"
    )
  );
  const heart = createSVG("svg", { viewBox: "0 0 24 24" });
  heart.appendChild(
    createSVG("path", {
      style: "fill:#C80909",
      d:
        "M12 4.435c-1.989-5.399-12-4.597-12 3.568 0 4.068 3.06 9.481 12 14.997 8.94-5.516 12-10.929 12-14.997 0" +
        "-8.118-10-8.999-12-3.568z",
    })
  );
  container.appendChild(
    createDOM("div", { class: "ogk-love" }, "Made isolated with ")
      .appendChild(heart)
      .parentElement.appendChild(document.createTextNode("in Paris")).parentElement
  );
  popupUtil.popup(null, container);
}

function settings(context) {
  function download(content, fileName) {
    var a = document.createElement("a");
    var file = new Blob([JSON.stringify(content)], { type: "text/plain" });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
  }

  let size = getLocalStorageSize();
  let container = createDOM("div", { class: "ogl-dialogContainer ogl-settings" });
  // Everything except the save footer lives in here - it is the part that scrolls,
  // so the save button (appended straight to `container`, below) stays visible
  // without having to scroll all the way down a long options list to reach it.
  let scrollBody = container.appendChild(createDOM("div", { class: "ogk-settings-body" }));
  let dataDiv = scrollBody.appendChild(createDOM("div"));
  let ogameInfinity = dataDiv.appendChild(createDOM("div"));
  ogameInfinity.appendChild(createDOM("div", { class: "ogk-logo" }, `v${VERSION}`));
  ogameInfinity.appendChild(
    DOM.createDOMSanitized(
      "div",
      { class: "ogi-checkbox" },
      `<strong class="undermark">${Translator.translate(
        133
      )}</strong><a target="_blank" href="https://discord.gg/9aMdQgk">Discord</span>`
    )
  );
  dataDiv.appendChild(createDOM("hr"));
  let universe = dataDiv.appendChild(createDOM("div"));
  let universeSettingsTooltip = "";
  for (let [key, value] of Object.entries(OGBIData.json.universeSettingsTooltip)) {
    universeSettingsTooltip += `<span>${key}: ${value}</span><br>`;
  }
  universe.appendChild(createDOM("h1", { class: "tooltip", title: universeSettingsTooltip }, Translator.translate(9)));
  let srvDatas = universe.appendChild(
    DOM.createDOMSanitized(
      "span",
      {
        style: "display: flex;justify-content: space-between; align-items: center;",
      },
      `${Translator.translate(10, "text", false)}: ` +
        toFormattedNumber(OGBIData.json.topScore, null, true) +
        `<br/>${Translator.translate(11, "text", false)}: ` +
        toFormattedNumber(OGBIData.json.speed) +
        `<br/>${Translator.translate(136, "text", false)}: ` +
        toFormattedNumber(OGBIData.json.speedResearch) +
        `<br/>${Translator.translate(12, "text", false)}: ` +
        toFormattedNumber(OGBIData.json.speedFleetWar) +
        `<br/>${Translator.translate(13, "text", false)}: ` +
        toFormattedNumber(OGBIData.json.speedFleetPeaceful) +
        `<br/>${Translator.translate(14, "text", false)}: ` +
        toFormattedNumber(OGBIData.json.speedFleetHolding)
    )
  );
  let srvDatasBtn = createDOM("button", { class: "btn_blue update" }, Translator.translate(23));
  srvDatas.appendChild(srvDatasBtn);
  srvDatasBtn.addEventListener("click", async () => await context.updateData());
  dataDiv.appendChild(createDOM("hr"));
  let featureSettings = dataDiv.appendChild(createDOM("div", { style: "display: grid;" }));
  featureSettings.appendChild(createDOM("h1", {}, Translator.translate(103)));
  featureSettings.appendChild(createDOM("h2", {}, Translator.translate(276)));
  if (OGBIData.json.timezoneDiff != 0) {
    let spanZone = featureSettings.appendChild(
      createDOM(
        "span",
        { style: "display: flex;justify-content: space-between; align-items: center;" },
        Translator.translate(36)
      )
    );
    let timeZoneCheck = spanZone.appendChild(createDOM("input", { type: "checkbox" }));
    timeZoneCheck.addEventListener("change", () => {
      OGBIData.json.options.timeZone = timeZoneCheck.checked;
      OGBIData.Save();
    });
    if (OGBIData.json.options.timeZone) {
      timeZoneCheck.checked = true;
    }
  }
  let optiondiv = featureSettings.appendChild(
    createDOM(
      "span",
      {
        class: "tooltip",
        title: Translator.translate(279),
        style: "display: flex;justify-content: space-between; align-items: center;",
      },
      Translator.translate(187)
    )
  );

  const alertHostileIncomingMode = DOM.createDOM("select", { class: "ogl-selectInput ogl-w-125 tooltip" });
  alertHostileIncomingMode.append(
    DOM.createDOM("option", { value: "0" }, Translator.translate(184)),
    DOM.createDOM("option", { value: "1" }, Translator.translate(185)),
    DOM.createDOM("option", { value: "2" }, Translator.translate(186))
  );
  alertHostileIncomingMode.value = getOption("alertHostileIncomingMode");
  optiondiv.appendChild(alertHostileIncomingMode);

  let importExportReminderMode;
  //Disabled for V13
  optiondiv = featureSettings.appendChild(
    createDOM(
      "span",
      {
        class: "tooltip",
        title: Translator.translate(280),
        style: "display: flex;justify-content: space-between; align-items: center;",
      },
      Translator.translate(222)
    )
  );
  importExportReminderMode = DOM.createDOM("select", { class: "ogl-selectInput ogl-w-125 tooltip" });
  importExportReminderMode.append(
    DOM.createDOM("option", { value: "0" }, Translator.translate(212)),
    DOM.createDOM("option", { value: "1" }, Translator.translate(223)),
    DOM.createDOM("option", { value: "2" }, Translator.translate(224))
  );
  importExportReminderMode.value = getOption("importExportReminderMode");
  optiondiv.appendChild(importExportReminderMode);

  optiondiv = featureSettings.appendChild(
    createDOM(
      "span",
      {
        class: "tooltip",
        title: Translator.translate(281),
        style: "display: flex;justify-content: space-between; align-items: center;",
      },
      Translator.translate(33)
    )
  );
  let timerCheck = optiondiv.appendChild(createDOM("input", { type: "checkbox" }));
  timerCheck.addEventListener("change", () => {
    OGBIData.json.options.activitytimers = timerCheck.checked;
    OGBIData.Save();
  });
  if (OGBIData.json.options.activitytimers) {
    timerCheck.checked = true;
  }

  optiondiv = featureSettings.appendChild(
    createDOM(
      "span",
      {
        class: "tooltip",
        title: Translator.translate(376),
        style: "display: flex;justify-content: space-between; align-items: center;",
      },
      Translator.translate(375)
    )
  );
  let bashingCounterCheck = optiondiv.appendChild(createDOM("input", { type: "checkbox" }));
  bashingCounterCheck.addEventListener("change", () => {
    OGBIData.json.options.bashingCounter = bashingCounterCheck.checked;
    OGBIData.Save();
  });
  if (OGBIData.json.options.bashingCounter) {
    bashingCounterCheck.checked = true;
  }

  optiondiv = featureSettings.appendChild(
    createDOM(
      "span",
      {
        class: "tooltip",
        title: Translator.translate(274),
        style: "display: flex;justify-content: space-between; align-items: center;",
      },
      Translator.translate(34)
    )
  );
  let lessAggressiveEmpireAutomaticUpdateBox = optiondiv.appendChild(createDOM("input", { type: "checkbox" }));
  lessAggressiveEmpireAutomaticUpdateBox.addEventListener("change", () => {
    OGBIData.json.options.lessAggressiveEmpireAutomaticUpdate = lessAggressiveEmpireAutomaticUpdateBox.checked;
    OGBIData.Save();
  });
  if (OGBIData.json.options.lessAggressiveEmpireAutomaticUpdate) {
    lessAggressiveEmpireAutomaticUpdateBox.checked = true;
  }
  featureSettings.appendChild(createDOM("h2", {}, Translator.translate(275)));
  let fleetActivity = featureSettings.appendChild(
    DOM.createDOMSanitized(
      "div",
      { class: "ogi-checkbox" },
      `<label for="fleet-activity" title="${Translator.translate(282)}">${Translator.translate(
        134
      )}</label>\n        <input type="checkbox" id="fleet-activity" name="fleet-activity" ${
        OGBIData.json.options.fleetActivity ? "checked" : ""
      }>`
    )
  );
  fleetActivity.querySelector("#fleet-activity").addEventListener("click", (e) => {
    const isChecked = e.currentTarget.checked;
    OGBIData.json.options.fleetActivity = isChecked;
  });
  let showProgressIndicators = featureSettings.appendChild(
    DOM.createDOMSanitized(
      "div",
      { class: "ogi-checkbox" },
      `<label for="progress-indicator" title="${Translator.translate(283)}">${Translator.translate(
        146
      )}</label>\n        <input type="checkbox" id="progress-indicator" name="progress-indicator" ${
        OGBIData.json.options.showProgressIndicators ? "checked" : ""
      }>`
    )
  );
  showProgressIndicators.querySelector("#progress-indicator").addEventListener("click", (e) => {
    const isChecked = e.currentTarget.checked;
    OGBIData.json.options.showProgressIndicators = isChecked;
  });
  let navigationArrows = featureSettings.appendChild(
    DOM.createDOMSanitized(
      "div",
      { class: "ogi-checkbox" },
      `<label for="fleet-activity" title="${Translator.translate(284)}">${Translator.translate(
        138
      )}</label>\n        <input type="checkbox" id="nav-arrows" name="fleet-activity" ${
        OGBIData.json.options.navigationArrows ? "checked" : ""
      }>`
    )
  );
  navigationArrows.querySelector("#nav-arrows").addEventListener("click", (e) => {
    const isChecked = e.currentTarget.checked;
    OGBIData.json.options.navigationArrows = isChecked;
  });
  featureSettings.appendChild(createDOM("h2", {}, Translator.translate(277)));
  // Wide-screen layout: stretch the fixed-width game column on monitors >= 1600px.
  let wideLayout = featureSettings.appendChild(
    DOM.createDOMSanitized(
      "div",
      { class: "ogi-checkbox" },
      `<label for="wide-layout" title="${Translator.translate(285)}">${Translator.translate(
        251
      )}</label>\n        <input type="checkbox" id="wide-layout" name="wide-layout" ${
        getOption("wideLayoutEnable") ? "checked" : ""
      }>`
    )
  );
  wideLayout.querySelector("#wide-layout").addEventListener("click", (e) => {
    setOption("wideLayoutEnable", e.currentTarget.checked);
    applyWideLayout();
  });
  // Wide-screen zoom: scale the game content once the column has hit its cap.
  let wideZoom = featureSettings.appendChild(
    DOM.createDOMSanitized(
      "div",
      { class: "ogi-checkbox" },
      `<label for="wide-zoom" title="${Translator.translate(286)}">${Translator.translate(
        252
      )}</label>\n        <input type="checkbox" id="wide-zoom" name="wide-zoom" ${
        getOption("wideZoomEnable") ? "checked" : ""
      }>`
    )
  );
  wideZoom.querySelector("#wide-zoom").addEventListener("click", (e) => {
    setOption("wideZoomEnable", e.currentTarget.checked);
    applyWideLayout();
  });
  optiondiv = featureSettings.appendChild(
    createDOM("span", { class: "tooltip", title: Translator.translate(254) }, Translator.translate(253))
  );
  let wideZoomFactorInput = optiondiv.appendChild(
    createDOM("input", {
      type: "text",
      class: "ogl-rvalInput ogl-formatInput tooltip",
      value: String(getOption("wideZoomFactor") ?? 0),
    })
  );
  featureSettings.appendChild(createDOM("h2", {}, Translator.translate(120)));
  optiondiv = featureSettings.appendChild(
    createDOM("span", { class: "tooltip", title: Translator.translate(105) }, Translator.translate(35))
  );
  let rvalInput = optiondiv.appendChild(
    createDOM("input", {
      type: "text",
      class: "ogl-rvalInput ogl-formatInput tooltip",
      value: toFormattedNumber(OGBIData.json.options.rvalLimit),
    })
  );

  optiondiv = featureSettings.appendChild(
    createDOM(
      "span",
      { class: "tooltip", title: Translator.translate(190) },
      `${Translator.translate(189)} - ${Translator.translate(193)}`
    )
  );
  let rvalSelfInputPlanet = optiondiv.appendChild(
    createDOM("input", {
      type: "text",
      class: "ogl-rvalInput ogl-formatInput tooltip",
      value: toFormattedNumber(OGBIData.json.options.rvalSelfLimitPlanet),
    })
  );
  optiondiv = featureSettings.appendChild(
    createDOM(
      "span",
      { class: "tooltip", title: Translator.translate(190) },
      `${Translator.translate(189)} - ${Translator.translate(192)}`
    )
  );
  let rvalSelfInputMoon = optiondiv.appendChild(
    createDOM("input", {
      type: "text",
      class: "ogl-rvalInput ogl-formatInput tooltip",
      value: toFormattedNumber(OGBIData.json.options.rvalSelfLimitMoon),
    })
  );

  featureSettings.appendChild(createDOM("h2", {}, Translator.translate(209)));
  // These three only take effect through the expedition button on the fleet dispatch
  // page (next to the custom mission buttons) - not obvious from this settings panel
  // alone, hence the explanatory note and per-field tooltips below.
  featureSettings.appendChild(createDOM("span", { class: "tooltip ogk-settings-note" }, Translator.translate(264)));
  optiondiv = featureSettings.appendChild(
    createDOM("span", { class: "tooltip", title: Translator.translate(261) }, Translator.translate(101))
  );
  let expeditionDefaultTime = optiondiv.appendChild(
    createDOM("input", {
      type: "text",
      class: "ogl-rvalInput ogl-formatInput",
      value: OGBIData.json.options.expedition.defaultTime,
    })
  );
  optiondiv = featureSettings.appendChild(
    createDOM("span", { class: "tooltip", title: Translator.translate(262) }, Translator.translate(149))
  );
  let expeditionLimitCargo = optiondiv.appendChild(
    createDOM("input", {
      type: "text",
      class: "ogl-rvalInput ogl-formatInput",
      value: Math.round(100 * OGBIData.json.options.expedition.limitCargo),
    })
  );
  optiondiv = featureSettings.appendChild(
    createDOM("span", { class: "tooltip", title: Translator.translate(263) }, Translator.translate(150))
  );
  let expeditionRotationAfter = optiondiv.appendChild(
    createDOM("input", {
      type: "text",
      class: "ogl-rvalInput ogl-formatInput",
      value: OGBIData.json.options.expedition.rotationAfter,
    })
  );
  // Balanced expedition dispatch (roadmap Feature C). Off by default: it changes the ship count
  // the dispatch form is pre-filled with, so it should be a deliberate choice.
  let balancedDispatch = featureSettings.appendChild(
    DOM.createDOMSanitized(
      "div",
      { class: "ogi-checkbox" },
      `<label for="balanced-dispatch" title="${Translator.translate(242)}">${Translator.translate(
        241
      )}</label>\n        <input type="checkbox" id="balanced-dispatch" name="balanced-dispatch" ${
        OGBIData.json.options.expedition.balancedDispatch ? "checked" : ""
      }>`
    )
  );
  balancedDispatch.querySelector("#balanced-dispatch").addEventListener("click", (e) => {
    OGBIData.json.options.expedition.balancedDispatch = e.currentTarget.checked;
  });

  featureSettings.appendChild(createDOM("h2", {}, Translator.translate(275)));
  optiondiv = featureSettings.appendChild(
    DOM.createDOM("span", { class: "tooltip", title: Translator.translate(287) }, Translator.translate(181))
  );
  const standardUnitInput = DOM.createDOM("select", { class: "ogl-selectInput tooltip" });
  standardUnitInput.append(
    DOM.createDOM("option", { value: "-1" }, Translator.translate(173)),
    DOM.createDOM("option", { value: "0" }, Translator.translate(174)),
    DOM.createDOM("option", { value: "1" }, Translator.translate(175)),
    DOM.createDOM("option", { value: "2" }, Translator.translate(176))
  );
  standardUnitInput.value = getOption("standardUnitBase");
  optiondiv.appendChild(standardUnitInput);

  /* ICONS SETTINGS*/
  featureSettings.appendChild(
    DOM.createDOM(
      "h1",
      { class: "tooltip", title: Translator.translate(288), style: "margin-top: 10px;" },
      Translator.translate(221)
    )
  );

  const addIconModeChoice = (parent, labelText, iconClass, value) => {
    const label = parent.appendChild(DOM.createDOM("span", {}, labelText));
    if (iconClass) {
      label.appendChild(DOM.createDOM("span", { class: iconClass }));
    }
    const select = label.appendChild(DOM.createDOM("select", { class: "ogl-selectInput ogl-w-175 tooltip" }));
    select.append(
      DOM.createDOM("option", { value: "0" }, Translator.translate(212)),
      DOM.createDOM("option", { value: "1" }, Translator.translate(213)),
      DOM.createDOM("option", { value: "2" }, Translator.translate(214)),
      DOM.createDOM("option", { value: "3" }, Translator.translate(215)),
      DOM.createDOM("option", { value: "4" }, Translator.translate(216))
    );
    select.value = value ?? "4";
    return select;
  };

  const regularConstructionsIconsInput = addIconModeChoice(
    featureSettings,
    Translator.translate(217),
    "icon12px icon_wrench",
    getOption("regularConstructionsIconsDisplayMode")
  );

  const lifeformConstructionsIconsInput = addIconModeChoice(
    featureSettings,
    Translator.translate(218),
    "icon12px icon_wrench_lf",
    getOption("lifeformConstructionsIconsDisplayMode")
  );
  const lifeformResearchsIconsInput = addIconModeChoice(
    featureSettings,
    Translator.translate(219),
    "icon12px icon_research_lf",
    getOption("lifeformResearchsIconsDisplayMode")
  );
  const ownFleetYieldIconsInput = addIconModeChoice(
    featureSettings,
    Translator.translate(220),
    "icon12px icon_spaceship",
    getOption("ownFleetYieldIconsDisplayMode")
  );

  dataDiv.appendChild(createDOM("hr"));
  let dataManagement = dataDiv.appendChild(createDOM("div", { style: "display: grid;" }));
  dataManagement.appendChild(
    DOM.createDOMSanitized(
      "h1",
      {},
      `${Translator.translate(15)}<span style="font-weight: 100;color: white; float:right"> <strong class="${
        size.total > 4 ? "overmark" : "undermark"
      }"> ${size.total}</strong>  / 5 Mb`
    )
  );
  // Otherwise nothing on this panel says these checkboxes gate the Reset button
  // below rather than doing anything on their own - a real "what does this do"
  // gap, since checking one has zero visible effect until Reset is clicked.
  dataManagement.appendChild(createDOM("span", { class: "tooltip ogk-settings-note" }, Translator.translate(278)));
  let expeditionsBox = dataManagement.appendChild(
    DOM.createDOMSanitized(
      "div",
      { class: "ogi-checkbox" },
      `<label for="expeditions" title="${Translator.translate(289)}">${Translator.translate(16)}</label>
      <input type="checkbox" id="expeditions" name="expeditions">`
    )
  );
  let discoveriesBox = dataManagement.appendChild(
    DOM.createDOMSanitized(
      "div",
      { class: "ogi-checkbox" },
      `<label for="discoveries" title="${Translator.translate(290)}">${Translator.translate(167)}</label>
      <input type="checkbox" id="discoveries" name="discoveries">`
    )
  );
  let combatsBox = dataManagement.appendChild(
    DOM.createDOMSanitized(
      "div",
      { class: "ogi-checkbox" },
      `<label for="combats" title="${Translator.translate(291)}">${Translator.translate(17)}</label>
      <input type="checkbox" id="combats" name="combats">`
    )
  );
  let targetsBox = dataManagement.appendChild(
    DOM.createDOMSanitized(
      "div",
      { class: "ogi-checkbox" },
      `<label for="targets" title="${Translator.translate(292)}">${Translator.translate(18)}</label>
      <input type="checkbox" id="targets" name="targets">`
    )
  );
  let spiesBox = dataManagement.appendChild(
    DOM.createDOMSanitized(
      "div",
      { class: "ogi-checkbox" },
      `<label for="spies" title="${Translator.translate(293)}">${Translator.translate(191)}</label>
      <input type="checkbox" id="spies" name="spies">`
    )
  );
  let scanBox = dataManagement.appendChild(
    DOM.createDOMSanitized(
      "div",
      { class: "ogi-checkbox" },
      `<label for="scan" title="${Translator.translate(294)}">${Translator.translate(19)}</label>
      <input type="checkbox" id="scan" name="scan">`
    )
  );
  let galaxyBox = dataManagement.appendChild(
    DOM.createDOMSanitized(
      "div",
      { class: "ogi-checkbox" },
      `<label for="galaxy_reset" title="${Translator.translate(295)}">${Translator.translate(226)}</label>
      <input type="checkbox" id="galaxy_reset" name="galaxy_reset">`
    )
  );
  let OptionsBox = dataManagement.appendChild(
    DOM.createDOMSanitized(
      "div",
      { class: "ogi-checkbox" },
      `<label for="options" title="${Translator.translate(296)}">${Translator.translate(20)}</label>
      <input type="checkbox" id="options" name="options ">`
    )
  );
  let cacheBox = dataManagement.appendChild(
    DOM.createDOMSanitized(
      "div",
      { class: "ogi-checkbox" },
      `<label for="temp" title="${Translator.translate(297)}">${Translator.translate(21)}</label>
      <input type="checkbox" id="temp" name="temp" checked>`
    )
  );
  let purgeBox = dataManagement.appendChild(
    DOM.createDOMSanitized(
      "div",
      { class: "ogi-checkbox" },
      `<label for="purge" title="${Translator.translate(298)}">${Translator.translate(22)}<span class="${
        size.other > 3 ? "undermark" : "overmark"
      }"> (${size.other}Mb)</span></label>
      <input type="checkbox" id="purge" name="purge">`
    )
  );
  let dataBtns = dataManagement.appendChild(
    createDOM("div", { style: "display: flex;align-items: flex-end;margin-top: 5px" })
  );
  let exportBtn = dataBtns.appendChild(createDOM("button", { class: "btn_blue" }, Translator.translate(24)));
  let fileHandler = dataBtns.appendChild(
    createDOM("input", { id: "file", name: "file", class: "inputfile", type: "file", accept: ".data" })
  );
  dataBtns.appendChild(
    createDOM("label", { for: "file", class: "btn_blue", style: "margin: 0px 10px" }, Translator.translate(25))
  );
  fileHandler.addEventListener("change", () => {
    var reader = new FileReader();
    reader.onload = (evt) => {
      let json = JSON.parse(evt.target.result);
      // Finish the replacement blob first: assigning it through the setter is one
      // write, where assigning and then patching it would be two.
      json.pantrySync = Date.now();
      OGBIData.json = json;
      document.location = document.location.origin + "/game/index.php?page=ingame&component=overview ";
    };
    reader.readAsText(event.target.files[0], "UTF-8");
  });
  exportBtn.addEventListener("click", () => {
    const data = Object.assign({}, OGBIData.json);
    download(data, `oginfinity-${OgamePageData.gameLang}-${context.universe}.data`);
  });
  let resetBtn = dataBtns.appendChild(
    createDOM(
      "button",
      { class: "btn_blue ogl-btn_red tooltip", title: Translator.translate(299) },
      Translator.translate(26)
    )
  );
  scrollBody.appendChild(createDOM("div", { style: "width: 1px; background: #10171d;" }));

  let settingDiv = scrollBody.appendChild(createDOM("div"));
  let saveBtn = createDOM("button", { class: "btn_blue save" }, Translator.translate(27));

  let keepOnPlanet = settingDiv.appendChild(createDOM("div"));
  keepOnPlanet.appendChild(keepOnPlanetDialog(null, saveBtn, context.dialogContext));
  settingDiv.appendChild(createDOM("hr"));
  let standardMissions = settingDiv.appendChild(createDOM("div"));
  standardMissions.appendChild(createDOM("h1", {}, Translator.translate(148)));
  let span = standardMissions.appendChild(
    createDOM(
      "span",
      { style: "display: flex;justify-content: space-between; align-items: center;", class: "ogl-w-300" },
      Translator.translate(30)
    )
  );
  let missionDiv = span.appendChild(createDOM("div", { style: "display:flex" }));
  let none = missionDiv.appendChild(
    createDOM("a", {
      class: "icon icon_against",
      style: "margin-top: 2px;margin-right: 5px;",
      title: Translator.translate(272),
    })
  );
  let own3 = missionDiv.appendChild(
    createDOM("div", {
      class: `ogl-mission-icon ogl-mission-3 ${OGBIData.json.options.harvestMission == 3 ? "ogl-active" : ""}`,
      title: Translator.translate(201),
    })
  );
  let own4 = missionDiv.appendChild(
    createDOM("div", {
      class: `ogl-mission-icon ogl-mission-4 ${OGBIData.json.options.harvestMission == 4 ? "ogl-active" : ""}`,
      title: Translator.translate(202),
    })
  );
  own3.addEventListener("click", () => {
    own4.classList.remove("ogl-active");
    own3.classList.add("ogl-active");
    OGBIData.json.options.harvestMission = 3;
    OGBIData.Save();
  });
  own4.addEventListener("click", () => {
    own3.classList.remove("ogl-active");
    own4.classList.add("ogl-active");
    OGBIData.json.options.harvestMission = 4;
    OGBIData.Save();
  });
  none.addEventListener("click", () => {
    own4.classList.remove("ogl-active");
    own3.classList.remove("ogl-active");
    OGBIData.json.options.harvestMission = 0;
    OGBIData.Save();
  });

  span = standardMissions.appendChild(
    createDOM(
      "span",
      { style: "display: flex;justify-content: space-between; align-items: center;", class: "ogl-w-300" },
      Translator.translate(31)
    )
  );
  missionDiv = span.appendChild(createDOM("div", { style: "display:flex" }));
  none = missionDiv.appendChild(
    createDOM("a", {
      class: "icon icon_against",
      style: "margin-top: 2px;margin-right: 5px;",
      title: Translator.translate(272),
    })
  );
  let other3 = missionDiv.appendChild(
    createDOM("div", {
      class: `ogl-mission-icon ogl-mission-3 ${OGBIData.json.options.foreignMission == 3 ? "ogl-active" : ""}`,
      title: Translator.translate(201),
    })
  );
  let other1 = missionDiv.appendChild(
    createDOM("div", {
      class: `ogl-mission-icon ogl-mission-1 ${OGBIData.json.options.foreignMission == 1 ? "ogl-active" : ""}`,
      title: Translator.translate(200),
    })
  );
  other1.addEventListener("click", () => {
    other3.classList.remove("ogl-active");
    other1.classList.add("ogl-active");
    OGBIData.json.options.foreignMission = 1;
  });
  other3.addEventListener("click", () => {
    other1.classList.remove("ogl-active");
    other3.classList.add("ogl-active");
    OGBIData.json.options.foreignMission = 3;
  });
  none.addEventListener("click", () => {
    other1.classList.remove("ogl-active");
    other3.classList.remove("ogl-active");
    OGBIData.json.options.foreignMission = 0;
  });
  span = standardMissions.appendChild(
    createDOM(
      "span",
      { style: "display: flex;justify-content: space-between; align-items: center;", class: "ogl-w-300" },
      Translator.translate(32)
    )
  );
  missionDiv = span.appendChild(createDOM("div", { style: "display:flex" }));
  none = missionDiv.appendChild(
    createDOM("a", {
      class: "icon icon_against",
      style: "margin-top: 2px;margin-right: 5px;",
      title: Translator.translate(272),
    })
  );
  let expe15 = missionDiv.appendChild(
    createDOM("div", {
      class: `ogl-mission-icon ogl-mission-15 ${OGBIData.json.options.expeditionMission == 15 ? "ogl-active" : ""}`,
      title: Translator.translate(209),
    })
  );
  let expe6 = missionDiv.appendChild(
    createDOM("div", {
      class: `ogl-mission-icon ogl-mission-6 ${OGBIData.json.options.expeditionMission == 6 ? "ogl-active" : ""}`,
      title: Translator.translate(273),
    })
  );
  expe15.addEventListener("click", () => {
    expe6.classList.remove("ogl-active");
    expe15.classList.add("ogl-active");
    OGBIData.json.options.expeditionMission = 15;
  });
  expe6.addEventListener("click", () => {
    expe15.classList.remove("ogl-active");
    expe6.classList.add("ogl-active");
    OGBIData.json.options.expeditionMission = 6;
  });
  none.addEventListener("click", () => {
    expe15.classList.remove("ogl-active");
    expe6.classList.remove("ogl-active");
    OGBIData.json.options.expeditionMission = 0;
  });

  settingDiv.appendChild(createDOM("hr"));
  let customMissions = settingDiv.appendChild(createDOM("div"));
  customMissions.appendChild(createDOM("h1", {}, Translator.translate(195)));
  let nbCustomMissionsDiv = customMissions.appendChild(createDOM("div", { class: "ogl-w-200" }));

  nbCustomMissionsDiv.appendChild(
    createDOM("span", { style: "justify-content: space-between; align-items: center;" }, Translator.translate(196))
  );

  const nbCustomMissionsSelect = DOM.createDOM("select", { class: "ogl-selectInput ogl-w-50" });
  for (let i = 0; i <= 5; i++) {
    nbCustomMissionsSelect.append(DOM.createDOM("option", { value: i.toString() }, i.toString()));
  }
  nbCustomMissionsSelect.value = getOption("nbCustomMissions");
  nbCustomMissionsDiv.appendChild(nbCustomMissionsSelect);

  if (OGBIData.json.options.customMissions) {
    let resetCustomMissions = customMissions.appendChild(
      createDOM("div", { style: "margin-top: 15px; display:grid; grid-template-columns: auto 1fr" })
    );
    resetCustomMissions.appendChild(createDOM("span", { style: "margin-top: 20px;" }, `${Translator.translate(26)} :`));
    let resetButtonsDiv = resetCustomMissions.appendChild(
      createDOM("div", {
        style: " display:grid; grid-template-columns: auto auto auto auto 1fr; gap: 5px 10px; margin-left: 15px;",
      })
    );

    const getresetBuittonClass = (customMissionId) => {
      const customMissionClass = `ogk-customMission ogk-customMission-${customMissionId}`;
      const missionClass = OGBIData.json.options.customMissions[customMissionId].mission == 4 ? "statio" : "";

      const shipClass =
        OGBIData.json.options.customMissions[customMissionId].ship === "select-most"
          ? "select-most"
          : OGBIData.json.options.customMissions[customMissionId].ship === "sendall"
          ? "sendall"
          : OGBIData.json.options.customMissions[customMissionId].ship == 202
          ? "smallCargo"
          : OGBIData.json.options.customMissions[customMissionId].ship == 219
          ? "pathFinder"
          : "largeCargo";
      return `${customMissionClass} ${missionClass} ${shipClass}`;
    };

    for (let customMissionId = 1; customMissionId <= 5; customMissionId++) {
      if (OGBIData.json.options.customMissions[customMissionId]) {
        let btnReset = resetButtonsDiv.appendChild(
          createDOM("button", {
            class: getresetBuittonClass(customMissionId),
            "data-marked": OGBIData.json.options.customMissions[customMissionId].color,
            title: `${Translator.translate(26)} #${customMissionId}`,
          })
        );
        btnReset.addEventListener("click", () => {
          let reset = confirm(Translator.translate(197));
          if (reset) {
            OGBIData.json.options.customMissions[customMissionId] = {
              ship: 202,
              mission: 4,
              rotation: false,
              keepSpeed: false,
              resources: true,
              target: {},
              color: "orange",
            };
            btnReset.classList = getresetBuittonClass(customMissionId);
            btnReset.setAttribute("data-marked", OGBIData.json.options.customMissions[customMissionId].color);
            OGBIData.Save();
          }
        });
      }
    }
  }

  settingDiv.appendChild(createDOM("hr"));

  // ---------- PTRE section (dedicated) ----------
  let ptreSection = settingDiv.appendChild(createDOM("div", { style: "display: grid;" }));
  ptreSection.appendChild(createDOM("h1", { class: "tooltip", title: Translator.translate(300) }, "PTRE settings"));

  const savedPtreKey = OGBIData.json.options.ptreTK;
  const ptreEnabled =
    typeof savedPtreKey === "string" && savedPtreKey.startsWith("TM") && savedPtreKey.replace(/-/g, "").length === 18;

  let ptreKeyRow = ptreSection.appendChild(createDOM("span"));
  ptreKeyRow.appendChild(createDOM("a", { href: "https://ptre.chez.gg/", target: "_blank" }, "PTRE"));
  ptreKeyRow.appendChild(document.createTextNode(" Teamkey "));
  ptreKeyRow.appendChild(
    createDOM(
      "span",
      {
        style: ptreEnabled
          ? "font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; letter-spacing: 0.3px; background: #1f7a3a; color: #dff5e2;"
          : "font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; letter-spacing: 0.3px; background: #5a2a2a; color: #f5dcdc;",
      },
      ptreEnabled ? "ENABLED" : "DISABLED"
    )
  );
  let ptreInput = ptreKeyRow.appendChild(
    createDOM("input", {
      type: "password",
      class: "ogl-ptreTeamKey tooltip",
      value: OGBIData.json.options.ptreTK ?? "",
      placeholder: "TM-XXXX-XXXX-XXXX-XXXX",
    })
  );
  // Reveal the team key while the input is focused so the user can verify what they
  // typed. Blur restores the masked view.
  ptreInput.addEventListener("focus", () => {
    ptreInput.type = "text";
  });
  ptreInput.addEventListener("blur", () => {
    ptreInput.type = "password";
  });

  // Phase 6 of refactoring.md: a malformed key used to be silently cleared on save
  // with no indication why PTRE stayed DISABLED. Hidden until the save handler
  // below has something to say.
  let ptreKeyError = ptreSection.appendChild(
    createDOM("div", { style: "display: none; color: #f5a3a3; font-size: 11px; margin-top: 2px;" })
  );

  // Systems count row in PTRE settings. Live query against `dataHelper.galaxyStorage`
  // via the page->content bridge - the value reflects the current in-memory store
  // at the moment the settings modal opens.
  let ptreLastApiUpdateRow = ptreSection.appendChild(createDOM("span"));
  ptreLastApiUpdateRow.textContent = `${Translator.translate(349)}: ...`;
  let ptreSystemCountRow = ptreSection.appendChild(createDOM("span"));
  ptreSystemCountRow.textContent = `${Translator.translate(350)}: ...`;
  let ptreStorageSizeRow = ptreSection.appendChild(createDOM("span"));
  ptreStorageSizeRow.textContent = `${Translator.translate(351)}: ...`;
  pageContextRequest("ptre", "galaxyInfo")
    .then((r) => {
      const n = r?.response?.systemCount ?? 0;
      ptreSystemCountRow.textContent = `${Translator.translate(350)}: ${n}`;
      const ts = r?.response?.lastGalaxyUpdateTS ?? -1;
      if (ts > 0) {
        const d = new Date(ts * 1000);
        const formatted = d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
        ptreLastApiUpdateRow.textContent = `${Translator.translate(349)}: ${formatted}`;
      } else {
        ptreLastApiUpdateRow.textContent = `${Translator.translate(349)}: ${Translator.translate(352)}`;
      }
      const bytes = r?.response?.storageBytes ?? 0;
      let sizeStr;
      if (bytes >= 1024 * 1024) sizeStr = `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
      else if (bytes >= 1024) sizeStr = `${(bytes / 1024).toFixed(1)} KB`;
      else sizeStr = `${bytes} B`;
      ptreStorageSizeRow.textContent = `${Translator.translate(351)}: ${sizeStr}`;
    })
    .catch((err) => {
      console.warn("[OGBI][PTRE] galaxyInfo failed", err);
      ptreSystemCountRow.textContent = `${Translator.translate(350)}: ${Translator.translate(353)}`;
      ptreLastApiUpdateRow.textContent = `${Translator.translate(349)}: ${Translator.translate(353)}`;
      ptreStorageSizeRow.textContent = `${Translator.translate(351)}: ${Translator.translate(353)}`;
    });

  settingDiv.appendChild(createDOM("hr"));
  let keys = settingDiv.appendChild(createDOM("div", { style: "display: grid;" }));
  keys.appendChild(createDOM("h1", {}, Translator.translate(147)));
  let pantry = keys.appendChild(
    createDOM("span", { class: "tooltip", title: Translator.translate(301) })
      .appendChild(createDOM("a", { href: "https://getpantry.cloud/", target: "_blank" }, "Pantry"))
      .parentElement.appendChild(document.createTextNode(" Key"))
      .parentElement.appendChild(createDOM("small", {}, " (Cloud Sync beta)")).parentElement
  );
  let pantryInput = pantry.appendChild(
    createDOM("input", {
      type: "password",
      class: "ogl-pantryKey tooltip",
      value: OGBIData.json.options.pantryKey ?? "",
      placeholder: "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
    })
  );
  let simulator = keys.appendChild(createDOM("span", {}, Translator.translate(170)));
  let simulatorInput = createDOM("select", { class: "ogl-selectInput ogl-simulator tooltip" });
  simulatorInput.append(
    createDOM("option", { value: "", disabled: "true" }, Translator.translate(171)),
    createDOM("option", { value: "https://battlesim.logserver.net/" }, "Logserver - Battlesim"),
    createDOM("option", { value: "https://obatsim.stevecohen.fr/" }, "Ogame Battle Simulator"),
    createDOM("option", { value: "https://simulator.ogame-tools.com/" }, "Ogame Tools - Simulator"),
    createDOM("option", { value: "https://webapp-universe.net/ogf/change_language/" }, "OGF")
  );
  simulatorInput.value = OGBIData.json.options.simulator;
  simulator.appendChild(simulatorInput);
  let footer = container.appendChild(createDOM("div", { class: "ogk-settings-footer" }));
  footer.appendChild(saveBtn);
  saveBtn.addEventListener("click", () => {
    OGBIData.json.options.importExportReminderMode = importExportReminderMode?.value;
    OGBIData.json.options.rvalLimit = fromFormattedNumber(rvalInput.value, true);
    OGBIData.json.options.rvalSelfLimitPlanet = fromFormattedNumber(rvalSelfInputPlanet.value, true);
    OGBIData.json.options.rvalSelfLimitMoon = fromFormattedNumber(rvalSelfInputMoon.value, true);
    if (ptreInput.value && ptreInput.value.replace(/-/g, "").length === 18 && ptreInput.value.startsWith("TM")) {
      OGBIData.json.options.ptreTK = ptreInput.value;
      ptreKeyError.style.display = "none";
    } else {
      OGBIData.json.options.ptreTK = "";
      // A typo used to be swallowed here with no sign anything went wrong: the key
      // was silently cleared and PTRE just stayed off. An empty input is a valid
      // "turn PTRE off" and gets no error; anything else that does not match the
      // format does.
      if (ptreInput.value) {
        ptreKeyError.textContent = Translator.translate(348);
        ptreKeyError.style.display = "block";
      } else {
        ptreKeyError.style.display = "none";
      }
    }
    pageContextRequest("ptre", "setTeamKey", OGBIData.json.options.ptreTK || "").catch((err) =>
      console.warn("[OGBI][PTRE] setTeamKey failed", err)
    );
    OGBIData.json.options.pantryKey = pantryInput.value.trim();
    OGBIData.json.options.simulator = simulatorInput.value;
    OGBIData.json.options.expedition.defaultTime = Math.max(1, Math.min(~~expeditionDefaultTime.value, 16));
    OGBIData.json.options.expedition.limitCargo = Math.max(1, Math.min(~~expeditionLimitCargo.value, 500)) / 100;
    OGBIData.json.options.expedition.rotationAfter = Math.max(1, Math.min(~~expeditionRotationAfter.value, 16));
    setOption("standardUnitBase", standardUnitInput.value);
    setOption("alertHostileIncomingMode", alertHostileIncomingMode.value);
    setOption("regularConstructionsIconsDisplayMode", regularConstructionsIconsInput.value);
    setOption("lifeformConstructionsIconsDisplayMode", lifeformConstructionsIconsInput.value);
    setOption("lifeformResearchsIconsDisplayMode", lifeformResearchsIconsInput.value);
    setOption("ownFleetYieldIconsDisplayMode", ownFleetYieldIconsInput.value);
    setOption("nbCustomMissions", nbCustomMissionsSelect.value);
    // 0 keeps the automatic stepped zoom; anything else is clamped to [1, 2].
    setOption("wideZoomFactor", normalizeZoomFactor(wideZoomFactorInput.value));
    applyWideLayout();

    OGBIData.needSync = true;
    document.querySelector(".ogl-dialog .close-tooltip").click();
  });
  resetBtn.addEventListener("click", () => {
    let reset = confirm(Translator.translate(197));
    if (reset) {
      let json = {};
      if (!cacheBox.children[1].checked) {
        json = Object.assign({}, OGBIData.json);
      }
      json.harvests = {};
      json.options = {};
      json.expeditions = {};
      json.expeditionSums = {};
      json.discoveries = {};
      json.discoveriesSums = {};
      json.combats = {};
      json.combatsSums = {};
      json.spies = {};
      if (scanBox.children[1].checked) {
        document.dispatchEvent(new CustomEvent("ogi-clear"));
      }
      if (galaxyBox.children[1].checked) {
        document.dispatchEvent(new CustomEvent("ogi-galaxy-clear"));
      }
      if (purgeBox.children[1].checked) {
        purgeLocalStorage();
      }
      if (!expeditionsBox.children[1].checked) {
        json.expeditionSums = OGBIData.json.expeditionSums;
        json.expeditions = OGBIData.json.expeditions;
        for (let id in OGBIData.json.harvests) {
          if (OGBIData.json.harvests[id].coords.split(":")[2] == 16) {
            json.harvests[id] = OGBIData.json.harvests[id];
          }
        }
        for (let id in OGBIData.json.combats) {
          if (OGBIData.json.combats[id].coordinates.position == 16) {
            json.combats[id] = OGBIData.json.combats[id];
          }
        }
      }
      if (!discoveriesBox.children[1].checked) {
        json.discoveriesSums = OGBIData.json.discoveriesSums;
        json.discoveries = OGBIData.json.discoveries;
      }
      if (!combatsBox.children[1].checked) {
        json.combatsSums = OGBIData.json.combatsSums;
        for (let id in OGBIData.json.combats) {
          if (OGBIData.json.combats[id].coordinates.position != 16) {
            json.combats[id] = OGBIData.json.combats[id];
          }
        }
        for (let id in OGBIData.json.harvests) {
          if (OGBIData.json.harvests[id].coords.split(":")[2] != 16) {
            json.harvests[id] = OGBIData.json.harvests[id];
          }
        }
      }
      if (!targetsBox.children[1].checked) {
        json.markers = OGBIData.json.markers;
      }
      if (!spiesBox.children[1].checked) {
        json.spies = OGBIData.json.spies;
      }
      if (!OptionsBox.children[1].checked) {
        json.options = OGBIData.json.options;
        json.options.empire = false;
      }
      json.needSync = false;
      OGBIData.json = json;
      document.location = document.location.origin + "/game/index.php?page=ingame&component=overview ";
    }
  });
  popupUtil.popup(false, container);
}

export { settings, welcome };
