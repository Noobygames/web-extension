/**
 * The options store. Every feature reads through `getOption` / the proxy, and
 * the proxy is what protects the option set from typos - a misspelt key must
 * not silently create a new option that nothing ever reads.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser, importFresh } from "../helpers/globals.js";

async function withOptions(run) {
  const browser = setupBrowser();
  try {
    await run(await importFresh("src/ctxpage/conf-options.js"));
  } finally {
    browser.cleanup();
  }
}

test("defaults are available before initConfOptions runs", async () => {
  await withOptions(({ getOption }) => {
    assert.equal(getOption("fret"), 202);
    assert.equal(getOption("rvalLimit"), 1e6);
    assert.equal(getOption("expeditionMission"), 15);
    assert.deepEqual(getOption("tradeRate"), [2.5, 1.5, 1, 0]);
  });
});

test("getOption returns undefined for an unknown option", async () => {
  await withOptions(({ getOption }) => {
    assert.equal(getOption("thisDoesNotExist"), undefined);
  });
});

test("initConfOptions merges stored options over the defaults", async () => {
  await withOptions(({ initConfOptions, getOption }) => {
    initConfOptions({ fret: 203, rvalLimit: 5e6 });

    assert.equal(getOption("fret"), 203);
    assert.equal(getOption("rvalLimit"), 5e6);
    assert.equal(getOption("expeditionMission"), 15, "untouched defaults survive");
  });
});

test("initConfOptions tolerates undefined", async () => {
  await withOptions(({ initConfOptions, getOption }) => {
    initConfOptions(undefined);
    assert.equal(getOption("fret"), 202);
  });
});

test("initConfOptions deep-merges the nested expedition block", async () => {
  await withOptions(({ initConfOptions, getOption }) => {
    initConfOptions({ expedition: { cargoShip: 203 } });

    const expedition = getOption("expedition");
    assert.equal(expedition.cargoShip, 203, "the stored value wins");
    assert.equal(expedition.standardFleetId, 0, "sibling defaults are kept");
    assert.ok("rotation" in expedition);
  });
});

test("initConfOptions deep-merges collect and customMissions too", async () => {
  await withOptions(({ initConfOptions, getOption }) => {
    initConfOptions({ collect: { mission: 4 } });

    assert.equal(getOption("collect").mission, 4);
    assert.ok(getOption("collect").target, "the default target object survives");
    assert.ok(getOption("customMissions"));
  });
});

test("the options proxy exposes declared options", async () => {
  await withOptions(({ getOptions }) => {
    const options = getOptions();

    assert.equal(options.fret, 202);
    assert.ok("rvalLimit" in options);
    assert.ok(Object.keys(options).includes("spyFilter"));
  });
});

test("the proxy rejects writes to undeclared options", async () => {
  await withOptions(({ getOptions, getOption }) => {
    const options = getOptions();

    // The handler returns false, which is a TypeError in strict mode.
    assert.throws(() => {
      options.definitelyNotAnOption = 1;
    }, TypeError);
    assert.equal(getOption("definitelyNotAnOption"), undefined);
  });
});

test("the proxy accepts writes to declared options", async () => {
  await withOptions(({ getOptions, getOption }) => {
    getOptions().fret = 203;
    assert.equal(getOption("fret"), 203);
  });
});

test("the proxy refuses deletion", async () => {
  await withOptions(({ getOptions }) => {
    assert.throws(() => {
      delete getOptions().fret;
    }, /Not allowed to delete/);
  });
});

test("the proxy refuses defining new properties", async () => {
  await withOptions(({ getOptions }) => {
    assert.throws(() => Object.defineProperty(getOptions(), "brandNew", { value: 1 }), /Not allowed to define/);
  });
});

test("reading an undeclared option through the proxy yields undefined", async () => {
  await withOptions(({ getOptions }) => {
    assert.equal(getOptions().nope, undefined);
  });
});

test("the proxy survives JSON.stringify", async () => {
  await withOptions(({ getOptions }) => {
    // The handler special-cases `toJSON` for exactly this reason.
    const json = JSON.parse(JSON.stringify(getOptions()));
    assert.equal(json.fret, 202);
    assert.deepEqual(json.tradeRate, [2.5, 1.5, 1, 0]);
  });
});

test("setOption bypasses the proxy guard and can create options", async () => {
  await withOptions(({ setOption, getOption }) => {
    // Documented behaviour: setOption writes to the raw target, so unlike the
    // proxy it will happily introduce a new key.
    setOption("brandNewOption", 42);
    assert.equal(getOption("brandNewOption"), 42);
  });
});

test("option changes are visible through every accessor", async () => {
  await withOptions(({ setOption, getOption, getOptions }) => {
    setOption("fret", 203);

    assert.equal(getOption("fret"), 203);
    assert.equal(getOptions().fret, 203);
  });
});
