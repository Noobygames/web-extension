import { getLogger } from "../../../platform/logger.js";
import { messagesTabs } from "../index.js";
import OGBIData from "../../../store/OGBIData.js";
import PlanetType from "../../../game/planetType.js";
import ship from "../../../game/ship.js";
import * as standardUnit from "../../../game/standardUnit.js";
import { createDOM } from "../../../ui/dom.js";
import { fleetCost } from "../../../game/fleetCost.js";
import { toFormattedNumber } from "../../../format/numbers.js";
import { confirmAttackFromReport } from "../../../store/bashLog.js";

class FightMessagesAnalyzer {
  #logger;
  #messages;

  constructor() {
    this.#logger = getLogger("FightMessagesAnalyzer");
  }

  support(tabId) {
    return [messagesTabs.BATTLE_REPORT].includes(tabId);
  }

  analyze(messageCallable, tabId) {
    this.#messages = messageCallable();

    this.#parseExpeditionFight();
    this.#parseFight();
  }

  #addStandardUnit(combat, message) {
    /* @todo remove the cargoCapacity check when GF provide the good number for data-raw-fleets>combatTechnologies.amount */
    if ((combat.isProbes && !OGBIData.ships[ship.EspionageProbe].cargoCapacity) || !combat.loot) return;

    const msgTitle = message.querySelector(".msgHeadItem .msgTitle");
    const standardUnitSum =
      standardUnit.standardUnit(combat.loot || [0, 0, 0]) - standardUnit.standardUnit(fleetCost(combat.losses || []));
    const amountDisplay = `${toFormattedNumber(standardUnitSum, [0, 1], true)} ${standardUnit.unitType()}`;

