import { messagesTabs } from "../index.js";
import { getLogger } from "../../../platform/logger.js";
import { createDOM } from "../../../ui/dom.js";
import { SpyReport } from "./Object/SpyReport.js";
import ship from "../../../game/ship.js";
import { tooltip } from "../../../ui/tooltip.js";
import { popup } from "../../../ui/popup.js";
import DateTime from "../../../format/dateTime.js";
import { toFormattedNumber } from "../../../format/numbers.js";
import { calcNeededShips } from "../../../game/calcNeededShips.js";
import * as ptreService from "../../../integrations/ptre/service.js";
import { isAbortError } from "../../../platform/abort.js";
import planetType from "../../../game/planetType.js";
import Markerui from "../../../ui/markers.js";
import Player from "../../stalk/player.js";
import * as stalk from "../../stalk/stalkPanel.js";
import PlayerClass from "../../../game/playerClass.js";
import OgamePageData from "../../../ogame/pageData.js";
import OGBIData from "../../../store/OGBIData.js";
import Translator from "../../../format/i18n/translate.js";
import { evaluateTarget } from "../../../game/farmEvaluator.js";
import { formatDuration } from "../../../game/fleetFlight.js";

class SpyMessagesAnalyzer {
  #logger;
  #messageCallable;
  #tabId;
  #onTrash = false;
  reportsToDelete = [];
  #spyReports = {};

  constructor() {
    this.#logger = getLogger("SpyMessagesAnalyer");

    window.addEventListener("ogi-spyTableReload", () => {
      this.clean();
      this.analyze(this.#messageCallable, this.#tabId);
    });
  }

  support(tabId) {
    return [messagesTabs.SPY, messagesTabs.TRASH, messagesTabs.FAVORITES].includes(tabId);
  }

  clean(force) {
    if (
      OGBIData.options.spyTableAppend &&
      !force &&
      this.#onTrash === !!document.querySelector('.messagesTrashcanBtns button.custom_btn[disabled="disabled"]')
    )
      return;

    this.#spyReports = {};

    // Removing the scroll wrapper takes the table inside it with it - removing
    // just the table would leave an empty wrapper behind on every clean+rebuild.
    (document.querySelector(".ogl-spyTableScroll") ?? document.querySelector(".ogl-spyTable"))?.remove();
    document.querySelector(".ogl-tableOptions")?.remove();
  }

  analyze(messageCallable, tabId) {
    this.reportsToDelete = [];
    this.#tabId = tabId;
    this.#messageCallable = messageCallable;
    this.#onTrash = !!document.querySelector('.messagesTrashcanBtns button.custom_btn[disabled="disabled"]');

    this.#displaySpyTable();
    this.#ptreSpy();
  }

  #isReport(message) {
    return (
      (message.querySelector(".msgContent .espionageInfo") !== null &&
        message.querySelector(".rawMessageData[data-raw-playername]").getAttribute("data-raw-playername").length) ||
      message.querySelector(".rawMessageData[data-raw-counterespionagechance]") !== null
    );
  }

  #displaySpyTable() {
    let table = document.querySelector(".ogl-spyTable");

    if (!table) {
      const target = document.querySelector("#messages .messagePaginator");
      // Only the rows scroll internally, capped well short of the viewport -
      // the header row (column names, per-column sort) stays visible via
      // `position: sticky` instead of scrolling away on a long report list.
      // Self-contained on purpose: it caps against this wrapper's own height,
      // not the viewport, so it never has to guess where OGame's own fixed
      // top bar ends.
      const scrollWrapper = createDOM("div", { class: "ogl-spyTableScroll" });
      table = createDOM("table", { class: "ogl-spyTable" });
      scrollWrapper.appendChild(table);
      target.parentNode.insertBefore(scrollWrapper, target);

      this.#spyTableOptions(table);
      this.#spyTableHeader(table);
    }

    if (!OGBIData.options.spyTableEnable) {
      table.classList.add("ogl-hidden");

      return;
    }

