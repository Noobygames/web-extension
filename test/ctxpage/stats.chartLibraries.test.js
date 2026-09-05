/**
 * Waiting for the chart libraries before drawing a chart.
 *
 * The bug this pins: `chart.min.js` and `chartjs-plugin-labels.js` arrive separately -
 * `ctxcontent/index.js` injects the plugin from the library's onload callback - and the
 * popup only ever waited for `Chart`. A chart built in the gap between the two is built
 * without the plugin, and Chart.js caches the plugin list per chart at update time, so
 * `beforeDatasetsUpdate` (which creates `chart._labels`) never runs for it. Registering
 * the plugin a moment later invalidates that cache, the doughnut's own open animation
 * draws another frame, and `afterDatasetsDraw` does `chart._labels.forEach(...)` on an
 * undefined:
 *
 *   Uncaught TypeError: Cannot read properties of undefined (reading 'forEach')
 *   libs/chartjs-plugin-labels.js:24
 *
 * The plugin registers into `Chart.plugins` and defines no global, so `Chart` being
 * there says nothing about it - which is exactly why the old wait looked complete.
 *
 * Page-context module - no `chrome: true` on setupBrowser.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const bootstrap = setupBrowser();
const { labelsPluginRegistered, chartLibrariesReady } = await import("../../src/ctxpage/stats/index.js");
bootstrap.cleanup();

/** Chart.js 2.9's plugin service: `getAll()` hands back the registered list. */
function chartStub(plugins = []) {
  return { plugins: { getAll: () => plugins, register: (plugin) => plugins.push(plugin) } };
}

function withPage(run) {
  const browser = setupBrowser();
  try {
    return run();
  } finally {
    delete globalThis.Chart;
    delete window.Chart;
    browser.cleanup();
  }
}

test("no Chart at all is not a registered plugin", () => {
  withPage(() => {
    assert.equal(labelsPluginRegistered(), false);
  });
});

test("Chart on its own is not a registered plugin either - this is the whole bug", () => {
  withPage(() => {
    window.Chart = chartStub();

    assert.equal(labelsPluginRegistered(), false, "the gap between the two scripts must be visible");
  });
});

test("a Chart carrying some other plugin still does not count", () => {
  withPage(() => {
    window.Chart = chartStub([{ id: "datalabels" }, {}, null]);

    assert.equal(labelsPluginRegistered(), false);
  });
});

test("the labels plugin registered is what the wait is for", () => {
  withPage(() => {
    window.Chart = chartStub([{ id: "labels" }]);

    assert.equal(labelsPluginRegistered(), true);
  });
});

test("a Chart from a version with no plugin service is handled, not thrown on", () => {
  withPage(() => {
    window.Chart = {};

    assert.equal(labelsPluginRegistered(), false);
  });
});

test("everything already there resolves without asking for an injection", async () => {
  const browser = setupBrowser();
  const dispatched = [];
  document.addEventListener("ogi-chart", () => dispatched.push("asked"));

  try {
    globalThis.Chart = chartStub([{ id: "labels" }]);
    window.Chart = globalThis.Chart;

    assert.equal(await chartLibrariesReady(), true);
    assert.deepEqual(dispatched, [], "the scripts are already on the page");
  } finally {
    delete globalThis.Chart;
    browser.cleanup();
  }
});

test("the wait continues past Chart until the plugin registers", async () => {
  const browser = setupBrowser();

  try {
    // The real sequence: the library lands first, the plugin a moment later.
    const plugins = [];
    globalThis.Chart = chartStub(plugins);
    window.Chart = globalThis.Chart;

    let resolved = false;
    const ready = chartLibrariesReady().then((value) => {
      resolved = true;
      return value;
    });

    await new Promise((done) => setTimeout(done, 40));
    assert.equal(resolved, false, "Chart alone must not end the wait - that is what drew the broken chart");

    globalThis.Chart.plugins.register({ id: "labels" });

    assert.equal(await ready, true);
  } finally {
    delete globalThis.Chart;
    browser.cleanup();
  }
});

test("a plugin that never arrives gives up rather than withholding the statistics", async () => {
  const browser = setupBrowser();

  try {
    globalThis.Chart = chartStub();
    window.Chart = globalThis.Chart;

    // Charts without their labels beat no statistics at all - and that is what the
    // old code shipped every single time.
    assert.equal(await chartLibrariesReady(), false);
  } finally {
    delete globalThis.Chart;
    browser.cleanup();
  }
});
