import OGBIData from "./OGBIData.js";
import { isPlanetScoped } from "../game/technoIds.js";
import { upgradeCostRange } from "../game/upgradeCost.js";

/**
 * The player's own upgrade plans: which building or research to raise, from which
 * level to which, on which planet or moon.
 *
 * This replaces the single resource blob `needs` used to hold. That blob could say
 * "this moon is short 4M metal" and nothing else - not which upgrade wanted it, and
 * not that the upgrade had since been built. Keeping the entries structured is what
 * lets `reconcile()` drop a finished plan and shrink a half-finished one on its own.
 *
 * Shape, keyed by the *planet's* id (a moon lives in its planet's bucket, the way
 * `OGBIData.empire` nests them):
 *
 *   { "33627261": { planetId, coords, planet: SIDE, moon: SIDE } }
 *   SIDE  = { entries: ENTRY[], manual: { metal, crystal, deuterium } }
 *   ENTRY = { technoId, from, to, addedAt }        // from = the level already owned
 *
 * A technology appears at most once per side, so re-planning the same building
 * replaces its range rather than stacking a second row - the same idempotence
 * `store/raidPins.js` gives a pinned coordinate.
 *
 * Costs are deliberately NOT stored. They are recomputed from the live lifeform and
 * robotics bonuses every time they are read, so a plan made before a bonus changed
 * still shows what the upgrade costs today.
 *
 * On top of what the player planned, the rows include the orders already **submitted**
 * in game, read out of the empire data - see `submittedOrders()` for why the one that is
 * building costs nothing and the ones queued behind it do not.
 *
 * **This module must stay off the page entry.** Pricing needs `gameFormulas.js` and
 * both cost tables, ~93 KB, and `test/bundle.test.js` caps the entry - the file every
 * OGame page loads - at 520 000 bytes, with little to spare. So nothing the planet bar
 * imports may reach this file. The planet bar keeps reading plain resource totals out of
 * `OGBIData.needs`, and `ctxpage/upgradePlans/sync.js`, chunk-side where the tables are
 * loaded anyway, is what keeps that cache in step.
 *
 * Nothing here talks to the network or to the game; it reads `OGBIData` and writes
 * `OGBIData`. Planning an upgrade is a note to self - no request, no dispatch, no
 * scheduling (AGENTS.md 1.2, 1.3).
 */

/** @returns {object} the whole plan map; never null. */
export function getPlans() {
  return OGBIData.upgradePlans || {};
}

function emptySide() {
  return { entries: [], manual: {} };
}

function normalizeSide(side) {
  return {
    entries: Array.isArray(side?.entries) ? side.entries : [],
    manual: side?.manual && typeof side.manual === "object" ? side.manual : {},
  };
}

/** Strips the brackets `OGBIData.empire` stores coordinates with. */
function bareCoords(coords) {
  return String(coords || "").replace(/[[\]]/g, "");
}

/**
 * @param {string} coords `"1:234:5"`, with or without brackets
 * @returns {object|null} the planet's `OGBIData.empire` entry
 */
export function planetByCoords(coords) {
  const wanted = bareCoords(coords);

  for (const planet of OGBIData.empire || []) {
    if (bareCoords(planet.coordinates) === wanted) return planet;
  }

  return null;
}

/**
 * Reads one side of one plan. Returns an empty side rather than undefined so callers
 * can sum without guarding.
 *
 * @param {string} coords
 * @param {boolean} isMoon
 */
export function planFor(coords, isMoon) {
  const planet = planetByCoords(coords);
  if (!planet) return emptySide();

  return normalizeSide(getPlans()[planet.id]?.[isMoon ? "moon" : "planet"]);
}

/**
 * Applies `mutate` to one side of one plan and writes the result back through the
 * `OGBIData` setter.
 *
 * Everything is rebuilt rather than mutated in place: `OGBIData.upgradePlans` writes
 * through its setter, so changing the object it handed back would never reach storage
 * (see CLAUDE.md, "Two separate stores").
 */
