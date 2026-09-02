import * as perf from "../platform/perf.js";
import { getLogger } from "../platform/logger.js";

const hotStorageKey = "ogk-data";
const coldStorageKey = "ogk-history";
/** Where an unparseable blob is moved so it is not lost when the store is reset. */
const hotCorruptStorageKey = "ogk-data-corrupt";
const coldCorruptStorageKey = "ogk-history-corrupt";

const logger = getLogger("OGBIData");

/**
 * The historical half of ogk-data: written only when a message is analyzed, but
 * dominates the blob's size (docs/performance.md - spies alone). Everything else is
 * hot - written on nearly every page load, including once per page in
 * renderPlanetBar() before first paint - so keeping it apart from the cold half is
 * what makes the other ~80 Save() call sites cheap again.
 */
const COLD_FIELDS = new Set([
  "spies",
  "expeditions",
  "combats",
  "harvests",
  "discoveries",
  "expeditionSums",
  "discoveriesSums",
  "combatsSums",
  "translations",
  "spyReportCache",
]);

class OGBIData {
  #hot;
  #cold;
  #jsonProxy;
  /**
   * Whether `#cold` has changed since it was last written. `Save()` is the escape
   * hatch for in-place mutation (the TRAP contract - see OGIData.test.js), and it is
   * also the call at the end of `updateProductionProgress()` that runs on every
   * page load before first paint (refactoring-new.md Phase C). That call never
   * touches a cold field, so without this flag `Save()` would re-serialize the
   * spies-dominated half on every load regardless - exactly the cost the split
   * exists to remove.
   */
  #coldDirty = false;

  get playerId() {
    return this.#hot.playerId;
  }

  get universeUrl() {
    return this.#hot.universeUrl;
  }

  get options() {
    return this.#hot.options;
  }
  set options(options) {
    this.#hot.options = options;

    this.#saveHot();
  }
  get universeSettingsTooltip() {
    return this.#hot.universeSettingsTooltip;
  }
  set universeSettingsTooltip(universeSettingsTooltip) {
    this.#hot.universeSettingsTooltip = universeSettingsTooltip;

    this.#saveHot();
  }
  get technology() {
    return this.#hot.technology;
  }
  set technology(technology) {
    this.#hot.technology = technology;

    this.#saveHot();
  }

  get playerMarkers() {
    return this.#hot.playerMarkers;
  }

  set playerMarkers(playerMarkers) {
    this.#hot.playerMarkers = playerMarkers;

    this.#saveHot();
  }

