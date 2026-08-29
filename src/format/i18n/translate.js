import OgamePageData from "../../ogame/pageData.js";
import OGBIData from "../../store/OGBIData.js";
import { getLogger } from "../../platform/logger.js";
import MissionType from "../../game/missionType.js";

import EN from "./translations/en.js";
import { loadChunk } from "../../platform/loadChunk.js";

/**
 * The six language tables used to sit in this file, one entry per key holding all
 * six strings - 78 KB of the page bundle, of which a player reads two languages at
 * most. Phase 5 of refactoring.md moved them to `translations/<lang>.js`: English
 * stays statically imported because it is the fallback for every key the player's
 * own language is missing, and the other five are reached through `import()`, so
 * only the one being played is ever fetched.
 *
 * Two keys were dropped in that move, `tech.label` and `text.166`: both listed all
 * six languages as `undefined`, so both returned `""` before and return `""` now.
 * `test/util/translations.test.js` pins the rest against `en`.
 */

const SUPPORTED_LANGUAGES = ["de", "en", "es", "fr", "tr", "br"];

let resolvedLanguage = null;

/**
 * The player's own table once its chunk has arrived.
 *
 * `null` until then, and for an English player for good: `EN` is already in this
 * bundle, so `load()` has nothing to fetch and every lookup falls through to the
 * fallback that would have answered anyway.
 *
 * @type {{tech: object, res: object, text: object} | null}
 */
let languageTable = null;

/**
 * One literal `import()` per language, because a bundler can only split at a
 * specifier it can read. Building the path from the language variable instead would
 * lint and build clean and then split into no chunk at all, leaving a request for a
 * file the package does not contain.
 *
 * @param {string} language one of SUPPORTED_LANGUAGES
 * @returns {Promise<{default: object} | undefined>}
 */
function importLanguage(language) {
  switch (language) {
    case "de":
      return loadChunk("translations/de", () => import("./translations/de.js"));
    case "es":
      return loadChunk("translations/es", () => import("./translations/es.js"));
    case "fr":
      return loadChunk("translations/fr", () => import("./translations/fr.js"));
    case "tr":
      return loadChunk("translations/tr", () => import("./translations/tr.js"));
    case "br":
      return loadChunk("translations/br", () => import("./translations/br.js"));
    default:
      return Promise.resolve(undefined);
  }
}

/**
 * The player language, resolved on first use rather than at module evaluation.
 *
 * Lazy on purpose: `OgamePageData` reads the `<meta name="ogame-language">`
 * tag, and `ogCore.js` is injected at `document_start` so its module graph can
 * load in parallel with the game's page parse. At that moment `<head>` is
 * still empty. Every caller runs after `DOMContentLoaded`.
 *
 * @returns {string} one of SUPPORTED_LANGUAGES
 */
function currentLanguage() {
  if (resolvedLanguage) return resolvedLanguage;

  const language = OgamePageData.playerLang;
  const mapped = ["ar", "mx"].includes(language) ? "es" : language;
  resolvedLanguage = SUPPORTED_LANGUAGES.includes(mapped) ? mapped : "en";

  return resolvedLanguage;
}

class Translator {
  logger = getLogger("Translator");

  /** @type {Promise<void> | null} in flight, so a second `load()` waits instead of refetching */
  #loading = null;

  #getTranslations() {
    const translations = OGBIData.json.translations ?? {};
    if (!translations.lfTypeNames) translations.lfTypeNames = {};
    if (!translations.tech) translations.tech = {};
    if (!translations.text) translations.text = {};
    if (!translations.language) translations.language = {};
    if (!translations.lastUpdate) translations.lastUpdate = new Date(0);