function updateSide(coords, isMoon, mutate) {
  const planet = planetByCoords(coords);
  if (!planet) return getPlans();

  const plans = getPlans();
  const key = String(planet.id);
  const current = plans[key];
  const sideName = isMoon ? "moon" : "planet";

  const bucket = {
    planetId: planet.id,
    coords: bareCoords(planet.coordinates),
    planet: normalizeSide(current?.planet),
    moon: normalizeSide(current?.moon),
  };

  bucket[sideName] = mutate(bucket[sideName]);

  OGBIData.upgradePlans = { ...plans, [key]: bucket };

  return OGBIData.upgradePlans;
}

/**
 * Plans one upgrade. Re-planning the same technology on the same side replaces its
 * level range instead of adding a second row.
 *
 * @param {string} coords
 * @param {boolean} isMoon
 * @param {{technoId: number, from: number, to: number}} entry `from` is the level owned
 */
export function addEntry(coords, isMoon, entry) {
  const technoId = Number(entry?.technoId);
  const from = Math.max(0, Math.floor(Number(entry?.from) || 0));
  const to = Math.floor(Number(entry?.to) || 0);

  if (!technoId || to <= from) return getPlans();

  return updateSide(coords, isMoon, (side) => ({
    ...side,
    entries: [
      ...side.entries.filter((existing) => Number(existing.technoId) !== technoId),
      { technoId, from, to, addedAt: Date.now() },
    ],
  }));
}

/** @param {number} technoId */
export function removeEntry(coords, isMoon, technoId) {
  return updateSide(coords, isMoon, (side) => ({
    ...side,
    entries: side.entries.filter((existing) => Number(existing.technoId) !== Number(technoId)),
  }));
}

/**
 * Moves one entry's target level by `delta`, one level at a time.
 *
 * `from` is deliberately left alone. `pricedEntries()` shows a raised `from` when the
 * game is already building part of the range, and writing that back would tell the plan
 * the player owns levels they have not paid for yet.
 *
 * @param {number} technoId
 * @param {number} delta levels to add to `to`, usually +1 or -1
 * @param {number|null} floor the level the row starts at on screen; below it the entry
 *   is gone. Defaults to the stored `from` - pass the displayed one so a row made up
 *   entirely of submitted levels disappears instead of lingering unseen.
 */
export function shiftEntryTarget(coords, isMoon, technoId, delta, floor = null) {
  const entry = planFor(coords, isMoon).entries.find((existing) => Number(existing.technoId) === Number(technoId));

  if (!entry) return getPlans();

  const to = Math.floor(Number(entry.to) || 0) + Math.trunc(Number(delta) || 0);
  const limit = floor === null ? entry.from : Math.max(entry.from, Number(floor) || 0);

  if (to <= limit) return removeEntry(coords, isMoon, technoId);

  return updateSide(coords, isMoon, (side) => ({
    ...side,
    entries: side.entries.map((existing) =>
      Number(existing.technoId) === Number(technoId) ? { ...existing, to } : existing
    ),
  }));
}

/** Empties every plan on every planet and moon. One setter write, nothing behind it. */
export function clearAllPlans() {
  OGBIData.upgradePlans = {};

  return OGBIData.upgradePlans;
}

/**
 * The free-hand pile on top of the planned entries: what migrated locks became, and
 * where the ship and defence panels record their sums - those have no level, so they
 * cannot be an entry.
 *
 * @param {{metal?: number, crystal?: number, deuterium?: number}} resources
 */
export function setManual(coords, isMoon, resources) {
  return updateSide(coords, isMoon, (side) => ({
    ...side,
    manual: {
      metal: Math.max(0, Math.round(Number(resources?.metal) || 0)),
      crystal: Math.max(0, Math.round(Number(resources?.crystal) || 0)),
      deuterium: Math.max(0, Math.round(Number(resources?.deuterium) || 0)),
    },
  }));
}

/** Adds to the free-hand pile rather than replacing it. */
export function addManual(coords, isMoon, resources) {
  const current = planFor(coords, isMoon).manual;

  return setManual(coords, isMoon, {
    metal: (current.metal || 0) + (Number(resources?.metal) || 0),
    crystal: (current.crystal || 0) + (Number(resources?.crystal) || 0),
    deuterium: (current.deuterium || 0) + (Number(resources?.deuterium) || 0),
  });
}

/** Empties one side of one plan - the tooltip's delete button and the panel's. */
export function clearSide(coords, isMoon) {
  return updateSide(coords, isMoon, () => emptySide());
}

