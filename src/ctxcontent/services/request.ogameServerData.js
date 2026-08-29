import { fetchXml } from "../../platform/fetch.js";

/**
 * @param {string} universe
 * @return {Promise<FetchResponse<Document>>}
 */
export function requestOGameServerData(universe) {
  const url = new URL(`https://${universe}.ogame.gameforge.com/api/serverData.xml`);
  return fetchXml(url, { method: "GET" });
}
