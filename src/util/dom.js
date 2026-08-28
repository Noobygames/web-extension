export function createDOM(element, attributes, textContent) {
  const e = document.createElement(element);
  for (const key in attributes) {
    e.setAttribute(key, attributes[key]);
  }
  if (textContent) e.textContent = textContent;

  //if element is a select, and doesn't have dropdownInitialized claass, add it => it prevent Ogame restyling it
  if (element === "select" && !e.classList.contains("dropdownInitialized")) {
    e.classList.add("dropdownInitialized");
  }

  return e;
}

/**
 * Like {@link createDOM}, but the content is inserted as HTML through DOMPurify
 * instead of as text. Lifted out of `OGInfinity.createDOM()` unchanged: that copy
 * differed from {@link createDOM} in exactly two ways, both kept here - the content
 * goes through DOMPurify, and a numeric `0` counts as content instead of being
 * skipped as falsy.
 *
 * Deliberately does NOT apply the `dropdownInitialized` class that {@link createDOM}
 * puts on `<select>`, because the class version never did and no caller creates a
 * `<select>` through it today.
 *
 * Page context only - `DOMPurify` is a page global, injected by `main.js`.
 */
export function createDOMSanitized(element, attributes, content) {
  const e = document.createElement(element);
  for (const key in attributes) {
    e.setAttribute(key, attributes[key]);
  }
  if (content || content == 0) e.innerHTML = DOMPurify.sanitize(content);
  return e;
}

export function createSVG(element, attributes) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", element);
  for (const key in attributes) {
    e.setAttributeNS(null, key, attributes[key]);
  }
  return e;
}

// function to change OGame custom select element
export function changeOGSelect(selector, value) {
  const select = document.querySelector(selector);
  if (select) {
    const option = select.querySelector(`option[value="${value}"]`);
    if (option) {
      select.value = value;
      const dropdown = document.querySelector(selector + " + .dropdown > a");
      if (dropdown) dropdown.textContent = option.textContent;
      select.dispatchEvent(new Event("change"));
    }
  }
}
