/**
 * The eventbox fleet-movement parser.
 *
 * `flying()` reads `#eventContent .eventFleet` rows and, for each one, parses a
 * tooltip HTML fragment OGame embeds in the row's `title` (or `data-tooltip-title`)
 * attribute - a `<table>` of `<tr>` rows mimicking the game's own movement tooltip.
 * The row layout, worked out from the slicing arithmetic (`fleetDataRow.slice(1,
 * metalRow - 1)`):
 *
 *   row 0              header, always skipped (slice starts at 1)
 *   row 1..N           one row per ship
 *   row N+1            spacer/consumption row, never read by anything
 *   row N+2 (-3/-4)    metal   (-4 instead of -3 when lifeforms are present)
 *   row N+3 (-2/-3)    crystal
 *   row N+4 (-1/-2)    deuterium
 *   row N+5 (lifeforms only) trailing row, never read either
 *
 * Every fixture below carries a deliberately conspicuous value (424242) in the
 * spacer row so a wrong offset shows up immediately in a ship or resource total
 * instead of passing silently.
 *
 * Page context module - no `chrome: true` on setupBrowser. `needs.js` (imported by
 * fleetMovements.js for the reversal-click wiring) is mocked wholesale rather than
 * given a real DOM: its own module-eval-time `#eventboxContent` observer has nothing
 * to do with what this file is testing, and mocking it lets the reversal test assert
 * on the call directly instead of on a side effect.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const displayLocksByCoords = mock.fn();
mock.module(new URL("../../src/ctxpage/planetbar/needs.js", import.meta.url).href, {
  namedExports: { displayLocksByCoords },
});

const bootstrap = setupBrowser();
const OGBIData = (await import("../../src/store/OGBIData.js")).default;
const flying = (await import("../../src/ogame/fleetMovements.js")).default;
bootstrap.cleanup();

const SHIP_NAMES = Object.freeze({ "Small Cargo": "202", "Large Cargo": "203" });

const HEADER_ROW = ["Ship", "Count"];
const SHIP_ROWS = [
  ["Small Cargo:", "5"],
  ["Large Cargo:", "3"],
];
/** Sits between the ships and the resources. Never read by the parser. */
const SPACER_ROW = ["Fuel Consumption", "424242"];

function resourceRows(metal, crystal, deuterium) {
  return [
    ["Metal", String(metal)],
    ["Crystal", String(crystal)],
    ["Deuterium", String(deuterium)],
  ];
}

function standardTooltipRows(metal, crystal, deuterium) {
  return [HEADER_ROW, ...SHIP_ROWS, SPACER_ROW, ...resourceRows(metal, crystal, deuterium)];
}

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

function createMoonMarker() {
  const span = document.createElement("span");
  span.classList.add("moon");
  return span;
}

