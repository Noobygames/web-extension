import { createDOM, createSVG } from "./dom.js";
import { addDiscGradient, drawEmblem } from "./logo.js";

/**
 * The wordmark - the emblem with the name beside it.
 *
 * Split from `ui/logo.js` for the bundle budget: `ogCore.js` needs only the round
 * emblem for the footer, and the bundler does not tree-shake (`treeshake: false` in
 * scripts/bundle.mjs), so anything sharing that file is paid for by every page load.
 * This half is reached from the settings chunk alone.
 */

/**
 * The emblem plus the name, sized to the 175x71 box `.ogk-logo` has always reserved.
 *
 * The text is real `<text>`, not paths: it is three words in one weight, and a page
 * that has to carry outlines for them is a page that cannot fix a typo. Each line
 * carries `textLength` with `lengthAdjust="spacingAndGlyphs"` so the mark is the same
 * width whatever the system resolves `sans-serif` to - and one advance per character
 * rather than one width for all three lines, because stretching "OGAME" to the width of
 * "INFINITY" spaces it out to nothing.
 *
 * @returns {SVGElement}
 */
export function wordmark() {
  const svg = createSVG("svg", {
    viewBox: "0 0 700 284",
    width: "175",
    height: "71",
    class: "ogl-logo-wordmark",
  });

  const gradientId = addDiscGradient(svg);

  drawEmblem(svg.appendChild(createSVG("g", { transform: "translate(8 42) scale(0.39)" })), gradientId);

  const text = svg.appendChild(
    createSVG("g", { "font-family": "Verdana, DejaVu Sans, sans-serif", "font-size": "62", "font-weight": "700" })
  );

  for (const [word, y, fill, length] of [
    ["OGAME", "80", "#f2f7fb", "280"],
    ["BEYOND", "150", "#63cfff", "336"],
    ["INFINITY", "220", "#f2f7fb", "448"],
  ]) {
    const line = text.appendChild(
      createSVG("text", { x: "222", y, fill, textLength: length, lengthAdjust: "spacingAndGlyphs" })
    );
    line.textContent = word;
  }

  return svg;
}

/**
 * The wordmark in a `.ogk-logo` box, optionally with a trailing label (the version).
 *
 * @param {string} [label]
 * @returns {HTMLElement}
 */
export function logoBlock(label) {
  const block = createDOM("div", { class: "ogk-logo" });

  block.appendChild(wordmark());
  if (label) block.appendChild(createDOM("span", { class: "ogk-logo-label" }, label));

  return block;
}
