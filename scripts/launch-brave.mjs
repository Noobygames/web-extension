#!/usr/bin/env node
/**
 * Launches Brave with a locally built unpacked extension loaded.
 *
 * By default it uses a throwaway profile under dist/ so it never collides with
 * a running Brave instance (Chromium ignores extra flags when it just attaches
 * to an already-running profile). Pass --profile=default to use your normal
 * profile instead - close Brave first in that case.
 *
 * Every other extension - most importantly the Web Store build of OGBI itself -
 * is switched off for the launched session via --disable-extensions-except, so
 * you never end up with two OGBI instances on the same page. Opt out with
 * --keep-extensions.
 *
 * Usage:
 *   node scripts/launch-brave.mjs --dir=dist/unpacked/chrome
 *   node scripts/launch-brave.mjs --dir=dist/unpacked/chrome --profile=default
 *   node scripts/launch-brave.mjs --dir=dist/unpacked/chrome --extensions-page
 *   node scripts/launch-brave.mjs --dir=dist/unpacked/chrome --keep-extensions
 *   BRAVE_PATH="C:\\path\\to\\brave.exe" node scripts/launch-brave.mjs --dir=...
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : true];
  })
);

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = path.resolve(projectRoot, String(args.dir || "dist/unpacked/chrome"));

if (!fs.existsSync(path.join(extensionDir, "manifest.json"))) {
  console.error(`No manifest.json in ${extensionDir}. Run "make dev" first.`);
  process.exit(1);
}

function findBrave() {
  if (process.env.BRAVE_PATH) return process.env.BRAVE_PATH;

  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

  const candidates =
    {
      win32: [
        path.join(programFiles, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
        path.join(programFilesX86, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
        localAppData && path.join(localAppData, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
      ],
      darwin: [
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        `${process.env.HOME}/Applications/Brave Browser.app/Contents/MacOS/Brave Browser`,
      ],
      linux: ["/usr/bin/brave-browser", "/usr/bin/brave", "/snap/bin/brave", "/opt/brave.com/brave/brave"],
    }[process.platform] || [];

  return candidates.filter(Boolean).find((candidate) => fs.existsSync(candidate));
}

const brave = findBrave();
if (!brave) {
  console.error("Brave not found. Set BRAVE_PATH to the browser binary, e.g.");
  console.error('  make brave BRAVE_PATH="C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"');
  console.error(`Or load it by hand: brave://extensions -> Developer mode -> Load unpacked -> ${extensionDir}`);
  process.exit(1);
}

const braveArgs = [
  `--load-extension=${extensionDir}`,
  // Chromium 137+ ignores --load-extension on stable channels unless this
  // kill-switch feature is disabled. Harmless on builds that never had it.
  "--disable-features=DisableLoadExtensionCommandLineSwitch",
  "--no-first-run",
  "--no-default-browser-check",
];

// Without this, the Web Store build of OGBI stays active next to the local one:
// both match the same OGame hosts, both inject ogCore.js, and both write the
// same localStorage["ogk-data"] key. This flag switches every other extension
// off for this browser session only - nothing is uninstalled or unchecked, so
// the next normal Brave start has everything back.
const isolateExtensions = !args["keep-extensions"];
if (isolateExtensions) {
  braveArgs.push(`--disable-extensions-except=${extensionDir}`);
}

const useDedicatedProfile = String(args.profile || "") !== "default";
const profileDir = useDedicatedProfile
  ? path.resolve(projectRoot, String(args.profile || "dist/.brave-dev-profile"))
  : null;
if (profileDir) {
  braveArgs.push(`--user-data-dir=${profileDir}`);
}

braveArgs.push(args["extensions-page"] ? "brave://extensions/" : "https://lobby.ogame.gameforge.com/");

/** A Brave that already owns the profile just opens a tab and drops every flag we pass. */
function braveIsRunning() {
  try {
    if (process.platform === "win32") {
      return execFileSync("tasklist", ["/FI", "IMAGENAME eq brave.exe", "/NH"], { encoding: "utf8" }).includes(
        "brave.exe"
      );
    }
    return execFileSync("pgrep", ["-f", "[Bb]rave"], { encoding: "utf8" }).trim().length > 0;
  } catch {
    return false;
  }
}

if (!useDedicatedProfile && !args["dry-run"] && braveIsRunning()) {
  console.warn("WARNING: Brave is already running.");
  console.warn("If that instance owns your default profile it will ignore --load-extension and");
  console.warn("--disable-extensions-except and just open a tab, leaving the Web Store build of OGBI");
  console.warn('active next to nothing. Close Brave completely and retry, or use "make brave"');
  console.warn("(throwaway profile, works alongside a running Brave).");
  console.warn("");
}

console.log(`${args["dry-run"] ? "Would launch" : "Launching"} ${brave}`);
console.log(`  extension: ${extensionDir}`);
console.log(`  profile:   ${useDedicatedProfile ? "dedicated dev profile" : "your default Brave profile"}`);
console.log(
  `  others:    ${isolateExtensions ? "all other extensions off for this session" : "left enabled (--keep-extensions)"}`
);

if (args["dry-run"]) {
  console.log(`  args:      ${braveArgs.join(" ")}`);
  process.exit(0);
}

if (profileDir) {
  fs.mkdirSync(profileDir, { recursive: true });
}

spawn(brave, braveArgs, { detached: true, stdio: "ignore" }).unref();

console.log("");
console.log("If the extension does not show up, Brave may have disabled --load-extension.");
console.log("Load it manually instead: brave://extensions -> Developer mode -> Load unpacked ->");
console.log(`  ${extensionDir}`);
