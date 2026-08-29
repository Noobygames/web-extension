/**
 * The game's arithmetic: what a building or research costs, how long it takes, what a
 * mine produces, and how long an upgrade takes to pay for itself.
 *
 * Lifted out of `OGBeyondInfinity` in Phase 3 of refactoring.md. The bodies are unchanged;
 * the only edits were the ones needed to drop `this`:
 *
 * - `this.json` became `OGBIData.json`. Back then `OGBeyondInfinity.init()` aliased one
 *   to the other, so it was always the same object; Phase 4 removed the alias, and
 *   `OGBIData` is now the only way in.
 * - `this.saveData()` became `OGBIData.Save()`, which is what it did.
 * - `this.playerClass` / `this.geologist` / `this.allOfficers` became an explicit
 *   `player` argument on the three functions that read them. A formula module must not
 *   hold a reference to the page controller.
 * - The file-local `PLAYER_CLASS_*` constants became the shared `PlayerClass` enum,
 *   which carries the same values.
 *
 * Two of these carry known defects, pinned by `test/ogCore.calculations.test.js`:
 * `roiMine()` prices an upgrade as N times the target level instead of summing the
 * levels, and `getBestRoi()` averages over `OGBIData.empire` while dividing by
 * `OGBIData.json.empire.length`. Both were moved as they are - repairs belong in their
 * own commits, not in a move.
 */
import { BUIDLING_INFO } from "./enum/buildingInfo.js";
import { RESEARCH_INFO } from "./enum/researchInfo.js";
import {
  CRAWLER_OVERLOAD_MAX,
  GEOLOGIST_CRAWLER_BONUS,
  GEOLOGIST_RESOURCE_BONUS,
  OFFICER_RESOURCE_BONUS,
  PLASMATECH_BONUS,
  TRADER_RESOURCE_BONUS,
} from "./gameConstants.js";
import PlayerClass from "./enum/playerClass.js";
import AllianceClass from "./enum/allianceClass.js";
import OGBIData from "./OGBIData.js";

export function consumption(id, lvl) {
  if (!BUIDLING_INFO[id].baseCons || !BUIDLING_INFO[id].factorCons) return 0;
  return Math.floor(
    BUIDLING_INFO[id].baseCons * lvl * Math.pow(BUIDLING_INFO[id].factorCons, id >= 11101 && lvl == 1 ? 0 : lvl) /*
    (1 - OGBIData.json.lifeformBonus.consumptionReduction?.[id]?.energy || 1)*/
    // TODO: add lf consumption reduction bonus
  );
}

export function minesProduction(id, lvl, position, temp) {
  let baseProd = { 1: 30, 2: 20, 3: 10, 4: 20 };
  let positionBonus = 1;
  if (id == 1) {
    if (position == 6 || position == 10) {
      positionBonus = 1.17;
    } else if (position == 7 || position == 9) {
      positionBonus = 1.23;
    } else if (position == 8) {
      positionBonus = 1.35;
    }
  }
  if (id == 2) {
    if (position == 1) {
      positionBonus = 1.4;
    } else if (position == 2) {
      positionBonus = 1.3;
    } else if (position == 3) {
      positionBonus = 1.2;
    }
  }
  let prod = baseProd[id] * lvl * Math.pow(1.1, lvl);
  if (id == 3) {
    prod *= 1.44 - 0.004 * temp;
  }
  if (id == 12) {
    prod = 30 * lvl * Math.pow(1.05 + OGBIData.json.technology[113] * 0.01, lvl);
  }
  prod = prod * positionBonus;
  if (id == 1 || id == 2 || id == 3) {
    prod = prod * OGBIData.json.speed;
  }
  return Math.floor(prod);
}