/** Builds one `.eventFleet` row in the shape `fleetMovements.js` reads. */
function appendEventRow(container, options) {
  const {
    id,
    missionType: type,
    back,
    arrival = 1700000000,
    originCoords,
    originName = "Origin Planet",
    originMoon = false,
    destCoords,
    destName = "Dest Planet",
    destMoon = false,
    ownText = "",
    tooltipRows,
    reserve = false,
    useDataAttr = false,
    reversal = false,
  } = options;

  const row = document.createElement("div");
  row.id = `eventRow-${id}`;
  row.classList.add("eventFleet");
  row.setAttribute("data-return-flight", String(back));
  row.setAttribute("data-mission-type", String(type));
  row.setAttribute("data-arrival-time", String(arrival));

  // children[0..3]: filler cells the parser never reads by position.
  for (let i = 0; i < 4; i++) row.appendChild(document.createElement("td"));

  // children[4]: the "own empire" check reads exactly this cell.
  const ownTd = document.createElement("td");
  ownTd.textContent = ownText;
  row.appendChild(ownTd);

  const originCoordsTd = document.createElement("td");
  originCoordsTd.classList.add("coordsOrigin");
  const originLink = document.createElement("a");
  originLink.textContent = `[${originCoords}]`;
  originCoordsTd.appendChild(originLink);
  row.appendChild(originCoordsTd);

  const originFleetTd = document.createElement("td");
  originFleetTd.classList.add("originFleet");
  originFleetTd.appendChild(document.createTextNode(originName));
  if (originMoon) originFleetTd.appendChild(createMoonMarker());
  row.appendChild(originFleetTd);

  const destCoordsTd = document.createElement("td");
  destCoordsTd.classList.add("destCoords");
  const destLink = document.createElement("a");
  destLink.textContent = `[${destCoords}]`;
  destCoordsTd.appendChild(destLink);
  row.appendChild(destCoordsTd);

  const destFleetTd = document.createElement("td");
  destFleetTd.classList.add("destFleet");
  destFleetTd.appendChild(document.createTextNode(destName));
  if (destMoon) destFleetTd.appendChild(createMoonMarker());
  row.appendChild(destFleetTd);

  const iconTd = document.createElement("td");
  iconTd.classList.add(reserve ? "icon_movement_reserve" : "icon_movement");
  const tooltipSpan = document.createElement("span");
  tooltipSpan.classList.add("tooltip");
  tooltipSpan.setAttribute(useDataAttr ? "data-tooltip-title" : "title", buildTooltipHtml(tooltipRows));
  iconTd.appendChild(tooltipSpan);
  row.appendChild(iconTd);

  if (reversal) {
    const reversalTd = document.createElement("td");
    reversalTd.classList.add("reversal");
    reversalTd.appendChild(document.createElement("a"));
    row.appendChild(reversalTd);
  }

  container.appendChild(row);
  return row;
}

/** `isOwnPlanet()` reads `#planetList .planet-koords` - always present, often empty. */
function planetListHtml(coordsList) {
  return `<div id="planetList">${coordsList
    .map((coords) => `<div class="smallplanet"><span class="planet-koords">${coords}</span></div>`)
    .join("")}</div>`;
}

test("a deployment credits the destination and skips the row between ships and resources", () => {
  const browser = setupBrowser({ html: `<div id="eventContent"></div>${planetListHtml(["1:2:5"])}` });
  try {
    OGBIData.json = { shipNames: { ...SHIP_NAMES } };
    OGBIData.empire = [];
    appendEventRow(document.getElementById("eventContent"), {
      id: 501,
      missionType: 4, // DEPLOYMENT
      back: false,
      originCoords: "1:2:3",
      destCoords: "1:2:5",
      tooltipRows: standardTooltipRows(1000, 500, 250),
    });

    const result = flying();

    assert.equal(result.metal, 1000);
    assert.equal(result.crystal, 500);
    assert.deepEqual(result.fleet, { 202: 5, 203: 3 });
    assert.equal(result.ids.length, 1);
    assert.equal(result.planets["1:2:5"].metal, 1000, "own destination planet is credited");
    assert.equal(result.planets["1:2:3"].metal, 0, "an outbound deployment does not credit its origin");
    assert.notEqual(result.metal, 424242, "the spacer row must never be read as a resource");
  } finally {
    browser.cleanup();
  }
});

test("deuterium reads the value actually in the table, without lifeforms", () => {
  // Was a KNOWN BUG: fleetDataRow.slice(deuteriumRow, deuteriumRow + 1) with
  // deuteriumRow = -1 became slice(-1, 0) - the end argument is the literal index
  // 0, not "one past the start", so start > end and the call always returned [].
  // Fixed by using .at(deuteriumRow), which handles a negative index directly.
  const browser = setupBrowser({ html: `<div id="eventContent"></div>${planetListHtml([])}` });
  try {
    OGBIData.json = { shipNames: {} };
    OGBIData.empire = [];
    appendEventRow(document.getElementById("eventContent"), {
      id: 70,
      missionType: 4, // DEPLOYMENT
      back: false,
      originCoords: "1:1:1",
      destCoords: "2:2:2",
      tooltipRows: standardTooltipRows(0, 0, 999),
    });

    const result = flying();

    assert.equal(result.deuterium, 999);
  } finally {
    browser.cleanup();
  }
});

