/**
 * `fleetMovements.js`'s lifeforms offset.
 *
 * `hasLifeforms()` reads `document.querySelector(".lifeform")` on its first call and
 * memoizes the result at module scope for the process lifetime - it never changes
 * mid-session on a real page, since a server either has lifeforms enabled or does
 * not. That memoization is exactly why this case needs its own file: node:test runs
 * every file in a separate process (docs/testing.md), so this is the only clean way
 * to exercise the lifeforms branch without importFresh() (reserved for construction
 * tests - see docs/testing.md) poisoning coverage attribution for the main file.
 *
 * With lifeforms present, `metalRow`/`crystalRow`/`deuteriumRow` shift from -3/-2/-1
 * to -4/-3/-2, so there is a second unread row - a trailing one after deuterium -
 * on top of the spacer between the ships and the resources that always exists.
 *
 * Page context module - no `chrome: true` on setupBrowser. `needs.js` is mocked
 * wholesale; see fleetMovements.test.js for why.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

mock.module(new URL("../../src/ctxpage/planetbar/needs.js", import.meta.url).href, {
  namedExports: { displayLocksByCoords: mock.fn() },
});

// hasLifeforms() is only ever evaluated lazily, inside flying(), so `.lifeform`
// does not need to be present for this import - only for the first real call below.
const bootstrap = setupBrowser();
const OGBIData = (await import("../../src/store/OGBIData.js")).default;
const flying = (await import("../../src/ogame/fleetMovements.js")).default;
bootstrap.cleanup();

const SHIP_NAMES = Object.freeze({ "Small Cargo": "202", "Large Cargo": "203" });

function buildTooltipHtml(rows) {
  const table = document.createElement("table");
  const tbody = table.appendChild(document.createElement("tbody"));
  rows.forEach(([first, second]) => {
    const tr = tbody.appendChild(document.createElement("tr"));
    tr.appendChild(document.createElement("td")).textContent = first;
    if (second !== undefined) {
      tr.appendChild(document.createElement("td")).textContent = second;
    }
  });
  return table.outerHTML;
}

function appendEventRow(container, { id, tooltipRows, destCoords }) {
  const row = document.createElement("div");
  row.id = `eventRow-${id}`;
  row.classList.add("eventFleet");
  row.setAttribute("data-return-flight", "false");
  row.setAttribute("data-mission-type", "4"); // DEPLOYMENT
  row.setAttribute("data-arrival-time", "1700000000");

  for (let i = 0; i < 4; i++) row.appendChild(document.createElement("td"));
  row.appendChild(document.createElement("td")); // children[4]: own-empire check, unused here

  const originCoordsTd = document.createElement("td");
  originCoordsTd.classList.add("coordsOrigin");
  originCoordsTd.appendChild(document.createElement("a")).textContent = "[1:1:1]";
  row.appendChild(originCoordsTd);

  const originFleetTd = document.createElement("td");
  originFleetTd.classList.add("originFleet");
  originFleetTd.textContent = "Origin Planet";
  row.appendChild(originFleetTd);

  const destCoordsTd = document.createElement("td");
  destCoordsTd.classList.add("destCoords");
  destCoordsTd.appendChild(document.createElement("a")).textContent = `[${destCoords}]`;
  row.appendChild(destCoordsTd);

  const destFleetTd = document.createElement("td");
  destFleetTd.classList.add("destFleet");
  destFleetTd.textContent = "Dest Planet";
  row.appendChild(destFleetTd);

  const iconTd = document.createElement("td");
  iconTd.classList.add("icon_movement");
  const tooltipSpan = document.createElement("span");
  tooltipSpan.classList.add("tooltip");
  tooltipSpan.setAttribute("title", buildTooltipHtml(tooltipRows));
  iconTd.appendChild(tooltipSpan);
  row.appendChild(iconTd);

  container.appendChild(row);
  return row;
}

function planetListHtml(coordsList) {
  return `<div id="planetList">${coordsList
    .map((coords) => `<div class="smallplanet"><span class="planet-koords">${coords}</span></div>`)
    .join("")}</div>`;
}

test("with lifeforms present, resource rows shift one earlier and the trailing row is never read", () => {
  // hasLifeforms() memoizes on its first call in the whole file, so `.lifeform`
  // must be present here too, not just in the bootstrap browser used for imports.
  const browser = setupBrowser({
    html: `<div class="lifeform"></div><div id="eventContent"></div>${planetListHtml(["9:9:9"])}`,
  });
  try {
    OGBIData.json = { shipNames: { ...SHIP_NAMES } };
    OGBIData.empire = [];
    appendEventRow(document.getElementById("eventContent"), {
      id: 60,
      destCoords: "9:9:9",
      tooltipRows: [
        ["Ship", "Count"],
        ["Small Cargo:", "5"],
        ["Large Cargo:", "3"],
        ["Fuel Consumption", "424242"], // spacer, before the resources - never read
        ["Metal", "1000"],
        ["Crystal", "500"],
        ["Deuterium", "250"],
        ["Lifeform Points", "111111"], // trailing, after deuterium - never read either
      ],
    });

    const result = flying();

    assert.equal(result.metal, 1000);
    assert.equal(result.crystal, 500);
    assert.equal(result.deuterium, 250);
    assert.deepEqual(result.fleet, { 202: 5, 203: 3 });
    assert.equal(result.planets["9:9:9"].deuterium, 250, "the trailing lifeform row must not leak into deuterium");
  } finally {
    browser.cleanup();
  }
});
