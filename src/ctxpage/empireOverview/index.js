import * as DOM from "../../util/dom.js";
import { createDOM, createSVG, createDOMSanitized } from "../../util/dom.js";
import { toFormattedNumber, fromFormattedNumber } from "../../util/numbers.js";
import * as Numbers from "../../util/numbers.js";
import * as popupUtil from "../../util/popup.js";
import * as utilTooltip from "../../util/tooltip.js";
import * as standardUnit from "../../util/standardUnit.js";
import Translator from "../../util/translate.js";
import OGIData from "../../util/OGIData.js";
import OgamePageData from "../../util/OgamePageData.js";
import shipEnum from "../../util/enum/ship.js";
import planetType from "../../util/enum/planetType.js";
import { tabs } from "../../util/tabs.js";
import { getOption } from "../conf-options.js";
// Re-exported: see the note in ctxpage/empire/index.js.
export { resourceDetail, updateresourceDetail } from "./resourceDetail.js";
import { CARGO_SHIP_IDS } from "../../util/harvestPlanner.js";
import { BUIDLING_INFO } from "../../util/enum/buildingInfo.js";
import { SUPPLIES_TECHID, FACILITIES_TECHID } from "../../util/gameConstants.js";
import { building, consumption, minesProduction } from "../../util/gameFormulas.js";

import { defenseOverview, fleetOverview, harvestOverview, minesOverview } from "./tables.js";

/**
 * The empire overview popup: mines, fleet, defence and harvest across every planet.
 *
 * Lifted out of `OGInfinity` in Phase 3 of refactoring.md, then split. This file is
 * the popup and its tabs; the resource panel in the top bar is next to it.
 */
function overview(context) {
  let header = createDOM("div", { class: "ogl-tabs" });
  let minesBtn = header.appendChild(createDOM("span", { class: "ogl-tab ogl-active" }, Translator.translate(90)));
  let fleetBtn = header.appendChild(createDOM("span", { class: "ogl-tab" }, Translator.translate(63)));
  let defBtn = header.appendChild(createDOM("span", { class: "ogl-tab" }, Translator.translate(54)));
  let harvestBtn = header.appendChild(createDOM("span", { class: "ogl-tab" }, Translator.translate(235)));
  let body = createDOM("div");
  body.appendChild(header);
  body.appendChild(minesOverview(context));
  let tabListener = (e) => {
    minesBtn.classList.remove("ogl-active");
    fleetBtn.classList.remove("ogl-active");
    defBtn.classList.remove("ogl-active");
    harvestBtn.classList.remove("ogl-active");
    body.children[1].remove();
    if (e.target.textContent == Translator.translate(63)) {
      fleetBtn.classList.add("ogl-active");
      body.appendChild(fleetOverview(context));
    } else if (e.target.textContent == Translator.translate(54)) {
      defBtn.classList.add("ogl-active");
      body.appendChild(defenseOverview(context));
    } else if (e.target.textContent == Translator.translate(235)) {
      harvestBtn.classList.add("ogl-active");
      body.appendChild(harvestOverview(context));
    } else {
      minesBtn.classList.add("ogl-active");
      body.appendChild(minesOverview(context));
    }
  };
  minesBtn.addEventListener("click", tabListener);
  fleetBtn.addEventListener("click", tabListener);
  defBtn.addEventListener("click", tabListener);
  harvestBtn.addEventListener("click", tabListener);
  popupUtil.popup(null, body);
}

export { overview };
