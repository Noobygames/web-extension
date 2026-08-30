import { createDOM } from "../../ui/dom.js";
import OGBIData from "../../store/OGBIData.js";
import { probingWarning } from "../settings/probingWarning.js";
import { setHighlightCoords } from "../../ui/highlight.js";
import Translator from "../../format/i18n/translate.js";

/**
 * One planet row for the target list and the marker overlays.
 *
 * Lifted out of `OGBeyondInfinity` in Phase 3 of refactoring.md. Its own file rather than
 * part of `galaxy/index.js` because it is a renderer with no state of its own - the
 * only thing it reads besides its arguments is the marker table in the store.
 */

function renderPlanet(context, coords, main, scanned, moon, deleted) {
  coords = coords.split(":");
  let a = createDOM("a");
  let planetDiv = a.appendChild(createDOM("div", { class: "ogl-planet-div" }));
  let planetIcon = planetDiv.appendChild(createDOM("div", { class: "ogl-planet" }));
  let panel = planetDiv.appendChild(createDOM("div", { class: "ogl-planet-hover" }));
  let plaspy = panel.appendChild(createDOM("button", { class: "icon_eye", title: Translator.translate(259) }));
  let plaFleet = panel.appendChild(createDOM("div", { class: "ogl-atk", title: Translator.translate(335) }));
  plaspy.addEventListener("click", (e) => {
    // sendShipsWithPopup(6, coords[0], coords[1], coords[2], 0, OGBIData.json.spyProbes);
    // disable direct probing in stalks and target list until complete removal or GF start to wake up
    probingWarning();
    e.stopPropagation();
  });
  plaFleet.addEventListener("click", (e) => {
    window.location.href = `?page=ingame&component=fleetdispatch&galaxy=${coords[0]}&system=${coords[1]}&position=${coords[2]}&type=1`;
    e.stopPropagation();
  });
  planetDiv.appendChild(createDOM("div", { class: "ogl-planet-act" }));
  a.appendChild(createDOM("span", {}, coords.join(":")));
  a.setAttribute("data-coords", coords.join(":"));
  if (main) {
    a.classList.add("ogl-main");
    planetIcon.classList.add("ogl-active");
  }
  if (deleted) {
    a.classList.add("ogl-deleted");
  } else if (scanned) {
    a.classList.add("ogl-scan");
  }
  let moonDiv = a.appendChild(createDOM("div", { class: "ogl-moon-div" }));
  moonDiv.appendChild(createDOM("div", { class: "ogl-moon-act" }));
  let mIcon = moonDiv.appendChild(createDOM("div", { class: "ogl-moon" }));
  panel = moonDiv.appendChild(createDOM("div", { class: "ogl-moon-hover" }));
  plaFleet = panel.appendChild(createDOM("div", { class: "ogl-atk", title: Translator.translate(335) }));
  plaspy = panel.appendChild(createDOM("button", { class: "icon_eye", title: Translator.translate(259) }));
  plaspy.addEventListener("click", (e) => {
    // sendShipsWithPopup(6, coords[0], coords[1], coords[2], 3, OGBIData.json.spyProbes);
    // disable direct probing in stalks and target list until complete removal or GF start to wake up
    probingWarning();
    e.stopPropagation();
  });
  plaFleet.addEventListener("click", (e) => {
    window.location.href = `?page=ingame&component=fleetdispatch&galaxy=${coords[0]}&system=${coords[1]}&position=${coords[2]}&type=3`;
    e.stopPropagation();
  });
  a.addEventListener("click", () => {
    if ($("#galaxyLoading").is(":visible")) return;
    let link = `?page=ingame&component=galaxy&galaxy=${coords[0]}&system=${coords[1]}&position=${coords[2]}`;
    link = "https://" + window.location.host + window.location.pathname + link;
    if (event.ctrlKey) window.open(link, "_blank");
    else {
      if (context.page == "galaxy") {
        document.querySelector("#galaxy_input").value = coords[0];
        document.querySelector("#system_input").value = coords[1];
        submitForm();
        setHighlightCoords(coords.join(":"));
      } else window.location.href = link;
    }
  });
  if (moon) {
    mIcon.classList.add("ogl-active");
    moonDiv.classList.add("ogl-active");
  }
  let targeted = OGBIData.json.markers[coords.join(":")];
  if (targeted) {
    a.classList.add("ogl-marked");
    a.setAttribute("data-marked", targeted.color);
  } else {
    a.classList.remove("ogl-marked");
    a.removeAttribute("data-marked");
  }
  return a;
}

export { renderPlanet };
