import { getLogger } from "../../../util/logger.js";
import { messagesTabs } from "../index.js";
import MessageType from "../../../util/enum/messageType.js";
import { toFormattedNumber } from "../../../util/numbers.js";
import { createDOM } from "../../../util/dom.js";
import * as standardUnit from "../../../util/standardUnit.js";

/**
 * Trade messages get one label appended - the net standard-unit gain or loss of the
 * transport - and nothing else. `OGBIData.trades` / `.tradesSums` used to exist for
 * a trade statistics tab that was never built: both writes were commented out from
 * the commit that introduced this file (2319fe5, 2024-07-30) onward, `tradesSums`
 * was a copy of the combat-sums shape (`losses`, `wins`, `topCombats`, ...) that
 * never actually accumulated anything, and nothing anywhere in `src/` ever read
 * either field. Removed rather than turned on - refactoring-new.md Phase A.1 #3.
 */
class TradeMessagesAnalyzer {
  #logger;
  #messages;

  constructor() {
    this.#logger = getLogger("TradeAnalyzer");
  }

  support(tabId) {
    return [messagesTabs.GROUP_SHIPPING].includes(tabId);
  }

  analyze(messageCallable, tabId) {
    this.#messages = messageCallable();

    this.#parseTradeMessages();
  }

  #getTradesMessages() {
    const messages = [];
    this.#messages.forEach((message) => {
      const rawMessageData = message.querySelector(".rawMessageData");
      if (
        parseInt(rawMessageData?.getAttribute("data-raw-messagetype")) !== MessageType.transport ||
        (parseInt(rawMessageData?.getAttribute("data-raw-sourceplayerid")) === playerId &&
          parseInt(rawMessageData?.getAttribute("data-raw-targetplayerid")) === playerId)
      )
        return;

      messages.push(message);
    });

    return messages;
  }

  #parseTradeMessages() {
    const addStandardUnit = (loot, message) => {
      const msgTitle = message.querySelector(".msgHeadItem .msgTitle");
      const standardUnitSum = standardUnit.standardUnit(loot);
      const amountDisplay = `${toFormattedNumber(standardUnitSum, [0, 1], true)} ${standardUnit.unitType()}`;

      msgTitle.appendChild(
        createDOM("span", { class: `ogk-label ${standardUnitSum < 0 ? "ogi-negative" : ""}` }, amountDisplay)
      );
    };

    this.#getTradesMessages().forEach((message) => {
      const rawMessageData = message.querySelector(".rawMessageData");
      const isIncomingRessources = parseInt(rawMessageData.getAttribute("data-raw-sourceplayerid")) !== playerId;
      const cargo = JSON.parse(rawMessageData.getAttribute("data-raw-cargo"));
      const loot = [
        cargo.metal * (isIncomingRessources ? 1 : -1),
        cargo.crystal * (isIncomingRessources ? 1 : -1),
        cargo.deuterium * (isIncomingRessources ? 1 : -1),
      ];

      addStandardUnit(loot, message);
    });
  }
}

export default TradeMessagesAnalyzer;