/**
 * The level of `technoId` the player owns right now.
 *
 * Classic research is bought once for the account and lives in
 * `OGBIData.json.technology`; buildings, lifeform buildings and lifeform research are
 * all per planet and sit on the planet object under their own id.
 */
export function currentLevel(technoId, object) {
  if (!isPlanetScoped(technoId)) return Number(OGBIData.json.technology?.[technoId]) || 0;

  return Number(object?.[technoId]) || 0;
}

/**
 * Which of the maps `ctxpage/empire/production.js` maintains holds the order that is
 * actually running, per empire-data group.
 *
 * `researchProgress` is the odd one: classic research is account-wide, so there is one
 * object rather than a map keyed by coordinates, and it carries the coordinates of the
 * planet doing the researching itself.
 */
const ACTIVE_ORDER_SOURCE = Object.freeze({
  supply: "productionProgress",
  station: "productionProgress",
  lifeformbuildings: "lfProductionProgress",
  lifeformresearch: "lfResearchProgress",
  research: "researchProgress",
});

/** The order OGame is actually building on this side right now, if any. */
function activeOrder(coords, isMoon, group) {
  if (group === "research") {
    const running = OGBIData.json.researchProgress;

    return running?.technoId && bareCoords(running.coords) === bareCoords(coords) && !isMoon ? running : null;
  }

  const key =
    isMoon && ACTIVE_ORDER_SOURCE[group] === "productionProgress"
      ? "moonProductionProgress"
      : ACTIVE_ORDER_SOURCE[group];

  return OGBIData.json[key]?.[bareCoords(coords)] || null;
}

/**
 * The orders the player has already submitted on this side, as level ranges that still
 * have to be paid for.
 *
 * OGame charges a build order when it *starts*, not when it finishes - but only the one
 * at the front of the list is started. The four that can sit behind it, and the officer
 * slot, are not paid yet, so they are a real need and belong in the total. (Shipyard and
 * defence orders are charged in full up front; the empire data does not report them
 * here, so there is nothing to exclude.)
 *
 * Two sources, because neither is complete on its own:
 *
 *  - `workInProgressTechs`, which `getEmpireInfo()` builds per planet and moon. Measured
 *    against a live 13.0.0 server it reports only the order that is *running*, one per
 *    build list - which is also the only one that is paid.
 *  - `OGBIData.json.buildQueue`, what `ogame/buildQueue.js` reads off the production box
 *    on the page. That is where the Commander's four extra slots show up. It stays empty
 *    unless the markup reads cleanly, so a planet the player has not opened since queuing,
 *    or a server whose box is built differently, simply contributes nothing here.
 *
 * Either way the result is incomplete rather than overstated, which is the safe
 * direction: a level counted twice would send resources the planet does not need.
 *
 * @returns {Array<{technoId: number, from: number, to: number, active: boolean, paid: boolean, group: string}>}
 */
export function submittedOrders(coords, isMoon) {
  const planet = planetByCoords(coords);
  const object = isMoon ? planet?.moon : planet;
  const orders = [];

  for (const wip of object?.workInProgressTechs || []) {
    const technoId = Number(wip.id);
    const to = Number(wip.to) || 0;
    const running = activeOrder(coords, isMoon, wip.group);
    const isRunning = Boolean(running) && Number(running.technoId) === technoId;

    // The running level is paid, so the unpaid range starts above it. A queued order
    // for some other technology has nothing paid at all and starts at its own level.
    const unpaidFrom = isRunning ? Math.max(Number(wip.from) || 0, Number(running.tolvl) || 0) : Number(wip.from) || 0;

    // A fully paid order is kept rather than dropped: its cost comes out as zero, so it
    // changes no total, but the player still sees what the planet is busy with.
    orders.push({
      technoId,
      from: Math.min(unpaidFrom, to),
      to,
      active: isRunning,
      paid: to <= unpaidFrom,
      group: wip.group,
      endDate: isRunning ? running.endDate : undefined,
    });
  }

  for (const queued of queuedOrders(coords, isMoon, orders)) orders.push(queued);

  return orders;
}

/** `ogame/buildQueue.js` groups by build list; the empire data groups by tech family. */
const QUEUE_KIND_GROUP = Object.freeze({
  building: "supply",
  lfbuilding: "lifeformbuildings",
  research: "research",
  lfresearch: "lifeformresearch",
});