export function research(id, lvl, technocrat, explorer, acceleration, object = null) {
  // console.log(
  //   `research(id=${id}, lvl=${lvl}, technocrat=${technocrat}, explorer=${explorer}, acceleration=${acceleration}, object=${object})`
  // );
  let labLvl = 1;
  let timeFactor = 1;
  let costFactor = 1;
  let costLFBonus = 0;
  let timeLFBonus = 0;
  if (object) {
    if (id < 11001) {
      let labs = [];
      let igfn = OGBIData.json.technology[123];
      OGBIData.empire.forEach((planet) => labs.push(planet[31]));
      if (object.type == 3) {
        labLvl = 0;
      } else {
        labLvl = object[31];
        labs.splice(object.index, 1);
      }
      labs
        .sort((a, b) => b - a)
        .slice(0, igfn)
        .map((x) => (labLvl += x));
    } else {
      costLFBonus += OGBIData.json.lifeformPlanetBonus[object.id]?.technologyCostReduction || 0;
      timeLFBonus += OGBIData.json.lifeformPlanetBonus[object.id]?.technologyTimeReduction || 0;
    }
    const key = id < 11201 ? id : "LfResearch";
    costLFBonus += OGBIData.json.lifeformBonus.technologyCostReduction?.[key] || 0;
    timeLFBonus = Math.min(0.99, timeLFBonus + (OGBIData.json.lifeformBonus.technologyTimeReduction?.[key] || 0));
    costFactor -= costLFBonus;
    timeFactor -= timeLFBonus;
  }
  let cost = [
    Math.floor(
      RESEARCH_INFO[id].baseCost[0] *
        Math.pow(RESEARCH_INFO[id].factorCost, lvl - 1) *
        (id >= 11101 ? lvl : 1) *
        (id >= 11101 && labLvl > 1 ? 1.0 - 0.0025 * labLvl : 1)
    ),
    Math.floor(
      RESEARCH_INFO[id].baseCost[1] *
        Math.pow(RESEARCH_INFO[id].factorCost, lvl - 1) *
        (id >= 11101 ? lvl : 1) *
        (id >= 11101 && labLvl > 1 ? 1.0 - 0.0025 * labLvl : 1)
    ),
    Math.floor(
      RESEARCH_INFO[id].baseCost[2] *
        Math.pow(RESEARCH_INFO[id].factorCost, lvl - 1) *
        (id >= 11101 ? lvl : 1) *
        (id >= 11101 && labLvl > 1 ? 1.0 - 0.0025 * labLvl : 1)
    ),
  ];
  if (RESEARCH_INFO[id].baseCost[3])
    cost.push(RESEARCH_INFO[id].baseCost[3] * Math.pow(RESEARCH_INFO[id].factorEnergy, lvl - 1));
  let time = ((cost[0] + cost[1]) / (OGBIData.json.speed * 1000 * (1 + labLvl)) / OGBIData.json.researchDivisor) * 3600;
  if (technocrat) time -= time * 0.25;
  if (explorer) time -= time * 0.25 * (1 + OGBIData.json.lifeformBonus.classBonus.explorer);
  if (acceleration) time -= time * 0.25;
  if (RESEARCH_INFO[id].factorTime)
    time = (RESEARCH_INFO[id].baseTime * Math.pow(RESEARCH_INFO[id].factorTime, lvl) * lvl) / OGBIData.json.speed;
  time *= timeFactor;
  if (id == 124) time = Math.round(time / 100) * 100;
  return {
    time: Math.max(Math.floor(time), 1),
    cost: cost.map((x) => Math.floor(x * costFactor)),
  };
}

