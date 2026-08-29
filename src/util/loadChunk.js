/**
 * Loading a page bundle chunk, without letting a failed fetch take the page down.
 *
 * Phase 5 of refactoring.md splits the page bundle: code that only one page or one
 * button needs is reached through `import()` and fetched when it is needed. That
 * turns a guaranteed local call into a network request against
 * `chrome-extension://<id>/chunks/...`, which introduces a failure mode static
 * imports did not have - a chunk missing from `web_accessible_resources`, an
 * extension reloaded from under a page that is still open, a manifest that lists
 * `chunks/*` in one browser's file and not the other's.
 *
 * Every one of those rejects the promise. Unhandled, that surfaces as
 * `Uncaught (in promise)` with no indication of which feature just stopped
 * existing, so this says the name out loud and resolves to `undefined`. Callers
 * check for it; nothing else on the page is interrupted.
 *
 * Compliance note (AGENTS.md 4): a chunk is a file inside the extension package.
 * No game server is contacted, so no activity is produced.
 */
import { getLogger } from "./logger.js";

const logger = getLogger("chunks");

/**
 * @template T
 * @param {string} name what to call the chunk if it fails, for the log line
 * @param {() => Promise<T>} load a function whose body is the bare `import(...)`,
 *   so the bundler can see the specifier and split at it
 * @returns {Promise<T | undefined>} the module, or undefined when it could not load
 */
export async function loadChunk(name, load) {
  try {
    return await load();
  } catch (error) {
    logger.error(`the "${name}" chunk could not be loaded, so that feature is not available`, error);
    return undefined;
  }
}

export default loadChunk;
