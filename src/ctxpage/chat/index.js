import { createDOM } from "../../ui/dom.js";
import { tooltip } from "../../ui/tooltip.js";
import Translator from "../../format/i18n/translate.js";
import Player from "../stalk/player.js";
import OGBIObserver from "../../platform/observer.js";
import { getLogger } from "../../platform/logger.js";

/**
 * Chat enhancements - page context.
 *
 * Two additions to OGame's own chat (chat bar and the `component=chat` page):
 *
 *   1. a private-message button next to the sender name of association
 *      (alliance) messages, and
 *   2. a hover menu on every coordinate written in a message.
 *
 * COMPLIANCE (AGENTS.md):
 *
 * - No direct probing. The hover menu never sends a fleet and never calls
 *   `miniFleet` / `sendFleet`; §1.5.1 forbids attaching a probe action to a
 *   coordinate the tool itself collected. The eye entry opens the galaxy view
 *   at that coordinate, which is exactly the flow the rules require - the
 *   player then clicks the game's own probe icon there.
 * - The attack entry only opens `fleetdispatch` with the target prefilled, the
 *   same navigation `OGBeyondInfinity.renderPlanet()` has always used for stalk and
 *   target lists (src/ogCore.js). One click, one page load, no game action:
 *   the player still picks ships and mission and confirms in the game's UI.
 * - Nothing here polls, schedules or refreshes anything. The MutationObserver
 *   only reads chat markup the game itself put on the page the player opened -
 *   no request leaves the browser, so §1.3 / §4 do not apply.
 * - The private-message button opens the game's own chat with that player
 *   (`ogame.chat.loadChatLogWithPlayer`), one click = one action.
 */

const logger = getLogger("chat");

/**
 * A coordinate as players write it in chat: `1:34:6` or `1-24-5`.
 *
 * The ranges are part of the pattern on purpose - they are what keeps clock
 * times and dates out of the result. `18:39:15` cannot match: galaxy is a
 * single `[1-9]`, so the engine would have to start at the `8`, and the
 * lookbehind rejects that because a digit precedes it. `2026-08-27` dies the
 * same way. The trailing guard rejects a following digit or a separator that
 * is itself followed by a digit, so a sentence-ending `1:34:6.` still matches
 * while `1:34:6:7` does not.
 *
 * Both separators are captured once and backreferenced, so `1:34-6` is not a
 * coordinate.
 */
const COORDINATE_PATTERN = /(?<!\d)(?<![\d][:.-])([1-9])([:-])([1-9]\d{0,2})\2(1[0-6]|[1-9])(?!\d)(?![:.-]\d)/g;

/** Marker attribute so the observer never enhances the same message twice. */
const DONE_ATTRIBUTE = "data-ogl-chat";

/**
 * Finds every coordinate in a piece of text.
 *
 * @param {string} text
 * @returns {{raw: string, index: number, length: number, galaxy: number, system: number, position: number}[]}
 */
export function findCoordinates(text) {
  if (!text) return [];

  const found = [];
  const pattern = new RegExp(COORDINATE_PATTERN.source, "g");
  let match;

  while ((match = pattern.exec(text)) !== null) {
    found.push({
      raw: match[0],
      index: match.index,
      length: match[0].length,
      galaxy: Number(match[1]),
      system: Number(match[3]),
      position: Number(match[4]),
    });
  }

  return found;
}

/**
 * @param {{galaxy: number, system: number, position: number}} coords
 * @returns {string} link to the galaxy view, target row highlighted by OGame itself
 */
export function galaxyLink(coords) {
  return `?page=ingame&component=galaxy&galaxy=${coords.galaxy}&system=${coords.system}&position=${coords.position}`;
}

/**
 * Opens the fleet dispatch page with the target prefilled. No mission and no
 * ships are preselected - see the compliance note at the top of the file.
 *
 * @param {{galaxy: number, system: number, position: number}} coords
 * @param {number} [type] 1 planet, 3 moon
 * @returns {string}
 */
export function fleetLink(coords, type = 1) {
  return (
    `?page=ingame&component=fleetdispatch&galaxy=${coords.galaxy}` +
    `&system=${coords.system}&position=${coords.position}&type=${type}`
  );
}