    msgTitle.appendChild(
      createDOM("span", { class: `ogk-label ${standardUnitSum < 0 ? "ogi-negative" : ""}` }, amountDisplay)
    );
  }

  #getExpeditionFight() {
    const messages = [];

    this.#messages.forEach((e) => {
      const coords = e.querySelector(".rawMessageData")?.getAttribute("data-raw-coords");

      if (parseInt(coords?.split(":")[2]) !== 16) return;

      messages.push(e);
    });

    return messages;
  }

  #parseExpeditionFight() {
    this.#getExpeditionFight().forEach((message) => {
      try {
        this.#parseOneExpeditionFight(message);
      } catch (error) {
        // Neither this pass nor #parseFight() below filters on `data-raw-messagetype`
        // - both look only at coordinates and hashcode, so a message that is not
        // actually a fight report reaches a parser that expects one. Before this
        // guard, the exception left `analyze()` and every message after this one in
        // the same pass was silently skipped - one odd row blanked the whole
        // battle-report tab. refactoring-new.md Phase A.2 #5.
        this.#logger.error(
          `could not parse message ${message.getAttribute("data-msg-id")} as an expedition fight`,
          error
        );
      }
    });
  }

  #parseOneExpeditionFight(message) {
    const combats = OGBIData.combats;
    const expeditionSums = OGBIData.expeditionSums;
    const msgId = message.getAttribute("data-msg-id");

    if (combats[msgId]) {
      message.classList.add("ogk-expedition");
      this.#addStandardUnit(combats[msgId], message);
      return;
    }

    const defendersSpaceObject = JSON.parse(
      message.querySelector(".rawMessageData")?.getAttribute("data-raw-defenderspaceobject")
    );

    const result = JSON.parse(message.querySelector(".rawMessageData").getAttribute("data-raw-result"));

    const newDate = new Date(message.querySelector(".rawMessageData").getAttribute("data-raw-date"));
    const dates = [
      newDate.getDate().toString().padStart(2, "0"),
      (newDate.getMonth() + 1).toString().padStart(2, "0"),
      newDate.getFullYear().toString().slice(2),
    ];

    const datePoint = dates.join(".");

    if (!expeditionSums[datePoint]) {
      expeditionSums[datePoint] = {
        found: [0, 0, 0, 0],
        harvest: [0, 0, 0],
        fleet: {},
        losses: {},
        type: {},
        fuel: 0,
        adjust: [0, 0, 0],
      };
    }

    const rounds = JSON.parse(message.querySelector(".rawMessageData").getAttribute("data-raw-combatrounds"));

    const lastRound = rounds.pop();
    const fleets = lastRound?.fleets[0]?.technologies;
    const losses = {};

    fleets.forEach((fleet) => {
      if (fleet.destroyedTotal === 0) return;

      if (!expeditionSums[datePoint].losses[fleet.technologyId]) {
        expeditionSums[datePoint].losses[fleet.technologyId] = 0;
      }

      expeditionSums[datePoint].losses[fleet.technologyId] += fleet.destroyedTotal;
      losses[fleet.technologyId] = fleet.destroyedTotal;
    });

    combats[msgId] = {
      timestamp: message.querySelector(".rawMessageData")?.getAttribute("data-raw-timestamp"),
      favorited: !!message.querySelector(".icon_favorited"),
      coordinates: {
        ...defendersSpaceObject.coordinates,
        planetType: defendersSpaceObject.type === "moon" ? PlanetType.moon : PlanetType.planet,
      },
      win: result.winner === "defender",
      draw: result.winner === "none",
      isProbes: false,
      loot: [0, 0, 0],
      losses,
    };

    message.classList.add("ogk-expedition");

    OGBIData.combats = combats;
    OGBIData.expeditionSums = expeditionSums;

    this.#addStandardUnit(combats[msgId], message);
  }

  /**
   * Feeds the bashing counter from a battle report.
   *
   * This is the half of the counter that does not depend on the fleet having been sent
   * from this browser: the report is in the inbox whichever device launched it, so
   * opening the messages tab is what keeps a phone-played account's numbers honest.
   * Runs on cached records too, so re-reading old reports backfills a cleared log.
   *
   * Skipped on purpose:
   * - fights the account defended (`attacker !== true`) - being attacked is not bashing;
   * - probe-only fights (`isProbes`) - those are espionage missions whose probes were
   *   shot down, and espionage is exempt from the rule;
   * - records cached before `attacker` was stored, where the side is unknown.
   *
   * Moon-destruction reports do count under the rule but arrive as their own message
   * type, which no analyzer covers yet; those stay launch-only for now.
   *
   * `confirmAttackFromReport()` is idempotent per hashcode and drops anything outside
   * the 24h window, so this runs on every render without inflating anything.
   */
  #recordBashing(combat) {
    if (combat?.attacker !== true || combat.isProbes) return;

    const coordinates = combat.coordinates;
    if (!coordinates) return;

    try {
      confirmAttackFromReport(
        `${coordinates.galaxy}:${coordinates.system}:${coordinates.position}`,
        coordinates.planetType,
        // `data-raw-timestamp` is epoch seconds, like everywhere else in the analyzers.
        Number(combat.timestamp) * 1000,
        combat.hashcode
      );
    } catch (error) {
      this.#logger.warn("could not feed the bashing counter from a battle report", error);
    }
  }

  #getFight() {
    const messages = [];

    this.#messages.forEach((e) => {
      const element = e.querySelector(".rawMessageData");
      const coords = element?.getAttribute("data-raw-coords");
      const hashcode = element?.getAttribute("data-raw-hashcode");

      if (parseInt(coords?.split(":")[2]) === 16) return; // Expedition fight
      if (hashcode === "") return; // If hashcode is empty, spy not come back

      messages.push(e);
    });

    return messages;
  }

  #parseFight() {
    this.#getFight().forEach((message) => {
      try {
        this.#parseOneFight(message);
      } catch (error) {
        this.#logger.error(`could not parse message ${message.getAttribute("data-msg-id")} as a fight`, error);
      }
    });
  }

  #parseOneFight(message) {
    const combats = OGBIData.combats;
    const msgId = message.getAttribute("data-msg-id");

    if (combats[msgId]) {
      if (combats[msgId].isProbes) {
        message.classList.add("ogk-combat-probes");
      } else if (combats[msgId].draw) {
        message.classList.add("ogk-combat-draw");
      } else if (combats[msgId].win) {
        message.classList.add("ogk-combat-win");
      } else {
        message.classList.add("ogk-combat");
      }

      this.#recordBashing(combats[msgId]);
      this.#addStandardUnit(combats[msgId], message);
      return;
    }

    const defendersSpaceObject = JSON.parse(
      message.querySelector(".rawMessageData")?.getAttribute("data-raw-defenderspaceobject")
    );

    const result = JSON.parse(message.querySelector(".rawMessageData").getAttribute("data-raw-result"));
    const fleets = JSON.parse(message.querySelector(".rawMessageData").getAttribute("data-raw-fleets"));
    const probesAccount = { defender: 0, attacker: 0 };
    const fleetPerSide = { defender: [], attacker: [] };
    let accountIsDefender = defendersSpaceObject.owner.id === playerId;
    let ennemy = null;

    fleets.forEach((fleet) => {
      if (!fleetPerSide[fleet.side][fleet.player.id]) fleetPerSide[fleet.side][fleet.player.id] = [];

      fleetPerSide[fleet.side][fleet.player.id].push({
        fleetId: fleet.fleetId,
        playerId: fleet.player.id,
        player: fleet.player,
      });

      if (fleet.player.id === playerId && fleet.side === "defender") accountIsDefender = true;

      fleet.combatTechnologies.forEach((shipInFleet) => {
        if (shipInFleet.technologyId == ship.EspionageProbe && probesAccount[fleet.side] >= 0)
          probesAccount[fleet.side] += shipInFleet.amount;
        else probesAccount[fleet.side] = -1;
      });
    });

    /* @todo this is wrong if multiple attacker / defender */
    if (accountIsDefender) {
      Object.values(fleetPerSide.attacker).forEach((players) => {
        players.forEach((fleet) => {
          ennemy = fleet.player;
        });
      });
    } else {
      Object.values(fleetPerSide.defender).forEach((players) => {
        players.forEach((fleet) => {
          ennemy = fleet.player;
        });
      });
    }

    const accountIsWinner = result.winner === (accountIsDefender ? "defender" : "attacker");
    const isDraw = result.winner === "none";
    const isProbes =
      (2e3 > probesAccount.defender && probesAccount.defender > 0) ||
      (2e3 > probesAccount.attacker && probesAccount.attacker > 0);

    const resources = result.loot.resources;

    result.totalValueOfUnitsLost.forEach((side) => {
      if (accountIsDefender && side.side === "attacker") ennemy.losses = side.value;
      if (!accountIsDefender && side.side === "defender") ennemy.losses = side.value;
    });

    const rounds = JSON.parse(message.querySelector(".rawMessageData").getAttribute("data-raw-combatrounds"));
    const lastRound = rounds.pop();
    const losses = {};

    lastRound?.fleets.forEach((side) => {
      if (
        !fleetPerSide.attacker[playerId]?.some((fleet) => fleet.fleetId === side.fleetId) &&
        !fleetPerSide.defender[playerId]?.some((fleet) => fleet.fleetId === side.fleetId)
      )
        return;

      side.technologies.forEach((ship) => {
        if (!Object.hasOwn(ship, "destroyedTotal") || ship.destroyedTotal === 0) return;

        if (!losses[ship.technologyId]) losses[ship.technologyId] = 0;
        losses[ship.technologyId] += ship.destroyedTotal;
      });
    });

    const hashcode = message.querySelector(".rawMessageData")?.getAttribute("data-raw-hashcode");
    const isKnownCombat = Object.values(combats).some((combat) => combat.hashcode === hashcode);

    combats[msgId] = {
      timestamp: message.querySelector(".rawMessageData")?.getAttribute("data-raw-timestamp"),
      favorited: !!message.querySelector(".icon_favorited"),
      hashcode: message.querySelector(".rawMessageData")?.getAttribute("data-raw-hashcode"),
      coordinates: {
        ...defendersSpaceObject.coordinates,
        planetType: defendersSpaceObject.type === "moon" ? PlanetType.moon : PlanetType.planet,
      },
      win: accountIsWinner,
      draw: isDraw,
      isProbes: isProbes,
      // Which side the account was on. Only stored since the bashing counter needed it -
      // an entry cached before that has it undefined, and #recordBashing() skips those
      // rather than guessing which way round the fight was.
      attacker: !accountIsDefender,
      loot: resources.map((obj) => obj.amount * (accountIsWinner ? 1 : -1)),
      losses,
    };

    this.#recordBashing(combats[msgId]);

    if (combats[msgId].isProbes) {
      message.classList.add("ogk-combat-probes");
    } else if (combats[msgId].draw) {
      message.classList.add("ogk-combat-draw");
    } else if (combats[msgId].win) {
      message.classList.add("ogk-combat-win");
    } else {
      message.classList.add("ogk-combat");
    }

    this.#addStandardUnit(combats[msgId], message);

    OGBIData.combats = combats;

    // don't account twice a know or probe fight in combatsSums
    if (isKnownCombat || combats[msgId].isProbes) return;

    const combatsSums = JSON.parse(JSON.stringify(OGBIData.combatsSums)); // deep copy
    const newDate = new Date(message.querySelector(".rawMessageData").getAttribute("data-raw-date"));
    const dates = [
      newDate.getDate().toString().padStart(2, "0"),
      (newDate.getMonth() + 1).toString().padStart(2, "0"),
      newDate.getFullYear().toString().slice(2),
    ];

    const datePoint = dates.join(".");

    if (!combatsSums[datePoint]) {
      combatsSums[datePoint] = {
        loot: [0, 0, 0],
        harvest: [0, 0, 0],
        losses: {},
        fuel: 0,
        adjust: [0, 0, 0],
        topCombats: [],
        count: 0,
        wins: 0,
        draws: 0,
      };
    }
    combatsSums[datePoint].count += 1;
    if (accountIsWinner) combatsSums[datePoint].wins += 1;
    if (isDraw) combatsSums[datePoint].draws += 1;

    const topCombat = {
      debris:
        parseInt(result.debris.resources?.[0]?.total || 0) +
        parseInt(result.debris.resources?.[1]?.total || 0) +
        parseInt(result.debris.resources?.[2]?.total || 0),
      loot: (resources?.[0].amount + resources?.[1].amount + resources?.[2].amount) * (accountIsWinner ? 1 : -1),
      ennemi: ennemy?.name,
      losses: ennemy?.losses,
    };

    combatsSums[datePoint].topCombats.push(topCombat);

    combatsSums[datePoint].topCombats.sort((a, b) => b.debris + Math.abs(b.loot) - (a.debris + Math.abs(a.loot)));

    if (combatsSums[datePoint].topCombats.length > 3) {
      combatsSums[datePoint].topCombats.pop();
    }

    combatsSums[datePoint].loot[0] += resources?.[0].amount * (accountIsWinner ? 1 : -1);
    combatsSums[datePoint].loot[1] += resources?.[1].amount * (accountIsWinner ? 1 : -1);
    combatsSums[datePoint].loot[2] += resources?.[2].amount * (accountIsWinner ? 1 : -1);

    Object.keys(losses).forEach((technologyId) => {
      if (!combatsSums[datePoint].losses[technologyId]) combatsSums[datePoint].losses[technologyId] = 0;
      combatsSums[datePoint].losses[technologyId] += losses[technologyId];
    });

    OGBIData.combatsSums = combatsSums;
  }
}

export default FightMessagesAnalyzer;
