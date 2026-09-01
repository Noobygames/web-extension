import { pageContextRequest } from "../platform/bridge.js";

/**
 * The page-context half of the bridge to the universe database in the content script.
 *
 * `getPlayer` and `filter` still ride the legacy `ogi-players` / `ogi-filter`
 * CustomEvent pairs (see the "Crossing the boundary" section of CLAUDE.md - new calls
 * use the typed bridge instead); `getExpeditionType` already goes through
 * `pageContextRequest`.
 *
 * Lifted out of `ogCore.js` in Phase 3 of refactoring.md, unchanged. It was a
 * file-local `var`, which meant every page module that needed a player record had to
 * be inside the monolith to reach it.
 */
const dataHelper = (function () {
  var requestId = 0;

  function expedition(message) {
    let rid = requestId++;
    return pageContextRequest("messages", "expeditionType", message).then((value) => value.response.type);
  }

  function Get(id) {
    let rid = requestId++;
    return new Promise(function (resolve, reject) {
      var listener = function (evt) {
        if (evt.detail.requestId == rid) {
          window.removeEventListener("ogi-players-rep", listener);
          resolve(evt.detail.player);
        }
      };
      window.addEventListener("ogi-players-rep", listener);
      var payload = { requestId: rid, id: id };
      window.dispatchEvent(new CustomEvent("ogi-players", { detail: payload }));
    });
  }

  /**
   * Inactive players in the given galaxies, out of the universe database the content
   * script already caches. Read-only display data for the raid list's radar tab - it
   * triggers no fetch and no game action (AGENTS.md 1.5.1 / 4).
   *
   * @param {Array<number|string>} galaxies
   * @return {Promise<Array<{playerId: number, name: string, status: string, coords: string, moon: boolean}>>}
   */
  function inactiveTargets(galaxies) {
    return pageContextRequest("universe", "inactives", galaxies).then((value) => value.response);
  }

  function filter(name, alliance) {
    let rid = requestId++;
    return new Promise(function (resolve, reject) {
      var listener = function (evt) {
        if (evt.detail.requestId == rid) {
          window.removeEventListener("ogi-filter-rep", listener);
          resolve(evt.detail.players);
        }
      };
      window.addEventListener("ogi-filter-rep", listener);
      var payload = { requestId: rid, name: name, alliance: alliance };
      window.dispatchEvent(new CustomEvent("ogi-filter", { detail: payload }));
    });
  }

  return { getExpeditionType: expedition, getPlayer: Get, filter: filter, getInactiveTargets: inactiveTargets };
})();

export default dataHelper;