  get markers() {
    return this.#hot.markers;
  }
  set markers(markers) {
    this.#hot.markers = markers;

    this.#saveHot();
  }
  /** Attack timestamps per target, for the bashing-rule counter. See game/bashing.js. */
  get bashLog() {
    return this.#hot.bashLog;
  }
  set bashLog(bashLog) {
    this.#hot.bashLog = bashLog;

    this.#saveHot();
  }
  get ships() {
    return this.#hot.ships;
  }
  set ships(ships) {
    this.#hot.ships = ships;

    this.#saveHot();
  }
  get expeditions() {
    return this.#cold.expeditions;
  }
  set expeditions(expeditions) {
    this.#cold.expeditions = expeditions;

    this.#saveCold();
  }
  get spies() {
    return this.#cold.spies;
  }
  set spies(spies) {
    this.#cold.spies = spies;

    this.#saveCold();
  }
  /** Espionage snapshots kept for the galaxy-view hover, keyed by coords+planetType. */
  get spyReportCache() {
    return this.#cold.spyReportCache;
  }
  set spyReportCache(spyReportCache) {
    this.#cold.spyReportCache = spyReportCache;

    this.#saveCold();
  }
  get discoveries() {
    return this.#cold.discoveries;
  }
  set discoveries(discoveries) {
    this.#cold.discoveries = discoveries;

    this.#saveCold();
  }
  get expeditionSums() {
    return this.#cold.expeditionSums;
  }
  set expeditionSums(expeditionSums) {
    this.#cold.expeditionSums = expeditionSums;

    this.#saveCold();
  }
  get discoveriesSums() {
    return this.#cold.discoveriesSums;
  }
  set discoveriesSums(discoveriesSums) {
    this.#cold.discoveriesSums = discoveriesSums;

    this.#saveCold();
  }
  get keepTooltip() {
    return this.#hot.keepTooltip;
  }
  set keepTooltip(keepTooltip) {
    this.#hot.keepTooltip = keepTooltip;

    this.#saveHot();
  }
  get tchat() {
    return this.#hot.tchat;
  }
  set tchat(tchat) {
    this.#hot.tchat = tchat;

    this.#saveHot();
  }
  /**
   * The player's pinned farm shortlist (`store/raidPins.js`). Hot, not cold: a handful
   * of rows, written on a click, never on message analysis.
   */
  get raidPins() {
    return this.#hot.raidPins;
  }
  set raidPins(raidPins) {
    this.#hot.raidPins = raidPins;

    this.#saveHot();
  }
  get searchHistory() {
    return this.#hot.searchHistory;
  }
  set searchHistory(searchHistory) {
    this.#hot.searchHistory = searchHistory;

    this.#saveHot();
  }
  get sideStalk() {
    return this.#hot.sideStalk;
  }
  set sideStalk(sideStalk) {
    const list = [];

    sideStalk.forEach((id) => {
      id = parseInt(id);
      if (list.indexOf(id) === -1) list.push(parseInt(id));
    });

    this.#hot.sideStalk = list;

    this.#saveHot();
  }

  get welcome() {
    return this.#hot.welcome;
  }

  set welcome(welcome) {
    this.#hot.welcome = welcome;

    this.#saveHot();
  }

  get combats() {
    return this.#cold.combats;
  }

  set combats(combats) {
    this.#cold.combats = combats;

    this.#saveCold();
  }

  get combatsSums() {
    return this.#cold.combatsSums;
  }

  set combatsSums(combatsSums) {
    this.#cold.combatsSums = combatsSums;

    this.#saveCold();
  }

  get harvests() {
    return this.#cold.harvests;
  }

  set harvests(harvests) {
    this.#cold.harvests = harvests;

    this.#saveCold();
  }

  get empire() {
    return this.#hot.empire;
  }

  set empire(empire) {
    this.#hot.empire = empire;

    this.#saveHot();
  }

  get needsUpdate() {
    return this.#hot.needsUpdate;
  }

  set needsUpdate(needsUpdate) {
    this.#hot.needsUpdate = needsUpdate;

    this.#saveHot();
  }

  get needSync() {
    return this.#hot.needSync;
  }

  set needSync(needSync) {
    this.#hot.needSync = needSync;

    this.#saveHot();
  }

  get needs() {
    return this.#hot.needs;
  }

  set needs(needs) {
    this.#hot.needs = needs;

    this.#saveHot();
  }

  get lastSentFleet() {
    return this.#hot.lastSentFleet;
  }
  set lastSentFleet(lastSentFleet) {
    this.#hot.lastSentFleet = lastSentFleet;

    this.#saveHot();
  }

  get lastSyncNotification() {
    return this.#hot.lastSyncNotification ?? new Date(0).toISOString();
  }
  set lastSyncNotification(date) {
    this.#hot.lastSyncNotification = date ?? new Date(0).toISOString();

    this.#saveHot();
  }

  get notifications() {
    return this.#hot.notifications ?? [];
  }
  set notifications(notifications) {
    this.#hot.notifications = notifications ?? [];

    this.#saveHot();
  }

