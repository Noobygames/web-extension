/**
 * `ogame/buildQueue.js` - the entries waiting behind the order OGame is building.
 *
 * Every fixture below is trimmed from a real production box on s282-de, OGame
 * 13.0.0-r16. That matters: the first cut of this module assumed a queued entry carried
 * a `.level` element like the running one does, and it does not - the level is bare text
 * beside the icon. The assumption failed silently, which is exactly the kind of mistake
 * a hand-written fixture would have reproduced.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const bootstrap = setupBrowser();
const { queuedInBox, readBuildQueues, QUEUE_BOXES } = await import("../../src/ogame/buildQueue.js");
bootstrap.cleanup();

/** The research box: Hyperraumtechnik 11 running, Spionagetechnik 13 queued behind it. */
const RESEARCH_BOX = `
<div id="productionboxresearchcomponent" class="productionboxresearch injectedComponent parent overview">
  <table cellspacing="0" cellpadding="0" class="construction active"><tbody>
    <tr><th colspan="2">Hyperraumtechnik</th></tr>
    <tr class="data">
      <td class="first" rowspan="3"><div>
        <a href="javascript:void(0);" class="tooltip" onclick="cancelresearch(114, 3188738, &quot;...&quot;); return false;">
          <img class="queuePic" width="40" height="40" alt="Hyperraumtechnik">
        </a>
      </div></td>
      <td class="desc ausbau">Forschen auf <span class="level">Stufe 11</span></td>
    </tr>
  </tbody></table>
  <table class="queue"><tbody><tr>
    <td class="tooltip" style="text-align: center">
      <a class="queue_link dark_highlight_tablet" href="javascript:void(0);"
         onclick="cancelresearch(106, 3188742, &quot;...&quot;); return false;">
        <img class="queuePic" height="28" width="28" alt="Spionagetechnik">
        13
      </a>
    </td>
  </tr></tbody></table>
</div>`;

/** The lifeform research box: one running, three queued - two of them the same tech. */
const LF_RESEARCH_BOX = `
<div id="productionboxlfresearchcomponent" class="productionboxlfresearch injectedComponent parent overview">
  <table cellspacing="0" cellpadding="0" class="construction active"><tbody>
    <tr><th colspan="2">Fusionstriebwerke</th></tr>
    <tr class="data">
      <td class="first" rowspan="3"><div>
        <a href="javascript:void(0);" class="tooltip" onclick="cancellfresearch(11203, 3189947, &quot;...&quot;); return false;">
          <div class="queuePic lifeformqueue lifeformTech11203"></div>
        </a>
      </div></td>
      <td class="desc ausbau">Forschen auf <span class="level">Stufe 11</span></td>
    </tr>
  </tbody></table>
  <table class="queue"><tbody><tr>
    <td class="tooltip" style="text-align: center">
      <a class="queue_link" href="javascript:void(0);" onclick="cancellfresearch(11201, 3194847, &quot;...&quot;); return false;">
        <div class="queuePic lifeformqueuetiny lifeformTech11201"></div>
        11
      </a>
    </td>
    <td class="tooltip" style="text-align: center">
      <a class="queue_link" href="javascript:void(0);" onclick="cancellfresearch(11204, 3194854, &quot;...&quot;); return false;">
        <div class="queuePic lifeformqueuetiny lifeformTech11204"></div>
        6
      </a>
    </td>
    <td class="tooltip" style="text-align: center">
      <a class="queue_link" href="javascript:void(0);" onclick="cancellfresearch(11204, 3194855, &quot;...&quot;); return false;">
        <div class="queuePic lifeformqueuetiny lifeformTech11204"></div>
        7
      </a>
    </td>
  </tr></tbody></table>
</div>`;

/** A box with nothing being built at all - no queue table, just the idle notice. */
const IDLE_BOX = `
<div id="productionboxbuildingcomponent" class="productionboxbuilding injectedComponent parent overview">
  <table cellspacing="0" cellpadding="0" class="construction active"><tbody>
    <tr><td colspan="2" class="idle"><a class="tooltip" href="...">Keine Gebäude im Bau.</a></td></tr>
  </tbody></table>
</div>`;