/**
 * The entries sitting behind the running order, none of which OGame has charged yet.
 *
 * **Each entry is exactly one level.** Queuing a mine twice puts two rows in the build
 * list, one per level - the real markup shows `lifeformTech11204` appearing at 6 and
 * again at 7 - so `from` is simply `to - 1`. That is worth stating because the obvious
 * alternative, reading the level the planet owns now, would silently price eleven levels
 * instead of one on any planet whose empire entry is missing that technology.
 *
 * An entry a running order already covers is skipped, so the two sources cannot count
 * the same level twice.
 */
function queuedOrders(coords, isMoon, running) {
  const queues = OGBIData.json.buildQueue?.[bareCoords(coords) + (isMoon ? "M" : "P")];
  if (!queues) return [];

  // Highest level a running order already reaches per technology. The empire page can
  // report a whole range where the box lists the levels one by one.
  const reached = {};
  for (const order of running) reached[order.technoId] = Math.max(reached[order.technoId] || 0, order.to);

  const queued = [];

  for (const [kind, entries] of Object.entries(queues)) {
    for (const entry of entries) {
      const technoId = Number(entry.technoId);
      const to = Number(entry.tolvl) || 0;

      if (!technoId || !to || to <= (reached[technoId] || 0)) continue;

      reached[technoId] = to;

      queued.push({ technoId, from: to - 1, to, active: false, paid: false, group: QUEUE_KIND_GROUP[kind] || kind });
    }
  }

  return queued;
}

/** The highest level any submitted order will reach for `technoId`, or 0. */
function submittedTo(orders, technoId) {
  let highest = 0;

  for (const order of orders) {
    if (Number(order.technoId) !== Number(technoId)) continue;
    highest = Math.max(highest, order.to);
  }

  return highest;
}

/**
 * One side's rows with their cost filled in, ready to render: the orders already
 * submitted in game first, then what the player planned on top of them.
 *
 * A planned entry that overlaps a submitted order starts where the order ends, so a
 * level is never counted twice - plan "metal mine 20 to 24" with 21 building and 22, 23
 * queued leaves the planned row covering level 24 alone.
 *
 * The officer flags `research()` takes are left false on purpose: technocrat, explorer
 * and acceleration change the build *time*, never the cost, and a plan for a planet
 * the player is not standing on cannot know which of them applied anyway.
 *
 * @returns {Array<{technoId, from, to, cost, time, submitted, active}>}
 */
export function pricedEntries(coords, isMoon) {
  const planet = planetByCoords(coords);
  const object = isMoon ? planet?.moon : planet;
  const orders = submittedOrders(coords, isMoon);
  const priced = [];

  for (const order of orders) {
    priced.push({
      ...order,
      submitted: true,
      ...upgradeCostRange(order.technoId, order.from, order.to, { object }),
    });
  }

  for (const entry of planFor(coords, isMoon).entries) {
    const from = Math.max(entry.from, submittedTo(orders, entry.technoId));

    if (entry.to <= from) continue;

    priced.push({
      ...entry,
      from,
      submitted: false,
      active: false,
      ...upgradeCostRange(entry.technoId, from, entry.to, { object }),
    });
  }

  return priced;
}

/**
 * What one side needs in total: every submitted and planned row plus the free-hand pile.
 *
 * @returns {{metal: number, crystal: number, deuterium: number}}
 */
export function totalsFor(coords, isMoon) {
  const side = planFor(coords, isMoon);
  const totals = {
    metal: side.manual.metal || 0,
    crystal: side.manual.crystal || 0,
    deuterium: side.manual.deuterium || 0,
  };

  for (const entry of pricedEntries(coords, isMoon)) {
    totals.metal += entry.cost[0];
    totals.crystal += entry.cost[1];
    totals.deuterium += entry.cost[2];
  }

  return totals;
}

/** True when the side has nothing planned and nothing pencilled in. */
function sideIsEmpty(side) {
  const manualSum = (side.manual.metal || 0) + (side.manual.crystal || 0) + (side.manual.deuterium || 0);

  return side.entries.length === 0 && manualSum === 0;
}

