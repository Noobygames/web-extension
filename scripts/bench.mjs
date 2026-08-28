/**
 * Micro-benchmarks for the extension's hot paths.
 *
 * These are not a substitute for profiling in the real game, but they make the cost of the
 * repeated work visible and give a before/after number for each optimisation.
 *
 *   node scripts/bench.mjs            run everything
 *   node scripts/bench.mjs flight     run only benchmarks whose name matches
 */
import { JSDOM } from "jsdom";

const filter = process.argv[2];
const results = [];

function bench(name, iterations, fn) {
  if (filter && !name.toLowerCase().includes(filter.toLowerCase())) return;

  fn(); // warm up, so the first call's JIT cost is not attributed to the measurement
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn();
  const nanos = Number(process.hrtime.bigint() - start);

  results.push({ name, iterations, totalMs: nanos / 1e6, perOpUs: nanos / iterations / 1000 });
}

/** A page roughly the size of an OGame overview: planet bar, resource bar, event list. */
function buildPage({ planets = 12, events = 40, buttons = 8 } = {}) {
  const planetRows = Array.from(
    { length: planets },
    (_, i) => `
      <div id="planet-${i}" class="smallplanet">
        <a class="planetlink ${i === 0 ? "active" : ""}"><span class="planet-koords">[1:${i + 1}:8]</span></a>
        <a class="moonlink"><span class="icon-moon"></span></a>
      </div>`
  ).join("");

  const eventRows = Array.from(
    { length: events },
    (_, i) => `
      <tr class="eventFleet" id="eventRow-${i}" data-mission-type="3" data-arrival-time="170000${i}">
        <td class="coordsOrigin"><a>[1:2:${i % 15}]</a></td>
        <td class="destCoords"><a>[3:4:${i % 15}]</a></td>
        <td class="originFleet">Planet</td><td class="destFleet">Target</td>
      </tr>`
  ).join("");

  const buttonRow = Array.from(
    { length: buttons },
    (_, i) => `<button class="${i % 2 ? "upgrade" : "build-faster"}">go</button>`
  ).join("");

  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="planetbarcomponent">${planetRows}</div>
    <div id="eventContent"><table>${eventRows}</table></div>
    <div id="pageContent">${buttonRow}</div>
  </body></html>`);

  return dom.window.document;
}

// ---------------------------------------------------------------------------
// The 100ms button-wiring scan in ogCore.js
// ---------------------------------------------------------------------------

const SCAN_SELECTOR =
  ".scrap_it, .build-it_wrap, button.upgrade, button.buildmulti, .abortNow, .build-faster, .og-button.submit, .abort_link, .js_executeJumpButton";

{
  const document = buildPage();

  bench("button scan: querySelectorAll (runs 10x/second, forever)", 2000, () => {
    document.querySelectorAll(SCAN_SELECTOR).forEach((btn) => {
      if (!btn.classList.contains("ogk-ready")) btn.classList.add("ogk-ready");
    });
  });

  // What it costs once every element is already wired - i.e. the steady state, which is
  // what actually runs for the whole session.
  bench("button scan: steady state, everything already wired", 2000, () => {
    document.querySelectorAll(SCAN_SELECTOR).forEach((btn) => {
      if (!btn.classList.contains("ogk-ready")) btn.classList.add("ogk-ready");
    });
  });
}

// ---------------------------------------------------------------------------
// calcNeededShips - called 4x per spy report while a message list renders
// ---------------------------------------------------------------------------

{
  // A realistic ogk-data blob for an established account.
  const blob = JSON.stringify({
    options: { fret: 203 },
    ships: { 202: { cargoCapacity: 5000 }, 203: { cargoCapacity: 25000 } },
    empire: Array.from({ length: 12 }, (_, i) => ({ id: i, metal: 1e6, crystal: 5e5, deuterium: 2e5 })),
    spies: Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [i, { coords: "1:2:3", total: 1e6 }])),
    expeditions: Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [i, { metal: 1e5 }])),
  });

  console.log(`(ogk-data blob used below: ${(blob.length / 1024).toFixed(0)} KB)`);

  bench("store: JSON.parse of the whole blob (the old per-call cost)", 2000, () => JSON.parse(blob));

  const parsed = JSON.parse(blob);
  bench("store: reading the already-parsed object (the new cost)", 200000, () => parsed.ships[203].cargoCapacity);
}

// ---------------------------------------------------------------------------
// Flight maths (Feature A) - runs once per spy report, on every table render
// ---------------------------------------------------------------------------

{
  const { distance, flightDuration } = await import("../src/util/fleetFlight.js");
  const { evaluateTarget } = await import("../src/util/farmEvaluator.js");

  const origins = Array.from({ length: 12 }, (_, i) => ({ galaxy: 1, system: i * 20 + 1, position: 8 }));
  const target = { galaxy: 3, system: 250, position: 6 };
  const universe = { galaxies: 9, systems: 499, donutGalaxy: true, donutSystem: true };

  bench("flight: distance()", 200000, () => distance(origins[0], target, universe));
  bench("flight: flightDuration()", 200000, () => flightDuration({ distance: 2795, shipSpeed: 7500 }));
  bench("farm: evaluateTarget() over 12 origins", 20000, () =>
    evaluateTarget({ target, origins, loot: 1e6, shipSpeed: 7500, universe })
  );
  bench("farm: 50-report table sort", 2000, () => {
    const reports = Array.from({ length: 50 }, (_, i) => ({
      target: { galaxy: (i % 9) + 1, system: i * 7 + 1, position: (i % 15) + 1 },
      loot: 1e6 - i * 1000,
    }));
    reports
      .map((r) => evaluateTarget({ ...r, origins, shipSpeed: 7500, universe }))
      .sort((a, b) => b.profitPerHour - a.profitPerHour);
  });
}

// ---------------------------------------------------------------------------
// Target claims (Feature E) - runs on every galaxy page change
// ---------------------------------------------------------------------------

{
  const { indexClaims, claimStatus } = await import("../src/util/targetClaims.js");

  const claims = Array.from({ length: 500 }, (_, i) => ({
    coords: `${(i % 9) + 1}:${i}:${(i % 15) + 1}`,
    playerId: 100 + (i % 20),
    date: Date.now() / 1000 - i * 60,
  }));

  bench("claims: indexClaims() over 500 entries", 2000, () => indexClaims(claims));

  const index = indexClaims(claims);
  bench("claims: claimStatus() for 15 galaxy rows", 20000, () => {
    for (let position = 1; position <= 15; position++) {
      claimStatus({ coordinates: `1:1:${position}`, claims: index, ownPlayerId: 101 });
    }
  });
}

// ---------------------------------------------------------------------------
// Harvest planning (Feature B) - runs when the Empire tab opens
// ---------------------------------------------------------------------------

{
  const { planHarvest } = await import("../src/util/harvestPlanner.js");

  const planets = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    name: `Planet ${i}`,
    coordinates: `[1:${i + 1}:8]`,
    resources: { metal: 1e6, crystal: 5e5, deuterium: 2e5 },
    ships: { 202: 100, 203: 200, 219: 50 },
  }));

  bench("harvest: planHarvest() over 20 planets", 20000, () =>
    planHarvest({ planets, bankCoordinates: "[1:1:8]", capacities: { 202: 5000, 203: 25000, 219: 10000 } })
  );
}

// ---------------------------------------------------------------------------

const width = Math.max(...results.map((r) => r.name.length));
console.log("");
for (const r of results) {
  console.log(
    `${r.name.padEnd(width)}  ${r.perOpUs.toFixed(3).padStart(10)} us/op   ${r.totalMs.toFixed(1).padStart(8)} ms / ${
      r.iterations
    }`
  );
}
console.log("");
