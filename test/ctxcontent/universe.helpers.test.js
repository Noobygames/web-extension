/**
 * Parsers for the OGame universe API (`/api/*.xml`).
 *
 * These run in the content context, turn XML into the Maps the DataHelper is
 * built on, and have no test surface of their own in the app - a parsing
 * regression only shows up as an empty sidebar.
 *
 * `fetch` is stubbed so the suite never touches the network.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser, importFresh } from "../helpers/globals.js";

/** Installs a fetch stub returning the given XML for every request. */
function stubFetchXml(xml, headers = {}, { status = 200 } = {}) {
  const requests = [];
  globalThis.fetch = (input, init) => {
    requests.push({ url: String(input), init });
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(xml),
      headers: new globalThis.window.Headers(headers),
    });
  };
  return requests;
}

async function withUniverse(xml, run, headers, fetchOptions) {
  const browser = setupBrowser({ chrome: true });
  try {
    const requests = stubFetchXml(xml, headers, fetchOptions);
    await run(requests, browser);
  } finally {
    delete globalThis.fetch;
    browser.cleanup();
  }
}

// Minified, exactly like the real API serves it - see the whitespace test below.
const PLANETS_XML =
  '<?xml version="1.0" encoding="UTF-8"?><universe timestamp="1700000000">' +
  '<planet id="33701001" player="101" name="Homeworld" coords="1:2:3"><moon id="33801001" name="Moon" size="8500"/></planet>' +
  '<planet id="33701002" player="101" name="Colony" coords="1:2:4"/>' +
  '<planet id="33701003" player="102" name="Enemy" coords="4:250:8"/>' +
  "</universe>";

const PLAYERS_XML =
  '<?xml version="1.0" encoding="UTF-8"?><players timestamp="1700000000">' +
  '<player id="101" name="Xtro" status="" alliance="7"/>' +
  '<player id="102" name="bfromb" status="i"/>' +
  '<player id="103" name="Cenetonne" status="vI" alliance="7"/>' +
  "</players>";

const ALLIANCES_XML =
  '<?xml version="1.0" encoding="UTF-8"?><alliances timestamp="1700000000">' +
  '<alliance id="7" name="Test Alliance" tag="TA"><player id="101"/><player id="103"/></alliance>' +
  '<alliance id="8" name="Empty" tag="EMP"/>' +
  "</alliances>";

// --------------------------------------------------------------------------
// planets
// --------------------------------------------------------------------------

test("planets are grouped by player id", async () => {
  await withUniverse(PLANETS_XML, async () => {
    const { getPlanets } = await importFresh("src/ctxcontent/parsers/universe.planets.js");
    const snapshot = await getPlanets("s101-en");
    const planets = snapshot.planets;

    assert.ok(planets instanceof Map);
    assert.deepEqual([...planets.keys()], [101, 102]);
    assert.equal(planets.get(101).length, 2);
    assert.equal(planets.get(102).length, 1);
  });
});

test("planet fields are parsed with the right types", async () => {
  await withUniverse(PLANETS_XML, async () => {
    const { getPlanets } = await importFresh("src/ctxcontent/parsers/universe.planets.js");
    const [homeworld, colony] = (await getPlanets("s101-en")).planets.get(101);

    assert.deepEqual(homeworld, {
      id: 33701001,
      player: 101,
      name: "Homeworld",
      coords: "1:2:3",
      moon: 33801001,
    });
    assert.equal(colony.moon, 0, "a planet without a moon reports 0");
    assert.equal(typeof colony.id, "number");
  });
});

test("the planets request targets the universe API of the right universe", async () => {
  await withUniverse(PLANETS_XML, async (requests) => {
    const { getPlanets } = await importFresh("src/ctxcontent/parsers/universe.planets.js");
    await getPlanets("s205-de");

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://s205-de.ogame.gameforge.com/api/universe.xml");
    assert.equal(requests[0].init.method, "GET");
    assert.ok(requests[0].init.signal, "requests must be abortable on page unload");
  });
});

test("an empty universe yields an empty map", async () => {
  await withUniverse('<?xml version="1.0"?><universe timestamp="1"/>', async () => {
    const { getPlanets } = await importFresh("src/ctxcontent/parsers/universe.planets.js");
    assert.equal((await getPlanets("s101-en")).planets.size, 0);
  });
});

test("the snapshot exposes a flat planet list and the universe.xml timestamp", async () => {
  await withUniverse(PLANETS_XML, async () => {
    const { getPlanets } = await importFresh("src/ctxcontent/parsers/universe.planets.js");
    const snapshot = await getPlanets("s101-en");

    // galaxyStorage is built from the flat list, not from the per-player map
    assert.ok(Array.isArray(snapshot.planetList));
    assert.equal(snapshot.planetList.length, 3);
    assert.deepEqual(
      snapshot.planetList.map((planet) => planet.coords),
      ["1:2:3", "1:2:4", "4:250:8"]
    );
    // rebuildGalaxyStorage() gates on this timestamp, so it must survive parsing
    assert.equal(snapshot.timestamp, 1700000000);
  });
});

test("a universe.xml without a timestamp reports -1 rather than NaN", async () => {
  await withUniverse('<?xml version="1.0"?><universe/>', async () => {
    const { getPlanets } = await importFresh("src/ctxcontent/parsers/universe.planets.js");
    const snapshot = await getPlanets("s101-en");

    // -1 keeps the `newTs <= previousTs` guard in rebuildGalaxyStorage() meaningful
    assert.equal(snapshot.timestamp, -1);
  });
});

