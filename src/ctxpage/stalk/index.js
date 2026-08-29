import * as DOM from "../../util/dom.js";
import { createDOM } from "../../util/dom.js";
import { toFormattedNumber } from "../../util/numbers.js";
import OGBIData from "../../util/OGBIData.js";
import OgamePageData from "../../util/OgamePageData.js";
import * as stalkUtil from "../../util/stalk.js";
import dataHelper from "../../util/dataHelper.js";
import markerui from "../../util/markerui.js";
import { generateMMORPGLink } from "../../util/mmorpgStats.js";
import { generateHiscoreLink, highlightTarget, stalk } from "../galaxy/index.js";

/**
 * Looking at other players: the search box, the stalk panel on the left, and the
 * highscore additions.
 *
 * Lifted out of `OGBeyondInfinity` in Phase 3 of refactoring.md.
 *
 * Compliance note (AGENTS.md 1.5.1): these views show coordinates and link into
 * galaxy view. None of them attaches a probe action to a coordinate - that is exactly
 * the case the rule names, and `probingWarning()` explains the inert icons.
 */

function timeSince(context, date) {
  var seconds = Math.floor((new Date(serverTime) - date) / 1e3);
  var interval = Math.floor(seconds / 86400);
  let since = "";
  if (interval >= 1) {
    since += interval + "d ";
  }
  seconds = seconds % 86400;
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) {
    since += interval + "h ";
  }
  seconds = seconds % 3600;
  interval = Math.floor(seconds / 60);
  if (interval >= 1 && since.indexOf("d") == -1) {
    since += interval + "m";
  }
  if (since == "") {
    since = "Just now";
  } else {
    since += " ago";
  }
  return since;
}

function generatePTRELink(context, playerid) {
  return `https://ptre.chez.gg/?country=${OgamePageData.gameLang}&univers=${context.universe}&player_id=${playerid}`;
}

function getPlayerStatus(context, status, noob) {
  if (status == "") {
    if (noob) return "status_abbr_noob";
    return "status_abbr_active";
  }
  if (status.includes("b")) return "status_abbr_banned";
  if (status.includes("v")) return "status_abbr_vacation";
  if (status.includes("i")) return "status_abbr_inactive";
  if (status.includes("I")) return "status_abbr_longinactive";
  if (status.includes("o")) return "status_abbr_outlaw";
}

