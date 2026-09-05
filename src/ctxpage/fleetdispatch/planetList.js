/**
 * The planet/moon grid OGBI opens as a target picker.
 *
 * Its own file since Phase 5 of refactoring.md. `pageTweaks/index.js` is core code
 * and imported this from the fleetdispatch barrel, so one 57-line grid was holding
 * all 185 KB of the fleet-dispatch page in the boot bundle - the barrel re-exports
 * `betterFleetDispatcher`, `customMissions` and `expedition`, and `treeshake` is
 * off by design.
 *
 * The two default parameters read the page's own `fleetDispatcher`, so this is
 * still fleet-dispatch code: every caller reaches it from a click handler on a page
 * that has a dispatcher.
 */
import { createDOM } from "../../ui/dom.js";

function openPlanetList(context, callcback, target = fleetDispatcher.targetPlanet, mission = fleetDispatcher.mission) {
  let container = createDOM("div", { class: "ogl-dialogContainer ogl-quickLinks" });
  let buildButton = (planet, id, galaxy, system, position, type) => {
    let data = {
      id: id,
      galaxy: galaxy,
      system: system,
      position: position,
      type: type,
    };
    let div = container.appendChild(createDOM("div"));
    if (type == 1) div.classList.add("ogl-quickPlanet");
    else div.classList.add("ogl-quickMoon");
    div.addEventListener("click", () => callcback(data));
    if (
      (planet == context.current.planet && !context.current.isMoon && type == 1) ||
      (planet == context.current.planet && context.current.isMoon && type == 3)
    ) {
      div.classList.add("ogl-current");
      div.classList.add(`mission-${mission}`);
    }
    if (
      target &&
      galaxy == target.galaxy &&
      system == target.system &&
      position == target.position &&
      type == target.type
    ) {
      div.classList.add("ogl-target");
      div.classList.add(`mission-${mission}`);
    }
    return div;
  };
  context.planetList.forEach((planet) => {
    let coords = planet.querySelector(".planet-koords").textContent.split(":");
    let btn = buildButton(
      planet,
      new URL(planet.querySelector(".planetlink").href).searchParams.get("cp"),
      coords[0],
      coords[1],
      coords[2],
      1
    );
    btn.textContent = `[${coords.join(":")}] ${planet.querySelector(".planet-name").textContent}`;
    if (planet.querySelector(".moonlink")) {
      let btn = buildButton(
        planet,
        new URL(planet.querySelector(".moonlink").href).searchParams.get("cp"),
        coords[0],
        coords[1],
        coords[2],
        3
      );
      btn.appendChild(createDOM("figure", { class: "planetIcon moon" }));
    } else container.appendChild(createDOM("div"));
  });
  return container;
}

export { openPlanetList };
export default openPlanetList;
