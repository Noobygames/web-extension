/**
 * `createCallbackToken()` exists twice, on purpose.
 *
 * `src/main.js` is a classic content script, not a module, so it cannot import
 * `util/service.callbackEvent.js` - and it has to mint the bridge token itself,
 * because minting it there is what lets `ogCore.js` (1.1 MB) and the content
 * bundle download in parallel instead of one after the other.
 *
 * The duplication is documented at both ends but was never checked. If the two
 * drift - a different length, a different alphabet, a different range - the page
 * half publishes a token the content half will not recognise, and the only
 * symptom is that every `pageContextRequest()` times out. Nothing else in the
 * repo would notice, so it is pinned here: the twins are compared as source, and
 * the token shape is asserted so a coordinated change still has to be deliberate.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { setupBrowser, importFresh } from "../helpers/globals.js";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");

/**
 * The body of the named function, normalised to a single line.
 *
 * Matching source rather than behaviour is the point: the values are random, so
 * no number of samples proves the two generators agree.
 */
function functionBody(file, name) {
  const source = fs.readFileSync(path.join(projectRoot, file), "utf8");
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name}() not found in ${file}`);
  const open = source.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (; end < source.length; end++) {
    if (source[end] === "{") depth++;
    else if (source[end] === "}" && --depth === 0) break;
  }
  return source
    .slice(open + 1, end)
    .replace(/\s+/g, " ")
    .trim();
}

test("main.js mints the bridge token exactly the way the bridge module does", () => {
  const bridge = functionBody("src/util/service.callbackEvent.js", "_createToken");
  const contentScript = functionBody("src/main.js", "createCallbackToken");

  assert.equal(
    contentScript,
    bridge,
    "the hand-copied token generator in src/main.js drifted from _createToken() in " +
      "src/util/service.callbackEvent.js - change both or neither"
  );
});

test("the exported generator produces a lowercase hex token of the documented width", async () => {
  const browser = setupBrowser();
  try {
    const { createCallbackToken } = await importFresh("src/util/service.callbackEvent.js");

    for (let i = 0; i < 500; i++) {
      const token = createCallbackToken();
      // The JSDoc says 12; the `+ 1e6` term can carry a draw at the very top of
      // the range into a 13th digit, roughly once in 280 million. Both twins do
      // it identically, and the token is only ever compared for equality, so the
      // width is asserted as a floor rather than pretended to be exact.
      assert.match(token, /^[0-9a-f]{12,13}$/, `token "${token}" is not hex of the expected width`);
    }
  } finally {
    browser.cleanup();
  }
});
