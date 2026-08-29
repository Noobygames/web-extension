import OgamePageData from "../ogame/pageData.js";

/**
 * The community mmorpg-stat.eu profile page for one player.
 *
 * The array below is a position lookup, not a list: mmorpg-stat.eu identifies a
 * country by its index in it, so entries may never be reordered or removed, only
 * appended. Lifted out of `OGBeyondInfinity` in Phase 3 of refactoring.md; the universe
 * number is a parameter now instead of `this.universe`.
 *
 * @param {string|number} universe the digits of the universe host, e.g. "282"
 * @param {string|number} playerId
 * @returns {string}
 */
export function generateMMORPGLink(universe, playerId) {
  const lang = [
    "fr",
    "de",
    "en",
    "es",
    "pl",
    "it",
    "ru",
    "ar",
    "mx",
    "tr",
    "fi",
    "tw",
    "gr",
    "br",
    "nl",
    "hr",
    "sk",
    "cz",
    "ro",
    "us",
    "pt",
    "dk",
    "no",
    "se",
    "si",
    "hu",
    "jp",
    "ba",
  ].indexOf(OgamePageData.gameLang);
  return `https://www.mmorpg-stat.eu/0_fiche_joueur.php?pays=${lang}&ftr=${playerId}.dat&univers=_${universe}`;
}
