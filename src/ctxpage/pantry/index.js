import * as DOM from "../../util/dom.js";
import { createDOM, createSVG, createDOMSanitized } from "../../util/dom.js";
import { toFormattedNumber, fromFormattedNumber } from "../../util/numbers.js";
import * as Numbers from "../../util/numbers.js";
import * as popupUtil from "../../util/popup.js";
import * as utilTooltip from "../../util/tooltip.js";
import * as wait from "../../util/wait.js";
import * as time from "../../util/time.js";
import * as standardUnit from "../../util/standardUnit.js";
import Translator from "../../util/translate.js";
import DateTime from "../../util/dateTime.js";
import OGIData from "../../util/OGIData.js";
import OgamePageData from "../../util/OgamePageData.js";
import PlayerClass from "../../util/enum/playerClass.js";
import shipEnum from "../../util/enum/ship.js";
import planetType from "../../util/enum/planetType.js";
import missionType from "../../util/enum/missionType.js";
import { getOption } from "../conf-options.js";
import { pageSignal } from "../../util/abort.js";
import { ensureLZString } from "../../util/lzstring.js";

/**
 * Backing the local store up to a Pantry bucket, and the toast that reports it.
 *
 * Lifted out of `OGInfinity` in Phase 3 of refactoring.md.
 *
 * Compliance note (AGENTS.md 1.9): this sends the player's own OGI data to a service
 * the player configured themselves, from a button they pressed. It is not automatic
 * and it collects nothing about anybody else.
 */

async function getObjLastElements(context, obj, elementsToReturn) {
  if (!obj) return;
  let keyList = Object.keys(obj);
  let nbElements = keyList.length;
  let startIndex = nbElements - elementsToReturn;
  let currentObj = {};
  if (startIndex <= 0) {
    return obj;
  }
  for (let i = startIndex; i < nbElements; i++) {
    currentObj[keyList[i]] = obj[keyList[i]];
  }
  return currentObj;
}

async function checkPantrySync(context, pantryKey) {
  let pantryBasketTime = null;
  let lastLocalSync = OGIData.json.pantrySync;
  let pantrySyncObj = null;
  if (!pantryKey || !OGIData.json.needSync || (lastLocalSync && Date.now() - lastLocalSync < 60000)) {
    return;
  }
  // Pantry sync is the only consumer of LZString, and most sessions never
  // reach this line. Loading it here instead of on every page load keeps one
  // more request off the boot path - same treatment chart.min.js already got.
  await ensureLZString();
  let syncRequest = await fetch(
    `https://getpantry.cloud/apiv1/pantry/${pantryKey}/basket/${context.universe}-${OgamePageData.gameLang}-full`,
    { priority: "high", method: "GET" }
  ).catch(() => {
    return;
  });
  if (syncRequest?.ok) {
    try {
      let rawObject = await syncRequest?.json();
      pantrySyncObj = JSON.parse(LZString.decompressFromUTF16(rawObject.data));
      pantryBasketTime = pantrySyncObj?.pantrySync;
    } catch {}
  } else {
    let responseText = await syncRequest?.text();
    if (!syncRequest || syncRequest.status !== 400 || !responseText.includes("not exist")) {
      return;
    }
  }

  let lastPantryTry = sessionStorage.getItem("lastPantryTry") ? parseInt(sessionStorage.getItem("lastPantryTry")) : 0;
  if (
    !pantryBasketTime ||
    isNaN(pantryBasketTime) ||
    (lastLocalSync && lastLocalSync >= pantryBasketTime && Date.now() - lastLocalSync > 300000)
  ) {
    pantrySync(context, pantryKey, pantrySyncObj, "post");
  } else if (
    (!lastLocalSync || isNaN(lastLocalSync) || lastLocalSync < pantryBasketTime) &&
    Date.now() - lastPantryTry > 10100
  ) {
    sessionStorage.setItem("lastPantryTry", Date.now());
    pantrySync(context, pantryKey, pantrySyncObj, "merge");
  }
}

