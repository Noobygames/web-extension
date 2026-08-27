/**
 * Chat enhancements.
 *
 * The markup in these fixtures is copied from a saved OGame page
 * (`tasks/design-changes/example.html`, v13.0.0-r16): `li.chat_msg` with a
 * `.msg_head > .msg_title` holding the sender as plain text, and a sibling
 * `.msg_content`. The sender carries no id anywhere, which is why
 * `resolvePlayerId` exists and why it is tested against both local sources.
 *
 * The coordinate pattern is the load-bearing part: chat is full of clock times
 * and dates that look like coordinates, and a false positive would put an
 * attack link on someone's timestamp.
 *
 * Page context module - no `chrome: true` on setupBrowser.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { setupBrowser } from "../helpers/globals.js";

const ALLIANCE_CHAT = `
<div id="chatBar">
  <ul class="chat_bar_list">
    <li class="chat_bar_list_item" data-associationid="500003">
      <div class="chat_box" data-associationid="500003">
        <div class="chat_box_ctn">
          <ul class="chat clearfix" data-foreign-association-id="500003">
            <li class="chat_msg sys_msg odd" data-foreign-association-id="500003">
              <div class="msg_head">
                <span class="msg_date fright">19:08:01</span>
                <span class="msg_title blue_txt">Systemnachricht</span>
              </div>
              <span class="msg_content">Es wurden 1909 Nachrichten ausgeblendet.</span>
            </li>
            <li class="chat_msg odd" data-chat-id="30501">
              <div class="msg_head">
                <span class="msg_date fright">27.08.2026 18:39:15</span>
                <span class="msg_title blue_txt">Emperor Viking</span>
              </div>
              <span class="msg_content">Mein Mond steht auf 1:34:6, der alte war 1-24-5.</span>
            </li>
            <li class="chat_msg" data-chat-id="30502">
              <div class="msg_head">
                <span class="msg_date fright">27.08.2026 18:40:24</span>
                <span class="msg_title blue_txt">Nerzal</span>
              </div>
              <span class="msg_content">Bin um 18:39:15 da gewesen, am 2026-08-27.</span>
            </li>
          </ul>
        </div>
      </div>
    </li>
    <li class="chat_bar_list_item" data-playerid="104340">
      <div class="chat_box" data-playerid="104340">
        <div class="chat_box_ctn">
          <ul class="chat clearfix" data-foreign-player-id="104340">
            <li class="chat_msg" data-chat-id="73837">
              <div class="msg_head">
                <span class="msg_date fright">20.08.2026 18:52:24</span>
                <span class="msg_title blue_txt">Sovereign Aero</span>
              </div>
              <span class="msg_content">danke, 3:200:8 passt</span>
            </li>
          </ul>
        </div>
      </div>
      <span class="cb_playername" data-playerid="104340">Sovereign Aero</span>
    </li>
  </ul>
</div>`;

/** The logged-in player, as OGame publishes it. */
function setOwnName(document_, name) {
  document_.head.insertAdjacentHTML("beforeend", `<meta name="ogame-player-name" content="${name}">`);
}

async function withChat(run, options = {}) {
  const browser = setupBrowser({ html: ALLIANCE_CHAT, gameLang: "de", ogameVersion: "13.0.0-r16", ...options });
  try {
    setOwnName(browser.document, options.ownName ?? "Nerzal");
    const chat = await import("../../src/ctxpage/chat/index.js");
    await run(chat, browser);
  } finally {
    browser.cleanup();
  }
}

test("findCoordinates accepts both notations players actually type", async () => {
  await withChat(({ findCoordinates }) => {
    assert.deepEqual(
      findCoordinates("Mein Mond steht auf 1:34:6, der alte war 1-24-5.").map((c) => c.raw),
      ["1:34:6", "1-24-5"]
    );

    const [first] = findCoordinates("[1:34:6]");
    assert.deepEqual(
      { galaxy: first.galaxy, system: first.system, position: first.position },
      { galaxy: 1, system: 34, position: 6 }
    );

    // A coordinate at the end of a sentence is still a coordinate.
    assert.equal(findCoordinates("komm nach 4:117:12.").length, 1);
  });
});

test("findCoordinates ignores times, dates and out-of-range positions", async () => {
  await withChat(({ findCoordinates }) => {
    for (const text of [
      "18:39:15", // clock time - galaxy would have to be 18
      "war um 20:15 da", // two parts only
      "2026-08-27", // ISO date
      "27.08.2026", // German date
      "1:34-6", // mixed separators
      "1:34:17", // position above 16
      "1:34:6:7", // longer chain
      "0:34:6", // galaxy 0 does not exist
      "11:34:6", // two-digit galaxy
    ]) {
      assert.deepEqual(findCoordinates(text), [], `should not match: ${text}`);
    }
  });
});

