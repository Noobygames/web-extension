#!/usr/bin/env node
/**
 * Builds an *unpacked* extension directory that can be loaded directly in a
 * browser via "Load unpacked" (Chrome / Brave / Edge) or "Load Temporary
 * Add-on" (Firefox).
 *
 * This is the local-development counterpart to packaging.sh: same version
 * stamping and same Firefox CSS rewrite, but it leaves a plain directory
 * behind instead of a zip, and it strips the two manifest keys that only make
 * sense for a store-published build.
 *
 * Usage:
 *   node scripts/build-unpacked.mjs --target=chrome  --version=2.1.1 --out=dist/unpacked/chrome
 *   node scripts/build-unpacked.mjs --target=firefox --version=2.1.1 --out=dist/unpacked/firefox
 *
 * Pass --stable-id to pin the extension id with a local key, so a permanently installed build
 * keeps its chrome.storage.local data across rebuilds and moves. See scripts/dev-key.mjs.
 *
 * Pass --no-bundle to skip the rollup step and load the raw module graph, which
 * is slower to boot but puts real per-file paths in the debugger.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { bundle } from "./bundle.mjs";
import { devManifestKey, devExtensionId } from "./dev-key.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : true];
  })
);

const target = args.target || "chrome";
if (!["chrome", "firefox"].includes(target)) {
  console.error(`Unknown target "${target}". Use --target=chrome or --target=firefox.`);
  process.exit(1);
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const version = String(args.version || "").trim() || packageJson.version || "0.0.0";
const srcDir = path.join(projectRoot, "src");
const outDir = path.resolve(projectRoot, String(args.out || `dist/unpacked/${target}`));

if (!fs.existsSync(srcDir)) {
  console.error(`Source directory not found: ${srcDir}`);
  process.exit(1);
}

// 1. Fresh copy of src/
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.cpSync(srcDir, outDir, { recursive: true });

// 2. Pick the right manifest, drop the other one
const manifestPath = path.join(outDir, "manifest.json");
const firefoxManifestPath = path.join(outDir, "manifest-firefox.json");
if (target === "firefox") {
  fs.copyFileSync(firefoxManifestPath, manifestPath);
}
fs.rmSync(firefoxManifestPath, { force: true });

// 3. Stamp the version + strip store-only keys
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.version = version;

// Chrome/Brave reject or ignore `update_url` for unpacked extensions.
delete manifest.update_url;

// `extension_ids` pins web-accessible resources to the *published* extension
// id. A locally loaded build gets a different id, so the whitelist would lock
// out this very build. `matches` still restricts access to the OGame origins.
for (const entry of manifest.web_accessible_resources || []) {
  delete entry.extension_ids;
}

// Optional: pin the extension id. Without a key Chromium derives the id from the absolute path,
// so a rebuild elsewhere would look like a different extension and lose its chrome.storage.local
// data. Only for local installs - the store build is signed by the store.
let stableId = null;
if (args["stable-id"]) {
  manifest.key = devManifestKey();
  stableId = devExtensionId();
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

// 4. Stamp the version constant read by ogCore.js (status bar link)
const versionJsPath = path.join(outDir, "util", "version.js");
fs.writeFileSync(versionJsPath, fs.readFileSync(versionJsPath, "utf8").replaceAll("__VERSION__", version));

// 5. Firefox: chrome-extension:// -> moz-extension:// and -chrome-* -> -moz-*
//    (same blunt replacement packaging.sh does; the `-chrome-` prefixes in the
//    source only become valid CSS after this rewrite)
if (target === "firefox") {
  const cssPath = path.join(outDir, "global.css");
  fs.writeFileSync(cssPath, fs.readFileSync(cssPath, "utf8").replaceAll("chrome", "moz"));
}

// 6. Collapse the module graph into one file per context. Last, so it picks up
//    the stamped version and the Firefox CSS rewrite. The per-file sources stay
//    in the directory: nothing loads them any more, but they are what a
//    sourcemap-less debugger and a reviewer want to read.
let bundles = [];
if (args["no-bundle"]) {
  console.log("Skipping the bundle step (--no-bundle): the raw module graph will be loaded.");
} else {
  bundles = await bundle(outDir);
}

const loadHint =
  target === "firefox"
    ? `about:debugging#/runtime/this-firefox -> "Load Temporary Add-on" -> pick ${path.join(outDir, "manifest.json")}`
    : 'brave://extensions (or chrome://extensions) -> enable "Developer mode" -> "Load unpacked" -> pick the folder above';

console.log(`Built unpacked ${target} extension v${version}`);
console.log(`  ${outDir}`);
for (const { file, bytes } of bundles) console.log(`  bundled ${file} (${(bytes / 1024).toFixed(0)} KB)`);
if (stableId) console.log(`  extension id: ${stableId} (pinned by .local-extension-key.pem)`);
console.log(`  ${loadHint}`);
