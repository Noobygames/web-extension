import * as DOM from "../../util/dom.js";
import { createDOM, createSVG, createDOMSanitized } from "../../util/dom.js";
import { tabs } from "../../util/tabs.js";
import { toFormattedNumber, fromFormattedNumber } from "../../util/numbers.js";
import * as Numbers from "../../util/numbers.js";
import * as popupUtil from "../../util/popup.js";
import * as utilTooltip from "../../util/tooltip.js";
import * as standardUnit from "../../util/standardUnit.js";
import * as time from "../../util/time.js";
import * as wait from "../../util/wait.js";
import DateTime from "../../util/dateTime.js";
import Translator from "../../util/translate.js";
import OGIData from "../../util/OGIData.js";
import PlayerClass from "../../util/enum/playerClass.js";
import OgamePageData from "../../util/OgamePageData.js";
import dataHelper from "../../util/dataHelper.js";
import shipEnum from "../../util/enum/ship.js";
import planetType from "../../util/enum/planetType.js";
import missionType from "../../util/enum/missionType.js";
import itemType from "../../util/enum/itemType.js";
import itemImageID from "../../util/enum/itemImageID.js";
import AllianceClass from "../../util/enum/allianceClass.js";
import { fleetCost } from "../../util/fleetCost.js";
import flying from "../../util/flying.js";
import { getOption } from "../../ctxpage/conf-options.js";
import { generateMMORPGLink } from "../../util/mmorpgStats.js";
import { BUIDLING_INFO } from "../../util/enum/buildingInfo.js";
import { RESEARCH_INFO } from "../../util/enum/researchInfo.js";
import {
  CRAWLER_OVERLOAD_MAX,
  CRYSTAL_GENERAL_INCOMING,
  CRYSTAL_POS_BONUS,
  ENGINEER_ENERGY_BONUS,
  FACILITIES_TECHID,
  GEOLOGIST_CRAWLER_BONUS,
  GEOLOGIST_RESOURCE_BONUS,
  IONTECHNOLOGY_BONUS,
  MAX_CRAWLERS_PER_MINE,
  METAL_GENERAL_INCOMING,
  METAL_POS_BONUS,
  OFFICER_ENERGY_BONUS,
  OFFICER_RESOURCE_BONUS,
  PLASMATECH_BONUS,
  SHIP_EXPEDITION_POINTS,
  SUPPLIES_TECHID,
  TRADER_ENERGY_BONUS,
  TRADER_RESOURCE_BONUS,
} from "../../util/gameConstants.js";
import {
  building,
  consumption,
  getBestRoi,
  minesProduction,
  research,
  roiAstrophysics,
  roiLfBuilding,
  roiLfResearch,
  roiMine,
  roiPlasmatechnology,
} from "../../util/gameFormulas.js";

import { statsState } from "./state.js";

/**
 * The panels the tabs assemble their bodies from, and the API-string copy button.
 */
function shipsBox(ships, minus) {
  let fleetDetail = createDOM("div", { class: "ogk-box" });
  let fleet = fleetDetail.appendChild(createDOM("div", { class: "ogk-fleet" }));
  [202, 203, 210, 204, 205, 206, 219, 207, 215, 211, 213, 218].forEach((id) => {
    let shipDiv = fleet.appendChild(createDOM("div"));
    shipDiv.appendChild(createDOM("a", { class: "ogl-option ogl-fleet-ship ogl-fleet-" + id }));
    shipDiv.appendChild(
      createDOM("span", { class: ships[id] && minus ? "overmark" : "" }, ships[id] ? toFormattedNumber(ships[id]) : "-")
    );
  });
  return fleetDetail;
}

