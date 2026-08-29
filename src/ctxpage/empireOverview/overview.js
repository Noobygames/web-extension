/**
 * The empire overview popup, in its own file so the boot bundle does not carry it.
 *
 * Phase 5 of refactoring.md: `overview()` opens from one sidebar button and pulls
 * `tables.js` (30 KB of per-planet mine, fleet, defence and harvest tables) behind
 * it. `resourceDetail()` next door is the part that runs on every page, and it
 * needs none of that - the two only ever shared a directory.
 */
import { createDOM } from "../../util/dom.js";
import * as popupUtil from "../../util/popup.js";
import Translator from "../../util/translate.js";
import { defenseOverview, fleetOverview, harvestOverview, minesOverview } from "./tables.js";

/**
 * The empire overview popup: mines, fleet, defence and harvest across every planet.
 *
 * Lifted out of `OGBeyondInfinity` in Phase 3 of refactoring.md, then split. This file is
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
export default overview;