export function building(id, lvl, object = null) {
  let costFactor = 1;
  let timeFactor = 1;

  let robotic = object ? object[14] : 0;
  let nanite = object ? (object[15] ? object[15] : 0) : 0;
  if (id >= 11101) lvl = Math.max(lvl, 1); // needed for demolish to lvl 0

  if (object) {
    costFactor -= OGBIData.json.lifeformPlanetBonus[object.id]?.buildingCostReduction?.[id] || 0;
    timeFactor -= OGBIData.json.lifeformPlanetBonus[object.id]?.buildingTimeReduction?.[id] || 0;
  }

  costFactor -= OGBIData.json.lifeformBonus.technologyCostReduction?.[id] || 0;
  timeFactor -= OGBIData.json.lifeformBonus.technologyTimeReduction?.[id] || 0;

  let cost = [
    Math.floor(
      BUIDLING_INFO[id].baseCost[0] *
        Math.pow(BUIDLING_INFO[id].factorCost, lvl - 1) *
        (id >= 11101 ? lvl : 1) *
        costFactor
    ),
    Math.floor(
      BUIDLING_INFO[id].baseCost[1] *
        Math.pow(BUIDLING_INFO[id].factorCost, lvl - 1) *
        (id >= 11101 ? lvl : 1) *
        costFactor
    ),
    Math.floor(
      BUIDLING_INFO[id].baseCost[2] *
        Math.pow(BUIDLING_INFO[id].factorCost, lvl - 1) *
        (id >= 11101 ? lvl : 1) *
        costFactor
    ),
  ];
  if (BUIDLING_INFO[id].baseCost[3])
    cost.push(
      Math.floor(
        BUIDLING_INFO[id].baseCost[3] *
          Math.pow(BUIDLING_INFO[id].factorEnergy, lvl - (id >= 11101 ? (lvl == 1 ? 1 : 0) : 1)) *
          (id >= 11101 ? lvl : 1) *
          costFactor
      )
    );
  let time = Math.max(
    Math.floor(
      ((cost[0] + cost[1]) /
        (2500 *
          (1 + robotic) *
          Math.pow(2, nanite) *
          (![15, 41, 42, 43].includes(id) ? Math.max(4 - lvl / 2, 1) : 1) *
          OGBIData.json.speed)) *
        3600
    ),
    1
  );

  // remove any time reduction applied by side effect on regular tech by cost reduction LF tech
  if (costFactor < 1 && id < 11101) time /= costFactor;

  if (BUIDLING_INFO[id].factorTime) {
    time = Math.max(
      Math.round(
        Math.floor(
          (BUIDLING_INFO[id].baseTime * Math.pow(BUIDLING_INFO[id].factorTime, lvl) * lvl) /
            ((1 + robotic) * Math.pow(2, nanite) * OGBIData.json.speed)
        ) * timeFactor
      ),
      lvl
    );
  }
  let returnValue = {
    time: time,
    cost: cost,
  };
  if (BUIDLING_INFO[id].basePop)
    // TODO: check if own population factor is needed
    returnValue.pop = Math.floor(
      BUIDLING_INFO[id].basePop * Math.pow(BUIDLING_INFO[id].factorPop, lvl - 1) * costFactor
    );
  return returnValue;
}

export function roiPlasmatechnology(tolvl) {
  let plasma = OGBIData.json.technology[122];
  let plasmaBonus = PLASMATECH_BONUS.map((x) => x * (tolvl - plasma));

  let tradeRate = OGBIData.json.options.tradeRate;
  let prodDiffMSE = 0;
  OGBIData.empire.forEach((planet) => {
    let pos = planet.position;
    let temp = planet.db_par2 + 40;
    let prodDiff = [
      minesProduction(1, planet[1], pos, temp) * plasmaBonus[0],
      minesProduction(2, planet[2], pos, temp) * plasmaBonus[1],
      minesProduction(3, planet[3], pos, temp) * plasmaBonus[2],
    ];
    prodDiffMSE += prodDiff.map((x, n) => (x * tradeRate[0]) / tradeRate[n]).reduce((sum, cur) => sum + cur, 0);
  });
  let reasearchCostMSE = 0;
  for (let lvl = plasma + 1; lvl <= tolvl; lvl++) {
    reasearchCostMSE += research(122, lvl, false, false, false)
      .cost.map((x, n) => (x * tradeRate[0]) / tradeRate[n])
      .reduce((sum, cur) => sum + cur, 0);
  }
  return (reasearchCostMSE * 3600) / prodDiffMSE;
}

