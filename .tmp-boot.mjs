/**
 * Boots the real page bundle against a fixture page and reports what breaks.
 *
 * Two signals, neither of which the unit suite produces:
 *  - rollup's own warnings while bundling: a name imported but not exported anywhere
 *    is `undefined` at run time, and only the bundler can see it across the graph;
 *  - every error the boot IIFE catches and logs, which is where a missing import or a
 *    lost module-level declaration surfaces.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { bundle } from "./scripts/bundle.mjs";
import { setupBrowser } from "./test/helpers/globals.js";
import { overviewPage } from "./test/fixtures/ogamePage.js";

const say = console.log.bind(console);

// --- 1. bundle, capturing what rollup complains about ----------------------
const warnings = [];
const originalWarn = console.warn;
const originalError = console.error;
console.warn = (...a) => warnings.push(a.map(String).join(" "));
console.error = (...a) => warnings.push(a.map(String).join(" "));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ogi-boot-"));
fs.cpSync("src", dir, { recursive: true });
const versionJs = path.join(dir, "util", "version.js");
fs.writeFileSync(versionJs, fs.readFileSync(versionJs, "utf8").replaceAll("__VERSION__", "9.9.9"));
await bundle(dir);

console.warn = originalWarn;
console.error = originalError;

const exportWarnings = warnings.filter((w) => /is not exported by/.test(w));
if (exportWarnings.length) {
  say("Rollup: fehlende Exporte\n");
  for (const w of [...new Set(exportWarnings)]) say("  " + w.replace(/\.\.[^"]*\//g, "").slice(0, 200));
  say("");
}

// --- 2. evaluate it the way the browser does -------------------------------
const browser = setupBrowser({
  html: overviewPage(),
  url: "https://s1-en.ogame.gameforge.com/game/index.php?page=ingame&component=overview",
});
document.documentElement.dataset.ogiCallbackEventToken = "0123456789ab";

globalThis.playerId = 12345;
globalThis.fadeBox = () => {};
globalThis.getFormatedDate = () => "";
globalThis.formatTimeWrapper = () => "";
globalThis.DOMPurify = { sanitize: (v) => String(v) };
globalThis.fetch = () => Promise.reject(new Error("no network in this check"));

const logged = [];
const saved = {};
for (const level of ["error", "warn", "log", "info", "debug"]) {
  saved[level] = console[level];
  console[level] = (...args) => logged.push(args);
}

try {
  await import(pathToFileURL(path.join(dir, "ogkush.js")).href);
  document.dispatchEvent(new window.Event("DOMContentLoaded"));
  await new Promise((resolve) => setTimeout(resolve, 400));
} finally {
  for (const level of Object.keys(saved)) console[level] = saved[level];
}

const referenceErrors = new Set();
const otherErrors = new Set();
for (const args of logged) {
  for (const arg of args) {
    if (arg instanceof Error) {
      (arg.name === "ReferenceError" ? referenceErrors : otherErrors).add(`${arg.name}: ${arg.message}`);
    } else if (typeof arg === "string" && /is not defined/.test(arg)) {
      referenceErrors.add(arg.slice(0, 160));
    }
  }
}

fs.rmSync(dir, { recursive: true, force: true });
browser.cleanup();

if (referenceErrors.size) {
  say("ReferenceError beim Booten:");
  for (const e of referenceErrors) say("  " + e);
} else {
  say("Boot: kein ReferenceError.");
}
if (otherErrors.size) {
  say("\nandere gefangene Fehler (auf der Fixture-Seite teils erwartet):");
  for (const e of otherErrors) say("  " + e);
}
// The bridge keeps a 30 s timer alive; nothing here needs it, and it would fire after
// browser.cleanup() has taken `document` away.
process.exit(referenceErrors.size || exportWarnings.length ? 1 : 0);