    return translations;
  }
  /**
   * Same fallback chain as before the split: the player's string, else the English
   * one, else the empty string. `languageTable` being null covers both an English
   * player and the window before `load()` has resolved - in either case English
   * answers, which is what a missing key did already.
   */
  #translate(id, type = "text") {
    return languageTable?.[type]?.[id] || EN?.[type]?.[id] || "";
  }

  /**
   * Fetches the player's language table. Idempotent, never rejects, and a no-op for
   * English.
   *
   * Has to run after `DOMContentLoaded`, because the language comes from a `<meta>`
   * tag that does not exist yet when this module is evaluated (Leitplanke 5 of
   * refactoring.md). `ogCore.js` starts it right after `domReady()` and awaits it
   * before `start()`; nothing in between translates.
   *
   * Compliance note (AGENTS.md 4): the chunk is a file inside the extension package.
   * No game server is contacted, so no activity is produced.
   *
   * @returns {Promise<void>}
   */
  async load() {
    if (languageTable || this.#loading) return this.#loading ?? undefined;

    this.#loading = importLanguage(currentLanguage()).then((module) => {
      if (module) languageTable = module.default;
    });

    return this.#loading;
  }
  translate(id, type = "text") {
    if (OGBIData.json.translations && type === "tech") {
      return OGBIData.json.translations.tech[id];
    }
    return this.#translate(id, type);
  }

  TranslateMissionType(missionTypeId) {
    if (missionTypeId == MissionType.ATTACK || missionTypeId == MissionType.ACS_ATTACK) {
      return this.#translate(200); //attack
    } else if (missionTypeId == MissionType.TRANSPORT) {
      return this.#translate(201); //transport
    } else if (missionTypeId == MissionType.DEPLOYMENT) {
      return this.#translate(202); //deployment
    } else if (missionTypeId == MissionType.ACS_DEFEND) {
      return this.#translate(203); //defense
    } else if (missionTypeId == MissionType.SPY) {
      return this.#translate(204); //spy
    } else if (missionTypeId == MissionType.COLONISATION) {
      return this.#translate(205); //colonization
    } else if (missionTypeId == MissionType.HARVEST) {
      return this.#translate(206); //harvest
    } else if (missionTypeId == MissionType.MOON_DESTRUCTION) {
      return this.#translate(207); //moon destruction
    } else if (missionTypeId == MissionType.MISSILE_ATTACK) {
      return this.#translate(208); //missile attack
    } else if (missionTypeId == MissionType.EXPEDITION) {
      return this.#translate(209); //expedition
    } else if (missionTypeId == MissionType.EXPLORATION) {
      return this.#translate(210); //exploration
    }
  }

  GetClassFromLifeformName(name) {
    const translations = this.#getTranslations();
    return translations.lfTypeNames[name];
  }

  #ForceUpdateAllTechNamesFromEmpire(translations, empire) {
    const regex = /^\d+$/;
    Object.keys(empire.translations.planets).forEach((key) => {
      if (!key.endsWith("_full")) {
        if (regex.test(key)) {
          translations.tech[key] = empire.translations.planets[`${key}_full`].trim();
        } else {
          translations.text[key] = empire.translations.planets[key].trim();
        }
      }
    });
  }

  UpdateAllTechNamesFromEmpire(empireFromPlanets, empireFromMoons) {
    const translations = this.#getTranslations();
    const diffInMinutes = Math.floor((new Date() - new Date(translations.lastUpdate)) / (1000 * 60));

    //if langage is different from currentLanguage or if date is older than 60 minutes update
    if (translations.language !== currentLanguage() || diffInMinutes > 60) {
      this.logger.debug(`Translations (${currentLanguage()}) will be updated`);

      this.#ForceUpdateAllTechNamesFromEmpire(translations, empireFromPlanets);
      if (empireFromMoons) {
        this.#ForceUpdateAllTechNamesFromEmpire(translations, empireFromMoons);
      }

      //set date to now and language to currentLanguage
      translations.lastUpdate = new Date().toISOString();
      translations.language = currentLanguage();

      OGBIData.json.translations = translations;

      this.logger.debug(`Translations (${currentLanguage()}) updated`);
    } else {
      this.logger.debug(
        `No need to update translations (${currentLanguage()}), last update was ${diffInMinutes} minutes ago`
      );
    }
  }

  InitializeLFNames(currentPosition, hasLifeforms) {
    if (!hasLifeforms) return;
    const translations = this.#getTranslations();
    fetch(`/game/index.php?page=ingame&component=lfsettings&cp=${currentPosition.id}`)
      .then((rep) => rep.text())
      .then((str) => {
        const htmlDocument = new window.DOMParser().parseFromString(str, "text/html");
        const listName = htmlDocument.querySelectorAll("div.lfsettingsContent > h3");
        listName.forEach((lfName) => {
          const lifeformIcon = lfName.parentElement.querySelector(".lifeform1, .lifeform2, .lifeform3, .lifeform4");
          translations.lfTypeNames[lfName.textContent.trim()] = lifeformIcon.classList[1];
        });
        OGBIData.json.translations = translations;
        // last fetch has to be from current planet/moon else Ogame switches on next refresh
        if (currentPosition.isMoon) fetch(currentPosition.planet.querySelector(".moonlink").href);
      });
  }
}

export default new Translator();