// --------------------------------------------------------------------------
// players
// --------------------------------------------------------------------------

test("players are indexed by id", async () => {
  await withUniverse(PLAYERS_XML, async () => {
    const { getPlayers } = await importFresh("src/ctxcontent/parsers/universe.players.js");
    const players = await getPlayers("s101-en");

    assert.deepEqual([...players.keys()], [101, 102, 103]);
    assert.equal(players.get(101).name, "Xtro");
  });
});

test("a player without an alliance attribute gets null, not NaN", async () => {
  await withUniverse(PLAYERS_XML, async () => {
    const { getPlayers } = await importFresh("src/ctxcontent/parsers/universe.players.js");
    const players = await getPlayers("s101-en");

    assert.equal(players.get(101).alliance, 7);
    assert.equal(players.get(102).alliance, null);
  });
});

test("player status is preserved verbatim", async () => {
  await withUniverse(PLAYERS_XML, async () => {
    const { getPlayers } = await importFresh("src/ctxcontent/parsers/universe.players.js");
    const players = await getPlayers("s101-en");

    assert.equal(players.get(101).status, "", "active player");
    assert.equal(players.get(102).status, "i", "inactive");
    assert.equal(players.get(103).status, "vI", "vacation + long inactive");
  });
});

test("DEFAULT_PLAYER is the placeholder used for unknown players", async () => {
  const browser = setupBrowser({ chrome: true });
  try {
    const { DEFAULT_PLAYER } = await importFresh("src/ctxcontent/parsers/universe.players.js");
    assert.deepEqual(DEFAULT_PLAYER, { name: "<?>", alliance: null, status: "", id: -1 });
  } finally {
    browser.cleanup();
  }
});

// --------------------------------------------------------------------------
// alliances
// --------------------------------------------------------------------------

test("alliances are indexed by id and carry their member list", async () => {
  await withUniverse(ALLIANCES_XML, async () => {
    const { getAlliances } = await importFresh("src/ctxcontent/parsers/universe.alliances.js");
    const { alliances } = await getAlliances("s101-en");

    assert.deepEqual(alliances.get(7), {
      id: 7,
      name: "Test Alliance",
      tag: "TA",
      players: [101, 103],
    });
    assert.deepEqual(alliances.get(8).players, [], "an alliance without members yields an empty list");
  });
});

test("the reverse player -> alliance index is built", async () => {
  await withUniverse(ALLIANCES_XML, async () => {
    const { getAlliances } = await importFresh("src/ctxcontent/parsers/universe.alliances.js");
    const { players } = await getAlliances("s101-en");

    assert.equal(players.get(101), 7);
    assert.equal(players.get(103), 7);
    assert.equal(players.get(102), undefined, "a player in no alliance must not appear");
  });
});

// --------------------------------------------------------------------------
// Known defects - see docs/testing.md.
// --------------------------------------------------------------------------

test("pretty-printed XML no longer breaks the parsers", async () => {
  // Fixed in refactoring-new.md Phase A.2 #7: all four parsers (planets, players,
  // alliances, highscore) iterated `doc.childNodes` and called `getAttribute()` on
  // every entry. Whitespace between elements is a text node, which has no
  // `getAttribute`, so the code only worked because the live API serves minified
  // XML - any proxy, cache or dev fixture that reformats the response broke it.
  // `doc.children` (and, for a planet's nested `<moon>`, `firstElementChild`
  // instead of `firstChild`) is Element-only and does not see whitespace.
  const prettyXml = `<?xml version="1.0" encoding="UTF-8"?>
<universe timestamp="1700000000">
  <planet id="33701001" player="101" name="Homeworld" coords="1:2:3">
    <moon id="33801001" name="Moon" size="8500"/>
  </planet>
  <planet id="33701002" player="102" name="Enemy" coords="4:250:8"/>
</universe>`;

  await withUniverse(prettyXml, async () => {
    const { getPlanets } = await importFresh("src/ctxcontent/parsers/universe.planets.js");
    const { planetList } = await getPlanets("s101-en");

    assert.equal(planetList.length, 2);
    assert.equal(planetList[0].id, 33701001);
    assert.equal(planetList[0].moon, 33801001, "the nested <moon> still resolves once whitespace is skipped");
    assert.equal(planetList[1].moon, 0, "a planet with no moon element stays 0, not a crash");
  });
});

test("an HTTP error response rejects instead of being parsed as if it were XML", async () => {
  // Fixed in refactoring-new.md Phase A.2 #7: fetchXml() checked neither
  // `response.ok` nor the `<parsererror>` node the DOM parser emits on invalid
  // input. A 500 page or an HTML error body used to be parsed anyway and only blow
  // up later, deep inside the mapping code, as a generic
  // "node.getAttribute is not a function" - and DataHelper.update() swallows that
  // in its catch block, so the universe data silently stayed stale with no signal
  // that the fetch itself had failed.
  await withUniverse(
    "<html><body>Service Unavailable</body></html>",
    async () => {
      const { getPlanets } = await importFresh("src/ctxcontent/parsers/universe.planets.js");

      await assert.rejects(
        () => getPlanets("s101-en"),
        (error) => /HTTP 503/.test(error.message)
      );
    },
    undefined,
    { status: 503 }
  );
});

test("a 200 response that is not valid XML rejects instead of being parsed anyway", async () => {
  await withUniverse("<<<not xml", async () => {
    const { getPlanets } = await importFresh("src/ctxcontent/parsers/universe.planets.js");

    await assert.rejects(
      () => getPlanets("s101-en"),
      (error) => /did not return valid XML/.test(error.message)
    );
  });
});
