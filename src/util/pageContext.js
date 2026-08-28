import planetType from "./enum/planetType.js";
import PlayerClass from "./enum/playerClass.js";
import ogiMode from "./enum/ogiMode.js";

/**
 * Everything `OGInfinity` used to read out of the DOM inside its own constructor,
 * as one plain object.
 *
 * This exists to give the class a seam. Before it, `new OGInfinity()` dereferenced
 * `meta[name="ogame-player-id"]` on its very first line, so the class could not be
 * constructed anywhere except a fully rendered OGame page - which is why
 * `bundle.test.js` only ever got as far as asserting that the constructor throws.
 *
 * The reads are lifted verbatim, including the parts that throw on a page that does
 * not have them (missing player-id meta, no `.smallplanet` entries, no universe
 * meta). That is deliberate: this is a characterisation seam, not a repair. The
 * throwing cases are pinned by tests in `test/util/pageContext.test.js`, so a later
 * decision to make them tolerant registers as a deliberate change.
 *
 * Pure: it reads, it does not write. The one DOM mutation that used to sit among
 * these lines - stripping the brackets OGame renders around `.planet-koords` - has
 * to happen before this runs and stays at the call site.
 *
 * @param {Document} doc
 * @param {Location|URL|{href: string, host: string}} loc
 * @returns {object} fields to assign onto the instance
 */
export function readPageContext(doc = document, loc = window.location) {
  const getMetaValue = (name) => doc.querySelector(`meta[name="${name}"]`);

  const rawURL = new URL(loc.href);

  let playerClass = PlayerClass.NONE;
  if (doc.querySelector("#characterclass .explorer")) {
    playerClass = PlayerClass.EXPLORER;
  } else if (doc.querySelector("#characterclass .warrior")) {
    playerClass = PlayerClass.WARRIOR;
  } else if (doc.querySelector("#characterclass .miner")) {
    playerClass = PlayerClass.MINER;
  }

  const planetList = doc.querySelectorAll(".smallplanet");

  // The lowest planet id is the home planet. `Math.min()` of an empty list is
  // Infinity, so an empty planet list lands on `undefined` here and throws on the
  // next line - same as before this function existed.
  const planetIds = [...planetList].map((planet) => parseInt(planet.id.split("-")[1]));
  const mainPlanet = planetList[planetIds.indexOf(Math.min(...planetIds))];
  const mainPlanetCoords = mainPlanet
    .querySelector(".planet-koords")
    .textContent.split(":")
    .map((e) => parseInt(e));

  const currentPlanet = (doc.querySelector("#planetList .active") ?? doc.querySelector("#planetList .planetlink"))
    .parentNode;

  const current = {
    planet: currentPlanet,
    id: parseInt(currentPlanet.id.split("-")[1]),
    coords: currentPlanet.querySelector(".planet-koords").textContent,
    hasMoon: !!currentPlanet.querySelector(".moonlink"),
  };
  current.isMoon = !!(current.hasMoon && currentPlanet.querySelector(".moonlink.active"));

  return {
    playerId: parseInt(doc.querySelector('meta[name="ogame-player-id"]').content),
    commander: doc.querySelector("#officers > a.commander.on") !== null,
    rawURL,
    page: rawURL.searchParams.get("component") || rawURL.searchParams.get("page"),
    playerClass,
    mode: rawURL.searchParams.get("oglMode") || ogiMode.DEFAULT,
    planetList,
    homePlanetCoords: {
      galaxy: mainPlanetCoords[0],
      system: mainPlanetCoords[1],
      position: mainPlanetCoords[2],
      type: planetType.planet,
    },
    isMobile: "ontouchstart" in doc.documentElement,
    universe: loc.host.replace(/\D/g, ""),
    universeUrl: `https://${getMetaValue("ogame-universe").content}`,
    universeName: getMetaValue("ogame-universe-name").content,
    universeDomain: getMetaValue("ogame-universe").content,
    geologist: !!doc.querySelector(".geologist.on"),
    technocrat: !!doc.querySelector(".technocrat.on"),
    admiral: !!doc.querySelector(".admiral.on"),
    engineer: !!doc.querySelector(".engineer.on"),
    allOfficers: !!doc.querySelector("#officers.all"),
    current,
  };
}

/**
 * The one DOM write that used to live in the constructor: OGame renders every
 * `.planet-koords` as `[1:2:3]`, and the whole codebase expects `1:2:3`.
 *
 * Idempotent it is NOT - calling it twice eats two more characters. It runs once,
 * from the constructor, before {@link readPageContext}.
 *
 * @param {Document} doc
 */
export function stripCoordinateBrackets(doc = document) {
  doc.querySelectorAll(".planet-koords").forEach((elem) => (elem.textContent = elem.textContent.slice(1, -1)));
}