  /**
   * The single external view of the store, unchanged since before the hot/cold
   * split: a live object, not a snapshot. Reading a field routes to whichever half
   * holds it; writing a field, iterating keys, `Object.assign({}, OGBIData.json)`
   * and `JSON.stringify(OGBIData.json)` all work exactly as they did against one
   * blob. Nothing crossing this getter/setter knows the split exists.
   */
  get json() {
    return this.#jsonProxy;
  }

  set json(json) {
    const hot = {};
    const cold = {};
    for (const [key, value] of Object.entries(json ?? {})) {
      if (COLD_FIELDS.has(key)) cold[key] = value;
      else hot[key] = value;
    }
    this.#hot = hot;
    this.#cold = cold;

    this.#saveHot();
    this.#saveCold();
  }

  constructor() {
    const hotRaw = localStorage.getItem(hotStorageKey);
    const coldRaw = localStorage.getItem(coldStorageKey);

    const atHot = perf.isEnabled() ? performance.now() : 0;
    let hot = OGBIData.#parse(hotRaw, hotCorruptStorageKey);
    perf.accumulate("ogk-data parse", perf.isEnabled() ? performance.now() - atHot : 0, hotRaw ? hotRaw.length : 0);

    const atCold = perf.isEnabled() ? performance.now() : 0;
    let cold = coldRaw !== null ? OGBIData.#parse(coldRaw, coldCorruptStorageKey) : {};
    perf.accumulate(
      "ogk-history parse",
      perf.isEnabled() ? performance.now() - atCold : 0,
      coldRaw ? coldRaw.length : 0
    );

    // A pre-split ogk-data (or one written by an older version) still carries the
    // cold fields inline. coldRaw only exists once a split has already happened, so
    // its absence is the migration trigger - re-checked, and safely a no-op, on
    // every boot until the split actually took place.
    if (coldRaw === null) {
      ({ hot, cold } = OGBIData.#migrate(hot));
    }

    this.#hot = hot;
    this.#cold = cold;
    this.#jsonProxy = this.#buildJsonProxy();
  }

  /**
   * Pulls the cold fields out of a (possibly pre-split) hot blob and, if any were
   * found, persists both halves before returning them.
   *
   * Order matters for the failure case: ogk-history is written first, ogk-data
   * second. If either `setItem` throws (quota, most likely), ogk-data on disk is
   * still the original, untouched blob - the very history the split must not lose
   * (refactoring.md Phase 2: "leer starten kostet eine Sitzung; leer starten und
   * wegwerfen kostet den Account"). The in-memory halves are still split either way,
   * so this session behaves correctly regardless; an interrupted migration simply
   * retries, harmlessly, on the next load.
   *
   * @param {object} hot
   * @returns {{hot: object, cold: object}}
   */
  static #migrate(hot) {
    const cold = {};
    let foundCold = false;
    for (const key of COLD_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(hot, key)) {
        cold[key] = hot[key];
        foundCold = true;
      }
    }
    if (!foundCold) return { hot, cold };

    const trimmedHot = { ...hot };
    for (const key of COLD_FIELDS) delete trimmedHot[key];

    try {
      localStorage.setItem(coldStorageKey, JSON.stringify(cold));
      localStorage.setItem(hotStorageKey, JSON.stringify(trimmedHot));
    } catch (error) {
      logger.error(`ogk-data migration to ogk-history failed (${error.message}). ogk-data was left untouched.`);
    }