/**
 * Name -> player id, from data the page already holds.
 *
 * Chat messages carry the sender as plain text, with no id anywhere on the
 * element, so the id has to come from somewhere else. Both sources here are
 * local: markup OGame rendered for the contact list / open conversations, and
 * the `visibleChats` global it writes next to the chat bar. Neither costs a
 * request, which matters because §4 counts every background call as activity.
 *
 * @param {string} name
 * @param {Document} [doc]
 * @returns {number|null}
 */
export function resolvePlayerId(name, doc) {
  const target = (name || "").trim();
  if (!target) return null;

  const document_ = doc ?? (typeof document === "undefined" ? undefined : document);
  if (document_) {
    for (const element of document_.querySelectorAll(".cb_playername[data-playerid]")) {
      if (element.textContent.trim() === target) {
        const id = Number(element.getAttribute("data-playerid"));
        if (id) return id;
      }
    }
  }

  const chats = typeof window === "undefined" ? undefined : window.visibleChats;
  for (const entry of chats?.players ?? []) {
    if (String(entry.partnerName).trim() === target) {
      const id = Number(entry.partnerId);
      if (id) return id;
    }
  }

  return fromGamePlayerList(target);
}

/**
 * Last local source: the contact list OGame loads into `ogame.chat.playerList`
 * for its own chat bar. Its shape is not part of any documented interface, so
 * this reads it defensively and gives up rather than throwing.
 *
 * @param {string} target trimmed player name
 * @returns {number|null}
 */
function fromGamePlayerList(target) {
  const list = typeof window === "undefined" ? undefined : window.ogame?.chat?.playerList;
  if (!list || typeof list !== "object") return null;

  try {
    for (const entry of Object.values(list)) {
      if (!entry || typeof entry !== "object") continue;

      const name = entry.name ?? entry.playerName ?? entry.partnerName;
      if (String(name ?? "").trim() !== target) continue;

      const id = Number(entry.id ?? entry.playerId ?? entry.partnerId);
      if (id) return id;
    }
  } catch (error) {
    logger.warn("Could not read ogame.chat.playerList", error);
  }

  return null;
}

/**
 * Opens the game's own private chat with a player.
 *
 * @param {number} playerId
 */
export function openPrivateChat(playerId) {
  const chat = typeof window === "undefined" ? undefined : window.ogame?.chat;

  if (typeof chat?.loadChatLogWithPlayer === "function") {
    chat.loadChatLogWithPlayer(Number(playerId));
    return;
  }

  // Same fallback as OGBeyondInfinity.sendMessage() for pages without the chat bar.
  document.location = `?page=ingame&component=chat&playerId=${playerId}`;
}

/** @returns {boolean} true on the standalone chat page (`component=chat`) */
function isChatPage() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location?.search ?? "");
  return (params.get("component") ?? params.get("page")) === "chat";
}

/** @returns {string} the name of the logged-in player, "" if the meta tag is missing */
function ownPlayerName() {
  return document.querySelector('meta[name="ogame-player-name"]')?.getAttribute("content")?.trim() ?? "";
}

/**
 * Builds the hover menu of one coordinate.
 *
 * @param {{galaxy: number, system: number, position: number}} coords
 * @returns {HTMLElement}
 */
export function buildCoordinateMenu(coords) {
  const menu = createDOM("div", { class: "ogl-chat-menu" });
  const label = `${coords.galaxy}:${coords.system}:${coords.position}`;

  menu.appendChild(createDOM("div", { class: "ogl-chat-menu-title" }, label));

  // Galaxy view. This is also the compliant way to spy a coordinate that was
  // not already in the inbox: the game's own probe icon sits in that row.
  const galaxy = menu.appendChild(createDOM("a", { class: "ogl-chat-menu-entry", href: galaxyLink(coords) }));
  galaxy.appendChild(createDOM("span", { class: "icon icon_eye" }));
  galaxy.appendChild(createDOM("span", {}, Translator.translate(256)));

  // Fleet dispatch, target prefilled only - no mission, no ships, no send.
  const attack = menu.appendChild(createDOM("a", { class: "ogl-chat-menu-entry", href: fleetLink(coords, 1) }));
  attack.appendChild(createDOM("span", { class: "ogl-icon-attack" }));
  attack.appendChild(createDOM("span", {}, Translator.translate(257)));

  const moon = menu.appendChild(createDOM("a", { class: "ogl-chat-menu-entry", href: fleetLink(coords, 3) }));
  moon.appendChild(createDOM("span", { class: "ogl-chat-menu-icon ogl-chat-icon-moon" }));
  moon.appendChild(createDOM("span", {}, Translator.translate(258)));

  // Says out loud why there is no probe button here.
  menu.appendChild(createDOM("div", { class: "ogl-chat-menu-hint" }, Translator.translate(259)));

  return menu;
}