function playerSearch(context, show, name) {
  let renderPlayerInfo = (player) => {
    OGBIData.json.playerSearch = player.name;
    OGBIData.Save();
    let planetsColumn = createDOM("div", { class: "ogl-planets-col" });
    let controlRow = planetsColumn.appendChild(createDOM("div", { class: "ogl-search-controls" }));
    let name = `<span>${player.name}</span> <span class="${getPlayerStatus(
      context,
      player.status
    )}"></span>\n                  <a target="_self"\n                    href="${generateHiscoreLink(
      context.galaxyContext,
      player.id
    )}"\n                    class="ogl-ranking">#${player.points.position || "b"}\n                  </a>`;
    controlRow.appendChild(DOM.createDOMSanitized("span", {}, name));
    let btns = controlRow.appendChild(createDOM("div"));

    if (OGBIData.json.options.ptreTK) {
      let ptreLink = btns.appendChild(
        createDOM(
          "a",
          {
            class: "ogl-ptre",
            href: generatePTRELink(context, player.id),
            target: generatePTRELink(context, player.id),
          },
          "P"
        )
      );
    }

    let stats = btns.appendChild(
      createDOM("a", {
        class: "ogl-mmorpgstats",
        href: generateMMORPGLink(context.universe, player.id),
        target: generateMMORPGLink(context.universe, player.id),
      })
    );
    let pinBtn = btns.appendChild(createDOM("a", { class: "ogl-pin" }));

    let chat = btns.appendChild(createDOM("a", { class: "icon icon_chat" }));
    pinBtn.addEventListener("click", () => {
      sideStalk(context, player.id);
    });
    chat.addEventListener("click", () => {
      sendMessage(context, player.id);
    });

    let detailRank = planetsColumn.appendChild(createDOM("div", { class: "ogl-detailRank" }));
    const detailRankDiv1 = createDOM("div");
    detailRankDiv1.replaceChildren(
      createDOM("div", { class: "ogl-totalIcon" }),
      document.createTextNode(` ${toFormattedNumber(Number(player.points.score), null, true)} `),
      createDOM("small", {}, "pts")
    );
    const detailRankDiv2 = createDOM("div");
    detailRankDiv2.replaceChildren(
      createDOM("div", { class: "ogl-ecoIcon" }),
      document.createTextNode(` ${toFormattedNumber(Number(player.economy.score), null, true)} `),
      createDOM("small", {}, "pts")
    );
    const detailRankDiv3 = createDOM("div");
    detailRankDiv3.replaceChildren(
      createDOM("div", { class: "ogl-techIcon" }),
      document.createTextNode(` ${toFormattedNumber(Number(player.research.score), null, true)} `),
      createDOM("small", {}, "pts")
    );
    const detailRankDiv4 = createDOM("div");
    detailRankDiv4.replaceChildren(
      createDOM("div", { class: "ogl-fleetIcon" }),
      document.createTextNode(` ${toFormattedNumber(Number(player.military.score), null, true)} `),
      createDOM("small", {}, "pts")
    );
    const detailRankDiv5 = createDOM("div");
    detailRankDiv5.replaceChildren(
      createDOM("div", { class: "ogl-fleetIcon grey" }),
      document.createTextNode(` ${toFormattedNumber(Number(player.def), null, true)} `),
      createDOM("small", {}, "pts")
    );
    const detailRankDiv6 = createDOM("div");
    detailRankDiv6.replaceChildren(
      createDOM("div", { class: "ogl-fleetIcon orange" }),
      document.createTextNode(` ${toFormattedNumber(Number(player.military.ships), null, true)} `),
      createDOM("small", {}, "ships")
    );
    detailRank.replaceChildren(
      detailRankDiv1,
      detailRankDiv2,
      detailRankDiv3,
      detailRankDiv4,
      detailRankDiv5,
      detailRankDiv6
    );
    let stalkPlanets = createDOM("div", { class: "ogl-stalkPlanets", "player-id": player.id });
    planetsColumn.appendChild(stalkPlanets);
    updateStalk(context, player.planets).forEach((e) => stalkPlanets.appendChild(e));
    highlightTarget(context.galaxyContext);
    let updateTime = planetsColumn.appendChild(createDOM("div", { class: "ogl-right ogl-date" }));
    updateTime.textContent = timeSince(context, new Date(player.lastUpdate));
    return planetsColumn;
  };
  let activeId, activeNode;
  // async, not forEach(async ...): forEach never awaits its callback, so the DOM
  // row for each player was appended whenever that player's own await resolved -
  // not in the rank/position order updateSearch() had just sorted them into.
  // refactoring-new.md Phase A.4 #9.
  let updatePlayerList = async (players, forced) => {
    for (const [index, player] of players.entries()) {
      if (forced && index != 0) continue;
      if (!player.points) {
        player.points = player.economy = player.research = player.military = { position: 0, score: 0 };
      }
      let noob = false;
      let self = await dataHelper.getPlayer(playerId);
      let currentScore = self.points.score;
      if (currentScore > 5e5) {
        if (player.points.score < 5e5) {
          if (player.points.score < 5e4) {
            noob = currentScore / player.points.score > 5;
          } else {
            noob = currentScore / player.points.score > 10;
          }
        }
      }
      let playerNode = createDOM("div", { class: "ogl-player-div" });
      let name = createDOM(
        "span",
        { class: getPlayerStatus(context, player.status, noob) },
        `${player.name} ${player.status == "" ? "" : "(" + player.status + ") "}`
      );
      playerNode.appendChild(
        createDOM(
          "a",
          { href: generateHiscoreLink(context.galaxyContext, player.id), class: "ogl-ranking" },
          `#${toFormattedNumber(Number(player.points.position)) || "b"}`
        )
      );
      let alliance = "";
      if (player.alliance) alliance = player.alliance.match(/^\[[^\]]*\]/)[0];
      playerNode.appendChild(name);
      let alliNode = playerNode.appendChild(createDOM("span", { class: "ogl-alliance" }, alliance));
      alliNode.addEventListener("click", (e) => {
        input.value = alliance.replace("[", "").replace("]", "");
        e.stopPropagation();
        updateSearch(input.value, alliance);
      });
      if (activeId == player.id) playerNode.classList.add("ogl-active");
      playerNode.addEventListener("click", () => {
        OGBIData.json.searchHistory.forEach((elem, i) => {
          if (elem.id == player.id) {
            OGBIData.json.searchHistory.splice(i, 1);
          }
        });
        OGBIData.json.searchHistory.push(player);
        if (OGBIData.json.searchHistory.length > 5) {
          OGBIData.json.searchHistory.shift();
        }
        OGBIData.Save();
        if (activeNode) activeNode.classList.remove("ogl-active");
        playerNode.classList.add("ogl-active");
        activeNode = playerNode;
        activeId = player.id;
        dataHelper.getPlayer(player.id).then((pl) => {
          let div = content.querySelector(".ogl-planets-col");
          if (div) div.remove();
          content.appendChild(renderPlayerInfo(pl));
        });
      });
      searchResult.appendChild(playerNode);
      if (forced) playerNode.click();
    }
  };
  let updateSearch = async (value, alliance, forced) => {
    searchResult.replaceChildren();
    if (value.length > 2) {
      var possible = await dataHelper.filter(value, alliance);
      possible.sort((a, b) => {
        if (alliance) {
          if (!a.points) a.points = { position: 1e4 };
          if (!b.points) b.points = { position: 1e4 };
          return a.points.position - b.points.position;
        } else {
          return a.name - b.name;
        }
      });
      updatePlayerList(possible, forced);
      if (possible.length == 0) {
        searchResult.appendChild(createDOM("div", { style: "text-align: center;" }, "No results..."));
      }
    } else {
      searchResult.appendChild(createDOM("div", { class: "historic" }, "Historic"));
      updatePlayerList(OGBIData.json.searchHistory.slice().reverse());
    }
  };
  let content = createDOM("div", { class: "ogl-search-content" });
  let searchColumn = content.appendChild(createDOM("div", { class: "ogl-search-col" }));
  let input = searchColumn.appendChild(createDOM("input", { type: "search", placeholder: "Player" }));
  input.addEventListener("keyup", () => {
    updateSearch(input.value, false);
  });
  let searchResult = content.appendChild(createDOM("div", { class: "ogl-search-result" }));
  setTimeout(() => {
    $(".ogl-search-result").mCustomScrollbar({ theme: "ogame" });
    searchResult = document.querySelector(".ogl-search-content .mCSB_container");
  }, 200);
  searchResult.appendChild(createDOM("div", { class: "historic" }, "Historic"));
  updatePlayerList(OGBIData.json.searchHistory.slice().reverse());
  if (name) {
    updateSearch(name, false, true);
    input.value = name;
  }
  if (show) {
    document.querySelector("#planetList").style.display = "none";
    document.querySelector("#countColonies").style.display = "none";
    document.querySelector("#rechts").children[0].appendChild(content);
    document.querySelector(".ogl-search-content input").focus();
  } else {
    document.querySelector("#planetList").style.display = "block";
    document.querySelector("#countColonies").style.display = "block";
    document.querySelector(".ogl-search-content").remove();
    OGBIData.json.playerSearch = "";
    OGBIData.Save();
  }
}

