import { createDOM } from "./dom.js";
import OGBIData from "./OGBIData.js";
import PlayerClass from "./enum/playerClass.js";

let resolvedPlayerClass = null;

/**
 * Reads the player class off the character-class widget, on first use.
 *
 * Lazy on purpose: `ogCore.js` is injected at `document_start` so its module
 * graph loads in parallel with the game's page parse, and at that point the
 * widget does not exist yet. `popup()` only ever runs on user interaction.
 *
 * @returns {number} a PlayerClass value
 */
function getPlayerClass() {
  if (resolvedPlayerClass !== null) return resolvedPlayerClass;

  if (document.querySelector("#characterclass .explorer")) {
    resolvedPlayerClass = PlayerClass.EXPLORER;
  } else if (document.querySelector("#characterclass .warrior")) {
    resolvedPlayerClass = PlayerClass.WARRIOR;
  } else if (document.querySelector("#characterclass .miner")) {
    resolvedPlayerClass = PlayerClass.MINER;
  } else {
    resolvedPlayerClass = PlayerClass.NONE;
  }

  return resolvedPlayerClass;
}

export function popup(header, content) {
  let overlay = document.querySelector(".ogl-dialogOverlay");
  if (!overlay) {
    overlay = document.body.appendChild(createDOM("div", { class: "ogl-dialogOverlay" }));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay && !OGBIData.welcome) {
        overlay.classList.remove("ogl-active");
      }
    });
  }
  let dialog = overlay.querySelector(".ogl-dialog");
  if (!dialog) {
    dialog = overlay.appendChild(createDOM("div", { class: "ogl-dialog" }));
    let close = dialog.appendChild(createDOM("div", { class: "close-tooltip" }));
    close.addEventListener("click", () => {
      let welcome = OGBIData.welcome;
      if (welcome) {
        welcome = false;
        OGBIData.welcome = welcome;
        if (getPlayerClass() === PlayerClass.NONE) {
          window.location.href = "?page=ingame&component=characterclassselection";
        } else {
          window.location.href = "?page=ingame&component=overview";
        }
      }
      overlay.classList.remove("ogl-active");
    });
  }
  const top = dialog.querySelector("header") || dialog.appendChild(createDOM("header"));
  const body =
    dialog.querySelector(".ogl-dialogContent") || dialog.appendChild(createDOM("div", { class: "ogl-dialogContent" }));
  top.replaceChildren();
  body.replaceChildren();
  if (header) {
    top.appendChild(header);
  }
  if (content) {
    body.appendChild(content);
  }
  overlay.classList.add("ogl-active");
}
