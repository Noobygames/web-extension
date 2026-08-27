/**
 * Start-up profiler.
 *
 * Off by default and free when off: every entry point returns immediately, so
 * the only cost on a normal page load is one `localStorage.getItem` at module
 * evaluation.
 *
 * Turn it on with either
 *   localStorage.setItem("ogi-perf", "1")   // sticky, survives navigation
 * or by appending `&ogi-perf=1` to the game URL (one page load only).
 *
 * It then prints a table to the console when the start-up sequence finishes:
 * one row per phase, plus one row per `OGInfinity.start()` step, sorted by
 * cost. All timings are relative to `navigationStart`, so they line up with
 * the Performance panel and with the game's own load.
 *
 * Pure measurement - it makes no game requests and stores nothing beyond the
 * on/off flag.
 */

const STORAGE_KEY = "ogi-perf";

const enabled = (() => {
  try {
    if (typeof location !== "undefined" && /[?&]ogi-perf=1\b/.test(location.search)) return true;
    return typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1";
  } catch (_) {
    // Private-mode localStorage can throw on read; profiling is never worth an exception.
    return false;
  }
})();

/** @type {{name: string, at: number, ms: number}[]} */
const entries = [];
let reported = false;

/** @returns {number} milliseconds since navigation start */
function now() {
  return typeof performance !== "undefined" ? performance.now() : 0;
}

/**
 * @returns {boolean} whether profiling is on for this page load
 */
export function isEnabled() {
  return enabled;
}

/**
 * Records a zero-length event, e.g. "page context module evaluated".
 * @param {string} name
 */
export function mark(name) {
  if (!enabled) return;
  entries.push({ name, at: now(), ms: 0 });
}

/**
 * Times a synchronous call and records it.
 * @template T
 * @param {string} name
 * @param {() => T} fn
 * @returns {T} whatever fn returned
 */
export function time(name, fn) {
  if (!enabled) return fn();
  const at = now();
  try {
    return fn();
  } finally {
    entries.push({ name, at, ms: now() - at });
  }
}

/**
 * Times a promise-returning call. The recorded duration covers the returned
 * promise as well, not just the synchronous part.
 * @template T
 * @param {string} name
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function timeAsync(name, fn) {
  if (!enabled) return fn();
  const at = now();
  return Promise.resolve()
    .then(fn)
    .finally(() => entries.push({ name: name + " (async)", at, ms: now() - at }));
}

/**
 * Times every own method of `target` named in `names`, in place. Used to get a
 * per-step breakdown of `OGInfinity.start()` without editing forty call sites.
 *
 * @param {object} target instance whose prototype methods get wrapped
 * @param {string} prefix label prefix for the recorded entries
 */
export function instrumentMethods(target, prefix = "") {
  if (!enabled || !target) return;
  const proto = Object.getPrototypeOf(target);
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === "constructor") continue;
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    if (!descriptor || typeof descriptor.value !== "function" || descriptor.get || descriptor.set) continue;
    const original = descriptor.value;
    // Own property on the instance, so the prototype stays untouched for any
    // other instance and the wrapper disappears with the object.
    Object.defineProperty(target, name, {
      configurable: true,
      writable: true,
      value: function (...args) {
        const at = now();
        try {
          return original.apply(this, args);
        } finally {
          const ms = now() - at;
          if (ms >= 0.5) entries.push({ name: prefix + name, at, ms });
        }
      },
    });
  }
}

/** @type {Map<string, {calls: number, ms: number, bytes: number}>} */
const totals = new Map();

/**
 * Adds one occurrence to a running total, for things that happen too often to
 * list individually - `ogk-data` writes above all.
 *
 * @param {string} name
 * @param {number} ms
 * @param {number} [bytes] payload size, summed as well when given
 */
export function accumulate(name, ms, bytes = 0) {
  if (!enabled) return;
  const row = totals.get(name) ?? { calls: 0, ms: 0, bytes: 0 };
  row.calls += 1;
  row.ms += ms;
  row.bytes += bytes;
  totals.set(name, row);
}

/**
 * Prints the collected timings. Safe to call more than once; only the first
 * call prints.
 * @param {string} [label]
 */
export function report(label = "OGI start-up") {
  if (!enabled || reported || entries.length === 0) return;
  reported = true;

  const total = now();
  const timeline = entries.map((e) => ({
    step: e.name,
    "at (ms)": Math.round(e.at),
    "took (ms)": Math.round(e.ms * 10) / 10,
  }));
  const slowest = entries
    .filter((e) => e.ms > 0)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 20)
    .map((e) => ({ step: e.name, "took (ms)": Math.round(e.ms * 10) / 10 }));

  console.group(`${label} - ${Math.round(total)} ms since navigation start`);
  console.table(timeline);
  if (totals.size) {
    console.groupCollapsed("totals");
    console.table(
      [...totals].map(([name, row]) => ({
        what: name,
        calls: row.calls,
        "total (ms)": Math.round(row.ms * 10) / 10,
        "avg size (KB)": row.bytes ? Math.round(row.bytes / row.calls / 102.4) / 10 : "",
      }))
    );
    console.groupEnd();
  }
  if (slowest.length) {
    console.groupCollapsed("slowest steps");
    console.table(slowest);
    console.groupEnd();
  }
  console.groupEnd();
}

/** Clears the buffer so a later sequence can be measured on its own. */
export function reset() {
  entries.length = 0;
  totals.clear();
  reported = false;
}
