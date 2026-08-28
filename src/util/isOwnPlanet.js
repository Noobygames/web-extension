/**
 * Whether a coordinate belongs to one of the player's own planets.
 *
 * Reads the planet bar rather than the store, so it is correct even before the empire
 * snapshot has been refreshed. Lifted out of `ogkush.js` in Phase 3 of refactoring.md,
 * unchanged.
 */
const isOwnPlanet = (coords) => {
  const planetList = document.getElementById("planetList").children;
  let found = false;
  Array.from(planetList).forEach((planet) => {
    const planetKoordsEl = planet.querySelector(".planet-koords");
    if (!planetKoordsEl) {
      return;
    }

    const planetKoords = planetKoordsEl.textContent;

    if (coords === planetKoords) found = true;
  });

  return found;
};

export default isOwnPlanet;
