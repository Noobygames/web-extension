import { createDOM, createDOMSanitized } from "../../util/dom.js";
import { toFormattedNumber, fromFormattedNumber } from "../../util/numbers.js";
import OGBIData from "../../util/OGBIData.js";
import Translator from "../../util/translate.js";
import shipEnum from "../../util/enum/ship.js";

/**
 * The "keep on planet" dialog: how many resources and ships a planet is never to send
 * away, edited per planet or as the default for all of them.
 *
 * Lifted out of `OGBeyondInfinity` in Phase 3 of refactoring.md. It sits under
 * `ctxpage/fleetdispatch/` because that is where the rule is applied, even though the
 * settings page is the other place that opens it - which is exactly why it could not
 * stay a method on the page controller.
 *
 * @param {string|null} coords the planet to edit, or null for the global default
 * @param {HTMLElement} [btn] save button to enable once something changed
 * @param {{hasLifeforms: boolean, current: object}} context page facts the dialog reads
 */

function keepOnPlanetDialog(coords, btn, context) {
  let kept;
  let defaultKeptMoon;
  if (coords) {
    kept = OGBIData.json.options.kept[coords];
  } else {
    defaultKeptMoon = OGBIData.json.options.defaultKeptMoon;
  }
  if (!kept) kept = OGBIData.json.options.defaultKept;
  if (!defaultKeptMoon) defaultKeptMoon = OGBIData.json.options.defaultKept; //initialize with defaultKept values if not set
  let container = createDOM("div");
  if (coords) {
    container.appendChild(
      createDOM(
        "h1",
        { style: "text-align: center; font-weight: 800" },
        context.current.coords +
          (context.current.isMoon ? ` (${Translator.translate(194)})` : ` (${Translator.translate(42)})`)
      )
    );
    container.appendChild(createDOM("hr"));
  }
  let box = createDOM("div", { class: "ogk-keep-dialog" });
  box.appendChild(createDOM("h1", {}, Translator.translate(28)));
  let boxResources = box.appendChild(
    createDOM("div", { class: `ogk-keep-dialog-resources${coords ? " ogk-keep-dialog-resources-coord" : ""}` })
  );
  let prodPlanet;
  if (!coords) {
    prodPlanet = boxResources.appendChild(createDOM("div"));
    prodPlanet.appendChild(createDOM("h1", {}, Translator.translate(42)));

    prodPlanet = prodPlanet.appendChild(createDOM("div", { class: "ogk-adjust-grid" }));
  } else {
    prodPlanet = boxResources.appendChild(createDOM("div", { class: "ogk-adjust-grid" }));
  }
  prodPlanet.appendChild(createDOM("span").appendChild(createDOM("a", { class: "resourceIcon metal" })).parentElement);
  let metInputPlanet = prodPlanet.appendChild(
    createDOM("input", {
      class: "ogl-formatInput metal",
      type: "text",
      value: toFormattedNumber(kept[0]) || toFormattedNumber(0),
    })
  );
  prodPlanet.appendChild(
    createDOM("span").appendChild(createDOM("a", { class: "resourceIcon crystal" })).parentElement
  );
  let criInputPlanet = prodPlanet.appendChild(
    createDOM("input", {
      class: "ogl-formatInput crystal",
      type: "text",
      value: toFormattedNumber(kept[1]) || toFormattedNumber(0),
    })
  );
  prodPlanet.appendChild(
    createDOM("span").appendChild(createDOM("a", { class: "resourceIcon deuterium" })).parentElement
  );
  let deutInputPlanet = prodPlanet.appendChild(
    createDOM("input", {
      class: "ogl-formatInput deuterium",
      type: "text",
      value: toFormattedNumber(kept[2]) || toFormattedNumber(0),
    })
  );
  let foodInputPlanet;
  if (context.hasLifeforms) {
    prodPlanet.appendChild(createDOM("span").appendChild(createDOM("a", { class: "resourceIcon food" })).parentElement);
    foodInputPlanet = prodPlanet.appendChild(
      createDOM("input", {
        class: "ogl-formatInput food",
        type: "text",
        value: toFormattedNumber(kept[3]) || toFormattedNumber(0),
      })
    );
  }
  // Moon resources
  let metInputMoon;
  let criInputMoon;
  let deutInputMoon;
  let foodInputMoon;
  if (!coords) {
    boxResources.appendChild(createDOM("div", { class: "ogk-keep-dialog-separator" }));
    let prodMoon = boxResources.appendChild(createDOM("div"));
    prodMoon.appendChild(createDOM("h1", {}, Translator.translate(194)));
    prodMoon = prodMoon.appendChild(createDOM("div", { class: "ogk-adjust-grid" }));
    prodMoon.appendChild(createDOM("span").appendChild(createDOM("a", { class: "resourceIcon metal" })).parentElement);
    metInputMoon = prodMoon.appendChild(
      createDOM("input", {
        class: "ogl-formatInput metal",
        type: "text",
        value: toFormattedNumber(defaultKeptMoon[0]) || toFormattedNumber(0),
      })
    );
    prodMoon.appendChild(
      createDOM("span").appendChild(createDOM("a", { class: "resourceIcon crystal" })).parentElement
    );
    criInputMoon = prodMoon.appendChild(
      createDOM("input", {
        class: "ogl-formatInput crystal",
        type: "text",
        value: toFormattedNumber(defaultKeptMoon[1]) || toFormattedNumber(0),
      })
    );
    prodMoon.appendChild(
      createDOM("span").appendChild(createDOM("a", { class: "resourceIcon deuterium" })).parentElement
    );
    deutInputMoon = prodMoon.appendChild(
      createDOM("input", {
        class: "ogl-formatInput deuterium",
        type: "text",
        value: toFormattedNumber(defaultKeptMoon[2]) || toFormattedNumber(0),
      })
    );

    if (context.hasLifeforms) {
      prodMoon.appendChild(createDOM("span").appendChild(createDOM("a", { class: "resourceIcon food" })).parentElement);
      foodInputMoon = prodMoon.appendChild(
        createDOM("input", {
          class: "ogl-formatInput food",
          type: "text",
          value: toFormattedNumber(defaultKeptMoon[3]) || toFormattedNumber(0),
        })
      );
    }
  }

  box.appendChild(createDOM("hr"));
  box.appendChild(createDOM("h1", {}, Translator.translate(29)));

  let boxFleet = box.appendChild(
    createDOM("div", { class: `ogk-keep-dialog-fleet${coords ? " ogk-keep-dialog-fleet-coord" : ""}` })
  );
  let fleetPlanet = boxFleet.appendChild(createDOM("div"));
  if (!coords) fleetPlanet.appendChild(createDOM("h1", {}, Translator.translate(42)));
  fleetPlanet = fleetPlanet.appendChild(createDOM("div", { class: "ogk-bhole-grid" }));
  let inputs = [];
  let inputsMoon = [];
  const shipIds = [202, 203, 210, 208, 209, 204, 205, 206, 219, 207, 215, 211, 213, 218, 214];
  shipIds.forEach((id) => {
    fleetPlanet.appendChild(createDOM("a", { class: "ogl-option ogl-fleet-ship ogl-fleet-" + id }));
    let input = fleetPlanet.appendChild(
      createDOM("input", {
        class: "ogl-formatInput",
        type: "text",
        data: id,
        value: toFormattedNumber(kept[id]) || toFormattedNumber(0),
      })
    );
    inputs.push(input);
  });
  if (!coords) {
    boxFleet.appendChild(createDOM("div", { class: "ogk-keep-dialog-separator" }));
    let fleetMoon = boxFleet.appendChild(createDOM("div"));
    fleetMoon.appendChild(createDOM("h1", {}, Translator.translate(194)));
    fleetMoon = fleetMoon.appendChild(createDOM("div", { class: "ogk-bhole-grid" }));

    shipIds.forEach((id) => {
      fleetMoon.appendChild(createDOM("a", { class: "ogl-option ogl-fleet-ship ogl-fleet-" + id }));
      inputsMoon.push(
        fleetMoon.appendChild(
          createDOM("input", {
            class: "ogl-formatInput",
            type: "text",
            data: id,
            value: toFormattedNumber(defaultKeptMoon[id]) || toFormattedNumber(0),
          })
        )
      );
    });
  }
  if (!btn) {
    btn = box.appendChild(createDOM("button", { class: "btn_blue" }, Translator.translate(27)));
  }
  btn.addEventListener("click", () => {
    kept = {};
    defaultKeptMoon = {};
    inputs.forEach((input) => {
      let id = Number(input.getAttribute("data"));
      let amount = fromFormattedNumber(input.value, true);
      if (amount > 0) {
        kept[id] = amount;
      }
    });
    if (!coords) {
      inputsMoon.forEach((input) => {
        let id = Number(input.getAttribute("data"));
        let amount = fromFormattedNumber(input.value, true);
        if (amount > 0) {
          defaultKeptMoon[id] = amount;
        }
      });
      defaultKeptMoon[0] = fromFormattedNumber(metInputMoon.value, true);
      defaultKeptMoon[1] = fromFormattedNumber(criInputMoon.value, true);
      defaultKeptMoon[2] = fromFormattedNumber(deutInputMoon.value, true);
      if (context.hasLifeforms) defaultKeptMoon[3] = fromFormattedNumber(foodInputMoon.value, true);
    }
    kept[0] = fromFormattedNumber(metInputPlanet.value, true);
    kept[1] = fromFormattedNumber(criInputPlanet.value, true);
    kept[2] = fromFormattedNumber(deutInputPlanet.value, true);
    if (context.hasLifeforms) kept[3] = fromFormattedNumber(foodInputPlanet.value, true);
    if (coords) {
      OGBIData.json.options.kept[coords] = kept;
    } else {
      OGBIData.json.options.defaultKept = kept;
      OGBIData.json.options.defaultKeptMoon = defaultKeptMoon;
    }
    OGBIData.needSync = true;
    document.querySelector(".ogl-dialog .close-tooltip").click();
    location.reload();
  });
  if (coords) {
    let resetBtn = box.appendChild(createDOM("button", { class: "btn_blue ogl-btn_red" }, Translator.translate(26)));
    resetBtn.addEventListener("click", () => {
      delete OGBIData.json.options.kept[coords];
      OGBIData.needSync = true;
      document.querySelector(".ogl-dialog .close-tooltip").click();
      location.reload();
    });
  }
  container.appendChild(box);
  return container;
}

export { keepOnPlanetDialog };
