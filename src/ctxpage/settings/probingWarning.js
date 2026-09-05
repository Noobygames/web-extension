/**
 * The notice explaining why the direct-probe icons do nothing.
 *
 * Compliance, not a setting (AGENTS.md 1.5.1): direct probing is allowed only from
 * galaxy view and from spy reports already in the inbox. The icons OGBI used to
 * attach to stalks, player profiles, target lists and the highscore were exactly
 * the forbidden case, so they stay in place but inert, and this explains that
 * rather than leaving the player clicking a dead icon.
 *
 * Its own file since Phase 5 of refactoring.md: `galaxy/renderPlanet.js` is core
 * code and this used to live in `settings/index.js`, so one 26-line popup held the
 * whole 43 KB settings dialog in the boot bundle. Nothing else in the settings
 * module is reachable from the galaxy view.
 */
import { createDOM } from "../../ui/dom.js";
import * as popupUtil from "../../ui/popup.js";

function probingWarning() {
  const content = createDOM("div", { style: "text-align: center; width: 550px" });
  const text1 = createDOM(
    "span",
    { class: "overmark", style: "font-size: 15px; font-weight: 800;" },
    "Direct probing in stalks, player profiles, target lists and highscore is disabled as requested by "
  );
  text1.append(
    createDOM(
      "a",
      { href: "https://forum.origin.ogame.gameforge.com/forum/thread/29-forbidden-features/", target: "_blank" },
      "Gameforge rules"
    ),
    createDOM("small", { class: "undermark" }, " ('Automation' and 'Drastic shortcuts' sections)")
  );
  content.append(
    text1,
    createDOM("br", {}),
    createDOM("br", {}),
    createDOM("span", {}, "The icons are not functional until a complete removal of the feature is done"),
    createDOM("br", {}),
    createDOM("span", {}, "If you have to blame someone, please do it in the proper direction")
  );
  popupUtil.popup(null, content);
}

export { probingWarning };
export default probingWarning;