function adjustBox(adjustments, onValidate) {
  let box = createDOM("div", { class: "ogk-box ogk-small" });
  let prod = box.appendChild(createDOM("div", { class: "ogk-adjust-grid" }));
  prod.appendChild(
    createDOM("span").appendChild(createDOM("a", { class: "ogl-option resourceIcon metal" })).parentElement
  );
  let metInput = prod.appendChild(
    createDOM("input", { class: "ogl-formatInput metal", type: "text", value: toFormattedNumber(adjustments[0]) })
  );
  prod.appendChild(
    createDOM("span").appendChild(createDOM("a", { class: "ogl-option resourceIcon crystal" })).parentElement
  );
  let criInput = prod.appendChild(
    createDOM("input", { class: "ogl-formatInput crystal", type: "text", value: toFormattedNumber(adjustments[1]) })
  );
  prod.appendChild(
    createDOM("span").appendChild(createDOM("a", { class: "ogl-option resourceIcon deuterium" })).parentElement
  );
  let deutInput = prod.appendChild(
    createDOM("input", { class: "ogl-formatInput deuterium", type: "text", value: toFormattedNumber(adjustments[2]) })
  );
  if (onValidate) {
    let btn = box.appendChild(createDOM("button", { class: "btn_blue" }, "OK"));
    btn.addEventListener("click", () => {
      onValidate([
        fromFormattedNumber(metInput.value, true),
        fromFormattedNumber(criInput.value, true),
        fromFormattedNumber(deutInput.value, true),
      ]);
    });
  }
  return box;
}

function resourceBox(rows, am, callback) {
  let box = createDOM("div", { class: "ogk-box" });
  let prod = box.appendChild(createDOM("div", { class: "ogk-grid" }));
  if (am) prod.classList.add("ogk-am");
  prod.appendChild(createDOM("span"));
  prod.appendChild(
    createDOM("span").appendChild(createDOM("a", { class: "ogl-option resourceIcon metal" })).parentElement
  );
  prod.appendChild(
    createDOM("span").appendChild(createDOM("a", { class: "ogl-option resourceIcon crystal" })).parentElement
  );
  prod.appendChild(
    createDOM("span").appendChild(createDOM("a", { class: "ogl-option resourceIcon deuterium" })).parentElement
  );
  if (am) {
    prod.appendChild(
      createDOM("span").appendChild(createDOM("a", { class: "ogl-option resourceIcon darkmatter" })).parentElement
    );
  }
  let totAm = 0;
  let sums = [0, 0, 0];
  rows.forEach((row) => {
    let p = prod.appendChild(DOM.createDOMSanitized("p", {}, row.title));
    if (row.edit) {
      p.appendChild(
        DOM.createDOMSanitized(
          "strong",
          {},
          '<span style="    display: inline-block;\n          vertical-align: middle;\n          float: none;\n          margin-left: 5px;\n          border-radius: 4px;\n          margin-bottom: 1px;\n          width: 17px;" class="planetMoveIcons settings planetMoveGiveUp icon"></span>'
        )
      );
      p.classList.add("ogk-edit");
      p.addEventListener("click", () => {
        callback();
      });
    }
    prod.appendChild(
      createDOM(
        "span",
        {
          class: "ogl-metal tooltip" + (row.metal < 0 ? " overmark" : ""),
          "data-title": toFormattedNumber(row.metal, 0),
        },
        `${row.metal == 0 ? "-" : toFormattedNumber(row.metal, null, true)}`
      )
    );
    prod.appendChild(
      createDOM(
        "span",
        {
          class: "ogl-crystal tooltip" + (row.crystal < 0 ? " overmark" : ""),
          "data-title": toFormattedNumber(row.crystal, 0),
        },
        `${row.crystal == 0 ? "-" : toFormattedNumber(row.crystal, null, true)}`
      )
    );
    prod.appendChild(
      createDOM(
        "span",
        {
          class: "ogl-deut tooltip" + (row.deuterium < 0 ? " overmark" : ""),
          "data-title": toFormattedNumber(row.deuterium, 0),
        },
        `${row.deuterium == 0 ? "-" : toFormattedNumber(row.deuterium, null, true)}`
      )
    );
    if (am) {
      if (row.am) {
        totAm = row.am;
        prod.appendChild(
          createDOM(
            "span",
            { class: "tootltip", "data-title": toFormattedNumber(row.am, 0) },
            `${toFormattedNumber(row.am, null, true)}`
          )
        );
      } else {
        prod.appendChild(createDOM("span", {}, "-"));
      }
    }
    sums[0] += row.metal;
    sums[1] += row.crystal;
    sums[2] += row.deuterium;
  });
  prod.appendChild(createDOM("p", { class: "ogk-total" }, Translator.translate(40)));
  prod.appendChild(
    createDOM(
      "span",
      {
        class: "ogl-metal ogk-total tooltip" + (sums[0] < 0 ? " overmark" : ""),
        "data-title": toFormattedNumber(sums[0], 0),
      },
      `${toFormattedNumber(sums[0], null, true)}`
    )
  );
  prod.appendChild(
    createDOM(
      "span",
      {
        class: "ogl-crystal ogk-total tooltip" + (sums[1] < 0 ? " overmark" : ""),
        "data-title": toFormattedNumber(sums[1], 0),
      },
      `${toFormattedNumber(sums[1], null, true)}`
    )
  );
  prod.appendChild(
    createDOM(
      "span",
      {
        class: "ogl-deut ogk-total tooltip" + (sums[2] < 0 ? " overmark" : ""),
        "data-title": toFormattedNumber(sums[2], 0),
      },
      `${toFormattedNumber(sums[2], null, true)}`
    )
  );
  if (am) {
    prod.appendChild(
      createDOM(
        "span",
        {
          class: "ogk-total tooltip",
          "data-title": toFormattedNumber(totAm, 0),
        },
        `${toFormattedNumber(totAm, null, true)}`
      )
    );
  }
  return box;
}