function addPlayerMarkerUI(context, parent, id) {
  markerui.addPlayer(parent, id);
}

function sendMessage(context, id) {
  if (OGBIData.json.tchat) {
    ogame.chat.loadChatLogWithPlayer(Number(id));
  } else {
    document.location = `/game/index.php?page=ingame&component=chat&&playerId=${id}`;
  }
}

function updateStalk(context, planets) {
  return stalkUtil.update(planets);
}

function sideStalk(context, playerid) {
  return stalkUtil.side(playerid);
}

function betterHighscore(context) {
  if (context.page == "highscore") {
    let addTooltip = () => {
      let positions = document.querySelectorAll("#ranks tbody tr");
      positions.forEach((position) => {
        if (!position.classList.contains("ogi-ready")) {
          position.classList.add("ogi-ready");
          let playerDiv = position.querySelector(".playername");
          let countDiv = position.querySelector(".score.tooltip");
          if (countDiv) {
            let count = countDiv.getAttribute("title") || countDiv.getAttribute("data-tooltip-title");
            count = count.split(":")[1].trim();
            const countValues = DOM.createDOM("div", { style: "max-width: 175px; float: right;" });
            countValues.appendChild(
              DOM.createDOM("span", { style: "display: block;" }, ` ${countDiv.textContent.trim()}`)
            );
            countValues.appendChild(
              DOM.createDOM("span", { class: "ogi-highscore-ships", style: "display: block;" }, `(${count})`)
            );
            countDiv.replaceChildren(countValues);
          }

          if (playerDiv) {
            //Reset player marker
            position.classList.remove("ogl-marked");
            position.removeAttribute("data-marked");

            const highscorePlayerId = position.getAttribute("id").match(/[0-9]+$/)[0];

            // exclude own player
            if (highscorePlayerId == playerId) return;

            /*get score cell and add marker ui*/
            const tdScore = position.querySelector(".score");
            const colors = tdScore.appendChild(
              DOM.createDOM("div", {
                class: "ogi-highscore-flag ogl-colors",
                "data-context": "players-highscore",
              })
            );
            addPlayerMarkerUI(context, colors, highscorePlayerId);

            // Update UI with player marker
            if (OGBIData.json.playerMarkers[highscorePlayerId]) {
              position.classList.add("ogl-marked");
              position.setAttribute("data-marked", OGBIData.json.playerMarkers[highscorePlayerId].color);
            }

            dataHelper.getPlayer(highscorePlayerId).then((p) => {
              // if player not found
              if (p.name == undefined) return;

              let statusClass = getPlayerStatus(context, p.status);
              if (playerDiv.getAttribute("class").includes("status_abbr_honorableTarget")) {
                statusClass = "status_abbr_honorableTarget";
              }
              playerDiv.replaceChildren(DOM.createDOM("span", { class: `${statusClass}` }, `${p.name}`));
              stalk(playerDiv, p);
            });
          }
        }
      });
    };

    initHighscoreContent = () => {
      let active = document.querySelector(".stat_filter.active");
      let type = 0;
      if (active) {
        type = active.getAttribute("rel");
      }
      var href = new URL(location.href);
      href.searchParams.set("type", type);
      history.replaceState({}, null, href.toString());
      if (userWantsFocus) {
        if ($("#position" + searchPosition).length > 0) {
          let top = Math.max(0, $("#position" + searchPosition).offset().top - 200);
          scrollTo(0, top);
        }
      }
      $(".changeSite").change(function () {
        var value = $(this).val();
        $("#stat_list_content").replaceChildren(
          createDOM("div", { class: "ajaxLoad" }, ` ${LocalizationStrings.loading} `)
        );
        ajaxCall(
          highscoreContentUrl + "&category=" + currentCategory + "&type=" + currentType + "&site=" + value,
          "#stat_list_content",
          initHighscoreContent
        );
      });
      var scrollToTopButton = $("#scrollToTop");
      var positionCell = $("#ranks thead .score");

      function positionScrollButton() {
        if (positionCell.length) {
          scrollToTopButton.css("left", positionCell.offset().left);
        }
      }

      positionScrollButton();
      $(window).unbind("resize.highscoreTop").bind("resize.highscoreTop", positionScrollButton);
      addTooltip();
    };

    history.scrollRestoration = "manual";
    let type = context.rawURL.searchParams.get("type");
    if (type) {
      $(".stat_filter").removeClass("active");
      $(`.stat_filter[rel=${type}]`).addClass("active");
    }

    setTimeout(function () {
      if (!document.querySelector(".playername.ogl-tooltipInit")) {
        addTooltip();
      }
    }, 500);
  }
}

export { playerSearch, sideStalk, updateStalk, getPlayerStatus, betterHighscore, addPlayerMarkerUI };
