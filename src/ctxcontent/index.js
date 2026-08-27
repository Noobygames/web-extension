import { getLogger } from "../util/logger.js";
import { injectScript } from "../util/runContext.js";
import { contentContextInit } from "../util/service.callbackEvent.js";
import { suppressAbortRejections } from "../util/abort.js";
import * as wait from "../util/wait.js";
import { getExpeditionType } from "./callbacks/expedition-type.js";
import { DataHelper } from "./data-helper.js";

const mainLogger = getLogger();

// The universe API requests below outlive a fast page change; a navigation
// aborting them is expected, not an error. See util/abort.js.
suppressAbortRejections();

// PTRE team key held in the content script only for the lifetime of the tab.
// Pushed in from the page via `ptre.setTeamKey`; never persisted here.
let pendingPtreKey = "";

const UNIVERSE = window.location.host.split(".")[0];
let universes = {};
let currentUniverse = null;
let dataHelper = null;

function processData() {
  if (dataHelper) {
    universes[UNIVERSE] = dataHelper;
  } else {
    universes[UNIVERSE] = new DataHelper(UNIVERSE);
  }
  universes[UNIVERSE].init().then(() => {
    try {
      universes[UNIVERSE].update().then(() => {
        if (pendingPtreKey && universes[UNIVERSE]._galaxySnapshot) {
          universes[UNIVERSE].rebuildGalaxyStorage(pendingPtreKey);
        }
        let tempSaveData = { ...universes[UNIVERSE] };
        tempSaveData.lastUpdate = universes[UNIVERSE].lastUpdate.toJSON();
        tempSaveData.lastPlanetsUpdate = universes[UNIVERSE].lastPlanetsUpdate.toJSON();
        tempSaveData.lastPlayersUpdate = universes[UNIVERSE].lastPlayersUpdate.toJSON();
        // galaxyStorage lives in its own key `ogi-galaxy-<UNIVERSE>`; don't
        // duplicate it into the big blob or a manual reset gets resurrected
        // on next boot via Object.assign in main().
        delete tempSaveData.galaxyStorage;
        delete tempSaveData.lastGalaxyUpdateTS;
        // Runtime-only setTimeout id; must not survive a reload.
        delete tempSaveData._galaxyFlushTimer;
        delete tempSaveData._lastFlushError;
        delete tempSaveData._galaxySnapshot;

        chrome.storage.local.set({ [UNIVERSE]: tempSaveData }, function (at) {});
      });
      dataHelper = universes[UNIVERSE];
    } catch (e) {
      console.error(e);
      universes = {};
    }
  });
}

document.addEventListener("ogi-chart", function (e) {
  injectScript("libs/chart.min.js", () => {
    injectScript("libs/chartjs-plugin-labels.js");
  });
});

// LZString is only used by the pantry sync, which most sessions never run.
// Injected on demand rather than on every page load - see ensureLZString() in
// ogkush.js.
let lzStringInjected = false;
document.addEventListener("ogi-lzstring", function (e) {
  if (lzStringInjected) return;
  lzStringInjected = true;
  injectScript("libs/lz-string.min.js");
});

window.addEventListener(
  "ogi-players",
  function (evt) {
    wait
      .waitFor(() => dataHelper)
      .then(() => {
        let request = evt.detail;
        let response = { player: dataHelper.getPlayer(evt.detail.id) };
        var clone = response;
        if (navigator.userAgent.indexOf("Firefox") > 0) {
          clone = cloneInto(response, document.defaultView);
        }
        clone.requestId = request.requestId;
        window.dispatchEvent(new CustomEvent("ogi-players-rep", { detail: clone }));
      });
  },
  false
);

window.addEventListener(
  "ogi-filter",
  function (evt) {
    let request = evt.detail;
    let response = {
      players: dataHelper.filter(evt.detail.name, evt.detail.alliance),
    };
    var clone = response;
    if (navigator.userAgent.indexOf("Firefox") > 0) {
      clone = cloneInto(response, document.defaultView);
    }
    clone.requestId = request.requestId;
    window.dispatchEvent(new CustomEvent("ogi-filter-rep", { detail: clone }));
  },
  false
);