export function roiLfResearch(technoId, baselvl, tolvl, object) {
  // console.log(`roiLfResearch(${technoId}, ${baselvl}, ${tolvl}, ${object})`);
  if (!OGBIData.json.lifeFormProductionBoostFromResearch[technoId]) return;
  let techBonusFromLifeformLevel =
    0.001 * OGBIData.json.lifeformBonus.lifeformLevel?.[OGBIData.json.selectedLifeforms[object.id]] || 0;
  let bonus = OGBIData.json.lifeFormProductionBoostFromResearch[technoId].map(
    (x) => (x / 100) * (1 + techBonusFromLifeformLevel) * (tolvl - baselvl + 1)
  );

  let tradeRate = OGBIData.json.options.tradeRate;
  let prodDiffMSE = 0;
  OGBIData.empire.forEach((planet) => {
    let pos = planet.position;
    let temp = planet.db_par2 + 40;
    let prodDiff = [
      minesProduction(1, planet[1], pos, temp) * bonus[0],
      minesProduction(2, planet[2], pos, temp) * bonus[1],
      minesProduction(3, planet[3], pos, temp) * bonus[2],
    ];
    prodDiffMSE += prodDiff.map((x, n) => (x * tradeRate[0]) / tradeRate[n]).reduce((sum, cur) => sum + cur, 0);
  });
  let reasearchCostMSE = 0;
  for (let lvl = baselvl; lvl <= tolvl; lvl++) {
    reasearchCostMSE += research(technoId, lvl, false, false, false, object)
      .cost.map((x, n) => (x * tradeRate[0]) / tradeRate[n])
      .reduce((sum, cur) => sum + cur, 0);
  }
  return (reasearchCostMSE * 3600) / prodDiffMSE;
}

export function roiLfBuilding(technoId, baselvl, tolvl, object) {
  // console.log(`roiLfBuilding(${technoId}, ${baselvl}, ${tolvl}, ${object})`);
  if (!OGBIData.json.lifeFormProductionBoostFromBuildings[technoId]) return;
  let bonus = OGBIData.json.lifeFormProductionBoostFromBuildings[technoId].map(
    (x) => (x / 100) * (tolvl - baselvl + 1)
  );
  let tradeRate = OGBIData.json.options.tradeRate;
  let pos = object.position;
  let temp = object.db_par2 + 40;
  let prodDiff = [
    minesProduction(1, object[1], pos, temp) * bonus[0],
    minesProduction(2, object[2], pos, temp) * bonus[1],
    minesProduction(3, object[3], pos, temp) * bonus[2],
  ];
  let prodDiffMSE = prodDiff.map((x, n) => (x * tradeRate[0]) / tradeRate[n]).reduce((sum, cur) => sum + cur, 0);
  let buildingCostMSE = 0;
  for (let lvl = baselvl; lvl <= tolvl; lvl++) {
    buildingCostMSE += building(technoId, lvl, object)
      .cost.map((x, n) => (x * tradeRate[0]) / tradeRate[n])
      .reduce((sum, cur) => sum + cur, 0);
  }
  return (buildingCostMSE * 3600) / prodDiffMSE;
}

/**
 * `object` is the planet the research would be started on, and every caller today
 * passes nothing - it exists because `research()` accepts one. `player` sits in front
 * of it so that a call without `object` cannot bind the player to it by accident.
 */
