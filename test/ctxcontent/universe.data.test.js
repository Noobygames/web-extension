/**
 * `getServerDataXml()` - the content-context cache in front of `serverData.xml`.
 *
 * Written for refactoring-new.md Phase A.3: this module used to build a parsed
 * `UniverseResponse` (with a `toLifeforms()` that was a permanent stub, and the same
 * `doc.childNodes` whitespace bug fixed elsewhere in Phase A.2 #7) that nothing in
 * the extension ever imported - a dead, unreachable duplicate of the live
 * `serverData.xml` fetch in `OGBeyondInfinity.updateServerSettings()`. It is rewired
 * now: this function fetches and caches the raw XML text, and
 * `updateServerSettings()` reaches it through the `serverData.get` bridge command
 * (`ctxcontent/index.js`) instead of fetching directly, so a second tab within the
 * 24h TTL costs nothing.
 *
 * A fixed TTL, not the HTTP `Expires` header the old code trusted
 * (`FetchResponse.expires`): whether `serverData.xml` actually sends that header
 * cannot be verified here, and if it doesn't, `setUniverseExpiration()` would have
 * been handed `-1` and the cache would silently never hit.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const SERVER_DATA_XML =
  '<?xml version="1.0" encoding="UTF-8"?><serverData timestamp="1700000000"><name>Quantum</name></serverData>';

async function withUniverse(run) {
  const browser = setupBrowser({ chrome: true });
  const requests = [];
  const savedFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    requests.push({ url: String(input), init });
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(SERVER_DATA_XML),
      headers: new globalThis.window.Headers(),
    });
  };
  try {
    const { getServerDataXml } = await import("../../src/ctxcontent/helpers/universe.data.js");
    await run(getServerDataXml, requests);
  } finally {
    globalThis.fetch = savedFetch;
    browser.cleanup();
  }
}

/**
 * `XMLSerializer` does not re-emit the `<?xml ...?>` declaration DOMParser stripped
 * on the way in - it was never part of the parsed node tree - so the round-tripped
 * text is not byte-identical to the input. `DOMParser.parseFromString()` on the page
 * side, which is what actually consumes this, does not care either way; asserting on
 * a field survives the round trip is the meaningful check.
 */
function timestampOf(xml) {
  return new DOMParser().parseFromString(xml, "text/xml").documentElement.getAttribute("timestamp");
}

test("the first call fetches and caches", async () => {
  await withUniverse(async (getServerDataXml, requests) => {
    const xml = await getServerDataXml("s101-en");

    assert.equal(timestampOf(xml), "1700000000");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://s101-en.ogame.gameforge.com/api/serverData.xml");
  });
});

test("a second call within the TTL is served from the cache, no second fetch", async () => {
  await withUniverse(async (getServerDataXml, requests) => {
    await getServerDataXml("s101-en");
    const xml = await getServerDataXml("s101-en");

    assert.equal(timestampOf(xml), "1700000000");
    assert.equal(requests.length, 1, "the second call must not hit the network");
  });
});

test("force bypasses the cache even within the TTL", async () => {
  await withUniverse(async (getServerDataXml, requests) => {
    await getServerDataXml("s101-en");
    await getServerDataXml("s101-en", true);

    assert.equal(requests.length, 2, "force must always fetch fresh");
  });
});

test("different universes are cached independently", async () => {
  await withUniverse(async (getServerDataXml, requests) => {
    await getServerDataXml("s101-en");
    await getServerDataXml("s205-de");

    assert.equal(requests.length, 2);
    assert.equal(requests[1].url, "https://s205-de.ogame.gameforge.com/api/serverData.xml");
  });
});