    return { hot: trimmedHot, cold };
  }

  /**
   * Reads a stored blob, and survives it being unreadable.
   *
   * This runs at module evaluation, so a bare `JSON.parse` threw before any feature
   * had started - a single truncated write (a browser killed mid-save, a hand-edited
   * value, a quota failure) left the whole page context dead with a SyntaxError and
   * no way back except clearing site data by hand.
   *
   * The unreadable value is moved aside rather than overwritten: it may be the
   * user's entire history - spy reports, expeditions, markers - and the very next
   * setter would otherwise write an empty object over it. Starting empty loses the
   * session; starting empty AND discarding the file loses the account.
   *
   * @param {string|null} raw
   * @param {string} corruptKey
   * @returns {object}
   */
  static #parse(raw, corruptKey) {
    if (!raw) return {};

    try {
      return JSON.parse(raw) || {};
    } catch (error) {
      logger.error(`${corruptKey.replace("-corrupt", "")} could not be parsed (${error.message}). Starting empty.`);
      try {
        localStorage.setItem(corruptKey, raw);
        logger.error(`The unreadable value was kept under "${corruptKey}".`);
      } catch (backupError) {
        // Out of quota, most likely. Nothing to do but say so - the alternative is
        // failing to start at all, which is what this whole guard exists to avoid.
        logger.error(`It could not be backed up either: ${backupError.message}`);
      }
      return {};
    }
  }

  /**
   * Builds the one live view over both halves. A single instance-lifetime Proxy,
   * not one per access: its traps close over `self` and read `self.#hot`/`self.#cold`
   * dynamically, so a later `set json(...)` (which reassigns both fields) is picked
   * up automatically without rebuilding the proxy.
   */
  #buildJsonProxy() {
    const self = this;
    return new Proxy(
      {},
      {
        get(_target, prop) {
          if (typeof prop !== "string") return undefined;
          return (COLD_FIELDS.has(prop) ? self.#cold : self.#hot)[prop];
        },
        set(_target, prop, value) {
          if (typeof prop === "string") {
            if (COLD_FIELDS.has(prop)) {
              self.#cold[prop] = value;
              self.#coldDirty = true;
            } else {
              self.#hot[prop] = value;
            }
          }
          return true;
        },
        has(_target, prop) {
          return typeof prop === "string" && prop in (COLD_FIELDS.has(prop) ? self.#cold : self.#hot);
        },
        deleteProperty(_target, prop) {
          if (typeof prop === "string") {
            if (COLD_FIELDS.has(prop)) {
              delete self.#cold[prop];
              self.#coldDirty = true;
            } else {
              delete self.#hot[prop];
            }
          }
          return true;
        },
        ownKeys() {
          return [...Object.keys(self.#hot), ...Object.keys(self.#cold)];
        },
        getOwnPropertyDescriptor(_target, prop) {
          if (typeof prop !== "string") return undefined;
          const source = COLD_FIELDS.has(prop) ? self.#cold : self.#hot;
          if (!Object.prototype.hasOwnProperty.call(source, prop)) return undefined;
          return { value: source[prop], writable: true, enumerable: true, configurable: true };
        },
      }
    );
  }

  #saveHot() {
    // Every setter writes its whole half. That is the documented contract (a setter
    // must be durable the moment it returns), but it also means the cost of one
    // write scales with the size of that half - which is why the profiler tracks
    // the count and the size, not just the time, and why the cold half (dominated
    // by spies) lives apart from this one.
    const at = perf.isEnabled() ? performance.now() : 0;
    const raw = JSON.stringify(this.#hot);
    localStorage.setItem(hotStorageKey, raw);
    perf.accumulate("ogk-data save", perf.isEnabled() ? performance.now() - at : 0, raw.length);
  }

  #saveCold() {
    const at = perf.isEnabled() ? performance.now() : 0;
    const raw = JSON.stringify(this.#cold);
    localStorage.setItem(coldStorageKey, raw);
    perf.accumulate("ogk-history save", perf.isEnabled() ? performance.now() - at : 0, raw.length);
    this.#coldDirty = false;
  }

  /**
   * The escape hatch for in-place mutation. Always flushes the hot half - it is
   * small and every one of the ~80 call sites expects this to be durable - but the
   * cold half only when something actually marked it dirty, so a call that never
   * touched a cold field (the boot-path `updateProductionProgress()`, notably)
   * does not pay to re-serialize the history it never changed.
   */
  Save() {
    this.#saveHot();
    if (this.#coldDirty) this.#saveCold();
  }
}

export default new OGBIData();