export function roiAstrophysics(baselvl, tolvl, player, object = null) {
  let tradeRate = OGBIData.json.options.tradeRate;
  let numPlanets = Math.round((baselvl - 1) / 2) + 1;
  let newNumPlanets = Math.round(tolvl / 2) + 1;
  let newPlanets = newNumPlanets - numPlanets;
  let researchCostMSE = 0;
  for (let lvl = baselvl; lvl <= tolvl; lvl++) {
    researchCostMSE += research(124, lvl, false, false, false, object)
      .cost.map((x, n) => (x * tradeRate[0]) / tradeRate[n])
      .reduce((sum, cur) => sum + cur, 0);
  }
  if (!OGBIData.json.averageMines || !OGBIData.json.totalProd) {
    getBestRoi(player);
  }
  let avgMineLvl = OGBIData.json.averageMines;
  let totalProdMSE = OGBIData.json.totalProd
    .map((x, n) => (x * tradeRate[0]) / tradeRate[n])
    .reduce((sum, cur) => sum + cur, 0);
  let constructionCostMSE = 0;
  for (let lvl = 1; lvl <= avgMineLvl[0]; lvl++) {
    constructionCostMSE += building(1, lvl)
      .cost.map((x, n) => (x * tradeRate[0]) / tradeRate[n])
      .reduce((sum, cur) => sum + cur, 0);
  }
  for (let lvl = 1; lvl <= avgMineLvl[1]; lvl++) {
    constructionCostMSE += building(2, lvl)
      .cost.map((x, n) => (x * tradeRate[0]) / tradeRate[n])
      .reduce((sum, cur) => sum + cur, 0);
  }
  for (let lvl = 1; lvl <= avgMineLvl[2]; lvl++) {
    constructionCostMSE += building(3, lvl)
      .cost.map((x, n) => (x * tradeRate[0]) / tradeRate[n])
      .reduce((sum, cur) => sum + cur, 0);
  }
  let totalCostMSE = researchCostMSE + constructionCostMSE * newPlanets;
  let prodDiffMSE = (totalProdMSE / numPlanets) * newPlanets;
  return (totalCostMSE * 3600) / prodDiffMSE;
}