/**
 * Brings every plan back in step with what has actually been built.
 *
 * An entry whose target level is reached is done and goes; one that is part way there
 * has its `from` raised, so the cost shown is what is still left to pay. This is the
 * whole reason the entries are structured - the old single-blob `needs` could not tell
 * a finished upgrade from an untouched one and sat there until the player deleted it.
 *
 * One batched write: the map is mutated on `OGBIData.json` and persisted by a single
 * `Save()`, never a setter followed by a `Save()` (`test/util/store-access.test.js`).
 *
 * @returns {boolean} whether anything changed
 */
export function reconcile() {
  const plans = getPlans();
  let changed = false;

  for (const key of Object.keys(plans)) {
    const bucket = plans[key];
    const planet = (OGBIData.empire || []).find((candidate) => String(candidate.id) === String(key));

    if (!planet) continue;

    bucket.coords = bareCoords(planet.coordinates);

    for (const sideName of ["planet", "moon"]) {
      const side = normalizeSide(bucket[sideName]);
      const object = sideName === "moon" ? planet.moon : planet;

      if (sideName === "moon" && !object) {
        bucket[sideName] = side;
        continue;
      }

      const kept = [];
      for (const entry of side.entries) {
        const owned = currentLevel(entry.technoId, object);

        if (owned >= entry.to) {
          changed = true;
          continue;
        }
        if (owned > entry.from) {
          kept.push({ ...entry, from: owned });
          changed = true;
          continue;
        }
        kept.push(entry);
      }

      side.entries = kept;
      bucket[sideName] = side;
    }

    if (sideIsEmpty(normalizeSide(bucket.planet)) && sideIsEmpty(normalizeSide(bucket.moon))) {
      delete plans[key];
      changed = true;
    }
  }

  if (changed) {
    OGBIData.json.upgradePlans = plans;
    OGBIData.Save();
  }

  return changed;
}

/**
 * Carries the old single-blob locks over, once.
 *
 * A migrated lock has no technology behind it - the old format never recorded one - so
 * it lands in `manual`, where it keeps showing the same shortfall it always did. The
 * player can delete it and plan the upgrade properly whenever they like.
 *
 * `OGBIData.json.needs` is left exactly as it is: it is the planet bar's cache now, and
 * `sync.js` rewrites each side from the plan behind it. Running twice would fold the
 * synced total back into `manual` and double every entry, so a flag pins it to once.
 *
 * @returns {boolean} whether anything was carried over
 */
export function migrateFromNeeds() {
  if (OGBIData.json.upgradePlansMigrated) return false;

  const needs = OGBIData.needs;

  if (!needs || Object.keys(needs).length === 0) {
    OGBIData.json.upgradePlansMigrated = true;
    OGBIData.Save();

    return false;
  }

  const plans = { ...getPlans() };

  for (const key of Object.keys(needs)) {
    const old = needs[key];
    if (!old) continue;

    const coords = bareCoords(old.coords);
    const planet = coords ? planetByCoords(coords) : null;
    // Keeps the old key when the planet is not in the empire data (a colony given up,
    // or the data not loaded yet). Nothing is thrown away; reconcile() fixes the
    // coordinates up on the first load that can resolve them.
    const bucketKey = planet ? String(planet.id) : String(key);
    const existing = plans[bucketKey];

    const bucket = {
      planetId: planet ? planet.id : old.planetId,
      coords,
      planet: normalizeSide(existing?.planet),
      moon: normalizeSide(existing?.moon),
    };

    for (const sideName of ["planet", "moon"]) {
      const blob = old[sideName];
      const sum = (blob?.metal || 0) + (blob?.crystal || 0) + (blob?.deuterium || 0);

      if (sum <= 0) continue;

      bucket[sideName] = {
        ...bucket[sideName],
        manual: {
          metal: blob.metal || 0,
          crystal: blob.crystal || 0,
          deuterium: blob.deuterium || 0,
        },
      };
    }

    if (!sideIsEmpty(bucket.planet) || !sideIsEmpty(bucket.moon)) plans[bucketKey] = bucket;
  }

  // One batch, one Save() - never a setter and a Save() for the same change.
  OGBIData.json.upgradePlans = plans;
  OGBIData.json.upgradePlansMigrated = true;
  OGBIData.Save();

  return true;
}