    this.#messageCallable().forEach((message) => {
      if (!this.#isReport(message)) return;

      const report = new SpyReport(message);

      if (!report.targetIsSelf) this.#spyReports[report.id] = report;
    });

    if (Object.keys(this.#spyReports).length === 0) {
      if (!table.querySelector("tbody")) {
        const body = table.appendChild(createDOM("tbody"));
        const row = body.appendChild(createDOM("tr"));
        row.appendChild(createDOM("td", { colspan: "8", class: "ogl-spyTable-empty" }, Translator.translate(345)));
      }
      return;
    }

    this.#spyTableBody(table);
  }

  #spyTableOptions(table) {
    if (document.querySelector('.messagesTrashcanBtns button.custom_btn[disabled="disabled"]')) return;
    const options = OGBIData.options;

    const tableOptions = createDOM("div", { class: "ogl-tableOptions" });
    const enableTable = tableOptions.appendChild(
      createDOM("button", { class: "icon icon_eye tooltip", title: Translator.translate(106, "text") })
    );
    if (options.spyTableEnable) enableTable.classList.add("ogl-active");
    enableTable.addEventListener("click", () => {
      enableTable.classList.toggle("ogl-active");
      table.classList.toggle("ogl-hidden");
      options.spyTableEnable = !options.spyTableEnable;
      OGBIData.options = options;

      window.dispatchEvent(new CustomEvent("ogi-spyTableReload"));
    });

    const appendOption = tableOptions.appendChild(
      createDOM("button", {
        class: "icon icon_plus tooltip",
        title: Translator.translate(182, "text"),
      })
    );

    if (options.spyTableAppend) appendOption.classList.add("ogl-active");

    appendOption.addEventListener("click", () => {
      appendOption.classList.toggle("ogl-active");
      options.spyTableAppend = !options.spyTableAppend;
      OGBIData.options = options;
    });

    const autoDelete = tableOptions.appendChild(
      createDOM("button", {
        class: "icon icon_trash tooltip",
        title: Translator.translate(104, "text"),
      })
    );
    if (options.autoDeleteEnable) autoDelete.classList.add("ogl-active");
    autoDelete.addEventListener("click", () => {
      options.autoDeleteEnable = !options.autoDeleteEnable;
      OGBIData.options = options;
      this.clean(true);
      window.dispatchEvent(new CustomEvent("ogi-spyTableReload"));
    });

    tableOptions.appendChild(createDOM("div", { style: "height:1px;width:20px;" }));

    // Inserted before the scroll wrapper, not the table itself, so the toolbar
    // stays outside the scrolling area (always visible) rather than scrolling
    // away with the rows.
    const scrollWrapper = table.closest(".ogl-spyTableScroll") ?? table.parentNode;
    scrollWrapper.parentNode.insertBefore(tableOptions, scrollWrapper);
  }

  #flightContextCache = null;

  /**
   * Own planets as flight origins, plus the universe geometry the distance formula needs.
   * Everything comes from data the page already holds - no request is made for any of it.
   */
  #flightContext() {
    if (this.#flightContextCache) return this.#flightContextCache;

    const origins = [];
    (OGBIData.empire || []).forEach((planet) => {
      // a moon shares its planet's coordinates, so it adds no separate origin
      const parsed = this.#parseCoords(planet.coordinates);
      if (parsed) origins.push(parsed);
    });

    const json = OGBIData.json;
    const settings = json.universeSettingsTooltip || {};

    // The cargo already chosen for this table decides the flight time, so the estimate matches
    // the fleet the player intends to send rather than some notional ship.
    const chosen = (json.ships || {})[OGBIData.options.spyFret];

    this.#flightContextCache = {
      origins,
      shipSpeed: Number(chosen?.speed) || 0,
      fleetSpeedFactor: Number(json.speedFleetWar) || 1,
      cargoCapacity: Number(chosen?.cargoCapacity) || 0,
      fuelConsumption: Number(chosen?.fuelConsumption) || 0,
      universe: {
        galaxies: settings.galaxies,
        systems: settings.systems,
        donutGalaxy: settings.donutGalaxy,
        donutSystem: settings.donutSystem,
      },
    };

    return this.#flightContextCache;
  }

  #parseCoords(raw) {
    const parts = String(raw || "")
      .replace(/[[\]]/g, "")
      .split(":");
    if (parts.length !== 3) return null;

    const [galaxy, system, position] = parts.map(Number);
    if ([galaxy, system, position].some((n) => !Number.isFinite(n))) return null;

    return { galaxy, system, position };
  }

  #flightOf(report) {
    const target = this.#parseCoords(report.coords);
    if (!target) return { profitPerHour: 0, durationSeconds: Infinity, origin: null, distance: Infinity };

    const context = this.#flightContext();

    return evaluateTarget({
      target,
      origins: context.origins,
      loot: report.renta,
      shipSpeed: context.shipSpeed,
      fleetSpeedFactor: context.fleetSpeedFactor,
      universe: context.universe,
      cargoCapacity: context.cargoCapacity,
      fuelConsumption: context.fuelConsumption,
    });
  }

  #profitPerHour(report) {
    return this.#flightOf(report).profitPerHour;
  }

  #spyTableHeader(table) {
    const thead = createDOM("thead");
    table.appendChild(thead);

    const header = createDOM("tr");
    thead.appendChild(header);

    header.appendChild(createDOM("th", {}, "#"));
    header.appendChild(createDOM("th", { "data-filter": "DATE" }, `${Translator.translate(97)} (*)`));
    header.appendChild(createDOM("th", { "data-filter": "COORDS" }, Translator.translate(98)));
    header.appendChild(createDOM("th", {}, `${Translator.translate(73)} (+)`));
    header.appendChild(createDOM("th", { "data-filter": "$" }, Translator.translate(265)));
    header.appendChild(createDOM("th", { "data-filter": "PER_HOUR" }, Translator.translate(232)));
    header.appendChild(createDOM("th", { "data-filter": "FLEET" }, Translator.translate(63)));
    header.appendChild(createDOM("th", { "data-filter": "DEF" }, Translator.translate(54)));

    header.querySelectorAll("th").forEach((th) => {
      const filter = th.getAttribute("data-filter");
      if (OGBIData.options.spyFilter === filter) th.classList.add("ogl-active");

      th.addEventListener("click", (event) => {
        if (filter) {
          // Injected into #messages, next to OGame's own message list - without this,
          // the click bubbles into whatever native handling lives up there.
          event.stopPropagation();

          // Read fresh, not a snapshot from table build time: this table can live
          // across many analyze() calls in append mode, and a stale snapshot here
          // would silently overwrite any other option changed since then.
          const options = OGBIData.options;
          options.spyFilter = filter;
          header.querySelector("th.ogl-active")?.classList?.remove("ogl-active");
          th.classList.add("ogl-active");

          OGBIData.options = options;

          table.querySelector("tbody")?.remove();
          this.#displaySpyTable();
        }
      });
    });

    const cargoSpan = createDOM("span", {
      style: "display: flex;",
      class: `ogl-option ogl-fleet-ship choice ogl-fleet-${OGBIData.options.spyFret}`,
    });

    const cargoChoice = this.#cargoChoice(cargoSpan);

    const cargo = createDOM("th", {
      style: " place-items: center; display: flex; height: 31px; place-content: center;",
    });

    cargo.addEventListener("mouseover", () => tooltip(cargo, cargoChoice, false, false, 50));

    cargo.appendChild(cargoSpan);
    header.appendChild(cargo);

    header.appendChild(createDOM("th", { class: "ogl-headerColors" }, "-"));
    header.appendChild(createDOM("th", {}, "Actions"));
  }

  #cargoChoice(cargoSpan) {
    const gridCol = OGBIData.ships[ship.EspionageProbe].cargoCapacity ? 4 : 3;

    const cargoChoice = createDOM("div", {
      style: `display: grid; grid-template-columns: repeat(${gridCol}, minmax(0, 1fr))`,
    });

    const smallCargo = cargoChoice.appendChild(
      createDOM("div", {
        class: `ogl-option ogl-fleet-ship choice ogl-fleet-${ship.SmallCargoShip}`,
        "data-ship": ship.SmallCargoShip,
      })
    );
    const largeCargo = cargoChoice.appendChild(
      createDOM("div", {
        class: `ogl-option ogl-fleet-ship choice ogl-fleet-${ship.LargeCargoShip}`,
        "data-ship": ship.LargeCargoShip,
      })
    );
    const pathFinder = cargoChoice.appendChild(
      createDOM("div", {
        class: `ogl-option ogl-fleet-ship choice ogl-fleet-${ship.Pathfinder}`,
        "data-ship": ship.Pathfinder,
      })
    );

    cargoChoice.appendChild(smallCargo);
    cargoChoice.appendChild(largeCargo);
    cargoChoice.appendChild(pathFinder);

    const saveDefaultCargo = (e) => {
      const options = OGBIData.options;
      const oldValue = options.spyFret;
      options.spyFret = parseInt(e.target.getAttribute("data-ship"));
      OGBIData.options = options;

      cargoSpan.classList.remove(`ogl-fleet-${oldValue}`);
      cargoSpan.classList.add(`ogl-fleet-${options.spyFret}`);

      document.querySelectorAll(".ogl-cargo-choice").forEach((el) => {
        const coords = el.getAttribute("data-coords");
        const planetTargetType = el.getAttribute("data-planet-target-type");
        const value = el.getAttribute(`data-ship-${options.spyFret}`);
        const fleetLink = this.#fleetDispatchLink(coords, planetTargetType, options.spyFret, value);
        el.querySelector("a").href = `?${fleetLink.toString()}`;
        el.querySelector("a").textContent = toFormattedNumber(parseInt(value));
      });

      // Gewinn/h is computed from whichever ship is chosen (#flightContext() reads
      // OGBIData.options.spyFret), but that context is cached per table build - without
      // invalidating it here, switching ships left every row's profit/hour frozen on
      // whatever ship was selected when the table was first drawn.
      this.#flightContextCache = null;
      const table = document.querySelector(".ogl-spyTable");
      table?.querySelector("tbody")?.remove();
      this.#displaySpyTable();
    };

    smallCargo.addEventListener("click", saveDefaultCargo);
    largeCargo.addEventListener("click", saveDefaultCargo);
    pathFinder.addEventListener("click", saveDefaultCargo);

    if (OGBIData.ships[ship.EspionageProbe].cargoCapacity) {
      cargoChoice.classList.add("spio");

      const probe = cargoChoice.appendChild(
        createDOM("div", {
          class: `ogl-option ogl-fleet-ship choice ogl-fleet-${ship.EspionageProbe}`,
          "data-ship": ship.EspionageProbe,
        })
      );

      cargoChoice.appendChild(probe);

      probe.addEventListener("click", saveDefaultCargo);
    }
    return cargoChoice;
  }

  #fleetDispatchLink(coords, planetTargetType, shipId, count) {
    coords = coords.split(":");
    const fleetLink = new URLSearchParams({
      page: "ingame",
      component: "fleetdispatch",
      galaxy: coords[0],
      system: coords[1],
      position: coords[2],
      type: planetTargetType,
      mission: 1,
      oglMode: 4,
    });

    if (shipId && count) fleetLink.append(`am${shipId}`, count);

    return fleetLink;
  }

  #spyTableBody(table) {
    let body = table.querySelector("tbody");

    if (!OGBIData.options.spyTableAppend || !body) {
      body = createDOM("tbody");
      table.appendChild(body);
    }

    const compare = (a, b) => {
      if (isNaN(a)) a = -1;
      if (isNaN(b)) b = -1;

      return a - b;
    };

    const reports = Object.values(this.#spyReports);

    const spyFilter = OGBIData.options.spyFilter;
    reports.sort((a, b) => {
      if (spyFilter === "$") {
        return compare(b.renta, a.renta);
      } else if (spyFilter === "DATE") {
        return compare(a.deltaDate, b.deltaDate);
      } else if (spyFilter === "COORDS") {
        return compare(a.tmpCoords, b.tmpCoords);
      } else if (spyFilter === "FLEET") {
        return compare(b.fleet, a.fleet);
      } else if (spyFilter === "DEF") {
        return compare(b.defense, a.defense);
      } else if (spyFilter === "PER_HOUR") {
        return compare(this.#profitPerHour(b), this.#profitPerHour(a));
      }
    });

    reports.forEach((report) => {
      let bodyRow = body.querySelector(`[data-report-id="${report.id}"]`);

      if (bodyRow) {
        // Moving an expanded row without closing it first would leave its
        // renta-breakdown rows behind at the old position, detached from it.
        if (bodyRow.getAttribute("data") === "expanded") {
          bodyRow.setAttribute("data", "closed");
          document.querySelectorAll("tr.spyTable-extended").forEach((e) => e.remove());
        }

        body.appendChild(bodyRow);

        return;
      }

      bodyRow = createDOM("tr", { data: "closed", "data-report-id": report.id });
      body.appendChild(bodyRow);

      const indexCol = createDOM("td");

      if (report.isNew) {
        indexCol.classList.add("ogi-new");
      }

      if (report.attacked) {
        bodyRow.classList.add("ogi-attacked");
      }

      bodyRow.appendChild(indexCol);

      // Date
      const dateDetail = createDOM("div");

      dateDetail.appendChild(createDOM("div", undefined, report.cleanDate.toLocaleDateString()));
      dateDetail.appendChild(createDOM("div", undefined, report.cleanDate.toLocaleTimeString()));
      dateDetail.appendChild(createDOM("div", undefined, `${Translator.translate(137)}: ${report.activity}`));

      const dateCol = createDOM("td", { class: "ogl-tooltipLeft ogl-date" }, DateTime.timeSince(report.cleanDate));

      dateCol.addEventListener("mouseover", () => tooltip(dateCol, dateDetail, true, false, 50));

      if (report.activity <= 15) dateCol.classList.add("ogl-danger");
      else if (report.activity < 60) dateCol.classList.add("ogl-care");
      else dateCol.classList.add("ogl-good");

      bodyRow.appendChild(dateCol);

      const coordsCol = createDOM("td");
      const coordsColLink = createDOM("a", { href: report.coordsLink });

      const coordsColLinkSpan = createDOM("span", {}, report.coords);
      coordsColLink.appendChild(coordsColLinkSpan);

      if (report.planetTargetType === planetType.moon) {
        const coordsColLinkMoon = createDOM("figure", { class: "planetIcon moon" });
        coordsColLink.appendChild(coordsColLinkMoon);
      }

      coordsCol.appendChild(coordsColLink);
      bodyRow.appendChild(coordsCol);

      const nameCol = createDOM("td", { class: "ogl-name" });
      const nameColLink = createDOM("a", { class: report.statusCssClass }, `${report.name} ${report.status}`);
      nameCol.appendChild(nameColLink);
      bodyRow.appendChild(nameCol);

      const gainColTitle = createDOM("div");
      const gainColTitleMetal = createDOM(
        "div",
        { class: "ogl-metal" },
        `${Translator.translate(0, "res")} : ${toFormattedNumber(report.metal, null, true)}`
      );
      const gainColTitleCrystal = createDOM(
        "div",
        { class: "ogl-crystal" },
        `${Translator.translate(1, "res")} : ${toFormattedNumber(report.crystal, null, true)}`
      );
      const gainColTitleDeut = createDOM(
        "div",
        { class: "ogl-deut" },
        `${Translator.translate(2, "res")} : ${toFormattedNumber(report.deut, null, true)}`
      );
      const gainColTitleSplitLine = createDOM(
        "div",
        { class: "splitline" },
        `${Translator.translate(40)} : ${toFormattedNumber(report.total, null, true)}`
      );

      gainColTitle.appendChild(gainColTitleMetal);
      gainColTitle.appendChild(gainColTitleCrystal);
      gainColTitle.appendChild(gainColTitleDeut);
      gainColTitle.appendChild(gainColTitleSplitLine);

      const gainCol = createDOM(
        "td",
        { class: "ogl-tooltipLeft ogl-lootable" },
        toFormattedNumber(report.renta, null, true)
      );

      if (OGBIData.options.rvalLimit <= Math.round((report.total * report.loot) / 100)) {
        gainCol.classList.add("ogl-good");
      }

      gainCol.addEventListener("mouseover", () => tooltip(gainCol, gainColTitle, true, false, 50));

      gainCol.style.background = `linear-gradient(to right, rgba(255, 170, 204, 0.63) ${
        report.resRatio[0]
      }%, rgba(115, 229, 255, 0.78) ${report.resRatio[0]}%\n, rgba(115, 229, 255, 0.78) ${
        report.resRatio[0] + report.resRatio[1]
      }%, rgb(166, 224, 176) ${report.resRatio[2]}%)`;

      bodyRow.appendChild(gainCol);

      // Profit per hour: what the target is worth once the flight is paid for. Display only -
      // it reorders the table, it never sends anything anywhere.
      const flight = this.#flightOf(report);
      const perHour = flight.profitPerHour;
      const perHourCol = createDOM(
        "td",
        { class: "ogl-tooltipLeft ogl-lootable" },
        perHour > 0 ? toFormattedNumber(Math.round(perHour), null, true) : "-"
      );

      if (perHour > 0) {
        const perHourDetail = createDOM("div", { class: "ogl-perHourDetail" });
        perHourDetail.appendChild(
          createDOM("div", undefined, `${Translator.translate(233)}: ${formatDuration(flight.durationSeconds)}`)
        );
        if (flight.origin) {
          // flight.origin is a plain {galaxy, system, position} object from
          // farmEvaluator.js's nearestOrigin() - never an OGameCoordinate instance
          // or an encoded number, so it was never a valid coordinate.toString()
          // argument. Before Phase A.5 of refactoring-new.md, the module's empty
          // "unsupported argument" guard silently produced the string "[undefined]"
          // here; after that fix made the guard throw instead, this call site
          // started throwing on every render - formatted directly instead.
          const { galaxy, system, position } = flight.origin;
          perHourDetail.appendChild(
            createDOM("div", undefined, `${Translator.translate(234)}: [${galaxy}:${system}:${position}]`)
          );
        }
        // Distance/ships/fuel breakdown, not just the final number: this formula has
        // never been checked against a real page (fleetFlight.js is the only consumer
        // of the OGame flight-time formula in this whole tool - everywhere else reads
        // OGame's own displayed numbers instead of recomputing them), so a wrong input
        // should be visible at a glance instead of requiring a console session to find.
        perHourDetail.appendChild(
          createDOM(
            "div",
            undefined,
            `${toFormattedNumber(flight.distance, 0)} · ${flight.shipCount}x · -${toFormattedNumber(
              Math.round(flight.fuelCost),
              null,
              true
            )} ${Translator.translate(2, "res")}`
          )
        );
        perHourCol.addEventListener("mouseover", () => tooltip(perHourCol, perHourDetail, true, false, 50));
      }

      bodyRow.appendChild(perHourCol);

      // report.fleet/report.defense are either a number or the sentinel string
      // "No data" (SpyReport.js) when OGame didn't reveal it. toFormattedNumber()
      // returns undefined (a blank cell) for that string, so it needs its own text.
      const fleetCol = createDOM(
        "td",
        {},
        report.fleet === "No data" ? report.fleet : toFormattedNumber(report.fleet, null, true)
      );
      if (
        report.fleet === "No data" ||
        Math.round(report.fleet * OGBIData.universeSettingsTooltip.debrisFactor) >= OGBIData.options.rvalLimit
      ) {
        fleetCol.classList.add("ogl-care");
      }
      bodyRow.appendChild(fleetCol);

      const defCol = createDOM(
        "td",
        {},
        report.defense === "No data" ? report.defense : toFormattedNumber(report.defense, null, true)
      );
      if (report.defense === "No data" || report.defense > 0) defCol.classList.add("ogl-danger");
      bodyRow.appendChild(defCol);

      const shipCol = createDOM("td", { class: "ogl-cargo-choice" });
      const shipId = OGBIData.options.spyFret;

      const ships = {
        smallCargo: {
          id: ship.SmallCargoShip,
          count: report.pt,
        },
        largeCargo: {
          id: ship.LargeCargoShip,
          count: report.gt,
        },
        pathFinder: {
          id: ship.Pathfinder,
          count: report.pf,
        },
      };

      if (OGBIData.ships[ship.EspionageProbe].cargoCapacity) {
        ships.probe = {
          id: ship.EspionageProbe,
          count: report.pb,
        };
      }

      shipCol.setAttribute("data-coords", report.coords);
      shipCol.setAttribute("data-planet-target-type", report.planetTargetType);

      for (const shipsKey in ships) {
        const ship = ships[shipsKey];

        shipCol.setAttribute(`data-ship-${ship.id}`, ship.count);
      }

      let shipCount = 0;

      if (parseInt(report.defense) === 0 && parseInt(report.fleet) === 0 && shipId === ship.EspionageProbe) {
        shipCount = report.pb;
      }

      if (shipId === ship.SmallCargoShip) shipCount = report.pt;
      else if (shipId === ship.LargeCargoShip) shipCount = report.gt;
      else if (shipId === ship.Pathfinder) shipCount = report.pf;

      const fleetLink = this.#fleetDispatchLink(report.coords, report.planetTargetType, shipId, shipCount);

      const shipLink = createDOM("a", { href: `?${fleetLink.toString()}` }, toFormattedNumber(shipCount));
      shipCol.appendChild(shipLink);
      bodyRow.appendChild(shipCol);

      const colorsCol = createDOM("td");
      const colorsColContent = createDOM("div", {
        class: "ogl-colors",
        "data-coords": report.coords,
        "data-context": "spytable",
      });

      colorsCol.appendChild(colorsColContent);

      Player.get(report.name).then((p) => {
        if (p.id) {
          stalk.stalk(nameColLink, p);
        }

        Markerui.add(report.coords, colorsColContent, p.id);
        Markerui.display(colorsColContent, report.coords);
      });

      bodyRow.appendChild(colorsCol);

      const optCol = createDOM("td", { class: "ogl-spyOptions" });

      const optColButton = createDOM("button", {
        class: "icon icon_maximize overlay",
        href: report.detailLink,
        title: Translator.translate(329),
      });
      optCol.appendChild(optColButton);

      const optColSimButton = createDOM("a", { class: "ogl-text-btn", title: Translator.translate(330) }, "T");
      const currentPlanet = (
        document.querySelector("#planetList .active") ?? document.querySelector("#planetList .planetlink")
      ).parentNode;
      const currentCoords = currentPlanet.querySelector(".planet-koords").textContent;

      let playerClass = PlayerClass.NONE;

      if (document.querySelector("#characterclass .explorer")) {
        playerClass = PlayerClass.EXPLORER;
      } else if (document.querySelector("#characterclass .warrior")) {
        playerClass = PlayerClass.WARRIOR;
      } else if (document.querySelector("#characterclass .miner")) {
        playerClass = PlayerClass.MINER;
      }

      optColSimButton.addEventListener("click", () => {
        if (!OGBIData.options.simulator) {
          popup(
            null,
            createDOM("div", { class: "ogl-warning-dialog overmark" }, "External tool not configured in 'Settings'")
          );
        } else {
          let apiTechData = {
            109: { level: OGBIData.technology[109] },
            110: { level: OGBIData.technology[110] },
            111: { level: OGBIData.technology[111] },
            115: { level: OGBIData.technology[115] },
            117: { level: OGBIData.technology[117] },
            118: { level: OGBIData.technology[118] },
            114: { level: OGBIData.technology[114] },
          };
          let coords = currentCoords.split(":");
          let payloadJson = {
            0: [
              {
                class: playerClass,
                research: apiTechData,
                planet: {
                  galaxy: coords[0],
                  system: coords[1],
                  position: coords[2],
                },
              },
            ],
          };
          const base64 = btoa(JSON.stringify(payloadJson));
          window.open(`${OGBIData.options.simulator}en?SR_KEY=${report.apiKey}#prefill=${base64}`, "_blank");
        }
      });
      optCol.appendChild(optColSimButton);

      if (OGBIData.options.ptreTK) {
        const optColPtreButton = createDOM("a", { class: "ogl-text-btn", title: Translator.translate(331) }, "P");
        optCol.appendChild(optColPtreButton);

        optColPtreButton.addEventListener("click", () => {
          ptreService
            .importSpy(OGBIData.options.ptreTK, report.apiKey)
            .then((result) => fadeBox(result.message_verbose, result.code !== 1))
            .catch((reason) => fadeBox(reason, true));
        });
      }

      const attackQueryString = this.#fleetDispatchLink(report.coords, report.planetTargetType);

      const optColAttackButton = createDOM("a", {
        class: "icon ogl-icon-attack",
        href: `?${attackQueryString.toString()}`,
        title: Translator.translate(200),
      });
      optCol.appendChild(optColAttackButton);

      const optColSpyButton = createDOM("button", {
        class: "icon icon_eye",
        onclick: report.spyLink,
        title: Translator.translate(332),
      });
      optCol.appendChild(optColSpyButton);

      if (
        this.#tabId === messagesTabs.SPY &&
        !document.querySelector('.messagesTrashcanBtns button.custom_btn[disabled="disabled"]')
      ) {
        const optColDeleteButton = createDOM("button", { class: "icon icon_trash", title: Translator.translate(333) });
        optColDeleteButton.setAttribute("data-id", report.id);
        optColDeleteButton.addEventListener("click", () => {
          this.reportsToDelete.push({ report, row: bodyRow });

          this.deleteReports();
        });
        optCol.appendChild(optColDeleteButton);

        if (
          OGBIData.options.autoDeleteEnable &&
          Math.round((parseInt(report.fleet) || 0) * OGBIData.universeSettingsTooltip.debrisFactor) +
            Math.round(((parseInt(report.total) || 0) * (parseInt(report.loot) || 0)) / 100) +
            Math.round(
              (parseInt(report.defense) || 0) *
                (1 - OGBIData.universeSettingsTooltip.repairFactor) *
                OGBIData.universeSettingsTooltip.debrisFactorDef
            ) <
            OGBIData.options.rvalLimit
        ) {
          this.reportsToDelete.push({ report, row: bodyRow });
        }
      } else if (document.querySelector('.messagesTrashcanBtns button.custom_btn[disabled="disabled"]')) {
        const optColRestoreButton = createDOM("button", {
          class: "icon icon_restore",
          title: Translator.translate(334),
        });
        optColRestoreButton.setAttribute("data-id", report.id);

        optColRestoreButton.addEventListener("click", () => {
          this.#flagDeleted([report.id], [bodyRow], () => {
            window.dispatchEvent(new CustomEvent("ogi-spyTableReload"));
          });
        });
        optCol.appendChild(optColRestoreButton);
      }

      bodyRow.appendChild(optCol);
      const rentaDisplay = () => {
        const renta = [];
        for (let round = 0; round < 6; round++) {
          renta[round] = Math.round((report.total * Math.pow(1 - report.loot / 100, round) * report.loot) / 100);
        }

        const line = gainCol.parentElement;

        if (line.getAttribute("data") === "expanded") {
          line.setAttribute("data", "closed");
          document.querySelectorAll("tr.spyTable-extended").forEach((e) => e.remove());

          return;
        }
        const expanded = document.querySelector("tr[data='expanded']");
        if (expanded) {
          expanded.setAttribute("data", "closed");
          document.querySelectorAll("tr.spyTable-extended").forEach((e) => e.remove());
        }
        line.setAttribute("data", "expanded");
        const nextReport = line.nextElementSibling;
        for (let round = 1; round < renta.length; round++) {
          const extraLine = line.parentNode.insertBefore(createDOM("tr", { class: "spyTable-extended" }), nextReport);
          extraLine.appendChild(createDOM("td"));
          extraLine.appendChild(createDOM("td", { class: "ogl-date" }));
          extraLine.appendChild(createDOM("td"));
          extraLine.appendChild(createDOM("td", { class: "ogl-name" }));

          const extraDetail = createDOM("div");
          const extraDetailMetal = createDOM(
            "div",
            { class: "ogl-metal" },
            `Metal : ${toFormattedNumber(renta[round] * report.resRatio[0], null, true)}`
          );
          const extraDetailCrystal = createDOM(
            "div",
            { class: "ogl-crystal" },
            `Crystal : ${toFormattedNumber(renta[round] * report.resRatio[1], null, true)}`
          );
          const extraDetailDeut = createDOM(
            "div",
            { class: "ogl-deut" },
            `Deuterium : ${toFormattedNumber(renta[round] * report.resRatio[2], null, true)}`
          );
          const extraDetailSplitLine = createDOM(
            "div",
            { class: "splitline" },
            `Total : ${toFormattedNumber(renta[round], null, true)}`
          );

          extraDetail.appendChild(extraDetailMetal);
          extraDetail.appendChild(extraDetailCrystal);
          extraDetail.appendChild(extraDetailDeut);
          extraDetail.appendChild(extraDetailSplitLine);
          const extraTotal = extraLine.appendChild(
            createDOM("td", { class: "ogl-tooltipLeft ogl-lootable" }, toFormattedNumber(renta[round], null, true))
          );
          extraTotal.addEventListener("mouseover", () => tooltip(extraTotal, extraDetail, true, false, 50));
          extraTotal.style.background = `linear-gradient(to right, rgba(255, 170, 204, 0.63) ${
            report.resRatio[0]
          }%, rgba(115, 229, 255, 0.78) ${report.resRatio[0]}%\n, rgba(115, 229, 255, 0.78) ${
            report.resRatio[0] + report.resRatio[1]
          }%, rgb(166, 224, 176) ${report.resRatio[2]}%)`;
          if (renta[round] >= OGBIData.options.rvalLimit) extraTotal.classList.add("ogl-good");

          extraLine.appendChild(createDOM("td"));
          extraLine.appendChild(createDOM("td"));

          const extraShip = extraLine.appendChild(createDOM("td", { class: "ogl-cargo-choice" }));

          let currentValue = null;

          for (const shipsKey in ships) {
            const ship = ships[shipsKey];

            const value = calcNeededShips({
              moreFret: true,
              fret: ship.id,
              resources: Math.ceil((report.total * Math.pow(1 - report.loot / 100, round) * report.loot) / 100),
            });

            if (ship.id === OGBIData.options.spyFret) currentValue = value;

            extraShip.setAttribute(`data-ship-${ship.id}`, value);
          }

          extraShip.setAttribute("data-coords", report.coords);
          extraShip.setAttribute("data-planet-target-type", report.planetTargetType);

          const extraFleetQueryParams = this.#fleetDispatchLink(
            report.coords,
            report.planetTargetType,
            OGBIData.options.spyFret,
            currentValue
          );

          extraShip.appendChild(
            createDOM(
              "a",
              {
                href: "?" + extraFleetQueryParams.toString(),
              },
              toFormattedNumber(currentValue)
            )
          );

          extraLine.appendChild(createDOM("td"));
          extraLine.appendChild(createDOM("td"));
        }
      };

      gainCol.addEventListener("click", () => {
        rentaDisplay();
      });
    });

    // The loop above reorders every row - reused and newly created alike - to match
    // the current sort, but only ever set the "#" cell on a row the first time it was
    // created. Renumber here so it always matches what's on screen, instead of a
    // reused row keeping the number it got under a previous sort. Filtered to rows
    // with a data-report-id: the renta-breakdown detail rows a click can insert have
    // none, and are not part of this numbering.
    Array.from(body.children)
      .filter((row) => row.hasAttribute("data-report-id"))
      .forEach((row, i) => {
        if (row.firstElementChild) row.firstElementChild.textContent = i + 1;
      });

    this.deleteReports();
  }

  // Shared by delete and restore: the game reuses the same ogame.messages.flagDeleted()
  // endpoint for both actions (toggles the message's trashed state), and it's been confirmed
  // to work safely with a detached element regardless of whether the real button is in the
  // DOM - it looks up the row and any open dialog by data-msg-id itself, and no-ops harmlessly
  // if it doesn't find them. rows are hidden optimistically and only put back if something
  // genuinely goes wrong (thrown error, or no server confirmation within 10s).
  #flagDeleted(messageIds, rows, onConfirmed) {
    const obj = this;

    rows.forEach((row) => row.classList.add("hide"));

    const revert = (reason) => {
      obj.#logger.warn(`Action failed for [${messageIds.join(", ")}]: ${reason}`);
      rows.forEach((row) => row.classList.remove("hide"));
    };

    try {
      // ogame.messages.flagDeleted() reads $(obj).data('messageId'), which can be a single
      // id or an array of ids - passing several at once sends one request instead of one
      // per report.
      const fakeBtn = document.createElement("button");
      $(fakeBtn).data("messageId", messageIds);
      ogame.messages.flagDeleted(fakeBtn);
    } catch (err) {
      // Something failed synchronously (e.g. the game changed how flagDeleted works).
      // Undo the optimistic hide right away instead of waiting for a reload.
      revert(err);
      return;
    }

    let settled = false;

    const onAjaxSuccess = function (e, xhr, settings) {
      const urlParams = new URLSearchParams(settings.url);
      const requestPayload = new URLSearchParams(settings.data);

      if (urlParams.get("action") !== "flagDeleted") return;

      const requestIds = requestPayload.getAll("messageIds[]");
      if (!messageIds.every((id) => requestIds.includes(String(id)))) return;

      settled = true;
      $(document).off("ajaxSuccess", onAjaxSuccess);

      if (xhr?.responseJSON?.status !== "success") {
        revert("server responded with a non-success status");
        return;
      }

      onConfirmed?.();
    };

    $(document).on("ajaxSuccess", onAjaxSuccess);

    // Safety net: if the server never confirms this batch (request failed, unexpected
    // response, etc.), don't leave the listener attached to document forever, and undo
    // the optimistic hide instead of leaving the user misled until they reload.
    setTimeout(() => {
      if (settled) return;

      $(document).off("ajaxSuccess", onAjaxSuccess);
      revert("no server confirmation within 10s");
    }, 10000);
  }

  deleteReports() {
    this.#logger.debug("Delete messages", this.reportsToDelete);

    if (this.reportsToDelete.length === 0) return;

    // Take everything queued right now as a single batch. Manual clicks queue one report
    // at a time and call deleteReports() immediately, so they end up as a batch of one.
    // The auto-delete pass queues several reports and calls deleteReports() once after
    // building the whole table, so those go out together as one request.
    const batch = this.reportsToDelete;
    this.reportsToDelete = [];

    const messageIds = batch.map(({ report }) => report.id);
    const rows = batch.map(({ row }) => row);
    this.#logger.debug("Messages to be deleted", messageIds);

    this.#flagDeleted(messageIds, rows, () => {
      // ogame.messages.flagDeleted() only cleans up the native message row for a single
      // id - when messageId is an array, it gets stringified straight into the selector
      // (e.g. ".msg[data-msg-id='123,456']"), which matches nothing. So for a batch, the
      // server-side deletion succeeds but the native rows never disappear from the list
      // below. Clean them up ourselves instead of relying on that. Safe to always run:
      // if the game already removed a row (single-delete case), this is just a no-op.
      messageIds.forEach((id) => {
        document.querySelector(`.messagesHolder .msg[data-msg-id='${id}']`)?.remove();
      });
    });
  }

  #ptreSpy() {
    if (!OGBIData.options.ptreTK) return;

    const universe = window.location.host.replace(/\D/g, "");
    const ptreJSON = {};

    this.#messageCallable().forEach((message) => {
      const dataRaw = message.querySelector(".rawMessageData");

      // Check if the target is the current player and skip if not
      if (parseInt(dataRaw?.getAttribute("data-raw-targetplayerid")) !== playerId) return;

      const id = message.getAttribute("data-msg-id");

      // Check if the spy data already exists and skip if it does
      if (OGBIData.spies[id]) return;

      try {
        const playerID = message
          .querySelector("span.player")
          .getAttribute("data-tooltip-title")
          .match(/data-playerId="(\d+)"/)?.[1];

        const spyFromUrl = new URLSearchParams(
          message.querySelector(".custom_btn.msgAttackBtn").getAttribute("onclick").split(/=(.*)/)[1].slice(1, -1)
        );

        const type = parseInt(spyFromUrl.get("type"));
        const timestamp = dataRaw.getAttribute("data-raw-timestamp");

        const spy = {
          id: id,
          targetPlayerId: playerId,
          sourcePlayerId: playerID,
          galaxy: spyFromUrl.get("galaxy"),
          system: spyFromUrl.get("system"),
          position: spyFromUrl.get("position"),
          type: type,
          timestamp: timestamp * 1e3,
        };

        ptreJSON[id] = {
          player_id: spy.sourcePlayerId,
          teamkey: OGBIData.options.ptreTK,
          galaxy: spy.galaxy,
          system: spy.system,
          position: spy.position,
          spy_message_ts: spy.timestamp,
          moon: {
            activity: type === planetType.planet ? "60" : "*",
          },
          main: false,
          activity: type === planetType.planet ? "*" : "60",
        };

        message.classList.add("ogl-reportReady");

        OGBIData.spies[id] = spy;
      } catch (err) {
        // Don't let one unexpected message shape (missing player tooltip, attack button,
        // etc.) throw and stop the rest of the batch from being sent to PTRE.
        this.#logger.warn(`Skipping PTRE data for message ${id}: unexpected message shape`, err);
      }
    });

    if (Object.keys(ptreJSON).length > 0) {
      ptreService.importPlayerActivity(OgamePageData.gameLang, universe, ptreJSON).catch((reason) => {
        // A page change aborting the request is expected, not a sync failure.
        if (!isAbortError(reason)) this.#logger.warn("PTRE activity sync failed", reason);
      });
    }
  }
}

export default SpyMessagesAnalyzer;