test("linkifyCoordinates wraps coordinates and keeps the surrounding text", async () => {
  await withChat(({ linkifyCoordinates }, { document }) => {
    const content = document.querySelector('[data-chat-id="30501"] .msg_content');
    const wrapped = linkifyCoordinates(content);

    assert.equal(wrapped, 2);
    assert.equal(content.textContent, "Mein Mond steht auf 1:34:6, der alte war 1-24-5.");

    const spans = [...content.querySelectorAll(".ogl-chat-coords")];
    assert.deepEqual(
      spans.map((s) => s.getAttribute("data-coords")),
      ["1:34:6", "1:24:5"]
    );
  });
});

test("linkifyCoordinates leaves text inside links alone and never wraps twice", async () => {
  await withChat(({ linkifyCoordinates }, { document }) => {
    const content = document.querySelector('[data-chat-id="30501"] .msg_content');
    content.innerHTML = '<a href="?page=ingame&component=galaxy">1:34:6</a> und 2:99:3';

    assert.equal(linkifyCoordinates(content), 1);
    assert.equal(linkifyCoordinates(content), 0);
    assert.equal(content.querySelectorAll(".ogl-chat-coords").length, 1);
    assert.equal(content.querySelector("a").textContent, "1:34:6");
  });
});

test("enhanceChat adds the PM button to alliance messages only", async () => {
  await withChat(({ enhanceChat }, { document }) => {
    enhanceChat(document);

    // Foreign sender in the alliance chat: button.
    assert.ok(document.querySelector('[data-chat-id="30501"] .ogl-chat-pm'));
    // System message: no author to write to.
    assert.equal(document.querySelector(".sys_msg .ogl-chat-pm"), null);
    // Own message: OGame rejects a chat with yourself.
    assert.equal(document.querySelector('[data-chat-id="30502"] .ogl-chat-pm'), null);
    // Private conversation: already talking to that player.
    assert.equal(document.querySelector('[data-chat-id="73837"] .ogl-chat-pm'), null);
  });
});

test("enhanceChat wraps coordinates in every chat, private ones included", async () => {
  await withChat(({ enhanceChat }, { document }) => {
    enhanceChat(document);

    assert.equal(document.querySelectorAll('[data-chat-id="30501"] .ogl-chat-coords').length, 2);
    assert.equal(document.querySelector('[data-chat-id="73837"] .ogl-chat-coords').textContent, "3:200:8");
    // The date and time in the third message must survive untouched.
    assert.equal(document.querySelectorAll('[data-chat-id="30502"] .ogl-chat-coords').length, 0);
  });
});

test("enhanceChat is idempotent - the observer may see the same message again", async () => {
  await withChat(({ enhanceChat }, { document }) => {
    enhanceChat(document);
    enhanceChat(document);

    assert.equal(document.querySelectorAll('[data-chat-id="30501"] .ogl-chat-pm').length, 1);
    assert.equal(document.querySelectorAll('[data-chat-id="30501"] .ogl-chat-coords').length, 2);
  });
});

test("PM button opens the game's own chat with the resolved player", async () => {
  await withChat(({ enhanceChat }, { document, window }) => {
    const opened = [];
    window.ogame = { chat: { loadChatLogWithPlayer: (id) => opened.push(id) } };
    window.visibleChats = { players: [{ partnerName: "Emperor Viking", partnerId: "103835" }] };

    enhanceChat(document);
    document.querySelector('[data-chat-id="30501"] .ogl-chat-pm').dispatchEvent(new window.MouseEvent("click"));

    assert.deepEqual(opened, [103835]);
  });
});

test("resolvePlayerId reads the ids OGame already put on the page", async () => {
  await withChat(({ resolvePlayerId }, { document, window }) => {
    // Contact list entry rendered by the chat bar.
    assert.equal(resolvePlayerId("Sovereign Aero", document), 104340);
    // Falls through to the global the chat bar is initialised with.
    window.visibleChats = { players: [{ partnerName: "Nordicloking", partnerId: 102179 }] };
    assert.equal(resolvePlayerId("Nordicloking", document), 102179);
    assert.equal(resolvePlayerId("Unbekannt", document), null);
    assert.equal(resolvePlayerId("", document), null);
  });
});

