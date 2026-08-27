#!/usr/bin/env node
/**
 * Bundles the two module entry points of a built extension directory, in place.
 *
 * ## Why
 *
 * The page context alone is 69 ES module files, 1.15 MB, seven levels deep. The
 * browser cannot know it needs level 7 until it has fetched and parsed levels 1
 * to 6, so the module graph is a request waterfall in front of every page load
 * - and OGame is not a single-page app, so that waterfall is paid again on
 * every view change. Bundling collapses it to one request per context.
 *
 * ## What this is not
 *
 * **Not minification, not obfuscation.** AGENTS.md §0 requires the code that
 * goes in for review to stay readable, and `packaging.sh` keeps its terser pass
 * deliberately disabled. Rollup is used rather than a faster bundler precisely
 * because its output *is* the source: same identifiers, same formatting, all
 * JSDoc and rationale comments intact, in module evaluation order. The only
 * changes are the removed `import`/`export` lines and a suffix on the handful
 * of names that collide between modules.
 *
 * The per-file sources stay in the package as well (nothing here deletes them
 * unless `--prune` is passed), so a reviewer can diff bundle against source.
 *
 * ## Usage
 *
 *   node scripts/bundle.mjs <dir> [--prune]
 *
 * `<dir>` is a directory that already holds a copy of `src/` with the version
 * placeholders substituted - bundling has to run after stamping, or the stamped
 * `util/version.js` is not the one that ends up in the bundle.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { rollup } from "rollup";

/**
 * Entry points, relative to the directory being bundled.
 *
 * Not listed, on purpose:
 * - `main.js` is a classic content script, not a module. The manifest loads it
 *   directly and it has no imports to resolve.
 * - `background.js` is a standalone service worker with no imports.
 * - `libs/*` is vendored third party, loaded as classic scripts (`chart.min.js`
 *   only on demand). Bundling it in would put already-minified code inside an
 *   otherwise readable file, for one request that is not on the boot path.
 */
const ENTRY_POINTS = ["ogkush.js", "ctxcontent/index.js"];

/**
 * Directories that exist only to be imported by the entry points above.
 * `--prune` removes them; the build flows do not use it, because keeping the
 * readable per-file source in the package is worth more than the bytes.
 */
const MODULE_DIRS = ["util", "ctxpage"];

const BANNER = `/*
 * Bundled by scripts/bundle.mjs. Not minified, not obfuscated.
 *
 * This is the ES modules under src/ concatenated in evaluation order with the
 * import graph resolved, so the browser fetches one file instead of ~70.
 * Identifiers, formatting and comments are unchanged; a few names carry a
 * numeric suffix where two modules used the same one. The per-file source ships
 * alongside this file and in the repository.
 */
`;

/**
 * Rollup warns about the messages <-> analyzers cycle, which is by design: the
 * analyzers only read `messagesTabs` from inside methods, never at module
 * evaluation time, so flattening the cycle into one scope is safe. Everything
 * else is worth seeing.
 *
 * @param {{code?: string, message: string}} warning
 * @param {(warning: unknown) => void} warn rollup's default handler
 */
function onwarn(warning, warn) {
  if (warning.code === "CIRCULAR_DEPENDENCY") return;
  warn(warning);
}

/**
 * @param {string} dir directory holding a built copy of src/
 * @param {{prune?: boolean}} [options]
 * @returns {Promise<{file: string, bytes: number}[]>} one entry per bundle written
 */
export async function bundle(dir, options = {}) {
  const written = [];

  for (const entry of ENTRY_POINTS) {
    const input = path.join(dir, entry);
    if (!fs.existsSync(input)) throw new Error(`Bundle entry point not found: ${input}`);

    const build = await rollup({ input, onwarn, treeshake: false });
    // generate + write by hand rather than build.write(): the output path is
    // the input path, and this way nothing is written until the whole graph has
    // been read.
    const { output } = await build.generate({ format: "es", banner: BANNER, indent: false });
    await build.close();

    if (output.length !== 1) {
      throw new Error(`Expected a single chunk for ${entry}, got ${output.length}`);
    }

    fs.writeFileSync(input, output[0].code);
    written.push({ file: entry, bytes: fs.statSync(input).size });
  }

  if (options.prune) prune(dir);

  return written;
}

/**
 * Removes the module sources nothing loads any more once the bundles exist.
 * @param {string} dir
 */
function prune(dir) {
  for (const name of MODULE_DIRS) {
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }

  // ctxcontent/ keeps its bundle and loses everything else.
  const contentDir = path.join(dir, "ctxcontent");
  for (const entry of fs.readdirSync(contentDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === "index.js") continue;
    fs.rmSync(path.join(contentDir, entry.name), { recursive: true, force: true });
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]).endsWith("bundle.mjs");
if (invokedDirectly) {
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith("--")));

  if (positional.length !== 1) {
    console.error("Usage: node scripts/bundle.mjs <dir> [--prune]");
    process.exit(1);
  }

  const written = await bundle(path.resolve(positional[0]), { prune: flags.has("--prune") });
  for (const { file, bytes } of written) {
    console.log(`Bundled: ${file} (${(bytes / 1024).toFixed(0)} KB)`);
  }
}
