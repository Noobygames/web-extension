/**
 * `ctxpage/galaxy/galaxyView.js` - reading a row's owner status.
 *
 * OGame marks status with `status_abbr_*` classes on the spans in the player cell, and
 * a player can carry several at once - "(u,i)" in the German client is vacation *and*
 * inactive. The bashing counter needs only one question answered off that: does the
 * limit apply here at all, which it does not for an inactive owner.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../../helpers/globals.js";

const bootstrap = setupBrowser({
  url: "https://s282-de.ogame.gameforge.com/game/index.php?page=ingame&component=galaxy",
});
const { isBashingExempt } = await import("../../../src/ctxpage/galaxy/galaxyView.js");
bootstrap.cleanup();

/** One galaxy row's player cell, the way the game writes it. */
function row(statuses) {
  const browser = setupBrowser({
    html: `
      <div id="galaxyRow5" class="galaxyRow ctContentRow">
        <div class="galaxyCell cellPlayerName">
          <span class="status_abbr_active">Nordicloking</span>
          <pre>${statuses.map((s) => `<span class="status_abbr_${s}">(x)</span>`).join("")}</pre>
        </div>
      </div>`,
  });

  try {
    return isBashingExempt(document.getElementById("galaxyRow5"));
  } finally {
    browser.cleanup();
  }
}

test("an inactive owner is exempt from the bashing limit", () => {
  assert.equal(row(["inactive"]), true);
});

test("a long-inactive owner is exempt too", () => {
  assert.equal(row(["longinactive"]), true);
});

test("inactive alongside another flag is still inactive", () => {
  // "(u,i)" on a German client: on holiday and inactive.
  assert.equal(row(["vacation", "inactive"]), true);
});

test("an active owner is not exempt", () => {
  assert.equal(row([]), false);
  assert.equal(row(["vacation"]), false, "on holiday is not inactive");
  assert.equal(row(["noob"]), false);
  assert.equal(row(["strong"]), false);
});

test("a row with no player cell is not exempt, and does not throw", () => {
  const browser = setupBrowser({ html: `<div id="galaxyRow13" class="galaxyRow ctContentRow"></div>` });

  try {
    assert.equal(isBashingExempt(document.getElementById("galaxyRow13")), false);
    assert.equal(isBashingExempt(null), false);
    assert.equal(isBashingExempt(undefined), false);
  } finally {
    browser.cleanup();
  }
});