test("the own-empire flag reads exactly the row's fifth cell against OGBIData.empire", () => {
  const browser = setupBrowser({ html: `<div id="eventContent"></div>${planetListHtml([])}` });
  try {
    OGBIData.json = { shipNames: {} };
    OGBIData.empire = [{ id: 1, coordinates: "[1:2:3]" }];
    const container = document.getElementById("eventContent");
    appendEventRow(container, {
      id: 1,
      missionType: 1, // ATTACK
      back: true,
      originCoords: "5:5:5",
      destCoords: "6:6:6",
      ownText: "[1:2:3]",
      tooltipRows: standardTooltipRows(0, 0, 0),
    });
    appendEventRow(container, {
      id: 2,
      missionType: 1,
      back: true,
      originCoords: "5:5:5",
      destCoords: "6:6:6",
      ownText: "[9:9:9]",
      tooltipRows: standardTooltipRows(0, 0, 0),
    });

    const result = flying();

    assert.equal(result.ids[0].own, true);
    assert.equal(result.ids[1].own, false);
  } finally {
    browser.cleanup();
  }
});

test("an attack landing on the player's own planet reads the whole table as ships and never touches resources", () => {
  const browser = setupBrowser({ html: `<div id="eventContent"></div>${planetListHtml(["3:3:3"])}` });
  try {
    OGBIData.json = { shipNames: { ...SHIP_NAMES } };
    OGBIData.empire = [];
    appendEventRow(document.getElementById("eventContent"), {
      id: 10,
      missionType: 1, // ATTACK
      back: false,
      originCoords: "1:1:1",
      destCoords: "3:3:3",
      tooltipRows: standardTooltipRows(1000, 500, 250),
    });

    const result = flying();

    assert.deepEqual(result.ids[0].fleet, { 202: 5, 203: 3 }, "ships are still read across the whole table");
    assert.equal(result.metal, 0, "an incoming attack on our own planet must not add resources");
    assert.equal(result.ids[0].metal, undefined);
  } finally {
    browser.cleanup();
  }
});

test("a transport's return leg is zeroed once it follows the matching outbound id", () => {
  const browser = setupBrowser({ html: `<div id="eventContent"></div>${planetListHtml([])}` });
  try {
    OGBIData.json = { shipNames: { ...SHIP_NAMES } };
    OGBIData.empire = [];
    const container = document.getElementById("eventContent");
    appendEventRow(container, {
      id: 20,
      missionType: 3, // TRANSPORT
      back: false,
      originCoords: "1:1:1",
      destCoords: "2:2:2",
      tooltipRows: standardTooltipRows(1000, 0, 0),
    });
    appendEventRow(container, {
      id: 21,
      missionType: 3,
      back: true,
      originCoords: "2:2:2",
      destCoords: "1:1:1",
      tooltipRows: standardTooltipRows(1000, 0, 0),
    });

    const result = flying();

    assert.equal(result.ids[0].metal, 1000, "the outbound leg keeps its resources");
    assert.equal(result.ids[1].metal, 0, "the matching return leg is zeroed");
    assert.equal(result.metal, 1000, "only the outbound leg counts toward the total");
  } finally {
    browser.cleanup();
  }
});

test("mission type 16 and exploration produce no movement record at all", () => {
  const browser = setupBrowser({ html: `<div id="eventContent"></div>${planetListHtml([])}` });
  try {
    OGBIData.json = { shipNames: {} };
    OGBIData.empire = [];
    const container = document.getElementById("eventContent");
    appendEventRow(container, {
      id: 30,
      missionType: 16,
      back: false,
      originCoords: "1:1:1",
      destCoords: "2:2:2",
      tooltipRows: standardTooltipRows(0, 0, 0),
    });
    appendEventRow(container, {
      id: 31,
      missionType: 18, // EXPLORATION
      back: false,
      originCoords: "1:1:1",
      destCoords: "2:2:2",
      tooltipRows: standardTooltipRows(0, 0, 0),
    });

    const result = flying();

    assert.deepEqual(result.ids, []);
    assert.equal(result.metal, 0);
  } finally {
    browser.cleanup();
  }
});

