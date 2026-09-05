import { tabs } from "../../ui/tabs.js";
import * as popupUtil from "../../ui/popup.js";
import { loading } from "../../ui/loading.js";
import Translator from "../../format/i18n/translate.js";
import dataHelper from "../../integrations/dataHelper.js";
import * as wait from "../../platform/wait.js";
import { getLogger } from "../../platform/logger.js";

import { statsState } from "./state.js";
import { generalStats } from "./generalStats.js";
import { minesStats } from "./minesStats.js";
import { expeditionStats } from "./expeditionStats.js";
import { discoveryStats } from "./discoveryStats.js";
import { combatStats } from "./combatStats.js";
import { roiStats } from "./roiStats.js";

/**
 * The statistics popup: the six tabs behind the chart icon in the top bar.
 *
 * Lifted out of `OGBeyondInfinity` in Phase 3 of refactoring.md, then split by tab because
 * one 3.6k-line file is not an improvement on one 19k-line file. This is the entry
 * point and the tab wiring; each tab and the shared drawing helpers live next to it.
 *
 * `Chart` is a page global, injected on demand over the `ogi-chart` event.
 */
const logger = getLogger("stats");

/**
 * Whether `chartjs-plugin-labels` has registered itself.
 *
 * It defines no global of its own - it calls `Chart.plugins.register()` - so the
 * presence of `Chart` says nothing about whether it is there yet.
 *
 * @returns {boolean}
 */
function labelsPluginRegistered() {
  const plugins = typeof window === "undefined" ? undefined : window.Chart?.plugins;
  if (typeof plugins?.getAll !== "function") return false;

  return plugins.getAll().some((plugin) => plugin?.id === "labels");
}

/**
 * Waits until a chart can actually be drawn - the library **and** the labels plugin.
 *
 * The two arrive separately: `ctxcontent/index.js` injects `chart.min.js` and only
 * from its onload callback `chartjs-plugin-labels.js`. Waiting for `Chart` alone
 * therefore returns during the gap between them, and a chart built in that gap is
 * built without the plugin: Chart.js caches the plugin list per chart at update
 * time, so `beforeDatasetsUpdate` - the hook that creates `chart._labels` - never
 * runs for it. Registering the plugin a moment later invalidates that cache, and the
 * next frame of the doughnut's own open animation reaches `afterDatasetsDraw`, which
 * does `chart._labels.forEach(...)` on an undefined. That is the
 * "Cannot read properties of undefined (reading 'forEach')" in the error console.
 *
 * A plugin that never turns up is not worth withholding the statistics for: the
 * charts then draw without their labels, which is what the old code did every time.
 *
 * @returns {Promise<boolean>} whether both were there in the end
 */
async function chartLibrariesReady() {
  if (typeof Chart === "undefined") {
    // Fire-and-forget event asks main.js to inject chart.min.js as a classic
    // script; there is no promise back from that, only the global it defines.
    // Phase 6 of refactoring.md replaced the hand-rolled setInterval poll with
    // the same waitForDefinition() the boot path already uses for DOMPurify.
    document.dispatchEvent(new CustomEvent("ogi-chart", {}), true, true);
    await wait.waitForDefinition(window, "Chart");
  }

  if (labelsPluginRegistered()) return true;

  try {
    await wait.waitFor(labelsPluginRegistered);
    return true;
  } catch {
    logger.warn("chartjs-plugin-labels never registered - drawing the charts without labels");
    return false;
  }
}

/**
 * Opens the statistics popup.
 *
 * @param {{playerClass: number, hasLifeforms: boolean, universe: string, playerBonuses: object}} context
 *   the page facts the tabs read, from `OGBeyondInfinity.statsContext()`. Stored for the
 *   lifetime of the popup rather than threaded through six tab functions.
 */
async function statistics(context) {
  statsState.context = context;

  // getPlayer() and, on first use, chart.min.js injection both take a beat -
  // show the spinner right away instead of leaving the click looking dead.
  loading();

  let showStats = async () => {
    let player = await dataHelper.getPlayer(playerId);
    let tabNames = {};
    tabNames[Translator.translate(91, "text", false)] = generalStats.bind(null, player);
    tabNames[Translator.translate(85, "text", false)] = minesStats;
    tabNames[Translator.translate(41, "text", false)] = expeditionStats;
    if (statsState.context.hasLifeforms) {
      tabNames[Translator.translate(139, "text", false)] = discoveryStats;
    }
    tabNames[Translator.translate(92, "text", false)] = combatStats;
    tabNames[Translator.translate(120, "text", false)] = roiStats;

    let body = tabs(tabNames);
    popupUtil.popup(null, body);
  };
  await chartLibrariesReady();
  showStats();
}

export { statistics, labelsPluginRegistered, chartLibrariesReady };
