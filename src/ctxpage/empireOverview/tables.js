import * as DOM from "../../util/dom.js";
import { createDOM } from "../../util/dom.js";
import { toFormattedNumber } from "../../util/numbers.js";
import * as Numbers from "../../util/numbers.js";
import * as standardUnit from "../../util/standardUnit.js";
import Translator from "../../util/translate.js";
import OGBIData from "../../util/OGIData.js";
import shipEnum from "../../util/enum/ship.js";
import { CARGO_SHIP_IDS } from "../../util/harvestPlanner.js";
import RecyclingYieldCalculator from "../../util/recyclingYieldCalculator.js";
import { planHarvest } from "../../util/harvestPlanner.js";

/** The four tables the overview popup shows, one per tab. */
function minesOverview(context) {
  let content = createDOM("div", { class: "ogl-mines-content" });
  let table = content.appendChild(createDOM("table", { class: "ogl-fleet-table" }));
  let header = table.appendChild(createDOM("tr"));
  header.appendChild(createDOM("th"));
  let metalRow = table.appendChild(createDOM("tr"));
  let crystalRow = table.appendChild(createDOM("tr"));
  let deutRow = table.appendChild(createDOM("tr"));
  let nrjRow = table.appendChild(createDOM("tr"));
  metalRow.appendChild(createDOM("td").appendChild(createDOM("div", { class: "resourceIcon metal" })).parentElement);
  crystalRow.appendChild(
    createDOM("td").appendChild(createDOM("div", { class: "resourceIcon crystal" })).parentElement
  );
  deutRow.appendChild(createDOM("td").appendChild(createDOM("div", { class: "resourceIcon deuterium" })).parentElement);
  nrjRow.appendChild(createDOM("td").appendChild(createDOM("div", { class: "resourceIcon energy" })).parentElement);
  let minTimeMetal = 1e20;
  let minTimeCrystal = 1e20;
  let minTimeDeuterium = 1e20;
  let minLocMetal = "";
  let minLocCrystal = "";
  let minLocDeuterium = "";
  OGBIData.empire.forEach((planet) => {
    let current = false;
    if (planet.coordinates.slice(1, -1) == context.current.coords) {
      current = true;
    }
    let mfilltime = ((5000 * Math.floor(2.5 * Math.exp((20 / 33) * planet[22]))) / planet.production.hourly[0]) * 3600;
    let cfilltime = ((5000 * Math.floor(2.5 * Math.exp((20 / 33) * planet[23]))) / planet.production.hourly[1]) * 3600;
    let dfilltime = ((5000 * Math.floor(2.5 * Math.exp((20 / 33) * planet[24]))) / planet.production.hourly[2]) * 3600;
    if (mfilltime < minTimeMetal) {
      minTimeMetal = mfilltime;
      minLocMetal = planet.coordinates;
    }
    if (cfilltime < minTimeCrystal) {
      minTimeCrystal = cfilltime;
      minLocCrystal = planet.coordinates;
    }
    if (dfilltime < minTimeDeuterium) {
      minTimeDeuterium = dfilltime;
      minLocDeuterium = planet.coordinates;
    }
    let link = `?page=ingame&component=supplies&cp=${planet.id}`;
    header.appendChild(
      DOM.createDOMSanitized(
        "th",
        {},
        `<div>${planet.name}</div> <a href="${link}" class="ogl-fleet-coords">${
          planet.coordinates
        }</a> <span class="ogl-planet-fields">${toFormattedNumber(planet.fieldUsed)} / ${toFormattedNumber(
          planet.fieldMax
        )}</span><div>${toFormattedNumber(planet.db_par2 + 40)}°C</div>`
      )
    );
    let td = metalRow.appendChild(createDOM("td"));
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-metal tooltip",
          "data-title": `${Translator.translate(132)}: ${formatTimeWrapper(mfilltime, 2, true, " ", false, "")}`,
        },
        toFormattedNumber(planet[1])
      )
    );
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-metal tooltip",
          "data-title": toFormattedNumber(Math.floor(planet.production.hourly[0])),
        },
        toFormattedNumber(Math.floor(planet.production.hourly[0]), null, true)
      )
    );
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-metal tooltip",
          "data-title": toFormattedNumber(Math.floor(planet.production.daily[0])),
        },
        toFormattedNumber(Math.floor(planet.production.daily[0]), null, true)
      )
    );
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-metal tooltip",
          "data-title": toFormattedNumber(Math.floor(planet.production.weekly[0])),
        },
        toFormattedNumber(Math.floor(planet.production.weekly[0]), null, true)
      )
    );
    if (current) td.classList.add("ogl-current");
    td = crystalRow.appendChild(createDOM("td"));
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-crystal tooltip",
          "data-title": `${Translator.translate(132)}: ${formatTimeWrapper(cfilltime, 2, true, " ", false, "")}`,
        },
        toFormattedNumber(planet[2])
      )
    );
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-crystal tooltip",
          "data-title": toFormattedNumber(Math.floor(planet.production.hourly[1])),
        },
        toFormattedNumber(Math.floor(planet.production.hourly[1]), null, true)
      )
    );
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-crystal tooltip",
          "data-title": toFormattedNumber(Math.floor(planet.production.daily[1])),
        },
        toFormattedNumber(Math.floor(planet.production.daily[1]), null, true)
      )
    );
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-crystal tooltip",
          "data-title": toFormattedNumber(Math.floor(planet.production.weekly[1])),
        },
        toFormattedNumber(Math.floor(planet.production.weekly[1]), null, true)
      )
    );
    if (current) td.classList.add("ogl-current");
    td = deutRow.appendChild(createDOM("td"));
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-deut tooltip",
          "data-title": `${Translator.translate(132)}: ${formatTimeWrapper(dfilltime, 2, true, " ", false, "")}`,
        },
        toFormattedNumber(planet[3])
      )
    );
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-deut tooltip",
          "data-title": toFormattedNumber(Math.floor(planet.production.hourly[2])),
        },
        toFormattedNumber(Math.floor(planet.production.hourly[2]), null, true)
      )
    );
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-deut tooltip",
          "data-title": toFormattedNumber(Math.floor(planet.production.daily[2])),
        },
        toFormattedNumber(Math.floor(planet.production.daily[2]), null, true)
      )
    );
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-deut tooltip",
          "data-title": toFormattedNumber(Math.floor(planet.production.weekly[2])),
        },
        toFormattedNumber(Math.floor(planet.production.weekly[2]), null, true)
      )
    );
    if (current) td.classList.add("ogl-current");
    td = nrjRow.appendChild(createDOM("td"));
    let diff = planet.production.hourly[3];
    td.appendChild(
      createDOM(
        "div",
        {
          class: "ogl-energy tooltip " + (diff >= 0 ? "undermark" : "overmark"),
          "data-title": toFormattedNumber(diff, 0),
        },
        toFormattedNumber(diff, null, true)
      )
    );
    if (current) td.classList.add("ogl-current");
  });
  header.appendChild(createDOM("th", { class: "ogl-sum-symbol" }, "Σ"));
  let sumlvl = (key) => OGBIData.empire.reduce((a, b) => a + Number(b[key]), 0);
  let sumhour = (key) => OGBIData.empire.reduce((a, b) => a + Number(b.production.hourly[key]), 0);
  let sumday = (key) => OGBIData.empire.reduce((a, b) => a + Number(b.production.daily[key]), 0);
  let sumweek = (key) => OGBIData.empire.reduce((a, b) => a + Number(b.production.weekly[key]), 0);
  let td = metalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": `${Translator.translate(132)}: ${formatTimeWrapper(
          minTimeMetal,
          2,
          true,
          " ",
          false,
          ""
        )} ${minLocMetal}`,
      },
      toFormattedNumber(sumlvl(1) / OGBIData.empire.length, 1)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.floor(sumhour(0))),
      },
      toFormattedNumber(Math.floor(sumhour(0)), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.floor(sumday(0))),
      },
      toFormattedNumber(Math.floor(sumday(0)), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-metal tooltip",
        "data-title": toFormattedNumber(Math.floor(sumweek(0))),
      },
      toFormattedNumber(Math.floor(sumweek(0)), null, true)
    )
  );
  td = crystalRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": `${Translator.translate(132)}: ${formatTimeWrapper(
          minTimeCrystal,
          2,
          true,
          " ",
          false,
          ""
        )} ${minLocCrystal}`,
      },
      toFormattedNumber(sumlvl(2) / OGBIData.empire.length, 1)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.floor(sumhour(1))),
      },
      toFormattedNumber(Math.floor(sumhour(1)), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.floor(sumday(1))),
      },
      toFormattedNumber(Math.floor(sumday(1)), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-crystal tooltip",
        "data-title": toFormattedNumber(Math.floor(sumweek(1))),
      },
      toFormattedNumber(Math.floor(sumweek(1)), null, true)
    )
  );
  td = deutRow.appendChild(createDOM("td"));
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": `${Translator.translate(132)}: ${formatTimeWrapper(
          minTimeDeuterium,
          2,
          true,
          " ",
          false,
          ""
        )} ${minLocDeuterium}`,
      },
      toFormattedNumber(sumlvl(3) / OGBIData.empire.length, 1)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.floor(sumhour(2))),
      },
      toFormattedNumber(Math.floor(sumhour(2)), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.floor(sumday(2))),
      },
      toFormattedNumber(Math.floor(sumday(2)), null, true)
    )
  );
  td.appendChild(
    createDOM(
      "div",
      {
        class: "ogl-deut tooltip",
        "data-title": toFormattedNumber(Math.floor(sumweek(2))),
      },
      toFormattedNumber(Math.floor(sumweek(2)), null, true)
    )
  );
  td = nrjRow.appendChild(createDOM("td"));
  return content;
}

function fleetOverview(context, moon) {
  let content = createDOM("div", { class: "ogl-fleet-content" });
  let table = createDOM("table", { class: "ogl-fleet-table" });
  let row = createDOM("tr");
  let td = createDOM("th");
  let planetIcon = createDOM("span", { class: "ogl-planet " + (!moon ? "ogl-active" : "") });
  let moonIcon = createDOM("span", { class: "ogl-moon " + (moon ? "ogl-active" : "") });
  planetIcon.addEventListener("click", () => {
    if (!planetIcon.classList.contains("ogl-active")) {
      content.replaceWith(fleetOverview(context, false));
    }
  });
  moonIcon.addEventListener("click", () => {
    if (!moonIcon.classList.contains("ogl-active")) {
      content.replaceWith(fleetOverview(context, true));
    }
  });
  row.appendChild(createDOM("th").appendChild(createDOM("span", { class: "icon_movement" })).parentElement);
  td.appendChild(planetIcon);
  td.appendChild(moonIcon);
  row.appendChild(td);

  OGBIData.empire.forEach((planet) => {
    let name = moon ? (planet.moon ? planet.moon.name : "-") : planet.name;
    let link = `?page=ingame&component=fleetdispatch&cp=${planet.id}`;
    if (moon && planet.moon) link = `?page=ingame&component=fleetdispatch&cp=${planet.moon.id}`;
    row.appendChild(
      DOM.createDOMSanitized(
        "th",
        {},
        `<p>${name}</p> <a class="ogl-fleet-coords" href="${link}">${planet.coordinates}</span> `
      )
    );
  });
  row.appendChild(createDOM("th", { class: "ogl-sum-symbol" }, "Σ"));
  table.appendChild(row);
  let flying = flying();

  const sumPerPlanet = [];
  Object.values(shipEnum).forEach((id) => {
    if (id == 212 || (id > 400 && id < 410)) {
      return;
    }
    row = createDOM("tr");
    let shipCount = flying.fleet[id];
    let td = createDOM("td", { class: shipCount ? "" : "ogl-fleet-empty" });
    td.appendChild(
      createDOM(
        "span",
        { class: "tooltip", "data-title": toFormattedNumber(shipCount) },
        shipCount ? toFormattedNumber(shipCount, null, true) : "-"
      )
    );
    row.appendChild(td);
    let th = row.appendChild(createDOM("th"));
    th.appendChild(createDOM("th", { class: "ogl-option ogl-fleet-ship ogl-fleet-" + id }));
    let sum = 0;
    OGBIData.empire.forEach((planet) => {
      let current = false;
      if (planet.coordinates.slice(1, -1) == context.current.coords) {
        current = true;
      }

      if (!sumPerPlanet[planet.id]) {
        sumPerPlanet[planet.id] = { planet: 0, moon: 0 };
      }
      if (moon) {
        if (planet.moon) {
          sumPerPlanet[planet.id].moon += Number(planet.moon[id]);
        }
      } else {
        sumPerPlanet[planet.id].planet += planet[id];
      }

      sum += moon && planet.moon ? Number(planet.moon[id]) : Number(planet[id]);
      let valuePLa = planet[id] == 0 ? "-" : toFormattedNumber(planet[id], null, true);
      let valueMooon = "-";
      if (planet.moon) {
        valueMooon = planet.moon[id] == 0 ? "-" : toFormattedNumber(planet.moon[id], null, true);
      }
      let td = createDOM("td", { class: valuePLa == "-" ? "ogl-fleet-empty" : "" });
      td.appendChild(
        createDOM(
          "span",
          { class: planet[id] > 0 ? "tooltip" : "", "data-title": toFormattedNumber(planet[id], 0) },
          valuePLa
        )
      );
      if (moon) {
        td = createDOM("td", { class: valueMooon == "-" ? "ogl-fleet-empty" : "" });
        td.appendChild(
          createDOM(
            "span",
            {
              class: planet.moon && planet.moon[id] > 0 ? "tooltip" : "",
              "data-title": toFormattedNumber(planet.moon ? planet.moon[id] : 0, 0),
            },
            valueMooon
          )
        );
      }
      if (current) {
        td.classList.add("ogl-current");
      }
      row.appendChild(td);
    });
    td = createDOM("td", { class: sum == "-" ? "ogl-fleet-empty" : "" });
    td.appendChild(
      createDOM(
        "span",
        { class: "tooltip", "data-title": toFormattedNumber(sum, 0) },
        sum == 0 ? "-" : toFormattedNumber(sum, null, true)
      )
    );
    row.appendChild(td);
    table.appendChild(row);
  });

  // Add recycling yield row
  row = createDOM("tr");
  td = createDOM("td", { class: "ogl-fleet-empty" }, "-");
  row.appendChild(td);
  td = createDOM("th");
  td.appendChild(createDOM("th", { class: "ogl-option ogl-fleet-ship ogl-fleet-value" }));
  row.appendChild(td);

  let totalYield = 0;
  let totalDisplay = 0;
  OGBIData.empire.forEach((planet) => {
    let current = false;
    if (planet.coordinates.slice(1, -1) == context.current.coords) {
      current = true;
    }
    td = createDOM("td");

    const fleetYield = RecyclingYieldCalculator.CalculateRecyclingYieldFleetFromEmpireData(
      planet,
      OGBIData.universeSettingsTooltip.debrisFactor,
      OGBIData.universeSettingsTooltip.deuteriumInDebris
    );

    const fleetAmount = moon
      ? [
          fleetYield.moonFleetRecyclingYield.metal,
          fleetYield.moonFleetRecyclingYield.crystal,
          fleetYield.moonFleetRecyclingYield.deut,
        ]
      : [
          fleetYield.planetFleetRecyclingYield.metal,
          fleetYield.planetFleetRecyclingYield.crystal,
          fleetYield.planetFleetRecyclingYield.deut,
        ];

    const limit = moon === true ? OGBIData.options.rvalSelfLimitMoon : OGBIData.options.rvalSelfLimitPlanet;

    const standardUnitSum = standardUnit.standardUnit(fleetAmount);
    const labelClass = standardUnitSum >= limit ? "ogk-label ogi-warning" : "ogk-label ogi-info";

    totalYield += standardUnitSum;
    totalDisplay =
      standardUnitSum > 0
        ? `${Numbers.toFormattedNumber(standardUnitSum, [0, 1], true)} ${standardUnit.unitType()}`
        : "-";
    td.appendChild(
      DOM.createDOM("span", { class: standardUnitSum > 0 ? labelClass : "ogl-fleet-empty" }, totalDisplay)
    );
    if (current) {
      td.classList.add("ogl-current");
    }
    row.appendChild(td);
  });

  td = createDOM("td");
  totalDisplay =
    totalYield > 0 ? `${Numbers.toFormattedNumber(totalYield, [0, 1], true)} ${standardUnit.unitType()}` : "-";
  td.appendChild(
    DOM.createDOM("span", { class: totalYield > 0 ? "ogk-label ogi-info" : "ogl-fleet-empty" }, totalDisplay)
  );

  row.appendChild(td);
  table.appendChild(row);
  content.appendChild(table);

  return content;
}

function defenseOverview(context, moon) {
  let content = createDOM("div", { class: "ogl-fleet-content" });
  let shipsInfo = JSON.parse(
    '{ "212": { "name": "Satellite solaire" }, "401": { "name": "Lanceur de missiles" }, "402": { "name": "Artillerie laser légère" }, "403": { "name": "Artillerie laser lourde" }, "404": { "name": "Canon de Gauss" }, "405": { "name": "Artillerie à ions" }, "406": { "name": "Lanceur de plasma" }, "407": { "name": "Petit bouclier" }, "408": { "name": "Grand bouclier" }, "502": { "name": "Missile d`interception" }, "503": { "name": "Missile interplanétaire" }, "202": { "id": 202, "name": "Petit transporteur", "baseFuelConsumption": 20, "baseFuelCapacity": 5000, "baseCargoCapacity": 7250, "fuelConsumption": 10, "baseSpeed": 10000, "speed": 32000, "cargoCapacity": 7250, "fuelCapacity": 5000, "number": 1, "recycleMode": 0, "rapidfire": { "205": -3, "215": -3, "214": -250, "210": 5, "212": 5, "217": 5 } }, "203": { "id": 203, "name": "Grand transporteur", "baseFuelConsumption": 50, "baseFuelCapacity": 25000, "baseCargoCapacity": 36250, "fuelConsumption": 25, "baseSpeed": 7500, "speed": 18000, "cargoCapacity": 36250, "fuelCapacity": 25000, "number": 1, "recycleMode": 0, "rapidfire": { "215": -3, "214": -250, "210": 5, "212": 5, "217": 5 } }, "204": { "id": 204, "name": "Chasseur léger", "baseFuelConsumption": 20, "baseFuelCapacity": 50, "baseCargoCapacity": 72, "fuelConsumption": 10, "baseSpeed": 12500, "speed": 30000, "cargoCapacity": 72, "fuelCapacity": 50, "number": 1, "recycleMode": 0, "rapidfire": { "206": -6, "214": -200, "219": -3, "210": 5, "212": 5, "217": 5 } }, "205": { "id": 205, "name": "Chasseur lourd", "baseFuelConsumption": 75, "baseFuelCapacity": 100, "baseCargoCapacity": 145, "fuelConsumption": 37, "baseSpeed": 10000, "speed": 32000, "cargoCapacity": 145, "fuelCapacity": 100, "number": 1, "recycleMode": 0, "rapidfire": { "215": -4, "214": -100, "219": -2, "210": 5, "212": 5, "217": 5, "202": 3 } }, "206": { "id": 206, "name": "Croiseur", "baseFuelConsumption": 300, "baseFuelCapacity": 800, "baseCargoCapacity": 1160, "fuelConsumption": 150, "baseSpeed": 15000, "speed": 48000, "cargoCapacity": 1160, "fuelCapacity": 800, "number": 1, "recycleMode": 0, "rapidfire": { "215": -4, "214": -33, "219": 3, "210": 5, "212": 5, "217": 5, "204": 6, "401": 10 } }, "207": { "id": 207, "name": "Vaisseau de bataille", "baseFuelConsumption": 500, "baseFuelCapacity": 1500, "baseCargoCapacity": 2175, "fuelConsumption": 250, "baseSpeed": 10000, "speed": 49000, "cargoCapacity": 2175, "fuelCapacity": 1500, "number": 1, "recycleMode": 0, "rapidfire": { "215": -7, "214": -30, "218": -7, "210": 5, "212": 5, "217": 5, "219": 5 } }, "208": { "id": 208, "name": "Vaisseau de colonisation", "baseFuelConsumption": 1000, "baseFuelCapacity": 7500, "baseCargoCapacity": 10875, "fuelConsumption": 500, "baseSpeed": 2500, "speed": 8000, "cargoCapacity": 10875, "fuelCapacity": 7500, "number": 1, "recycleMode": 0, "rapidfire": { "214": -250, "210": 5, "212": 5, "217": 5 } }, "209": { "id": 209, "name": "Recycleur", "baseFuelConsumption": 300, "baseFuelCapacity": 20000, "baseCargoCapacity": 29000, "fuelConsumption": 150, "baseSpeed": 2000, "speed": 4800, "cargoCapacity": 29000, "fuelCapacity": 20000, "number": 1, "recycleMode": 0, "rapidfire": { "214": -250, "210": 5, "212": 5, "217": 5 } }, "210": { "id": 210, "name": "Sonde despionnage", "baseFuelConsumption": 1, "baseFuelCapacity": 5, "baseCargoCapacity": 7, "fuelConsumption": 0, "baseSpeed": 100000000, "speed": 240000000, "cargoCapacity": 7, "fuelCapacity": 5, "number": 1, "recycleMode": 0, "rapidfire": { "204": -5, "205": -5, "206": -5, "207": -5, "215": -5, "211": -5, "213": -5, "214": -1250, "218": -5, "219": -5, "202": -5, "203": -5, "208": -5, "209": -5 } }, "211": { "id": 211, "name": "Bombardier", "baseFuelConsumption": 700, "baseFuelCapacity": 500, "baseCargoCapacity": 725, "fuelConsumption": 350, "baseSpeed": 5000, "speed": 24500, "cargoCapacity": 725, "fuelCapacity": 500, "number": 1, "recycleMode": 0, "rapidfire": { "214": -25, "218": -4, "210": 5, "212": 5, "217": 5, "401": 20, "402": 20, "403": 10, "405": 10, "404": 5, "406": 5 } }, "213": { "id": 213, "name": "Destructeur", "baseFuelConsumption": 1000, "baseFuelCapacity": 2000, "baseCargoCapacity": 2900, "fuelConsumption": 500, "baseSpeed": 5000, "speed": 24500, "cargoCapacity": 2900, "fuelCapacity": 2000, "number": 1, "recycleMode": 0, "rapidfire": { "214": -5, "218": -3, "210": 5, "212": 5, "217": 5, "402": 10, "215": 2 } }, "214": { "id": 214, "name": "Étoile de la mort", "baseFuelConsumption": 1, "baseFuelCapacity": 1000000, "baseCargoCapacity": 1450000, "fuelConsumption": 0, "baseSpeed": 100, "speed": 490, "cargoCapacity": 1450000, "fuelCapacity": 1000000, "number": 1, "recycleMode": 0, "rapidfire": { "210": 1250, "212": 1250, "204": 200, "205": 100, "206": 33, "207": 30, "211": 25, "213": 5, "202": 250, "203": 250, "208": 250, "209": 250, "401": 200, "402": 200, "403": 100, "405": 100, "404": 50, "215": 15, "219": 30, "218": 10, "217": 1250 } }, "215": { "id": 215, "name": "Traqueur", "baseFuelConsumption": 250, "baseFuelCapacity": 750, "baseCargoCapacity": 1087, "fuelConsumption": 125, "baseSpeed": 10000, "speed": 49000, "cargoCapacity": 1087, "fuelCapacity": 750, "number": 1, "recycleMode": 0, "rapidfire": { "214": -10, "405": -2, "210": 5, "212": 5, "217": 5, "207": 7, "211": 4, "213": 3 } }, "217": { "id": 217, "name": "Foreuse", "baseFuelConsumption": 0, "baseFuelCapacity": 0, "baseCargoCapacity": 0, "fuelConsumption": 0, "baseSpeed": 0, "speed": 0, "cargoCapacity": 0, "fuelCapacity": 0, "number": 1, "recycleMode": 0, "rapidfire": { "204": -5, "205": -5, "206": -5, "207": -5, "215": -5, "211": -5, "213": -5, "214": -1250, "218": -5, "219": -5, "202": -5, "203": -5, "208": -5, "209": -5 } }, "218": { "id": 218, "name": "Faucheur", "baseFuelConsumption": 1100, "baseFuelCapacity": 10000, "baseCargoCapacity": 14500, "fuelConsumption": 550, "baseSpeed": 7000, "speed": 34300, "cargoCapacity": 14500, "fuelCapacity": 10000, "number": 1, "recycleMode": 2, "rapidfire": { "214": -10, "405": -2, "210": 5, "212": 5, "217": 5, "207": 7, "211": 4, "213": 3 } }, "219": { "id": 219, "name": "Éclaireur", "baseFuelConsumption": 300, "baseFuelCapacity": 10000, "baseCargoCapacity": 14500, "fuelConsumption": 150, "baseSpeed": 12000, "speed": 58800, "cargoCapacity": 14500, "fuelCapacity": 10000, "number": 1, "recycleMode": 3, "rapidfire": { "207": -5, "214": -30, "210": 5, "212": 5, "217": 5, "206": 3, "204": 3, "205": 2 } } }'
  );
  let table = createDOM("table", { class: "ogl-fleet-table" });
  let row = createDOM("tr");
  let td = createDOM("td");
  let planetIcon = createDOM("span", { class: "ogl-planet " + (!moon ? "ogl-active" : "") });
  let moonIcon = createDOM("span", { class: "ogl-moon " + (moon ? "ogl-active" : "") });
  planetIcon.addEventListener("click", () => {
    if (!planetIcon.classList.contains("ogl-active")) {
      content.replaceWith(defenseOverview(context, false));
    }
  });
  moonIcon.addEventListener("click", () => {
    if (!moonIcon.classList.contains("ogl-active")) {
      content.replaceWith(defenseOverview(context, true));
    }
  });
  td.appendChild(planetIcon);
  td.appendChild(moonIcon);
  row.appendChild(td);
  OGBIData.empire.forEach((planet) => {
    let name = moon ? (planet.moon ? planet.moon.name : "-") : planet.name;
    let link = `?page=ingame&component=defenses&cp=${planet.id}`;
    if (moon && planet.moon) link = `?page=ingame&component=defenses&cp=${planet.moon.id}`;
    row.appendChild(
      DOM.createDOMSanitized(
        "th",
        {},
        `<p>${name}</p> <a class="ogl-fleet-coords" href="${link}">${planet.coordinates}</span>`
      )
    );
  });
  row.appendChild(createDOM("th", { class: "ogl-sum-symbol" }, "Σ"));
  table.appendChild(row);
  Object.keys(shipsInfo).forEach((id) => {
    if (id > 200 && id < 300) {
      return;
    }
    row = createDOM("tr");
    let th = row.appendChild(createDOM("th"));
    th.appendChild(createDOM("th", { class: "ogl-option ogl-fleet-ship tooltip ogl-fleet-" + id }));
    let sum = 0;
    OGBIData.empire.forEach((planet) => {
      let current = false;
      if (planet.coordinates.slice(1, -1) == context.current.coords) {
        current = true;
      }
      sum += moon && planet.moon ? Number(planet.moon[id]) : Number(planet[id]);
      let valuePLa = planet[id] == 0 ? "-" : toFormattedNumber(planet[id], null, true);
      let valueMooon = "-";
      if (planet.moon) {
        valueMooon = planet.moon[id] == 0 ? "-" : toFormattedNumber(planet.moon[id], null, true);
      }
      let td = createDOM(
        "td",
        { class: valuePLa == "-" ? "ogl-fleet-empty" : "tooltip", "data-title": toFormattedNumber(planet[id], 0) },
        valuePLa
      );
      if (moon) {
        td = createDOM(
          "td",
          {
            class: valueMooon == "-" ? "ogl-fleet-empty" : "tooltip",
            "data-title": toFormattedNumber(planet.moon ? planet.moon[id] : 0, 0),
          },
          valueMooon
        );
      }
      if (current) {
        td.classList.add("ogl-current");
      }
      row.appendChild(td);
    });
    row.appendChild(
      createDOM(
        "td",
        { class: sum == "-" ? "ogl-fleet-empty" : "tooltip", "data-title": toFormattedNumber(sum, 0) },
        sum == 0 ? "-" : toFormattedNumber(sum, null, true)
      )
    );
    table.appendChild(row);
  });
  content.appendChild(table);
  return content;
}

