import { tabs } from "../../util/tabs.js";
import * as popupUtil from "../../util/popup.js";
import Translator from "../../util/translate.js";
import dataHelper from "../../util/dataHelper.js";
import * as wait from "../../util/wait.js";

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
/**
 * Opens the statistics popup.
 *
 * @param {{playerClass: number, hasLifeforms: boolean, universe: string, playerBonuses: object}} context
 *   the page facts the tabs read, from `OGBeyondInfinity.statsContext()`. Stored for the
 *   lifetime of the popup rather than threaded through six tab functions.
 */
async function statistics(context) {
  statsState.context = context;

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
  if (typeof Chart === "undefined") {
    // Fire-and-forget event asks main.js to inject chart.min.js as a classic
    // script; there is no promise back from that, only the global it defines.
    // Phase 6 of refactoring.md replaced the hand-rolled setInterval poll with
    // the same waitForDefinition() the boot path already uses for DOMPurify.
    document.dispatchEvent(new CustomEvent("ogi-chart", {}), true, true);
    await wait.waitForDefinition(window, "Chart");
    showStats();
  } else {
    showStats();
  }
}

export { statistics };