test("the PM button lands next to the report control, not in the sender line", async () => {
  await withChat(({ enhanceChat }, { document }) => {
    const message = document.querySelector('[data-chat-id="30501"]');
    // OGame adds this at runtime; the class name is guessed defensively, so the
    // fixture uses a spelling the sweep has to catch by attribute, not by class.
    message
      .querySelector(".msg_head")
      .insertAdjacentHTML("beforeend", '<span class="icon fright" title="Diese Nachricht melden"></span>');

    enhanceChat(document);

    const button = message.querySelector(".ogl-chat-pm");
    assert.equal(button.previousElementSibling.getAttribute("title"), "Diese Nachricht melden");
    // Never between the title and the rest of the head - that is what broke the layout.
    assert.notEqual(button.previousElementSibling, message.querySelector(".msg_title"));
  });
});

test("without a report control the button goes to the front of the head and moves later", async () => {
  await withChat(({ enhanceChat }, { document, window }) => {
    enhanceChat(document);

    const message = document.querySelector('[data-chat-id="30501"]');
    const head = message.querySelector(".msg_head");
    assert.equal(head.firstElementChild.classList.contains("ogl-chat-pm"), true);

    // The game adds its report control on hover - the button follows it.
    head.insertAdjacentHTML("beforeend", '<a class="reportMessage"></a>');
    message.dispatchEvent(new window.MouseEvent("mouseenter"));

    assert.equal(message.querySelectorAll(".ogl-chat-pm").length, 1);
    assert.equal(message.querySelector(".ogl-chat-pm").previousElementSibling.className, "reportMessage");
  });
});

test("resolvePlayerId also reads OGame's own chat player list", async () => {
  await withChat(({ resolvePlayerId }, { document, window }) => {
    // Shape is undocumented, so the lookup tolerates the common key spellings.
    window.ogame = { chat: { playerList: { 7: { playerName: "Lord Grus", playerId: "104649" } } } };
    assert.equal(resolvePlayerId("Lord Grus", document), 104649);

    window.ogame.chat.playerList = "not an object";
    assert.equal(resolvePlayerId("Lord Grus", document), null);
  });
});

test("PM button falls back to the extension's universe data", async () => {
  await withChat(async ({ enhanceChat }, { document, window }) => {
    const opened = [];
    window.ogame = { chat: { loadChatLogWithPlayer: (id) => opened.push(id) } };

    // Stands in for the content script answering the ogi-players bridge.
    window.addEventListener("ogi-players", (event) => {
      window.dispatchEvent(
        new window.CustomEvent("ogi-players-rep", {
          detail: { player: { name: event.detail.id, id: 999001 }, requestId: event.detail.requestId },
        })
      );
    });

    enhanceChat(document);
    document.querySelector('[data-chat-id="30501"] .ogl-chat-pm').dispatchEvent(new window.MouseEvent("click"));
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    assert.deepEqual(opened, [999001]);
  });
});

test("the hover menu offers navigation only - no probe, no fleet send", async () => {
  await withChat(({ buildCoordinateMenu }) => {
    const menu = buildCoordinateMenu({ galaxy: 1, system: 34, position: 6 });
    const hrefs = [...menu.querySelectorAll("a")].map((a) => a.getAttribute("href"));

    assert.deepEqual(hrefs, [
      "?page=ingame&component=galaxy&galaxy=1&system=34&position=6",
      "?page=ingame&component=fleetdispatch&galaxy=1&system=34&position=6&type=1",
      "?page=ingame&component=fleetdispatch&galaxy=1&system=34&position=6&type=3",
    ]);

    // AGENTS.md §1.5.1: no direct probing anywhere in this menu, and no
    // preselected mission that would turn the link into a one-click action.
    for (const href of hrefs) {
      assert.ok(!href.includes("miniFleet"), href);
      assert.ok(!href.includes("mission="), href);
    }
  });
});

test("initChatEnhancements picks up messages the game appends later", async () => {
  await withChat(async ({ initChatEnhancements }, { document, window }) => {
    initChatEnhancements();

    const list = document.querySelector('ul.chat[data-foreign-association-id="500003"]');
    list.insertAdjacentHTML(
      "beforeend",
      `<li class="chat_msg" data-chat-id="30599">
         <div class="msg_head"><span class="msg_title">Naraf</span></div>
         <span class="msg_content">bin auf 2:5:16</span>
       </li>`
    );

    // MutationObserver callbacks are microtask-scheduled in jsdom.
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    const added = document.querySelector('[data-chat-id="30599"]');
    assert.ok(added.querySelector(".ogl-chat-pm"));
    assert.equal(added.querySelector(".ogl-chat-coords").getAttribute("data-coords"), "2:5:16");
  });
});
