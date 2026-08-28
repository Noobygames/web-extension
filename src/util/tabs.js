import { createDOM, createDOMSanitized } from "./dom.js";

/**
 * A tab strip over a set of lazily rendered panels.
 *
 * `titles` maps the visible label to a function that builds that panel's content;
 * only the active panel exists in the DOM, and switching tabs discards the old one
 * and calls the next builder. The first entry is rendered immediately.
 *
 * Lifted out of `OGInfinity` in Phase 3 of refactoring.md, unchanged. It sits in
 * `util/` rather than with the statistics popup because nothing about it is about
 * statistics - it is the only tab widget the extension has.
 *
 * Labels go through DOMPurify because they come from the translation tables.
 *
 * @param {Record<string, () => Node>} titles
 * @returns {HTMLElement} the strip and the active panel, as one element
 */
export function tabs(titles) {
  let body = createDOM("div");
  let header = body.appendChild(createDOM("div", { class: "ogl-tabs" }));
  let tabs = [];
  let first;
  for (let title in titles) {
    if (!first) first = titles[title];
    tabs.push(header.appendChild(createDOMSanitized("span", { class: "ogl-tab" }, title)));
  }
  tabs[0].classList.add("ogl-active");
  let tabListener = (evt) => {
    tabs.forEach((tab) => tab.classList.remove("ogl-active"));
    evt.target.classList.add("ogl-active");
    body.children[1].remove();
    body.appendChild(titles[evt.target.textContent]());
  };
  tabs.forEach((tab) => tab.addEventListener("click", tabListener));
  body.appendChild(first());
  return body;
}