function harvestOverview(context) {
  const content = createDOM("div", { class: "ogl-harvest-content" });

  const bank = OGBIData.json.options.collect.target;
  const bankCoordinates = `[${bank.galaxy}:${bank.system}:${bank.position}]`;

  const capacities = {};
  CARGO_SHIP_IDS.forEach((id) => {
    capacities[id] = Number(OGBIData.json.ships?.[id]?.cargoCapacity) || 0;
  });

  const keptForCurrent = OGBIData.json.options.defaultKept || {};
  const keep = {
    metal: Number(keptForCurrent[1]) || 0,
    crystal: Number(keptForCurrent[2]) || 0,
    deuterium: Number(keptForCurrent[3]) || 0,
  };

  const planets = OGBIData.empire.map((planet) => ({
    id: planet.id,
    name: planet.name,
    coordinates: planet.coordinates,
    resources: { metal: planet.metal, crystal: planet.crystal, deuterium: planet.deuterium },
    ships: CARGO_SHIP_IDS.reduce((ships, id) => ({ ...ships, [id]: Number(planet[id]) || 0 }), {}),
  }));

  const { plans, totals } = planHarvest({ planets, bankCoordinates, capacities, keep });

  const bankLine = createDOM("div", { class: "ogl-harvest-bank" }, `${Translator.translate(236)}: ${bankCoordinates}`);
  content.appendChild(bankLine);

  if (plans.length === 0) {
    content.appendChild(createDOM("div", { class: "ogl-harvest-empty" }, Translator.translate(239)));
    return content;
  }

  const table = createDOM("table", { class: "ogl-harvest-table" });
  const head = createDOM("tr");
  [Translator.translate(90), Translator.translate(237), Translator.translate(63), Translator.translate(238)].forEach(
    (label) => head.appendChild(createDOM("th", {}, label))
  );
  table.appendChild(head);

  plans.forEach((plan) => {
    const row = createDOM("tr", plan.feasible ? {} : { class: "ogl-harvest-short" });

    const link = `?page=ingame&component=fleetdispatch&cp=${plan.planet.id}&galaxy=${bank.galaxy}&system=${bank.system}&position=${bank.position}&type=${bank.type}&mission=${OGBIData.json.options.collect.mission}&oglMode=0`;
    row.appendChild(
      DOM.createDOMSanitized(
        "td",
        {},
        `<a href="${link}">${plan.planet.name}</a> <span class="ogl-harvest-coords">${plan.planet.coordinates}</span>`
      )
    );

    row.appendChild(createDOM("td", {}, toFormattedNumber(plan.send.total, null, true)));

    const shipCell = createDOM("td");
    CARGO_SHIP_IDS.forEach((id) => {
      if (!plan.ships[id]) return;
      const shipSpan = createDOM("span", { class: `ogl-option ogl-fleet-ship ogl-fleet-${id}` });
      shipCell.appendChild(shipSpan);
      shipCell.appendChild(createDOM("span", {}, ` ${toFormattedNumber(plan.ships[id], null, true)} `));
    });
    if (plan.shortfall > 0) {
      shipCell.appendChild(
        createDOM("span", { class: "ogl-danger" }, ` -${toFormattedNumber(plan.shortfall, null, true)}`)
      );
    }
    row.appendChild(shipCell);

    // The waste warning: hold that would fly empty if this fleet left as planned.
    const wasteCell = createDOM("td", plan.wastedCapacity > 0 ? { class: "ogl-care" } : {});
    wasteCell.textContent = plan.wastedCapacity > 0 ? toFormattedNumber(plan.wastedCapacity, null, true) : "-";
    row.appendChild(wasteCell);

    table.appendChild(row);
  });

  const sumRow = createDOM("tr", { class: "ogl-harvest-sum" });
  sumRow.appendChild(createDOM("th", {}, "Σ"));
  sumRow.appendChild(createDOM("th", {}, toFormattedNumber(totals.resources, null, true)));
  sumRow.appendChild(createDOM("th", {}, toFormattedNumber(totals.ships, null, true)));
  sumRow.appendChild(createDOM("th", {}, toFormattedNumber(totals.wastedCapacity, null, true)));
  table.appendChild(sumRow);

  content.appendChild(table);

  return content;
}

export { minesOverview, fleetOverview, defenseOverview, harvestOverview };
