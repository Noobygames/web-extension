/**
 * Checks the zips `packaging.sh` just produced, before anyone uploads them to a store.
 *
 *   node scripts/verify-package.mjs [dist-dir]
 *
 * The store review loop is days long, and every one of these has actually shipped or
 * nearly shipped: an Edge build that kept the Chrome Web Store `update_url` and lost an
 * icon (a bare `sed -i '31d'` whose line number had drifted), a Firefox build whose
 * asset URLs still said `chrome-extension://`, and a packaging script that exited 0
 * after a step had failed. A zip is opaque; nothing else looks inside one.
 *
 * Zero dependencies, and no `unzip` either - the central directory plus
 * `zlib.inflateRawSync` is all a zip needs, and shelling out would make this Linux-only
 * on a project whose developers are on Windows.
 */
import { inflateRawSync } from "node:zlib";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.resolve(process.argv[2] || path.join(root, "dist"));

/**
 * Every entry in a zip, by name.
 *
 * @param {string} file
 * @returns {Map<string, Buffer>}
 */
function readZip(file) {
  const buffer = readFileSync(file);

  // The end-of-central-directory record is last, after a comment of unknown length, so
  // it is found by scanning back for its signature.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`${file}: no end-of-central-directory record - not a zip`);

  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error(`${file}: bad central directory entry ${i}`);

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    // The local header repeats the name and carries its own extra field, whose length
    // is often different from the central one - so the data offset has to come from it.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    if (!name.endsWith("/")) {
      entries.set(name, method === 0 ? raw : inflateRawSync(raw));
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

const problems = [];

/** @param {boolean} ok @param {string} message */
function check(ok, message) {
  if (!ok) problems.push(message);
}

/** Files every build must carry, whatever the browser. */
const REQUIRED = [
  "manifest.json",
  "ogCore.js",
  "main.js",
  "background.js",
  "global.css",
  "assets/images/logo128.png",
  "assets/images/logo512.png",
  "libs/purify.min.js",
];

/**
 * @param {string} label
 * @param {Map<string, Buffer>} entries
 * @param {"firefox"|"chrome"|"edge"} flavour
 */
function verify(label, entries, flavour) {
  for (const file of REQUIRED) check(entries.has(file), `${label}: missing ${file}`);

  // The Firefox manifest is copied over manifest.json; shipping both would leave the
  // reviewer looking at a file the browser ignores.
  check(!entries.has("manifest-firefox.json"), `${label}: manifest-firefox.json was not removed`);

  if (!entries.has("manifest.json")) return;

  let manifest;
  try {
    manifest = JSON.parse(entries.get("manifest.json").toString("utf8"));
  } catch (error) {
    check(false, `${label}: manifest.json is not valid JSON - ${error.message}`);
    return;
  }

  check(manifest.version !== "0.0.0", `${label}: the version placeholder was never stamped`);
  check(manifest.name === "Ogame Beyond Infinity", `${label}: unexpected extension name "${manifest.name}"`);

  // Every icon the manifest promises has to be in the zip, or the store shows a blank.
  for (const set of [manifest.icons, manifest.action?.default_icon, manifest.browser_action?.default_icon]) {
    for (const file of Object.values(set || {})) {
      check(entries.has(file), `${label}: manifest references ${file}, which is not in the package`);
    }
  }

  const css = entries.get("global.css")?.toString("utf8") || "";
  const entry = entries.get("ogCore.js")?.toString("utf8") || "";

  check(!entry.includes("__VERSION__"), `${label}: the bundled entry still carries the __VERSION__ placeholder`);

  if (flavour === "firefox") {
    check(!css.includes("chrome-extension://"), `${label}: global.css still points at chrome-extension:// URLs`);
    check(css.includes("moz-extension://"), `${label}: global.css has no moz-extension:// URLs at all`);
    check(!!manifest.browser_specific_settings?.gecko?.id, `${label}: no browser_specific_settings.gecko.id`);
    check(!!manifest.background?.scripts, `${label}: Firefox needs background.scripts, not a service worker`);
    // The bare s/chrome/moz/g this replaced also rewrote vendor prefixes.
    check(!css.includes("-chrome-"), `${label}: global.css carries -chrome- vendor prefixes`);
  } else {
    check(css.includes("chrome-extension://"), `${label}: global.css has no chrome-extension:// URLs at all`);
    check(!css.includes("moz-extension://"), `${label}: global.css points at moz-extension:// URLs`);
    check(!!manifest.background?.service_worker, `${label}: Chromium needs background.service_worker`);
  }

  if (flavour === "chrome") {
    check(!!manifest.update_url, `${label}: the Chrome Web Store update_url is missing`);
  }

  if (flavour === "edge") {
    // Edge serves its own updates and rejects a package pointing at Google's.
    check(!manifest.update_url, `${label}: the Chrome Web Store update_url must not be in the Edge build`);
  }
}

const PACKAGES = [
  ["ogi-firefox.zip", "firefox"],
  ["ogi-chrome.zip", "chrome"],
  ["ogi-edge.zip", "edge"],
];

for (const [name, flavour] of PACKAGES) {
  const file = path.join(distDir, name);

  if (!existsSync(file)) {
    problems.push(`${name}: not built`);
    continue;
  }

  check(statSync(file).size > 100_000, `${name}: suspiciously small (${statSync(file).size} bytes)`);

  try {
    verify(name, readZip(file), flavour);
  } catch (error) {
    problems.push(`${name}: ${error.message}`);
  }
}

if (problems.length > 0) {
  console.error("Package verification failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`Package verification passed (${PACKAGES.map(([name]) => name).join(", ")}).`);