function discoveryBox(rows, am, callback) {
  let box = createDOM("div", { class: "ogk-box" });
  let discovery = box.appendChild(createDOM("div", { class: "ogk-grid-discovery" }));
  discovery.appendChild(createDOM("span"));
  discovery.appendChild(
    createDOM("span").appendChild(createDOM("a", { class: "ogl-option lifeform-item-icon small lifeform1" }))
      .parentElement
  );
  discovery.appendChild(
    createDOM("span").appendChild(createDOM("a", { class: "ogl-option lifeform-item-icon small lifeform2" }))
      .parentElement
  );
  discovery.appendChild(
    createDOM("span").appendChild(createDOM("a", { class: "ogl-option lifeform-item-icon small lifeform3" }))
      .parentElement
  );
  discovery.appendChild(
    createDOM("span").appendChild(createDOM("a", { class: "ogl-option lifeform-item-icon small lifeform4" }))
      .parentElement
  );

  rows.forEach((row) => {
    let p = discovery.appendChild(DOM.createDOMSanitized("p", {}, row.title));
    if (row.edit) {
      p.appendChild(
        DOM.createDOMSanitized(
          "strong",
          {},
          '<span style="    display: inline-block;\n          vertical-align: middle;\n          float: none;\n          margin-left: 5px;\n          border-radius: 4px;\n          margin-bottom: 1px;\n          width: 17px;" class="planetMoveIcons settings planetMoveGiveUp icon"></span>'
        )
      );
      p.classList.add("ogk-edit");
      p.addEventListener("click", () => {
        callback();
      });
    }
    discovery.appendChild(
      createDOM(
        "span",
        { class: "tooltip" + (row.human < 0 ? " overmark" : ""), "data-title": toFormattedNumber(row.human, 0) },
        `${row.human == 0 ? "-" : toFormattedNumber(row.human, null, true)}`
      )
    );
    discovery.appendChild(
      createDOM(
        "span",
        { class: "tooltip" + (row.rocktal < 0 ? " overmark" : ""), "data-title": toFormattedNumber(row.rocktal, 0) },
        `${row.rocktal == 0 ? "-" : toFormattedNumber(row.rocktal, null, true)}`
      )
    );
    discovery.appendChild(
      createDOM(
        "span",
        { class: "tooltip" + (row.mecha < 0 ? " overmark" : ""), "data-title": toFormattedNumber(row.mecha, 0) },
        `${row.mecha == 0 ? "-" : toFormattedNumber(row.mecha, null, true)}`
      )
    );

    discovery.appendChild(
      createDOM(
        "span",
        { class: "tooltip" + (row.kaelesh < 0 ? " overmark" : ""), "data-title": toFormattedNumber(row.kaelesh, 0) },
        `${row.kaelesh == 0 ? "-" : toFormattedNumber(row.kaelesh, null, true)}`
      )
    );
  });

  return box;
}

