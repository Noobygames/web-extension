import planetType from "../game/planetType.js";

/**
 * Singleton view over the `<meta name="ogame-*">` tags the game puts in `<head>`.
 *
 * The fields are read lazily, on first access, instead of in the constructor.
 * That is what lets `ogCore.js` be injected at `document_start` and load,
 * parse and evaluate its module graph in parallel with the game's own page
 * parse: at that point `<head>` is still empty, and an eager read here would
 * see no meta tags at all (or throw on the language one). Every consumer runs
 * after `DOMContentLoaded`, so by the time a getter is touched the tags exist.
 */
class OgamePageData {
  #loaded = false;

  #load() {
    if (this.#loaded) return;
    this.#loaded = true;

    this._version = document.querySelector("meta[name='ogame-version']")?.content || "0.0.0";
    this._gameLang = document.querySelector('meta[name="ogame-language"]').getAttribute("content");
    this._playerLang = document.cookie.match(/oglocale=([a-z]+)/)?.[1] || this._gameLang;
    this._isAtLeast_13_0_0 = OgamePageData.#IsVersionEqualOrGreaterThan(this._version, "13.0.0");
    this._currentCoordinates = document.querySelector('meta[name="ogame-planet-coordinates"]')?.getAttribute("content");
    const coordinates = (this._currentCoordinates || "").split(":");
    this._currentGalaxy = parseInt(coordinates[0]);
    this._currentSystem = parseInt(coordinates[1]);
    this._currentPosition = parseInt(coordinates[2]);
    // Uses the shared planetType enum rather than literal 1/3 so it stays in step with the
    // v13 coordinate work merged in #545, which reads the same values out of message data.
    this._currentPositionType =
      document.querySelector('meta[name="ogame-planet-type"]')?.getAttribute("content") === "planet"
        ? planetType.planet
        : planetType.moon;
    this._donutSystem = document.querySelector('meta[name="ogame-donut-system"]')?.getAttribute("content") === "1";
  }

  /** @type {string} */
  get gameLang() {
    this.#load();
    return this._gameLang;
  }
  /** @type {string} */
  get playerLang() {
    this.#load();
    return this._playerLang;
  }

  /** @type {string} */
  get version() {
    this.#load();
    return this._version;
  }
  /** @type {boolean} */
  get isAtLeast_13_0_0() {
    this.#load();
    return this._isAtLeast_13_0_0;
  }
  /** @type {string} */
  get currentCoordinates() {
    this.#load();
    return this._currentCoordinates;
  }
  /** @type {number} */
  get currentGalaxy() {
    this.#load();
    return this._currentGalaxy;
  }
  /** @type {number} */
  get currentSystem() {
    this.#load();
    return this._currentSystem;
  }
  /** @type {number} */
  get currentPosition() {
    this.#load();
    return this._currentPosition;
  }
  /** @type {number} */
  get currentPositionType() {
    this.#load();
    return this._currentPositionType;
  }
  /** @type {boolean} */
  get donutSystem() {
    this.#load();
    return this._donutSystem;
  }

  static #IsVersionEqualOrGreaterThan(ogameVersion, compareVersion) {
    // Extract the numeric parts of the version strings and convert them to numbers for comparison (ex: "13.0.0-r1" -> "13.0.0")
    const cleanVersion = (v) => v.split("-")[0].split(".").map(Number);

    const ogameVersionParts = cleanVersion(ogameVersion);
    const compareVersionParts = cleanVersion(compareVersion);

    const maxLength = Math.max(ogameVersionParts.length, compareVersionParts.length);

    for (let i = 0; i < maxLength; i++) {
      const ogameV = ogameVersionParts[i] || 0;
      const b = compareVersionParts[i] || 0;

      if (ogameV > b) return true; // Ogame version is greater
      if (ogameV < b) return false; // Ogame version is lesser
    }

    return true; // Versions are equal
  }
}

export default new OgamePageData();