document.addEventListener("ogi-clear", function (e) {
  dataHelper.clearData();
});
document.addEventListener("ogi-galaxy-clear", function (e) {
  if (dataHelper) {
    dataHelper.galaxyStorage = {};
    dataHelper.lastGalaxyUpdateTS = -1;
  }
  chrome.storage.local.remove(`ogi-galaxy-${UNIVERSE}`);
});
document.addEventListener("ogi-notification", function (e) {
  if (!e.detail) throw new Error("No notification details provided");
  chrome.runtime.sendMessage({ eventType: "ogi-notification", message: e.detail }, function (response) {});
});
document.addEventListener("ogi-notification-scheduled", function (e) {
  if (!e.detail) throw new Error("No notification details provided");
  chrome.runtime.sendMessage({ eventType: "ogi-notification-scheduled", message: e.detail }, function (response) {});
});
document.addEventListener("ogi-notification-cancel", function (e) {
  if (!e.detail) throw new Error("No notification details provided");
  chrome.runtime.sendMessage({ eventType: "ogi-notification-cancel", message: e.detail }, function (response) {});
});
document.addEventListener("ogi-notification-sync", function (e) {
  if (!e.detail) throw new Error("No notification details provided");
  chrome.runtime.sendMessage({ eventType: "ogi-notification-sync", message: e.detail }, function (response) {
    // The sync result has to be applied by the page-context Notifier, which owns OGIData.
    // Importing Notifier here would pull the page's localStorage singleton into the content
    // script and give it a second, always-stale copy of ogk-data - so the result goes back
    // over an event instead, the same way ogi-players / ogi-filter reply.
    let clone = response ?? {};
    if (navigator.userAgent.indexOf("Firefox") > 0) {
      clone = cloneInto(clone, document.defaultView);
    }
    document.dispatchEvent(new CustomEvent("ogi-notification-sync-rep", { detail: clone }));
  });
});

/**
 * Registers the cross-context callbacks, then hydrates the universe DataHelper
 * from `chrome.storage.local` and refreshes it.
 *
 * Injection of the page-context scripts used to live at the bottom of this
 * function. It now happens in `main.js` at `document_start`, before this module
 * is even imported, so `ogkush.js` loads in parallel with this one instead of
 * behind it.
 *
 * @param {string} callbackToken the handshake token `main.js` minted and put on
 *   `<html>` before injecting the page script
 */
export function main(callbackToken) {
  mainLogger.log("Starting Ogame Beyond Infinity");

  // Registered here rather than at module evaluation because `main.js` mints
  // the token and publishes it at document_start, then injects ogkush.js
  // without waiting for this module - so the token has to come in as an
  // argument, and an argument is only available once main() is called.
  contentContextInit(
    {
      ptre: {
        galaxy: function (galaxy, system, positions, additionnal, ptreKey = null, serverTime = null) {
          return dataHelper.scan(galaxy, system, positions, additionnal, ptreKey, serverTime);
        },
        setTeamKey: function (key) {
          pendingPtreKey = typeof key === "string" ? key : "";
          if (pendingPtreKey && dataHelper && dataHelper._galaxySnapshot) {
            dataHelper.rebuildGalaxyStorage(pendingPtreKey);
          }
        },
        galaxyInfo: function () {
          if (!dataHelper || !dataHelper.galaxyStorage) {
            return Promise.resolve({ systemCount: 0, lastGalaxyUpdateTS: -1, storageBytes: 0 });
          }
          let systemCount = 0;
          for (const g in dataHelper.galaxyStorage) {
            systemCount += Object.keys(dataHelper.galaxyStorage[g]).length;
          }
          const lastGalaxyUpdateTS = dataHelper.lastGalaxyUpdateTS ?? -1;
          const key = `ogi-galaxy-${UNIVERSE}`;
          return new Promise((resolve) => {
            try {
              chrome.storage.local.get([key], (result) => {
                let storageBytes = 0;
                const raw = result?.[key];
                if (typeof raw === "string") storageBytes = new Blob([raw]).size;
                resolve({ systemCount, lastGalaxyUpdateTS, storageBytes });
              });
            } catch (_) {
              resolve({ systemCount, lastGalaxyUpdateTS, storageBytes: 0 });
            }
          });
        },
      },
      messages: {
        expeditionType: getExpeditionType,
      },
    },
    callbackToken
  );

  if (!universes[UNIVERSE] || Object.keys(universes[UNIVERSE]).length === 0) {
    //chrome.storage.local.clear()
    chrome.storage.local.get([UNIVERSE], function (data) {
      if (data && Object.keys(data).length > 0) {
        try {
          let tempSaveData = data[UNIVERSE];
          tempSaveData.lastUpdate = new Date(tempSaveData.lastUpdate);
          tempSaveData.lastPlanetsUpdate = new Date(tempSaveData.lastPlanetsUpdate);
          tempSaveData.lastPlayersUpdate = new Date(tempSaveData.lastPlayersUpdate);
          universes[UNIVERSE] = new DataHelper(UNIVERSE);
          dataHelper = Object.assign(universes[UNIVERSE], tempSaveData);
        } catch (e) {
          console.error(e);
          chrome.storage.local.clear();
        }
      }
      processData();
    });
  }
}
