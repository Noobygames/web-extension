import { createSVG } from "./dom.js";

/**
 * OGBI's emblem, as inline SVG. The wordmark that uses it is in `ui/wordmark.js`.
 *
 * Two touching rings for the infinity symbol and a chevron breaking out past the right
 * one - "beyond infinity", which is the name. The same geometry is in
 * `scripts/make-logo.mjs`, which rasterises it for the manifest icons; edit both.
 *
 * **Inline, not a stylesheet background.** It was
 * `background: url("chrome-extension://__MSG_@@extension_id__/assets/images/logo-text.svg")`
 * and the settings dialog came up with an empty box where the logo had been. The file
 * was in the build and rendered correctly on its own, so the problem is somewhere in
 * fetching an extension asset from CSS - and there is nothing to gain by finding out
 * exactly where, because inline markup has no URL to resolve, no `__MSG_@@extension_id__`
 * substitution to depend on, and nothing for a page CSP to have an opinion about. The
 * Ko-fi button two lines below it is inline SVG and was drawing fine the whole time.
 */

/** The disc's gradient needs an id, and two logos on one page must not share it. */
let gradientSeq = 0;

/**
 * @param {SVGElement} svg
 * @returns {string} the gradient id to fill the disc with
 */
export function addDiscGradient(svg) {
  const id = `ogbi-disc-${++gradientSeq}`;
  const gradient = svg
    .appendChild(createSVG("defs"))
    .appendChild(createSVG("radialGradient", { id, cx: "50%", cy: "50%", r: "50%" }));

  gradient.appendChild(createSVG("stop", { offset: "0%", "stop-color": "#0d1420" }));
  gradient.appendChild(createSVG("stop", { offset: "100%", "stop-color": "#16273f" }));

  return id;
}

/** The mark itself, drawn into whatever group is passed in. */
export function drawEmblem(parent, gradientId) {
  parent.appendChild(createSVG("circle", { cx: "256", cy: "256", r: "238", fill: `url(#${gradientId})` }));
  parent.appendChild(
    createSVG("circle", { cx: "256", cy: "256", r: "245", fill: "none", stroke: "#4aa8dd", "stroke-width": "13" })
  );

  const rings = parent.appendChild(createSVG("g", { fill: "none", stroke: "#f2f7fb", "stroke-width": "22" }));
  rings.appendChild(createSVG("circle", { cx: "160", cy: "256", r: "64" }));
  rings.appendChild(createSVG("circle", { cx: "288", cy: "256", r: "64" }));

  parent.appendChild(
    createSVG("path", {
      d: "M382 196 L434 256 L382 316",
      fill: "none",
      stroke: "#63cfff",
      "stroke-width": "22",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    })
  );
}

/**
 * The round mark on its own, for places too small for the name.
 *
 * @param {number} size edge length in pixels
 * @returns {SVGElement}
 */
export function emblem(size = 16) {
  const svg = createSVG("svg", {
    viewBox: "0 0 512 512",
    width: String(size),
    height: String(size),
    class: "ogl-logo-emblem",
  });

  drawEmblem(svg, addDiscGradient(svg));

  return svg;
}
