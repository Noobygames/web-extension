/**
 * `DataHelper.update()` - the once-per-page-load hydration of the public-API snapshot.
 *
 * Before the TTL this had a 1-minute in-memory throttle, which meant every page load past
 * that minute re-fetched 12 XML documents (players, universe, alliances and 9 highscore
 * categories). AGENTS.md 6 asks for the opposite: these files are regenerated on a fixed
 * schedule, so cache them and respect the interval.
 *
 * The failure this guards against is silent in both directions - too many requests looks
 * exactly like the right number from inside the extension, and a TTL set on a failed
 * fetch would leave the universe empty for 12 hours with nothing in the log.
 *
 * Closes the `update()` gap named in docs/testing.md. Content-context module, so
 * `setupBrowser({chrome: true})`.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const PLAYERS_XML = '<players timestamp="1700000000"><player id="7" name="Sleeper" status="i"/></players>';
const UNIVERSE_XML = '<universe timestamp="1700000000"><planet id="1" player="7" coords="1:150:4"/></universe>';
const ALLIANCES_XML = "<alliances></alliances>";

/**
 * The highscore parser keys its result off the root's own `category`/`type` attributes,
 * not off the URL, so the fixture has to echo back what was asked for - a fixed body
 * would land every category under the same key and leave `points` undefined.
 */
function highscoreXml(url) {
  const params = new URL(url).searchParams;
  return (
    `<highscore category="${params.get("category")}" type="${params.get("type")}">` +
    '<player id="7" position="1" score="1000" ships="42"/>' +
    "</highscore>"
  );
}

function bodyFor(url) {
  if (url.includes("players.xml")) return PLAYERS_XML;
  if (url.includes("universe.xml")) return UNIVERSE_XML;
  if (url.includes("highscore.xml")) return highscoreXml(url);
  return ALLIANCES_XML;
}

async function withHelper(run) {
  const browser = setupBrowser({ chrome: true });
  const requests = [];
  const savedFetch = globalThis.fetch;
  globalThis.fetch = (input) => {
    const url = String(input);
    requests.push(url);
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(bodyFor(url)),
      headers: new globalThis.window.Headers(),
    });
  };

  try {
    const { DataHelper } = await import("../../src/ctxcontent/data-helper.js");
    const helper = new DataHelper("s101-en");
    await helper.init();
    await run(helper, requests);
  } finally {
    globalThis.fetch = savedFetch;
    browser.cleanup();
  }
}

/** How many distinct API documents one refresh pulls: players + universe + alliances + 9 highscores. */
const DOCUMENTS_PER_REFRESH = 12;

test("the first update fetches the whole API snapshot", async () => {
  await withHelper(async (helper, requests) => {
    const refreshed = await helper.update();

    assert.equal(refreshed, true);
    assert.equal(requests.length, DOCUMENTS_PER_REFRESH);
    assert.equal(helper.players[7].name, "Sleeper");
  });
});

test("a second update inside the TTL fetches nothing and says so", async () => {
  await withHelper(async (helper, requests) => {
    await helper.update();
    const refreshed = await helper.update();

    assert.equal(refreshed, false);
    assert.equal(requests.length, DOCUMENTS_PER_REFRESH);
  });
});

test("the TTL persists, so a fresh DataHelper for the same universe skips the fetch too", async () => {
  await withHelper(async (helper, requests) => {
    await helper.update();

    // A second page load: same storage, a brand-new instance carrying the cached snapshot
    // back in the way `ctxcontent/index.js` restores it from the `[UNIVERSE]` blob.
    const { DataHelper } = await import("../../src/ctxcontent/data-helper.js");
    const reloaded = Object.assign(new DataHelper("s101-en"), { players: helper.players });
    await reloaded.init();

    assert.equal(await reloaded.update(), false);
    assert.equal(requests.length, DOCUMENTS_PER_REFRESH);
  });
});

test("force bypasses the TTL", async () => {
  await withHelper(async (helper, requests) => {
    await helper.update();
    const refreshed = await helper.update(true);

    assert.equal(refreshed, true);
    assert.equal(requests.length, DOCUMENTS_PER_REFRESH * 2);
  });
});

/**
 * The expiration key and the `[UNIVERSE]` blob are separate storage keys, so one can
 * disappear without the other. A live TTL over an empty snapshot would leave the
 * extension with no universe at all until it expires.
 */
test("a live TTL over a missing snapshot refetches rather than serving nothing", async () => {
  await withHelper(async (helper, requests) => {
    await helper.update();
    helper.players = {};

    assert.equal(await helper.update(), true);
    assert.equal(requests.length, DOCUMENTS_PER_REFRESH * 2);
  });
});

test("a failed fetch does not arm the TTL, so the next page load retries", async () => {
  await withHelper(async (helper, requests) => {
    const working = globalThis.fetch;
    globalThis.fetch = () => Promise.reject(new Error("offline"));

    assert.equal(await helper.update(), false);

    globalThis.fetch = working;
    const before = requests.length;

    assert.equal(await helper.update(), true);
    assert.equal(requests.length, before + DOCUMENTS_PER_REFRESH);
  });
});

test("a concurrent update is dropped rather than doubling the requests", async () => {
  await withHelper(async (helper, requests) => {
    const [first, second] = await Promise.all([helper.update(), helper.update()]);

    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(requests.length, DOCUMENTS_PER_REFRESH);
  });
});