async function pantrySync(context, pantryKey, mainSyncObj, action = "merge") {
  if (!pantryKey) return;
  const pantryHeaders = new Headers({ "Content-Type": "application/json" });
  let success = true;
  let errorCode = null;
  let errorMsg = null;
  let menuDiv = document.getElementById("links");
  let loadIcon = createDOM("span", { class: "ogi-loader" });
  let loadPantrySync = createDOM("div", { id: "ogi-pantry-sync", class: "ogi-loader-container" });
  let loaderText = createDOM("span", { class: "ogi-loader-text" });
  loaderText.textContent = "Syncing Pantry ...";
  loadPantrySync.append(loadIcon);
  loadPantrySync.append(loaderText);
  menuDiv.append(loadPantrySync);
  if (action === "post") {
    let mainSyncJsonObj = {};
    mainSyncJsonObj.pantrySync = Date.now();
    mainSyncJsonObj.options = this?.json?.options;
    mainSyncJsonObj.searchHistory = this?.json?.searchHistory;
    mainSyncJsonObj.search = this?.json?.search;
    mainSyncJsonObj.sideStalk = this?.json?.sideStalk;
    mainSyncJsonObj.myActivities = this?.json?.myActivities;
    mainSyncJsonObj.needs = this?.json?.needs;
    mainSyncJsonObj.playerMarkers = this?.json?.playerMarkers;
    mainSyncJsonObj.markers = this?.json?.markers;
    mainSyncJsonObj.sideStargetTabstalk = this?.json?.targetTabs;
    mainSyncJsonObj.missing = this?.json?.missing;
    mainSyncJsonObj.flying = this?.json?.flying;
    mainSyncJsonObj.productionProgress = this?.json?.productionProgress;
    mainSyncJsonObj.lfProductionProgress = this?.json?.lfProductionProgress;
    mainSyncJsonObj.researchProgress = this?.json?.researchProgress;
    mainSyncJsonObj.lfResearchProgress = this?.json?.lfResearchProgress;
    mainSyncJsonObj.reminders = this?.json?.reminders;

    mainSyncJsonObj.expeditions = await getObjLastElements(context, this?.json?.expeditions, 5000);
    mainSyncJsonObj.expeditionSums = this?.json?.expeditionSums;
    mainSyncJsonObj.combats = await getObjLastElements(context, this?.json?.combats, 5000);
    mainSyncJsonObj.combatsSums = this?.json?.combatsSums;
    mainSyncJsonObj.discoveries = await getObjLastElements(context, this?.json?.discoveries, 5000);
    mainSyncJsonObj.discoveriesSums = this?.json?.discoveriesSums;
    mainSyncJsonObj.harvests = this?.json?.harvests;
    mainSyncJsonObj.spies = await getObjLastElements(context, this?.json?.spies, 5000);
    mainSyncJsonObj.notifications = this?.json?.notifications;

    let finalJson = {
      data: LZString.compressToUTF16(JSON.stringify(mainSyncJsonObj)),
    };

    fetch(
      `https://getpantry.cloud/apiv1/pantry/${pantryKey}/basket/${context.universe}-${OgamePageData.gameLang}-full`,
      {
        priority: "low",
        method: "POST",
        headers: pantryHeaders,
        body: JSON.stringify(finalJson),
      }
    )
      .then(async (response) => {
        document.getElementById("ogi-pantry-sync").remove();

        let responseText = (await response.text()) || "";
        if (!response.ok) {
          success = false;
          errorCode = errorCode ? errorCode : response.status;
          errorMsg = errorMsg ? errorMsg : responseText;
        }

        if (success) {
          OGIData.json.pantrySync = mainSyncJsonObj.pantrySync;
          OGIData.Save();
          console.info("[OGInfinity] - Pantry synchronisation complete");
        }
      })
      .catch(() => {
        success = false;
      });
  } else {
    document.getElementById("ogi-pantry-sync").remove();

    OGIData.json = {
      ...OGIData.json,
      ...mainSyncObj,
    };

    OGIData.json.pantrySync = Date.now();
    OGIData.Save();
    console.info("[OGInfinity] - Pantry synchronisation complete");
    let toastText = "OGInfinity - Pantry synchronisation complete.";
    showToast(context, toastText, "success", "done", null, 3500);
    sessionStorage.removeItem("lastPantryTry");
  }
  if (!success) {
    console.warn(`[OGInfinity] - Pantry Synch failed with error ${errorCode} => ${errorMsg}`);
    let toastText = "OGInfinity - Synch failed";
    if (errorCode === 400 && errorMsg.includes("pantry with id")) {
      toastText += ": Invalid Pantry Key";
    } else if (errorCode === 413 && errorMsg.includes("Too Large")) {
      toastText += ": Too much data (reset addon)";
    } else if (errorCode === 503 || errorCode === 502 || errorCode === 500) {
      toastText += ": Pantry Service is unavailable (" + errorCode + ")";
    } else if (!errorCode && !errorMsg) {
      toastText += ": Pantry request Failed (check console for details)";
    } else {
      toastText += ": " + (errorMsg && errorMsg != "" ? errorMsg : ": Error " + errorCode);
    }
    showToast(context, toastText, "warning", "warning", null, 3500);
  }
}

function showToast(context, text, type = "info", icon = "info", title = null, duration = 3500) {
  let totalduration = duration + 2000;
  let toastHtml = createDOM("div", { class: `ogi-toast ogi-toast-${type}` });
  let toastContainer = createDOM("div", { class: "ogi-toast-container" });
  let toastBody = createDOM("span", { class: "ogi-toast-body" });
  let toastLogoContainer = createDOM("span", { class: "ogi-toast-logo" });
  let toastLogo = createDOM("div", { class: "material-icons" });
  toastLogo.textContent = icon;
  toastBody.textContent = text;
  if (title) {
    let toastTitle = createDOM("span", { class: "ogi-toast-title" });
    let title = document.createElement("h1");
    title.textContent = title;
    toastTitle.append(title);
    toastHtml.append(toastTitle);
  }
  toastLogoContainer.append(toastLogo);
  toastContainer.append(toastLogoContainer);
  toastContainer.append(toastBody);
  toastHtml.append(toastContainer);
  document.body.appendChild(toastHtml);
  setTimeout(function () {
    toastHtml.classList.add("toast-show");
    setTimeout(function () {
      toastHtml.classList.remove("toast-show");
      setTimeout(function () {
        toastHtml.remove();
      }, 1000);
    }, totalduration);
  }, 300);
}

export { pantrySync, checkPantrySync, showToast };