/**
 * Wraps every coordinate inside `container` in a hoverable span.
 *
 * @param {HTMLElement} container usually a `.msg_content`
 * @returns {number} how many coordinates were wrapped
 */
export function linkifyCoordinates(container) {
  if (!container) return 0;

  const walker = container.ownerDocument.createTreeWalker(container, 4 /* NodeFilter.SHOW_TEXT */);
  const textNodes = [];
  let node;

  while ((node = walker.nextNode()) !== null) {
    // Never touch text that already sits in a link or in a menu we built.
    if (node.parentElement?.closest("a, .ogl-chat-coords")) continue;
    if (findCoordinates(node.nodeValue).length) textNodes.push(node);
  }

  let count = 0;

  for (const textNode of textNodes) {
    const text = textNode.nodeValue;
    const fragment = container.ownerDocument.createDocumentFragment();
    let cursor = 0;

    for (const coords of findCoordinates(text)) {
      if (coords.index > cursor) {
        fragment.appendChild(container.ownerDocument.createTextNode(text.slice(cursor, coords.index)));
      }

      const span = createDOM(
        "span",
        {
          class: "ogl-chat-coords",
          "data-coords": `${coords.galaxy}:${coords.system}:${coords.position}`,
        },
        coords.raw
      );

      attachCoordinateMenu(span, coords);
      fragment.appendChild(span);
      cursor = coords.index + coords.length;
      count++;
    }

    if (cursor < text.length) {
      fragment.appendChild(container.ownerDocument.createTextNode(text.slice(cursor)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  }

  return count;
}

/**
 * @param {HTMLElement} span
 * @param {{galaxy: number, system: number, position: number}} coords
 */
function attachCoordinateMenu(span, coords) {
  const open = () => tooltip(span, buildCoordinateMenu(coords), true, { auto: true }, 200, true);

  span.addEventListener("mouseenter", open);
  // Touch devices get the same menu on tap; the entries are plain links, so a
  // second tap follows one of them.
  span.addEventListener("touchstart", open);
}

/**
 * OGame hangs a "report to a game operator" control on every chat message. It
 * is added by the game's own script at runtime, not by the server, so it is
 * absent from any saved page and its class name is not something this repo can
 * look up - hence the attribute sweep instead of one fixed selector.
 *
 * @param {HTMLElement} message an `li.chat_msg`
 * @returns {HTMLElement|null}
 */
export function findReportControl(message) {
  for (const element of message.querySelectorAll("a, button, span, div")) {
    if (element.classList.contains("ogl-chat-pm")) continue;

    const haystack = [
      element.className,
      element.id,
      element.getAttribute("title"),
      element.getAttribute("onclick"),
      element.getAttribute("data-action"),
    ]
      .filter((value) => typeof value === "string")
      .join(" ");

    if (/report|melden|operator/i.test(haystack)) return element;
  }

  return null;
}

/**
 * Puts the button where it does not break the message layout.
 *
 * Inline in the sender line it pushed the title around, so it goes next to the
 * report control instead and floats clear of it - one below the other, both out
 * of the text flow. Without a report control (older versions, or the script has
 * not run yet) it goes to the front of `.msg_head`, where the same float lands
 * it under the date.
 *
 * @param {HTMLElement} message
 * @param {HTMLElement} head the `.msg_head` of that message
 * @param {HTMLElement} button
 */
function placeButton(message, head, button) {
  const report = findReportControl(message);

  if (report?.parentElement) {
    report.after(button);
    return;
  }

  head.insertBefore(button, head.firstChild);

  // OGame often adds the report control only once a message is hovered, which
  // is after this ran. Move the button over as soon as it appears.
  const relocate = () => {
    const late = findReportControl(message);
    if (!late?.parentElement) return;

    message.removeEventListener("mouseenter", relocate);
    late.after(button);
  };

  message.addEventListener("mouseenter", relocate);
}

/**
 * Adds the private-message button to one message.
 *
 * @param {HTMLElement} message an `li.chat_msg`
 * @returns {HTMLElement|null} the button, or null when none was added
 */
export function addPrivateMessageButton(message) {
  const head = message.querySelector(".msg_head");
  const title = head?.querySelector(".msg_title");
  const name = title?.textContent.trim();

  if (!name) return null;
  if (message.querySelector(".ogl-chat-pm")) return null;
  // System messages have no author, and OGame rejects a chat with yourself.
  if (message.classList.contains("sys_msg")) return null;
  if (name === ownPlayerName()) return null;

  const button = createDOM("a", {
    class: "icon icon_chat ogl-chat-pm",
    title: `${Translator.translate(255)} - ${name}`,
  });

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const id = resolvePlayerId(name);
    if (id) {
      openPrivateChat(id);
      return;
    }

    // Nothing local knew the name - ask the universe data the extension has
    // already cached in the content context. Still no request to the game.
    Player.get(name)
      .then((player) => {
        if (player?.id) {
          openPrivateChat(player.id);
          return;
        }

        // Nobody knows this name - a player who never appeared in the universe
        // data and has no open conversation. Opening the chat page at least
        // puts the player in front of the game's own recipient list instead of
        // leaving the click dead.
        logger.warn(`No player id found for "${name}", opening the chat page`);
        document.location = "?page=ingame&component=chat";
      })
      .catch((error) => logger.warn(`Player lookup failed for "${name}"`, error));
  });

  placeButton(message, head, button);

  return button;
}

/**
 * Enhances one chat message: private-message button (association chats only)
 * plus coordinate menus (every chat).
 *
 * @param {HTMLElement} message an `li.chat_msg`
 */
export function enhanceMessage(message) {
  if (!message || message.hasAttribute(DONE_ATTRIBUTE)) return;
  message.setAttribute(DONE_ATTRIBUTE, "1");

  // A private conversation is already with that player, so the button would be
  // a no-op there; the association chats are the ones that need it.
  const isAssociationChat = !!message.closest("[data-associationid], [data-foreign-association-id]");
  if (isAssociationChat) addPrivateMessageButton(message);

  linkifyCoordinates(message.querySelector(".msg_content"));
}

/**
 * @param {ParentNode} root
 */
export function enhanceChat(root) {
  const scope = root ?? (typeof document === "undefined" ? undefined : document);
  if (!scope) return;

  scope.querySelectorAll(`li.chat_msg:not([${DONE_ATTRIBUTE}])`).forEach(enhanceMessage);
}

/**
 * Entry point, called once from `OGBeyondInfinity.start()`.
 *
 * The chat bar renders its history asynchronously and appends every new
 * message, so a one-shot pass over the DOM would only ever catch what happened
 * to be there at start-up - hence the observer. It reacts to markup the game
 * writes; it never asks the server for anything.
 */
export function initChatEnhancements() {
  if (typeof document === "undefined") return;

  const roots = [document.querySelector("#chatBar")].filter(Boolean);

  // The standalone chat page (`component=chat`) fills its message list after
  // load, so there is nothing chat-shaped to hang an observer on yet - watch
  // the content column instead and let the callback filter.
  if (isChatPage()) {
    const pageRoot = document.querySelector("#chatcomponent") ?? document.querySelector("#middle") ?? document.body;
    if (pageRoot) roots.push(pageRoot);
  }

  if (!roots.length) return;

  enhanceChat(document);

  const observe = new OGBIObserver();
  roots.forEach((root) =>
    observe(root, (mutations) => {
      for (const mutation of mutations) {
        for (const added of mutation.addedNodes) {
          if (added.nodeType !== 1) continue;
          if (added.matches?.("li.chat_msg")) enhanceMessage(added);
          else enhanceChat(added);
        }
      }
    })
  );
}

export default { initChatEnhancements, enhanceChat, enhanceMessage, findCoordinates, resolvePlayerId };