test("origin and destination carry a moon or planet suffix from the moon markers", () => {
  const browser = setupBrowser({ html: `<div id="eventContent"></div>${planetListHtml([])}` });
  try {
    OGBIData.json = { shipNames: {} };
    OGBIData.empire = [];
    appendEventRow(document.getElementById("eventContent"), {
      id: 40,
      missionType: 1,
      back: true,
      originCoords: "1:1:1",
      originMoon: true,
      destCoords: "2:2:2",
      destMoon: false,
      tooltipRows: standardTooltipRows(0, 0, 0),
    });

    const result = flying();

    assert.equal(result.ids[0].origin, "1:1:1M");
    assert.equal(result.ids[0].dest, "2:2:2P");
  } finally {
    browser.cleanup();
  }
});

test("the tooltip is also read from data-tooltip-title, and from the reserve icon variant", () => {
  const browser = setupBrowser({ html: `<div id="eventContent"></div>${planetListHtml([])}` });
  try {
    OGBIData.json = { shipNames: { ...SHIP_NAMES } };
    OGBIData.empire = [];
    appendEventRow(document.getElementById("eventContent"), {
      id: 41,
      missionType: 1,
      back: true,
      originCoords: "1:1:1",
      destCoords: "2:2:2",
      reserve: true,
      useDataAttr: true,
      tooltipRows: standardTooltipRows(10, 20, 30),
    });

    const result = flying();

    assert.deepEqual(result.fleet, { 202: 5, 203: 3 });
    assert.equal(result.ids[0].metal, 10);
  } finally {
    browser.cleanup();
  }
});

test("accepting a reversal notifies needs.js about the destination", () => {
  const browser = setupBrowser({
    html: `<div id="eventContent"></div>${planetListHtml([])}<button id="errorBoxDecisionYes"></button>`,
  });
  try {
    OGBIData.json = { shipNames: {} };
    OGBIData.empire = [];
    appendEventRow(document.getElementById("eventContent"), {
      id: 50,
      missionType: 1,
      back: true,
      originCoords: "1:1:1",
      destCoords: "2:2:2",
      destMoon: true,
      reversal: true,
      tooltipRows: standardTooltipRows(0, 0, 0),
    });

    displayLocksByCoords.mock.resetCalls();
    flying();

    document.querySelector(".reversal a").dispatchEvent(new Event("click", { bubbles: true }));
    document.getElementById("errorBoxDecisionYes").dispatchEvent(new Event("click", { bubbles: true }));

    assert.equal(displayLocksByCoords.mock.callCount(), 1);
    assert.deepEqual(displayLocksByCoords.mock.calls[0].arguments, ["2:2:2", true]);
  } finally {
    browser.cleanup();
  }
});

test("a ship row naming an unknown ship is ignored instead of crashing", () => {
  const browser = setupBrowser({ html: `<div id="eventContent"></div>${planetListHtml([])}` });
  try {
    OGBIData.json = { shipNames: { ...SHIP_NAMES } };
    OGBIData.empire = [];
    appendEventRow(document.getElementById("eventContent"), {
      id: 60,
      missionType: 1,
      back: true,
      originCoords: "1:1:1",
      destCoords: "2:2:2",
      tooltipRows: [HEADER_ROW, ["Unknown Vessel:", "9"], ...SHIP_ROWS, SPACER_ROW, ...resourceRows(0, 0, 0)],
    });

    const result = flying();

    assert.deepEqual(result.fleet, { 202: 5, 203: 3 }, "the unrecognised ship name is skipped, not crashed on");
  } finally {
    browser.cleanup();
  }
});
