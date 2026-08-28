/**
 * Minimal but realistic OGame page fragments, shared by the tests that need a page
 * rather than a single element.
 *
 * These are hand-written rather than saved verbatim from the game: a real overview
 * page is ~400 KB of markup, almost none of which any of this code looks at, and a
 * dump that large hides which attribute a test actually depends on. Everything here
 * is a selector that `src/` reads. If a test needs another one, add it here with a
 * comment saying who reads it.
 *
 * OGame 13 markup only. v12 support was dropped, so there is no second variant.
 */

/**
 * The `<meta>` tags `readPageContext()` and `OgamePageData` read.
 *
 * They are emitted into the body rather than the head because `setupBrowser()` owns
 * the head. `document.querySelector('meta[name=…]')` does not care where they sit.
 */
export function metaTags({
  playerId = 12345,
  universeDomain = "s1-en.ogame.gameforge.com",
  universeName = "Quantum",
} = {}) {
  return `
    <meta name="ogame-player-id" content="${playerId}">
    <meta name="ogame-universe" content="${universeDomain}">
    <meta name="ogame-universe-name" content="${universeName}">
  `;
}

/**
 * The officer bar. `readPageContext()` reads one `.on` class per officer, plus
 * `#officers.all` for the all-officers bundle.
 *
 * @param {{commander?: boolean, admiral?: boolean, engineer?: boolean,
 *          geologist?: boolean, technocrat?: boolean, all?: boolean}} on
 */
export function officers(on = {}) {
  const cls = (name) => `${name}${on[name] ? " on" : ""}`;
  return `
    <div id="officers"${on.all ? ' class="all"' : ""}>
      <a class="${cls("commander")}"></a>
      <a class="${cls("admiral")}"></a>
      <a class="${cls("engineer")}"></a>
      <a class="${cls("geologist")}"></a>
      <a class="${cls("technocrat")}"></a>
    </div>
  `;
}

/** The character-class badge. `playerClass` is read from exactly this. */
export function characterClass(name) {
  return `<div id="characterclass">${name ? `<div class="${name}"></div>` : ""}</div>`;
}

/**
 * The right-hand planet bar.
 *
 * Coordinates are written the way the game writes them - wrapped in brackets -
 * because `stripCoordinateBrackets()` is what removes them, and a fixture that
 * pre-strips would hide a regression in exactly that step.
 *
 * @param {Array<{id: number, coords: string, moon?: boolean, active?: boolean,
 *                moonActive?: boolean, name?: string}>} planets
 */
export function planetList(planets) {
  const rows = planets
    .map(
      (p) => `
      <div class="smallplanet" id="planet-${p.id}">
        <a class="planetlink${p.active ? " active" : ""}" href="?page=ingame&cp=${p.id}">
          <span class="planet-name">${p.name || "Homeworld"}</span>
          <span class="planet-koords">[${p.coords}]</span>
        </a>
        ${p.moon ? `<a class="moonlink${p.moonActive ? " active" : ""}" href="?page=ingame&cp=${p.id + 1}"></a>` : ""}
      </div>`
    )
    .join("");
  return `<div id="planetList">${rows}</div>`;
}

/**
 * A complete-enough page for `new OGBeyondInfinity()` / `readPageContext()`.
 *
 * Defaults: two planets, the second one active, no moons, no officers, no class.
 */
export function overviewPage(options = {}) {
  const {
    meta = {},
    officerState = {},
    playerClassName = null,
    planets = [
      { id: 33621, coords: "1:2:3", name: "Homeworld" },
      { id: 33790, coords: "4:5:6", name: "Colony", active: true },
    ],
  } = options;

  return [metaTags(meta), characterClass(playerClassName), officers(officerState), planetList(planets)].join("\n");
}
