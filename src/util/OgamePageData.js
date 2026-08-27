import planetType from "./enum/planetType.js";

class OgamePageData {
  constructor() {
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
    return this._gameLang;
  }
  /** @type {string} */
  get playerLang() {
    return this._playerLang;
  }

  /** @type {string} */
  get version() {
    return this._version;
  }
  /** @type {boolean} */
  get isAtLeast_13_0_0() {
    return this._isAtLeast_13_0_0;
  }
  /** @type {string} */
  get currentCoordinates() {
    return this._currentCoordinates;
  }
  /** @type {number} */
  get currentGalaxy() {
    return this._currentGalaxy;
  }
  /** @type {number} */
  get currentSystem() {
    return this._currentSystem;
  }
  /** @type {number} */
  get currentPosition() {
    return this._currentPosition;
  }
  /** @type {number} */
  get currentPositionType() {
    return this._currentPositionType;
  }
  /** @type {boolean} */
  get donutSystem() {
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
