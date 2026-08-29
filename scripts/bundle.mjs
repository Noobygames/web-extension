#!/usr/bin/env node
/**
 * Bundles the two module entry points of a built extension directory, in place.
 *
 * ## Why
 *
 * The page context alone is ~70 ES module files, seven levels deep. The browser
 * cannot know it needs level 7 until it has fetched and parsed levels 1 to 6, so
 * the module graph is a request waterfall in front of every page load - and OGame
 * is not a single-page app, so that waterfall is paid again on every view change.
 * Bundling collapses it to one request per context.
 *
 * ## Chunks (Phase 5 of refactoring.md)
 *
 * One file per context was the whole story until the page bundle reached 1.1 MB,
 * all of it parsed on every view change even though most pages use a fraction of
 * it. The entry keeps every static import; anything reached through a dynamic
 * `import()` in `src/` becomes its own chunk under `chunks/`, fetched the first
 * time a page actually needs it.
 *
 * This is still one request for the common path: the chunks hang off pages
 * (fleetdispatch, the build pages) and off buttons (statistics, settings), not
 * off the boot sequence. Rollup decides the split from the import graph - there
 * is no list of chunks here to keep in step with `src/`.
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
const ENTRY_POINTS = ["ogCore.js", "ctxcontent/index.js"];

/**
 * Where split-out chunks are written, relative to the entry point's directory.
 *
 * A directory rather than the root because both manifests have to make the files
 * web-accessible, and `chunks/*` is one entry that never needs editing again -
 * where a root-level name would need adding to two manifests per chunk.
 */
const CHUNK_DIR = "chunks";

/**
 * Directories that exist only to be imported by the entry points above.
 * `--prune` removes them; the build flows do not use it, because keeping the
 * readable per-file source in the package is worth more than the bytes.
 */
const MODULE_DIRS = ["game", "ogame", "store", "ui", "format", "platform", "integrations", "ctxpage"];

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
 * Names a chunk after the source it was split at, instead of rollup's default.
 *
 * The default derives from the module's basename, and half of `src/ctxpage/` is
 * called `index.js`, so the output would be `index.js`, `index2.js`, `index3.js` -
 * stable, but useless to a reviewer holding the bundle next to the source. Naming
 * the chunk after its directory means `chunks/stats.js` is the statistics popup and
 * nothing else has to be looked up.
 *
 * @param {{facadeModuleId: string|null, name: string}} chunk
 * @returns {string}
 */
function chunkFileNames(chunk) {
  // No facade module means rollup invented this chunk to hold code two other
  // chunks share. It has no single source to be named after, so it says so.
  if (!chunk.facadeModuleId) return `${CHUNK_DIR}/shared-${chunk.name}.js`;

  const base = path.basename(chunk.facadeModuleId, ".js");
  const name = base === "index" ? path.basename(path.dirname(chunk.facadeModuleId)) : base;
  return `${CHUNK_DIR}/${name}.js`;
}

/**
 * @param {string} dir directory holding a built copy of src/
 * @param {{prune?: boolean}} [options]
 * @returns {Promise<{file: string, bytes: number}[]>} one entry per file written
 */
export async function bundle(dir, options = {}) {
  const written = [];

  for (const entry of ENTRY_POINTS) {
    const input = path.join(dir, entry);
    if (!fs.existsSync(input)) throw new Error(`Bundle entry point not found: ${input}`);

    // Chunks are emitted next to their entry point, because a dynamic import in
    // the bundle resolves relative to the file it is written in.
    const outDir = path.dirname(input);

    // "allow-extension" keeps the entry file the real bundle. The default
    // ("exports-only") emits a facade - a two-line ogCore.js that re-exports a
    // chunk holding the whole program - which would move every byte off the file
    // the manifest injects and defeat the point of measuring the entry at all.
    const build = await rollup({ input, onwarn, treeshake: false, preserveEntrySignatures: "allow-extension" });
    // generate + write by hand rather than build.write(): one output path is the
    // input path, and this way nothing is written until the whole graph has been
    // read and every chunk generated.
    const { output } = await build.generate({
      format: "es",
      banner: BANNER,
      indent: false,
      entryFileNames: path.basename(entry),
      chunkFileNames: chunkFileNames,
      // A module used by both the entry and a chunk stays in the entry, and the
      // chunk imports it back. Rollup renames those cross-chunk bindings to `a`,
      // `$`, `a0` by default - which is minification by another name, in the one
      // file a reviewer is most likely to open (AGENTS.md 0). Off.
      minifyInternalExports: false,
    });
    await build.close();

    for (const chunk of output) {
      // `generate` yields assets as well as chunks in principle; nothing here
      // emits one, and writing a stray asset as if it were code would be worse
      // than saying so.
      if (chunk.type !== "chunk") throw new Error(`Unexpected ${chunk.type} in the ${entry} bundle`);

      const target = path.join(outDir, chunk.fileName);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, chunk.code);
      written.push({
        file: path.join(path.dirname(entry), chunk.fileName).replaceAll("\\", "/"),
        bytes: fs.statSync(target).size,
        entry: chunk.isEntry,
      });
    }
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

  // ctxcontent/ keeps its bundle and its chunks, and loses everything else.
  const contentDir = path.join(dir, "ctxcontent");
  for (const entry of fs.readdirSync(contentDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === "index.js") continue;
    if (entry.isDirectory() && entry.name === CHUNK_DIR) continue;
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