export function roiMine(technoId, tolvl, object, player) {
  let baseProd = [30 * OGBIData.json.speed, 15 * OGBIData.json.speed, 0];
  let pos = object.position;
  let temp = object.db_par2 + 40;
  let plasmaBonus = PLASMATECH_BONUS.map((x) => x * OGBIData.json.technology[122]);
  let crawlerCount = OGBIData.json.options.limitCrawler ? object[217] : 1000000;
  let lifeFormBonus = OGBIData.json.lifeformBonus.productionBonus || [0, 0, 0];
  let lifeFormPlanetBonus = OGBIData.json.lifeformPlanetBonus[object.id]?.productionBonus || [0, 0, 0];
  let crawlerPercent = Math.min(
    OGBIData.json.options.crawlerPercent || 1,
    player.playerClass == PlayerClass.MINER ? CRAWLER_OVERLOAD_MAX : 1
  );
  let currentMineLvls = [Number(object[1]), Number(object[2]), Number(object[3])];
  let currentMineSum = currentMineLvls.reduce((sum, cur) => sum + cur, 0);
  let currentCrawlerCount = Math.min(
    Math.floor(currentMineSum * 8 * (player.geologist ? 1 + GEOLOGIST_CRAWLER_BONUS : 1)),
    crawlerCount
  );
  let crawlerBonus =
    OGBIData.json.resourceBuggyProductionBoost *
    (player.playerClass == PlayerClass.MINER
      ? 1 + OGBIData.json.minerBonusAdditionalCrawler * (1 + OGBIData.json.lifeformBonus.classBonus.miner)
      : 1) *
    (1 + OGBIData.json.lifeformBonus.crawlerBonus?.production || 1);
  let currentCrawlerBonus = Math.min(
    currentCrawlerCount * crawlerPercent * crawlerBonus,
    OGBIData.json.resourceBuggyMaxProductionBoost
  );
  let currentMineProd = [
    minesProduction(1, currentMineLvls[0], pos, temp),
    minesProduction(2, currentMineLvls[1], pos, temp),
    minesProduction(3, currentMineLvls[2], pos, temp),
  ];
  let currentPlasmaProd = [
    currentMineProd[0] * plasmaBonus[0],
    currentMineProd[1] * plasmaBonus[1],
    currentMineProd[2] * plasmaBonus[2],
  ];
  let currentCrawlerProd = currentMineProd.map((x) => x * currentCrawlerBonus);
  let currentPlayerClassProd = currentMineProd.map(
    (x) =>
      x *
      (player.playerClass == PlayerClass.MINER
        ? OGBIData.json.minerBonusResourceProduction * (1 + OGBIData.json.lifeformBonus.classBonus.miner)
        : 0)
  );
  let currentGeologistProd = currentMineProd.map((x) => x * (player.geologist ? GEOLOGIST_RESOURCE_BONUS : 0));
  let currentAllyClassProd = currentMineProd.map(
    (x) => x * (OGBIData.json.allianceClass == AllianceClass.MINER ? TRADER_RESOURCE_BONUS : 0)
  );
  let currentOfficersProd = currentMineProd.map((x) => x * (player.allOfficers ? OFFICER_RESOURCE_BONUS : 0));
  let currentLifeFormProd = [
    currentMineProd[0] * lifeFormBonus[0],
    currentMineProd[1] * lifeFormBonus[1],
    currentMineProd[2] * lifeFormBonus[2],
  ];
  let currentLifeFormPlanetProd = [
    currentMineProd[0] * lifeFormPlanetBonus[0],
    currentMineProd[1] * lifeFormPlanetBonus[1],
    currentMineProd[2] * lifeFormPlanetBonus[2],
  ];
  let currentTotalProd = [
    Math.floor(
      currentMineProd[0] +
        currentPlasmaProd[0] +
        currentCrawlerProd[0] +
        currentPlayerClassProd[0] +
        currentGeologistProd[0] +
        currentAllyClassProd[0] +
        currentOfficersProd[0] +
        currentLifeFormProd[0] +
        currentLifeFormPlanetProd[0] +
        baseProd[0]
    ),
    Math.floor(
      currentMineProd[1] +
        currentPlasmaProd[1] +
        currentCrawlerProd[1] +
        currentPlayerClassProd[1] +
        currentGeologistProd[1] +
        currentAllyClassProd[1] +
        currentOfficersProd[1] +
        currentLifeFormProd[1] +
        currentLifeFormPlanetProd[1] +
        baseProd[1]
    ),
    Math.floor(
      currentMineProd[2] +
        currentPlasmaProd[2] +
        currentCrawlerProd[2] +
        currentPlayerClassProd[2] +
        currentGeologistProd[2] +
        currentAllyClassProd[2] +
        currentOfficersProd[2] +
        currentLifeFormProd[2] +
        currentLifeFormPlanetProd[2] +
        baseProd[2]
    ),
  ];
  let newMineLvls = [...currentMineLvls];
  newMineLvls[technoId - 1] = tolvl;
  let newMineSum = newMineLvls.reduce((sum, cur) => sum + cur, 0);
  let newCrawlerCount = Math.min(
    Math.floor(newMineSum * 8 * (player.geologist ? 1 + GEOLOGIST_CRAWLER_BONUS : 1)),
    crawlerCount
  );
  let newCrawlerBonus = Math.min(
    newCrawlerCount * crawlerPercent * crawlerBonus,
    OGBIData.json.resourceBuggyMaxProductionBoost
  );
  let newMineProd = [
    minesProduction(1, newMineLvls[0], pos, temp),
    minesProduction(2, newMineLvls[1], pos, temp),
    minesProduction(3, newMineLvls[2], pos, temp),
  ];
  let newPlasmaProd = [
    newMineProd[0] * plasmaBonus[0],
    newMineProd[1] * plasmaBonus[1],
    newMineProd[2] * plasmaBonus[2],
  ];
  let newCrawlerProd = newMineProd.map((x) => x * newCrawlerBonus);
  let newPlayerClassProd = newMineProd.map(
    (x) =>
      x *
      (player.playerClass == PlayerClass.MINER
        ? OGBIData.json.minerBonusResourceProduction * (1 + OGBIData.json.lifeformBonus.classBonus.miner)
        : 0)
  );
  let newGeologistProd = newMineProd.map((x) => x * (player.geologist ? GEOLOGIST_RESOURCE_BONUS : 0));
  let newAllyClassProd = newMineProd.map(
    (x) => x * (OGBIData.json.allianceClass == AllianceClass.MINER ? TRADER_RESOURCE_BONUS : 0)
  );
  let newOfficersProd = newMineProd.map((x) => x * (player.allOfficers ? OFFICER_RESOURCE_BONUS : 0));
  let newLifeFormProd = [
    newMineProd[0] * lifeFormBonus[0],
    newMineProd[1] * lifeFormBonus[1],
    newMineProd[2] * lifeFormBonus[2],
  ];
  let newLifeFormPlanetProd = [
    newMineProd[0] * lifeFormPlanetBonus[0],
    newMineProd[1] * lifeFormPlanetBonus[1],
    newMineProd[2] * lifeFormPlanetBonus[2],
  ];
  let newTotalProd = [
    Math.floor(
      newMineProd[0] +
        newPlasmaProd[0] +
        newCrawlerProd[0] +
        newPlayerClassProd[0] +
        newGeologistProd[0] +
        newAllyClassProd[0] +
        newOfficersProd[0] +
        newLifeFormProd[0] +
        newLifeFormPlanetProd[0] +
        baseProd[0]
    ),
    Math.floor(
      newMineProd[1] +
        newPlasmaProd[1] +
        newCrawlerProd[1] +
        newPlayerClassProd[1] +
        newGeologistProd[1] +
        newAllyClassProd[1] +
        newOfficersProd[1] +
        newLifeFormProd[1] +
        newLifeFormPlanetProd[1] +
        baseProd[1]
    ),
    Math.floor(
      newMineProd[2] +
        newPlasmaProd[2] +
        newCrawlerProd[2] +
        newPlayerClassProd[2] +
        newGeologistProd[2] +
        newAllyClassProd[2] +
        newOfficersProd[2] +
        newLifeFormProd[2] +
        newLifeFormPlanetProd[2] +
        baseProd[2]
    ),
  ];
  let prodDiff = [
    newTotalProd[0] - currentTotalProd[0],
    newTotalProd[1] - currentTotalProd[1],
    newTotalProd[2] - currentTotalProd[2],
  ];
  let tradeRate = OGBIData.json.options.tradeRate;
  let prodDiffMSE = prodDiff.map((x, n) => (x * tradeRate[0]) / tradeRate[n]).reduce((sum, cur) => sum + cur, 0);
  let buildingCostMSE = 0;
  for (let lvl = currentMineLvls[technoId - 1] + 1; lvl <= tolvl; lvl++) {
    buildingCostMSE += building(technoId, lvl, object)
      .cost.map((x, n) => (x * tradeRate[0]) / tradeRate[n])
      .reduce((sum, cur) => sum + cur, 0);
  }
  return (buildingCostMSE * 3600) / prodDiffMSE;
}