function withPage(html, run) {
  const browser = setupBrowser({ html });

  try {
    return run();
  } finally {
    browser.cleanup();
  }
}

test("the running order is not part of the queue", () => {
  withPage(RESEARCH_BOX, () => {
    // Hyperraumtechnik 11 is building and paid for; only Spionagetechnik 13 is owed.
    assert.deepEqual(queuedInBox(document.getElementById("productionboxresearchcomponent")), [
      { technoId: 106, tolvl: 13 },
    ]);
  });
});

test("a queued level is the bare text beside the icon, not a .level element", () => {
  withPage(RESEARCH_BOX, () => {
    const box = document.getElementById("productionboxresearchcomponent");

    // The shape that broke the first attempt: one `.level` for two `.queuePic`.
    assert.equal(box.querySelectorAll(".queuePic").length, 2);
    assert.equal(box.querySelectorAll(".level").length, 1);
    assert.equal(queuedInBox(box)[0].tolvl, 13);
  });
});

test("a lifeform entry is identified by its icon class, since it has no alt", () => {
  withPage(LF_RESEARCH_BOX, () => {
    assert.deepEqual(queuedInBox(document.getElementById("productionboxlfresearchcomponent")), [
      { technoId: 11201, tolvl: 11 },
      { technoId: 11204, tolvl: 6 },
      { technoId: 11204, tolvl: 7 },
    ]);
  });
});

test("the same technology queued twice keeps both of its levels, in order", () => {
  withPage(LF_RESEARCH_BOX, () => {
    // Two consecutive levels of Tarnfeld-Generator. Collapsing them to one would drop a
    // level's cost from the plan; the store chains them from one `to` to the next.
    const tarnfeld = queuedInBox(document.getElementById("productionboxlfresearchcomponent")).filter(
      (entry) => entry.technoId === 11204
    );

    assert.deepEqual(
      tarnfeld.map((entry) => entry.tolvl),
      [6, 7]
    );
  });
});

test("an idle box has no queue", () => {
  withPage(IDLE_BOX, () => {
    assert.deepEqual(queuedInBox(document.getElementById("productionboxbuildingcomponent")), []);
  });
});

test("an entry whose technology cannot be read discards the whole queue", () => {
  const broken = `
    <div id="productionboxresearchcomponent">
      <table class="queue"><tbody><tr>
        <td><a class="queue_link"><img class="queuePic" alt="Spionagetechnik">13</a></td>
      </tr></tbody></table>
    </div>`;

  withPage(broken, () => {
    // Half a queue is worse than none: the total would be short by exactly the row that
    // failed, with nothing on screen to say so.
    assert.deepEqual(queuedInBox(document.getElementById("productionboxresearchcomponent")), []);
  });
});

test("an entry with no level discards the whole queue", () => {
  const broken = `
    <div id="productionboxresearchcomponent">
      <table class="queue"><tbody><tr>
        <td><a class="queue_link" onclick="cancelresearch(106, 1, '');"><img class="queuePic"></a></td>
      </tr></tbody></table>
    </div>`;

  withPage(broken, () => {
    assert.deepEqual(queuedInBox(document.getElementById("productionboxresearchcomponent")), []);
  });
});

test("a missing box is not an error", () => {
  withPage("<div></div>", () => {
    assert.deepEqual(queuedInBox(null), []);
    assert.deepEqual(queuedInBox(document.getElementById("nope")), []);
  });
});

test("every box on the page is read into its own build list", () => {
  withPage(`<div id="productionboxBottom">${IDLE_BOX}${RESEARCH_BOX}${LF_RESEARCH_BOX}</div>`, () => {
    assert.deepEqual(readBuildQueues(), {
      research: [{ technoId: 106, tolvl: 13 }],
      lfresearch: [
        { technoId: 11201, tolvl: 11 },
        { technoId: 11204, tolvl: 6 },
        { technoId: 11204, tolvl: 7 },
      ],
    });
  });
});

test("the shipyard box is left out, because ships are charged in full up front", () => {
  assert.deepEqual(Object.values(QUEUE_BOXES).sort(), ["building", "lfbuilding", "lfresearch", "research"]);
  assert.equal(Object.keys(QUEUE_BOXES).includes("productionboxshipyardcomponent"), false);
});