function discoveryCostsBox(rows, am, callback) {
  let box = createDOM("div", { class: "ogk-box" });
  let discovery = box.appendChild(createDOM("div", { class: "ogk-grid-discovery" }));
  discovery.appendChild(createDOM("span"));
  discovery.appendChild(
    createDOM("span").appendChild(createDOM("a", { class: "ogl-option resourceIcon metal" })).parentElement
  );
  discovery.appendChild(
    createDOM("span").appendChild(createDOM("a", { class: "ogl-option resourceIcon crystal" })).parentElement
  );
  discovery.appendChild(
    createDOM("span").appendChild(createDOM("a", { class: "ogl-option resourceIcon deuterium" })).parentElement
  );
  discovery.appendChild(
    createDOM("span").appendChild(createDOM("a", {}, `${Translator.translate(145)}`)).parentElement
  );

  rows.forEach((row) => {
    let p = discovery.appendChild(DOM.createDOMSanitized("p", {}, row.title));
    if (row.edit) {
      p.appendChild(
        DOM.createDOMSanitized(
          "strong",
          {},
          '<span style="    display: inline-block;\n          vertical-align: middle;\n          float: none;\n          margin-left: 5px;\n          border-radius: 4px;\n          margin-bottom: 1px;\n          width: 17px;" class="planetMoveIcons settings planetMoveGiveUp icon"></span>'
        )
      );
      p.classList.add("ogk-edit");
      p.addEventListener("click", () => {
        callback();
      });
    }
    discovery.appendChild(
      createDOM(
        "span",
        { class: "tooltip" + (row.metal < 0 ? " overmark" : ""), "data-title": toFormattedNumber(row.metal, 0) },
        `${row.metal == 0 ? "-" : toFormattedNumber(row.metal, null, true)}`
      )
    );
    discovery.appendChild(
      createDOM(
        "span",
        { class: "tooltip" + (row.crystal < 0 ? " overmark" : ""), "data-title": toFormattedNumber(row.crystal, 0) },
        `${row.crystal == 0 ? "-" : toFormattedNumber(row.crystal, null, true)}`
      )
    );
    discovery.appendChild(
      createDOM(
        "span",
        { class: "tooltip" + (row.deut < 0 ? " overmark" : ""), "data-title": toFormattedNumber(row.deut, 0) },
        `${row.deut == 0 ? "-" : toFormattedNumber(row.deut, null, true)}`
      )
    );

    discovery.appendChild(
      createDOM(
        "span",
        {
          class: "tooltip" + (row.artefacts < 0 ? " overmark" : ""),
          "data-title": toFormattedNumber(row.artefacts, 0),
        },
        `${row.artefacts == 0 ? "-" : toFormattedNumber(row.artefacts, null, true)}`
      )
    );
  });

  return box;
}

function APIStringToClipboard(fleet) {
  let str = "";
  str += `characterClassId;${statsState.context.playerClass}|114;${OGIData.json.technology[114]}|`;
  [109, 110, 111, 115, 117, 118].forEach((id) => {
    str += id + ";" + OGIData.json.technology[id] + "|";
  });
  for (let id in fleet) {
    let count = fleet[id];
    str += `${id};${count}|`;
  }
  fadeBox(`<br/>${Translator.translate(58)}`);
  navigator.clipboard.writeText(str);
}

export { shipsBox, adjustBox, resourceBox, discoveryBox, discoveryCostsBox, APIStringToClipboard };