export function getBestRoi(player) {
  let astro = OGBIData.json.technology[124];
  let roi = [];
  let totalProd = { metal: 0, crystal: 0, deuterium: 0 };
  let avgMineLvl = { metal: 0, crystal: 0, deuterium: 0 };
  let maxMineLvl = { metal: 0, crystal: 0, deuterium: 0 };
  let numPlanets = OGBIData.json.empire.length;

  OGBIData.empire.forEach((planet) => {
    let coords = planet.coordinates.slice(1, -1);
    let planetProductionProgress = OGBIData.json.productionProgress[coords] || {
      technoId: 0,
      tolvl: 0,
      endDate: new Date().toGMTString(),
    };
    let metalLvl = parseInt(planet[1]);
    let crystalLvl = parseInt(planet[2]);
    let deuteriumLvl = parseInt(planet[3]);

    totalProd.metal += planet.production.hourly[0];
    totalProd.crystal += planet.production.hourly[1];
    totalProd.deuterium += planet.production.hourly[2];

    avgMineLvl.metal += metalLvl;
    avgMineLvl.crystal += crystalLvl;
    avgMineLvl.deuterium += deuteriumLvl;

    maxMineLvl.metal = Math.max(maxMineLvl.metal, metalLvl);
    maxMineLvl.crystal = Math.max(maxMineLvl.crystal, crystalLvl);
    maxMineLvl.deuterium = Math.max(maxMineLvl.deuterium, deuteriumLvl);

    for (let lvl = metalLvl + 1; lvl <= maxMineLvl.metal + 5; lvl++) {
      roi.push({
        time: roiMine(1, lvl, planet, player),
        technoId: 1,
        lvl: lvl,
        coords: coords,
        planetId: planet.id,
        construction: planetProductionProgress.technoId != 0 ? true : false,
        inConstruction: planetProductionProgress.technoId == 1 && planetProductionProgress.tolvl == lvl ? true : false,
        endDate: planetProductionProgress.endDate || new Date().toGMTString(),
      });
    }
    for (let lvl = crystalLvl + 1; lvl <= maxMineLvl.crystal + 5; lvl++) {
      roi.push({
        time: roiMine(2, lvl, planet, player),
        technoId: 2,
        lvl: lvl,
        coords: coords,
        planetId: planet.id,
        construction: planetProductionProgress.technoId != 0 ? true : false,
        inConstruction: planetProductionProgress.technoId == 2 && planetProductionProgress.tolvl == lvl ? true : false,
        endDate: planetProductionProgress.endDate || new Date().toGMTString(),
      });
    }
    for (let lvl = deuteriumLvl + 1; lvl <= maxMineLvl.deuterium + 5; lvl++) {
      roi.push({
        time: roiMine(3, lvl, planet, player),
        technoId: 3,
        lvl: lvl,
        coords: coords,
        planetId: planet.id,
        construction: planetProductionProgress.technoId != 0 ? true : false,
        inConstruction: planetProductionProgress.technoId == 3 && planetProductionProgress.tolvl == lvl ? true : false,
        endDate: planetProductionProgress.endDate || new Date().toGMTString(),
      });
    }
  });
  avgMineLvl.metal /= numPlanets;
  avgMineLvl.crystal /= numPlanets;
  avgMineLvl.deuterium /= numPlanets;

  OGBIData.json.averageMines = [avgMineLvl.metal, avgMineLvl.crystal, avgMineLvl.deuterium];
  OGBIData.json.totalProd = [totalProd.metal, totalProd.crystal, totalProd.deuterium];
  OGBIData.Save();

  let researchProgress = OGBIData.json.researchProgress.technoId
    ? OGBIData.json.researchProgress
    : { technoId: 0, tolvl: 0, endDate: new Date().toGMTString() };
  for (let l = (astro + 1) % 2 == 1 ? 1 : 2; l <= 10; l += 2) {
    let newAstro = astro + l;
    roi.push({
      time: roiAstrophysics(astro + 1, newAstro, player),
      technoId: 124,
      lvl: newAstro,
      coords: researchProgress.technoId == 124 ? researchProgress.coords : null,
      planetId: researchProgress.technoId == 124 ? researchProgress.planetId : null,
      construction: researchProgress.technoId != 0 ? true : false,
      inConstruction:
        researchProgress.technoId == 124 &&
        (researchProgress.tolvl == newAstro ||
          researchProgress.tolvl == newAstro - (researchProgress.tolvl % 2 ? 0 : 1))
          ? true
          : false,
      endDate: researchProgress.endDate,
    });
  }

  for (let l = 1; l <= 5; l++) {
    let newLvl = OGBIData.json.technology[122] + l;
    roi.push({
      time: roiPlasmatechnology(newLvl),
      technoId: 122,
      lvl: newLvl,
      coords: researchProgress.technoId == 122 ? researchProgress.coords : null,
      planetId: researchProgress.technoId == 122 ? researchProgress.planetId : null,
      construction: researchProgress.technoId != 0 ? true : false,
      inConstruction: researchProgress.technoId == 122 && researchProgress.tolvl == newLvl ? true : false,
      endDate: researchProgress.endDate,
    });
  }

  return roi.sort((a, b) => a.time - b.time);
}
