import { createDOM, createSVG } from "./dom.js";
import Translator from "../format/i18n/translate.js";

/**
 * The donation link, and the button that opens it.
 *
 * Compliance (AGENTS.md 1.8): an optional donation button is explicitly allowed; a fee,
 * a premium tier, a paid subscription or an injected advert is not. So this is a plain
 * link and nothing else - no feature is behind it, nothing is withheld without it, and
 * the tooltip says so. It lives only on OGBI's own surfaces (the settings dialog and the
 * welcome panel), never in OGame's own chrome: 1.7 puts the banners, the top bar, the
 * footer and the Merchant / Officers / Shop items off limits, and a donation button
 * squeezed in beside them would read as exactly the injected advertising 1.8 forbids.
 *
 * No Ko-fi widget script either. Theirs would be a third-party script and a third-party
 * request from the game page - blocked by OGame's CSP, and a beacon telling Ko-fi which
 * of our users opened a settings dialog (AGENTS.md 1.9). The cup below is our own
 * drawing in their brand colour, and nothing leaves the machine until the player clicks.
 */
export const KOFI_URL = "https://ko-fi.com/nerzal";

/** A coffee cup with a heart in it, drawn rather than fetched. */
function cupIcon() {
  const svg = createSVG("svg", { viewBox: "0 0 24 24", width: "16", height: "16", class: "ogl-kofi-cup" });

  svg.appendChild(
    createSVG("path", {
      class: "ogl-kofi-cupBody",
      d: "M2.5 6h13.5v7.5a5.5 5.5 0 0 1-5.5 5.5H8A5.5 5.5 0 0 1 2.5 13.5V6z",
    })
  );
  svg.appendChild(
    createSVG("path", {
      class: "ogl-kofi-cupBody",
      d: "M16 8h1.75a3.25 3.25 0 0 1 0 6.5H16v-2h1.75a1.25 1.25 0 0 0 0-2.5H16V8z",
    })
  );
  svg.appendChild(
    createSVG("path", {
      class: "ogl-kofi-heart",
      d: "M9.25 16c-2.1-1.6-3.6-2.9-3.6-4.6a2.05 2.05 0 0 1 3.6-1.35 2.05 2.05 0 0 1 3.6 1.35c0 1.7-1.5 3-3.6 4.6z",
    })
  );

  return svg;
}

/**
 * @param {"card"|"inline"} [variant] `card` for the settings dialog's own block,
 *   `inline` for a single line inside running text.
 * @returns {HTMLElement}
 */
export function supportButton(variant = "card") {
  const link = createDOM("a", {
    class: `ogl-kofi ogl-kofi-${variant} tooltip`,
    href: KOFI_URL,
    target: "_blank",
    // Opener isolation and no referrer: the donation page has no business knowing which
    // OGame universe the tab it was opened from was on.
    rel: "noopener noreferrer",
    title: Translator.translate(422),
  });

  link.appendChild(cupIcon());
  link.appendChild(createDOM("span", {}, Translator.translate(421)));

  return link;
}

export default supportButton;
