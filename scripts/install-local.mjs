#!/usr/bin/env node
/**
 * Builds the current working tree into a PERMANENT local extension directory, suitable for
 * "Load unpacked" in Brave / Chrome / Edge.
 *
 * Two things separate this from `make dev`:
 *
 *  - It builds into `local-extension/` at the repo root, not into `dist/`. `dist/` is wiped by
 *    `make clean` and by every other build; if the folder a loaded extension points at
 *    disappears, the browser drops the extension.
 *  - It pins the extension id with a local key (scripts/dev-key.mjs), so rebuilding - or moving
 *    the repo - does not look like a brand new extension and does not reset the
 *    chrome.storage.local data the content script keeps per universe.
 *
 * Load it ONCE via brave://extensions; after that every `make install` refreshes the files in
 * place and the browser picks them up on the extension's reload button (or a browser restart).
 *
 * Usage:
 *   node scripts/install-local.mjs [--target=chrome|firefox] [--out=<dir>]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { devExtensionId, devKeyPath } from "./dev-key.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : true];
  })
);

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = args.target || "chrome";
const outDir = path.resolve(projectRoot, String(args.out || "local-extension"));

// The marker lives OUTSIDE the build directory: the build wipes and recreates that directory,
// so anything kept inside it would make every run look like a first install.
const markerPath = path.join(projectRoot, ".local-extension-installed");
const firstInstall = !fs.existsSync(markerPath);

execFileSync(
  process.execPath,
  [path.join(projectRoot, "scripts", "build-unpacked.mjs"), `--target=${target}`, "--stable-id", `--out=${outDir}`],
  { stdio: "inherit", cwd: projectRoot }
);

const relative = path.relative(projectRoot, outDir);
fs.writeFileSync(
  markerPath,
  `${outDir}
${new Date().toISOString()}
`
);

console.log("");
if (target === "firefox") {
  // Firefox only accepts a *temporary* add-on unsigned, and drops it on restart. Say so rather
  // than let it look like the install failed.
  console.log("Firefox cannot install an unsigned extension permanently.");
  console.log(
    `  about:debugging#/runtime/this-firefox -> "Load Temporary Add-on" -> ${path.join(outDir, "manifest.json")}`
  );
  console.log("  It is dropped when Firefox restarts. Use Chrome/Brave for a permanent local install,");
  console.log("  or sign the build via AMO.");
} else if (firstInstall) {
  console.log("Install it once (this is the only manual step):");
  console.log("  1. open  brave://extensions");
  console.log('  2. turn on "Developer mode" (top right)');
  console.log('  3. "Load unpacked"  ->  select this folder:');
  console.log(`       ${outDir}`);
  console.log("");
  console.log("It then survives browser restarts. Re-run `make install` after changing src/,");
  console.log("then press the extension's reload icon on brave://extensions.");
} else {
  console.log(`Refreshed ${relative}. Press the reload icon on brave://extensions to pick it up.`);
}

console.log("");
console.log(`extension id : ${devExtensionId()}`);
console.log(`id pinned by : ${path.relative(projectRoot, devKeyPath)}  (keep this file - deleting it changes the id)`);
