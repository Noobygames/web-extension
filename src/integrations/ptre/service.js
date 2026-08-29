import { getLogger } from "../../platform/logger.js";
import { pageSignal, isAbortError } from "../../platform/abort.js";

const logger = getLogger("service.ptre");

const PTRE_URL = "https://ptre.chez.gg/scripts/";

/**
 * @typedef {object} PtreResponse
 * @property {number} code
 * @property {string} message
 * @property {string} message_verbose
 * @property {string} message_debug
 */

/**
 * @param {URLSearchParams} params
 * @param {{[key:string]: any}} data
 * @return {URLSearchParams}
 * @private
 */
function _buildQueryString(params, data = undefined) {
  //const params = new URLSearchParams();
  params.set("tool", "infinity");
  if (data) {
    Object.entries(data).forEach((e) => params.set(e[0], String(e[1])));
  }
}

/**
 * @return {Promise<PtreResponse>}
 */
export function getPlayerInfos(country, universe, teamKey, cleanPlayerName, playerId, frame) {
  const url = new URL(PTRE_URL.concat("oglight_get_player_infos.php"));
  _buildQueryString(url.searchParams, {
    country: country,
    univers: universe,
    team_key: teamKey,
    pseudo: cleanPlayerName,
    player_id: playerId,
    input_frame: frame,
  });

  return fetch(url, {
    method: "GET",
    signal: pageSignal(),
    mode: "cors",
  })
    .then((response) => response.json())
    .catch((reason) => {
      // A page change aborting the request is expected, not a PTRE failure.
      if (!isAbortError(reason)) logger.error(reason);
      throw reason;
    });
}

/**
 * @return {Promise<PtreResponse>}
 */
export function updateGalaxy(country, universe, position) {
  const url = new URL(PTRE_URL.concat("api_galaxy_import_infos.php"));
  _buildQueryString(url.searchParams, {
    country: country,
    univers: universe,
  });

  return fetch(url, {
    method: "POST",
    body: JSON.stringify(position),
    signal: pageSignal(),
  })
    .then((response) => response.json())
    .catch((reason) => {
      // A page change aborting the request is expected, not a PTRE failure.
      if (!isAbortError(reason)) logger.error(reason);
      throw reason;
    })
    .then((data) => {
      if (data.code !== 1) {
        const msg = "Galaxy import error! ".concat(data.message);
        logger.error(msg);
        return Promise.reject(Error(msg));
      }
      return Promise.resolve(data);
    });
}

/**
 * @return {Promise<PtreResponse>}
 */
export function importPlayerActivity(country, universe, activity) {
  const url = new URL(PTRE_URL.concat("oglight_import_player_activity.php"));
  _buildQueryString(url.searchParams, {
    country: country,
    univers: universe,
  });

  return fetch(url, {
    method: "POST",
    body: JSON.stringify(activity),
    signal: pageSignal(),
  })
    .then((response) => response.json())
    .catch((reason) => {
      // A page change aborting the request is expected, not a PTRE failure.
      if (!isAbortError(reason)) logger.error(reason);
      throw reason;
    })
    .then((data) => {
      if (data.code !== 1) {
        const msg = "Import player activity error! ".concat(data.message);
        logger.error(msg);
        return Promise.reject(new Error(msg));
      }
      return Promise.resolve(data);
    });
}

/**
 * @return {Promise<PtreResponse>}
 */
export function importSpy(teamKey, reportKey) {
  const url = new URL(PTRE_URL.concat("oglight_import.php"));
  _buildQueryString(url.searchParams, {
    team_key: teamKey,
    sr_id: reportKey,
  });

  return fetch(url, {
    method: "GET",
    signal: pageSignal(),
  })
    .then((response) => response.json())
    .catch((reason) => {
      // A page change aborting the request is expected, not a PTRE failure.
      if (!isAbortError(reason)) logger.error(reason);
      throw reason;
    })
    .then((data) => {
      if (data.code !== 1) {
        const msg = "Import spy report error! ".concat(data.message);
        logger.error(msg);
        return Promise.reject(new Error(msg));
      }
      return Promise.resolve(data);
    });
}

/**
 * Targets recently hit by the player's own alliance, for the galaxy-view claim colours
 * (roadmap Feature E).
 *
 * Read-only, and gated on the team key the player entered themselves - no key, no call, so a
 * player who has not opted into PTRE never talks to it. Call this ONLY when a galaxy page is
 * loaded by the player; never on a timer or a loop (AGENTS.md section 4).
 *
 * @param {string} country
 * @param {string|number} universe
 * @param {string} teamKey
 * @param {number} galaxy
 * @param {number} system
 * @return {Promise<PtreResponse & {targets?: Array<object>}>}
 */
export function getGalaxyTargets(country, universe, teamKey, galaxy, system) {
  const url = new URL(PTRE_URL.concat("api_galaxy_get_infos.php"));
  _buildQueryString(url.searchParams, {
    country: country,
    univers: universe,
    team_key: teamKey,
    galaxy: galaxy,
    system: system,
  });

  return fetch(url, {
    method: "GET",
    signal: pageSignal(),
    mode: "cors",
  })
    .then((response) => response.json())
    .catch((reason) => {
      // A page change aborting the request is expected, not a PTRE failure.
      if (!isAbortError(reason)) logger.error(reason);
      throw reason;
    });
}
