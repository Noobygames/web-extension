#!/usr/bin/env node
/** Prints `make help`. A node script so the output is identical under sh and cmd.exe. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version =
  process.env.OGI_VERSION || JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")).version || "?";
const chromeDir = process.env.OGI_CHROME_DIR || "dist/unpacked/chrome";
const firefoxDir = process.env.OGI_FIREFOX_DIR || "dist/unpacked/firefox";

console.log(`Ogame Infinity - make targets

  make install        Install dev dependencies (prettier, eslint, terser, clean-css)
  make format         Format all sources with prettier (run before every commit)
  make check          Run eslint
  make test           Run the unit test suite (node:test + jsdom)
  make test-watch     Re-run the suite on every change
  make coverage       Run the suite and print a coverage report

  make dev            Build unpacked Chromium/Brave extension into ${chromeDir}
  make dev-firefox    Build unpacked Firefox extension into ${firefoxDir}
  make brave          Build + launch Brave with the extension loaded (throwaway dev profile)
  make brave-main     Same, but using your normal Brave profile (close Brave first)
  make brave-open     Build + launch Brave straight to brave://extensions

All three switch every other extension off for that browser session, so the Web Store
build of OGI cannot run next to your local one. Nothing is uninstalled - a normal
Brave start has everything back.

  make build          Full release packaging via packaging.sh (needs bash + zip)
                      without VERSION= it uses packaging.sh's date-based version
  make clean          Remove dist/
  make clean-profile  Remove the throwaway Brave dev profile only

Variables:
  VERSION             stamped into manifest.json and util/version.js
                      defaults to the package.json version (${version}); override: make dev VERSION=9.9.9
  BRAVE_PATH          overrides Brave binary autodetection
  BRAVE_PROFILE       throwaway profile location for "make brave"

Manual load (any Chromium): brave://extensions -> Developer mode -> Load unpacked -> ${chromeDir}`);
