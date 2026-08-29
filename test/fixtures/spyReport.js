/**
 * A spy-report message row, in the shape `SpyReport` and `SpyMessagesAnalyzer` read it.
 *
 * Unlike `ogamePage.js`'s `messageRow()` helper in `test/ctxpage/messages/analyzers.test.js`
 * (which only carries `.rawMessageData[data-raw-*]`), a spy report also reads a full set of
 * `data-messages-filters-*` attributes straight off the `<li class="msg">` element, plus a
 * handful of nested elements (`.playerName`, `.msg_actions`, `.msgFilteredHeaderRow`, ...).
 * Every selector below is one `SpyReport.js` / `SpyMessagesAnalyzer.js` read - see the two
 * source files for the exact call sites.
 *
 * OGame 13 markup only, hand-written rather than a page dump for the same reason as
 * `ogamePage.js`.
 */

/**
 * @param {number|string} id
 * @param {object} [opts]
 * @param {string} [opts.playername]
 * @param {number} [opts.targetPlayerId] compared against `OGBIData.playerId` for targetIsSelf
 * @param {string} [opts.planetTargetTypeAttr] raw `data-raw-targetplanettype` value, omit for "not set"
 * @param {string} [opts.coords] e.g. "1:2:3"
 * @param {string} [opts.activity] raw `data-messages-filters-activity`, must contain a number
 * @param {string} [opts.fleetFilter] raw `data-messages-filters-fleet` ("-", "0", or anything else)
 * @param {string} [opts.fleetValue] raw `data-raw-fleetvalue`, omit to leave the attribute off
 * @param {string} [opts.defenseFilter] raw `data-messages-filters-defense`
 * @param {string} [opts.defenseValue] raw `data-raw-defensevalue`, omit to leave the attribute off
 * @param {string} [opts.loot] e.g. "25%"
 * @param {number|string} [opts.metal]
 * @param {number|string} [opts.crystal]
 * @param {number|string} [opts.deuterium]
 * @param {number} [opts.timestamp] seconds
 * @param {string} [opts.hashcode]
 * @param {boolean} [opts.isNew]
 * @param {boolean} [opts.favorited]
 * @param {boolean} [opts.attacked]
 * @param {string} [opts.detailLink]
 * @param {string} [opts.coordsLink]
 * @param {Array<{class: string, text?: string}>|null} [opts.statusSpans] children of `.playerName`;
 *        default is a single class-less span (a player with no status badge)
 * @param {object} [opts.rawFleet] `data-raw-fleet` payload (ship id -> count), for the
 *        targetIsSelf recycling-yield path
 * @param {object} [opts.rawDefense] `data-raw-defense` payload (defence id -> count)
 * @returns {HTMLLIElement} already appended to `document.body`
 */
export function spyReportRow(id, opts = {}) {
  const {
    playername = "Enemy One",
    targetPlayerId = 99999,
    planetTargetTypeAttr,
    coords = "1:2:3",
    activity = "15",
    fleetFilter = "1234",
    fleetValue,
    defenseFilter = "56",
    defenseValue,
    loot = "25%",
    metal = 0,
    crystal = 0,
    deuterium = 0,
    timestamp = 1756288800,
    hashcode = "abc123hash",
    isNew = false,
    favorited = false,
    attacked = false,
    detailLink = "https://s1-en.ogame.gameforge.com/detail",
    coordsLink = "https://s1-en.ogame.gameforge.com/coords",
    statusSpans = null,
    rawFleet,
    rawDefense,
  } = opts;

  const li = document.createElement("li");
  li.className = `msg${isNew ? " msg_new" : ""}`;
  li.setAttribute("data-msg-id", String(id));
  li.setAttribute("data-messages-filters-playername", playername);
  li.setAttribute("data-messages-filters-activity", activity);
  li.setAttribute("data-messages-filters-coordinates", `[${coords}]`);
  li.setAttribute("data-messages-filters-fleet", fleetFilter);
  li.setAttribute("data-messages-filters-defense", defenseFilter);
  li.setAttribute("data-messages-filters-loot", loot);
  li.setAttribute("data-messages-filters-metal", String(metal));
  li.setAttribute("data-messages-filters-crystal", String(crystal));
  li.setAttribute("data-messages-filters-deuterium", String(deuterium));

  const statusHtml = statusSpans
    ? statusSpans.map((s) => `<span class="${s.class}">${s.text ?? ""}</span>`).join("")
    : `<span></span>`;

  const escapeAttr = (value) => String(value).replaceAll('"', "&quot;");

  const rawAttrs = [
    `data-raw-targetplayerid="${targetPlayerId}"`,
    planetTargetTypeAttr !== undefined ? `data-raw-targetplanettype="${planetTargetTypeAttr}"` : "",
    `data-raw-timestamp="${timestamp}"`,
    `data-raw-hashcode="${hashcode}"`,
    fleetValue !== undefined ? `data-raw-fleetvalue="${fleetValue}"` : "",
    defenseValue !== undefined ? `data-raw-defensevalue="${defenseValue}"` : "",
    `data-raw-playername="${escapeAttr(playername)}"`,
    rawFleet !== undefined ? `data-raw-fleet="${escapeAttr(JSON.stringify(rawFleet))}"` : "",
    rawDefense !== undefined ? `data-raw-defense="${escapeAttr(JSON.stringify(rawDefense))}"` : "",
  ]
    .filter(Boolean)
    .join(" ");

  li.innerHTML = `
    <div class="msgHeadItem">
      <span class="msgTitle"><a href="${coordsLink}"></a></span>
      <div class="playerName">${statusHtml}</div>
    </div>
    <div class="messageContentWrapper">
      <div class="msgContent"><div class="espionageInfo"></div></div>
      <div class="msg_actions">
        <a onclick="sendShipsWithPopup('x')"></a>
        <message-footer-details><a class="fright" href="${detailLink}"></a></message-footer-details>
        <message-footer-actions></message-footer-actions>
      </div>
    </div>
    <div class="msgFilteredHeaderRow">
      <div class="msgFilteredHeaderCell msgFilteredHeaderCell_fleetValue"><span>-</span></div>
      <div class="msgFilteredHeaderCell msgFilteredHeaderCell_defenseValue"><span>-</span></div>
    </div>
    <span class="rawMessageData" ${rawAttrs}></span>
    ${favorited ? '<span class="icon_favorited"></span>' : ""}
    ${attacked ? '<span class="fleetAction fleetHostile"></span>' : ""}
  `;

  document.body.appendChild(li);
  return li;
}
