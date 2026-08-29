import { isUniverseExpired, setUniverseExpirationTTL } from "../services/universe.expirations.js";
import { universeStorageOperator, universeStorageSupplier } from "../services/universe.storage.js";
import { requestOGameServerData } from "../services/request.ogameServerData.js";

const STORAGE_KEY = "serverData";

/** 24 hours - the same window `OGBeyondInfinity.updateServerSettings()` throttled itself to. */
const TTL_MS = 24 * 3600 * 1000;

/**
 * Fetches `serverData.xml`, cached in `chrome.storage.local` per universe, and hands
 * back the raw XML text.
 *
 * Text, not a parsed `Document` or the field map this module used to build: a `Document`
 * cannot cross the content/page bridge (`util/service.callbackEvent.js`) - only
 * structured-cloneable values can - and every consumer today is
 * `OGBeyondInfinity.updateServerSettings()` in the page context, which already has
 * ~150 lines of `Number()` / `== 1` field extraction that this deliberately leaves
 * untouched rather than re-deriving. Reached through the `serverData.get` bridge
 * command registered in `ctxcontent/index.js`.
 *
 * A fixed TTL rather than the HTTP `Expires` header `FetchResponse.expires` exposes:
 * whether `serverData.xml` actually sends that header cannot be verified offline, and
 * a missing header would silently turn the cache into "always expired" - worse than
 * the throttle it replaces. 24 hours matches what the page-context caller already
 * proved out.
 *
 * @param {string} universe
 * @param {boolean} [force]
 * @return {Promise<string>}
 */
export async function getServerDataXml(universe, force = false) {
  if (!force && !(await isUniverseExpired(universe, STORAGE_KEY))) {
    const cached = await universeStorageSupplier(universe, STORAGE_KEY)();
    if (cached !== undefined) return cached;
  }

  const response = await requestOGameServerData(universe);
  const xml = new XMLSerializer().serializeToString(response.document);

  await universeStorageOperator(universe, STORAGE_KEY)(xml);
  await setUniverseExpirationTTL(universe, STORAGE_KEY, TTL_MS);

  return xml;
}
