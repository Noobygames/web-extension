/**
 * `OGBeyondInfinity.updateServerSettings()` — the one caller of `serverData.xml`.
 *
 * Written for one bug (refactoring-new.md, Phase A.1 #1): `deuteriumInDebris` was
 * parsed as `Boolean(xml.querySelector("deuteriumInDebris").innerHTML)`. The XML
 * value is always the string `"0"` or `"1"`, and `Boolean("0")` is `true` in
 * JavaScript - a non-empty string is truthy regardless of its content. The field
 * was `true` on every universe, including ones where the server setting is off,
 * which makes `RecyclingYieldCalculator` overstate debris-field yield in the spy
 * table, the fleet dispatcher and the empire overview.
 *
 * The fix reads it the same way its neighbour four lines up already does:
 * `.innerHTML == 1`. This drives the real method end to end against a
 * `serverData.xml` fixture, rather than testing the comparison in isolation,
 * because the isolated version would not have caught the original bug - nothing
 * about `Boolean(x)` looks wrong out of context.
 *
 * `pageContextRequest` is mocked rather than driven through the real bridge:
 * `updateServerSettings()` fetches through the content-context `serverData.get`
 * command (refactoring-new.md Phase A.3) since it was rewired to cache across tabs,
 * and standing up a real content context alongside the page one in a single jsdom
 * window is what `test/util/service.callbackEvent.test.js` already covers end to
 * end. Nothing here is about the bridge; it is about what `updateServerSettings()`
 * does with the XML text once it has it.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "./helpers/globals.js";
import { overviewPage } from "./fixtures/ogamePage.js";

const INTRO_URL = "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame&component=intro";

/** Set by each test before calling `updateServerSettings()`; read by the mock below. */
let nextServerDataXml = "";

mock.module(new URL("../src/platform/bridge.js", import.meta.url).href, {
  namedExports: {
    pageContextInit: () => {},
    pageContextRequest: async (command, action) => {
      if (command === "serverData" && action === "get") {
        return { success: true, response: nextServerDataXml };
      }
      throw new Error(`unexpected pageContextRequest("${command}", "${action}") in this test`);
    },
  },
});

const bootstrap = setupBrowser({ url: INTRO_URL });
document.documentElement.dataset.ogiCallbackEventToken = "0123456789ab";
const { OGBeyondInfinity } = await import("../src/ogCore.js");
const OGBIData = (await import("../src/store/OGBIData.js")).default;
bootstrap.cleanup();

/**
 * A `serverData.xml` document carrying every leaf `updateServerSettings()` reads
 * without a null-guard. Values are arbitrary except where a specific test cares.
 *
 * @param {{donutGalaxy?: 0|1, donutSystem?: 0|1, deuteriumInDebris?: 0|1}} flags
 */
function serverDataXml({ donutGalaxy = 1, donutSystem = 0, deuteriumInDebris = 1 } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<serverData timestamp="1700000100" xmlns="https://s1-en.ogame.gameforge.com">
  <name>Quantum</name>
  <domain>s1-en.ogame.gameforge.com</domain>
  <number>1</number>
  <language>en</language>
  <timezone>Europe/Berlin</timezone>
  <timezoneOffset>+02:00</timezoneOffset>
  <domainPHP>s1-en.ogame.gameforge.com</domainPHP>
  <speed>1</speed>
  <speedFleetPeaceful>1</speedFleetPeaceful>
  <speedFleetWar>1</speedFleetWar>
  <speedFleetHolding>1</speedFleetHolding>
  <galaxies>9</galaxies>
  <systems>499</systems>
  <acs>1</acs>
  <rapidFire>1</rapidFire>
  <defToTF>0</defToTF>
  <debrisFactor>0.3</debrisFactor>
  <debrisFactorDef>0</debrisFactorDef>
  <repairFactor>0.7</repairFactor>
  <newbieProtectionLimit>50000</newbieProtectionLimit>
  <newbieProtectionHigh>500000</newbieProtectionHigh>
  <topScore>123456789</topScore>
  <bonusFields>30</bonusFields>
  <donutGalaxy>${donutGalaxy}</donutGalaxy>
  <donutSystem>${donutSystem}</donutSystem>
  <researchDurationDivisor>2</researchDurationDivisor>
  <globalDeuteriumSaveFactor>0.7</globalDeuteriumSaveFactor>
  <probeCargo>5</probeCargo>
  <deuteriumInDebris>${deuteriumInDebris}</deuteriumInDebris>
  <characterClassesEnabled>1</characterClassesEnabled>
  <minerBonusFasterTradingShips>0.3</minerBonusFasterTradingShips>
  <minerBonusIncreasedCargoCapacityForTradingShips>0.3</minerBonusIncreasedCargoCapacityForTradingShips>
  <minerBonusResourceProduction>0.35</minerBonusResourceProduction>
  <minerBonusAdditionalCrawler>3</minerBonusAdditionalCrawler>
  <minerBonusMaxCrawler>0.5</minerBonusMaxCrawler>
  <minerBonusEnergy>0.1</minerBonusEnergy>
  <warriorBonusFasterCombatShips>0.3</warriorBonusFasterCombatShips>
  <warriorBonusFasterRecyclers>0.3</warriorBonusFasterRecyclers>
  <warriorBonusRecyclerFuelConsumption>0.4</warriorBonusRecyclerFuelConsumption>
  <combatDebrisFieldLimit>1.5</combatDebrisFieldLimit>
  <resourceBuggyProductionBoost>0.3</resourceBuggyProductionBoost>
  <resourceBuggyMaxProductionBoost>0.5</resourceBuggyMaxProductionBoost>
  <explorerBonusIncreasedResearchSpeed>0.25</explorerBonusIncreasedResearchSpeed>
  <explorerBonusIncreasedExpeditionOutcome>0.05</explorerBonusIncreasedExpeditionOutcome>
  <cargoHyperspaceTechMultiplier>5</cargoHyperspaceTechMultiplier>
</serverData>`;
}

/**
 * @param {{donutGalaxy?: 0|1, donutSystem?: 0|1, deuteriumInDebris?: 0|1}} flags
 * @param {(instance: import("../src/ogCore.js").OGBeyondInfinity) => Promise<void> | void} run
 */
async function onOverviewPageWithServerData(flags, run) {
  const page = setupBrowser({
    html: overviewPage({ meta: { timestamp: 1700100000 } }),
    url: "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame&component=overview",
  });
  nextServerDataXml = serverDataXml(flags);
  try {
    const instance = new OGBeyondInfinity();
    await instance.updateServerSettings(true);
    await run(instance);
  } finally {
    page.cleanup();
  }
}

test("deuteriumInDebris reads the server flag, not the presence of the string", async () => {
  await onOverviewPageWithServerData({ deuteriumInDebris: 0 }, () => {
    assert.equal(OGBIData.json.universeSettingsTooltip.deuteriumInDebris, false);
  });
  await onOverviewPageWithServerData({ deuteriumInDebris: 1 }, () => {
    assert.equal(OGBIData.json.universeSettingsTooltip.deuteriumInDebris, true);
  });
});

test("donutGalaxy and donutSystem still parse correctly, as the comparison point", async () => {
  await onOverviewPageWithServerData({ donutGalaxy: 0, donutSystem: 1 }, () => {
    assert.equal(OGBIData.json.universeSettingsTooltip.donutGalaxy, false);
    assert.equal(OGBIData.json.universeSettingsTooltip.donutSystem, true);
  });
});
