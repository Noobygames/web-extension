import * as DOM from "../../util/dom.js";
import { createDOM } from "../../util/dom.js";
import { toFormattedNumber } from "../../util/numbers.js";
import * as standardUnit from "../../util/standardUnit.js";
import Translator from "../../util/translate.js";
import OGBIData from "../../util/OGIData.js";
import { tooltip } from "../../util/tooltip.js";

/**
 * The resource panel that replaces OGame's own numbers in the top bar, and the update
 * that runs when a fresh empire snapshot lands.
 */
function resourceDetail(context) {
  let rechts = document.querySelector("#rechts");
  !context.isMobile &&
    rechts.addEventListener("mouseover", () => {
      let rect = rechts.getBoundingClientRect();
      if (rect.width + rect.x > window.innerWidth) {
        let diff = rect.width + rect.x - window.innerWidth;
        rechts.style.right = diff + "px";
      }
    });
  !context.isMobile &&
    rechts.addEventListener("mouseout", (e) => {
      if (e.target.classList.contains("tooltipRight")) return;
      if (e.target.classList.contains("tooltipLeft")) return;
      if (e.target.id == "planetList") {
        return;
      }
      rechts.style.right = "0px";
    });
  if (!OGBIData.json.options.empire || document.querySelectorAll("div[id*=planet-").length != OGBIData.empire.length) {
    return;
  }
  document.querySelector(".ogl-overview-icon").classList.add("ogl-active");
  let list = document.querySelector("#planetList");
  list.classList.add("moon-construction-sum");
  let flying = createDOM("div", { class: "ogl-res" });
  flying.appendChild(
    createDOM(
      "span",
      { class: "tooltip ogl-metal", "data-title": toFormattedNumber(OGBIData.json.flying.metal, 0) },
      toFormattedNumber(OGBIData.json.flying.metal, null, true)
    )
  );
  flying.appendChild(
    createDOM(
      "span",
      { class: "tooltip ogl-crystal", "data-title": toFormattedNumber(OGBIData.json.flying.crystal, 0) },
      toFormattedNumber(OGBIData.json.flying.crystal, null, true)
    )
  );
  flying.appendChild(
    createDOM(
      "span",
      { class: "tooltip ogl-deut", "data-title": toFormattedNumber(OGBIData.json.flying.deuterium, 0) },
      toFormattedNumber(OGBIData.json.flying.deuterium, null, true)
    )
  );
  let flyingSum = createDOM("div", { class: "smallplanet smaller ogl-summary" });
  flyingSum.appendChild(
    createDOM("div", { class: "ogl-sum-symbol" }).appendChild(createDOM("span", { class: "icon_movement" }))
      .parentElement
  );
  flyingSum.appendChild(flying);
  let mSumP = 0,
    cSumP = 0,
    dSumP = 0;
  let mSumM = 0,
    cSumM = 0,
    dSumM = 0;
  OGBIData.empire.forEach((elem) => {
    if (!elem) return;
    let planet = list.querySelector(`div[id=planet-${elem.id}]`);
    if (!planet) return;
    let isFullM = elem.metalStorage - elem.metal > 0 ? "" : " ogl-full";
    let isFullC = elem.crystalStorage - elem.crystal > 0 ? "" : " ogl-full";
    let isFullD = elem.deuteriumStorage - elem.deuterium > 0 ? "" : " ogl-full";
    let isaFullM = elem.metalStorage - elem.metal > elem.production.hourly[0] * 2 ? "" : " ogl-afull";
    let isaFullC = elem.crystalStorage - elem.crystal > elem.production.hourly[1] * 2 ? "" : " ogl-afull";
    let isaFullD = elem.deuteriumStorage - elem.deuterium > elem.production.hourly[2] * 2 ? "" : " ogl-afull";
    let divPla = createDOM("div", { class: "ogl-res" });
    if (elem.invalidate) divPla.classList.add("ogi-invalidate");
    divPla.appendChild(
      createDOM(
        "span",
        { class: "tooltip ogl-metal" + isFullM + isaFullM, "data-title": toFormattedNumber(Math.floor(elem.metal)) },
        toFormattedNumber(Math.floor(elem.metal), null, true)
      )
    );
    divPla.appendChild(
      createDOM(
        "span",
        {
          class: "tooltip ogl-crystal" + isFullC + isaFullC,
          "data-title": toFormattedNumber(Math.floor(elem.crystal)),
        },
        toFormattedNumber(Math.floor(elem.crystal), null, true)
      )
    );
    divPla.appendChild(
      createDOM(
        "span",
        {
          class: "tooltip ogl-deut" + isFullD + isaFullD,
          "data-title": toFormattedNumber(Math.floor(elem.deuterium)),
        },
        toFormattedNumber(Math.floor(elem.deuterium), null, true)
      )
    );
    mSumP += elem.metal;
    cSumP += elem.crystal;
    dSumP += elem.deuterium;
    planet
      .querySelector(".planetlink")
      .parentNode.insertBefore(divPla, planet.querySelector(".planetlink").nextSibling);
    if (elem.moon) {
      let divMoon = createDOM("div", { class: "ogl-res" });
      if (elem.moon.invalidate) {
        divMoon.classList.add("ogi-invalidate");
      }
      divMoon.appendChild(
        createDOM(
          "span",
          { class: "tooltip ogl-metal", "data-title": toFormattedNumber(Math.floor(elem.moon.metal)) },
          toFormattedNumber(Math.floor(elem.moon.metal), null, true)
        )
      );
      divMoon.appendChild(
        createDOM(
          "span",
          { class: "tooltip ogl-crystal", "data-title": toFormattedNumber(Math.floor(elem.moon.crystal)) },
          toFormattedNumber(Math.floor(elem.moon.crystal), null, true)
        )
      );
      divMoon.appendChild(
        createDOM(
          "span",
          { class: "tooltip ogl-deut", "data-title": toFormattedNumber(Math.floor(elem.moon.deuterium)) },
          toFormattedNumber(Math.floor(elem.moon.deuterium), null, true)
        )
      );
      mSumM += elem.moon.metal;
      cSumM += elem.moon.crystal;
      dSumM += elem.moon.deuterium;
      planet.appendChild(divMoon);
    }
  });
  let divPlaSum = createDOM("div", { class: "ogl-res" });
  divPlaSum.appendChild(
    createDOM(
      "span",
      { class: "tooltip ogl-metal", "data-title": toFormattedNumber(Math.floor(mSumP)) },
      toFormattedNumber(Math.floor(mSumP), null, true)
    )
  );
  divPlaSum.appendChild(
    createDOM(
      "span",
      { class: "tooltip ogl-crystal", "data-title": toFormattedNumber(cSumP) },
      toFormattedNumber(Math.floor(cSumP), null, true)
    )
  );
  divPlaSum.appendChild(
    createDOM(
      "span",
      { class: "tooltip ogl-deut", "data-title": toFormattedNumber(Math.floor(dSumP)) },
      toFormattedNumber(Math.floor(dSumP), null, true)
    )
  );
  let divMoonSum = createDOM("div", { class: "ogl-res" });
  divMoonSum.appendChild(
    createDOM(
      "span",
      { class: "tooltip ogl-metal", "data-title": toFormattedNumber(Math.floor(mSumM)) },
      toFormattedNumber(Math.floor(mSumM), null, true)
    )
  );
  divMoonSum.appendChild(
    createDOM(
      "span",
      { class: "tooltip ogl-crystal", "data-title": toFormattedNumber(Math.floor(cSumM)) },
      toFormattedNumber(Math.floor(cSumM), null, true)
    )
  );
  divMoonSum.appendChild(
    createDOM(
      "span",
      { class: "tooltip ogl-deut", "data-title": toFormattedNumber(Math.floor(dSumM)) },
      toFormattedNumber(Math.floor(dSumM), null, true)
    )
  );
  let sumPlanet = createDOM("div", { class: "smallplanet smaller ogl-summary" });
  sumPlanet.appendChild(createDOM("div", { class: "ogl-sum-symbol" }, "Σ"));
  sumPlanet.appendChild(divPlaSum);
  let moonSumSymbol = sumPlanet.appendChild(createDOM("div", { class: "ogl-sum-symbol" }, "Σ"));
  sumPlanet.appendChild(divMoonSum);
  list.appendChild(sumPlanet);
  list.appendChild(flyingSum);
  let sum = createDOM("div", { class: "smallplanet smaller ogl-summary" });
  let sumres = createDOM("div", { class: "ogl-res" });

  sumres.appendChild(
    createDOM(
      "span",
      {
        class: "tooltip ogl-metal",
        "data-title": toFormattedNumber(Math.floor(mSumP + mSumM + OGBIData.json.flying.metal)),
      },
      toFormattedNumber(Math.floor(mSumP + mSumM + OGBIData.json.flying.metal), null, true)
    )
  );
  sumres.appendChild(
    createDOM(
      "span",
      {
        class: "tooltip ogl-crystal",
        "data-title": toFormattedNumber(Math.floor(cSumP + cSumM + OGBIData.json.flying.crystal)),
      },
      toFormattedNumber(Math.floor(cSumP + cSumM + OGBIData.json.flying.crystal), null, true)
    )
  );
  sumres.appendChild(
    createDOM(
      "span",
      {
        class: "tooltip ogl-deut",
        "data-title": toFormattedNumber(Math.floor(dSumP + dSumM + OGBIData.json.flying.deuterium)),
      },
      toFormattedNumber(Math.floor(dSumP + dSumM + OGBIData.json.flying.deuterium), null, true)
    )
  );

  sum.appendChild(createDOM("div", { class: "ogl-sum-symbol" }, "ΣΣ"));
  sum.appendChild(sumres);

  const valueSumStandardUnit = standardUnit.standardUnit([
    mSumP + mSumM + OGBIData.json.flying.metal,
    cSumP + cSumM + OGBIData.json.flying.crystal,
    dSumP + dSumM + OGBIData.json.flying.deuterium,
  ]);
  const sumresStandardUnit = createDOM("div", { class: "ogl-res ogl-sum-symbol tooltip" });
  sumresStandardUnit.appendChild(
    createDOM(
      "span",
      {
        class: "tooltip",
        title: `${toFormattedNumber(Math.floor(valueSumStandardUnit))} ${standardUnit.unitType()}`,
      },
      toFormattedNumber(Math.floor(valueSumStandardUnit), null, true)
    )
  );

  const noMoons = document.querySelectorAll(".moonlink").length === 0;
  const sumMsuSideDiv = createDOM(
    "div",
    { class: "ogl-sum-symbol tooltip", title: standardUnit.unitType(true) },
    `${noMoons ? "ΣΣ " : ""}${standardUnit.unitType()}`
  );

  if (noMoons) {
    divMoonSum.style.display = "none";
    moonSumSymbol.style.display = "none";
    list.appendChild(sum);
    const sumMSU = createDOM("div", { class: "smallplanet smaller ogl-summary" });
    sumMSU.appendChild(sumMsuSideDiv);
    sumMSU.appendChild(sumresStandardUnit);
    list.appendChild(sumMSU);
  } else {
    sum.appendChild(sumMsuSideDiv);
    sum.appendChild(sumresStandardUnit);
    list.appendChild(sum);
  }

  // Resource Transport tooltip
  const flyingIcon = document.querySelector(".ogl-sum-symbol .icon_movement");
  const RTlistener = () => {
    const flyingDetails = {};
    OGBIData.json.flying.ids.forEach((mov) => {
      if (mov.resDest && mov.metal + mov.crystal + mov.deuterium > 0) {
        const coords = mov.back ? mov.origin : mov.dest;
        flyingDetails[coords] = flyingDetails[coords] || {
          metal: 0,
          crystal: 0,
          deuterium: 0,
        };
        flyingDetails[coords].metal += mov.metal || 0;
        flyingDetails[coords].crystal += mov.crystal || 0;
        flyingDetails[coords].deuterium += mov.deuterium || 0;
        flyingDetails[coords].name = mov.back ? mov.originName : mov.destName;
        flyingDetails[coords].own = false;
      }
    });
    if (!Object.keys(flyingDetails).length) return;
    OGBIData.empire.forEach((planet) => {
      const indexPlanet = planet.coordinates.slice(1, -1) + "P";
      if (flyingDetails[indexPlanet]) {
        flyingDetails[indexPlanet].own = true;
      }
      if (planet.moon) {
        const indexMoon = planet.coordinates.slice(1, -1) + "M";
        if (flyingDetails[indexMoon]) {
          flyingDetails[indexMoon].own = true;
        }
      }
    });

    const tooltipDiv = DOM.createDOM("div", {}, Translator.translate(128));
    tooltipDiv.appendChild(DOM.createDOM("div", { class: "splitLine" }));
    const tableDiv = tooltipDiv.appendChild(DOM.createDOM("table", { class: "flyingFleet" }));
    const rowHeader = tableDiv.appendChild(DOM.createDOM("tr"));
    rowHeader.append(
      DOM.createDOM("th", { colspan: 3 }, Translator.translate(127)),
      DOM.createDOM("th", { class: "ogl-metal" }, Translator.translate(0, "res")),
      DOM.createDOM("th", { class: "ogl-crystal" }, Translator.translate(1, "res")),
      DOM.createDOM("th", { class: "ogl-deut" }, Translator.translate(2, "res"))
    );

    for (const [coords, details] of Object.entries(flyingDetails)) {
      const coord = coords.slice(0, -1).split(":");
      const moon = coords.includes("M");
      const href = new URLSearchParams({
        page: "ingame",
        component: "galaxy",
        galaxy: coord[0],
        system: coord[1],
        position: coord[2],
      });

      const row = DOM.createDOM("tr");
      row.append(
        DOM.createDOM("td", { class: details.own ? "own" : "friendly" }, details.name),
        DOM.createDOM("td", { class: details.own ? "own" : "friendly" }).appendChild(
          DOM.createDOM("a", { href: `?${href.toString()}` }, `[${coord.join(":")}]`)
        ).parentElement,
        DOM.createDOM("td").appendChild(DOM.createDOM("figure", { class: `planetIcon ${moon ? "moon" : "planet"}` }))
          .parentElement,
        DOM.createDOM("td", { class: "value ogl-metal" }, toFormattedNumber(details.metal)),
        DOM.createDOM("td", { class: "value ogl-crystal" }, toFormattedNumber(details.crystal)),
        DOM.createDOM("td", { class: "value ogl-deut" }, toFormattedNumber(details.deuterium))
      );
      tableDiv.appendChild(row);
    }
    tooltip(flyingIcon, tooltipDiv, false);
  };
  flyingIcon.addEventListener("ontouchstart" in document.documentElement ? "touchstart" : "mouseenter", RTlistener);
}

function updateresourceDetail(context) {
  if (!OGBIData.json.options.empire) return;
  if (!document.querySelector(".ogl-metal")) return;
  flying();
  let mSumP = 0,
    cSumP = 0,
    dSumP = 0;
  let mSumM = 0,
    cSumM = 0,
    dSumM = 0;
  OGBIData.empire.forEach((planet) => {
    let planetNode = document.querySelector(`div[id=planet-${planet.id}]`);
    let isFullM = planet.metalStorage - planet.metal > 0 ? "" : " ogl-full";
    let isFullC = planet.crystalStorage - planet.crystal > 0 ? "" : " ogl-full";
    let isFullD = planet.deuteriumStorage - planet.deuterium > 0 ? "" : " ogl-full";
    let isaFullM = planet.metalStorage - planet.metal > planet.production.hourly[0] * 2 ? "" : " ogl-afull";
    let isaFullC = planet.crystalStorage - planet.crystal > planet.production.hourly[1] * 2 ? "" : " ogl-afull";
    let isaFullD = planet.deuteriumStorage - planet.deuterium > planet.production.hourly[2] * 2 ? "" : " ogl-afull";
    let [resPlanet, resMoon] = planetNode.querySelectorAll(".ogl-res");
    resPlanet.classList.remove("ogi-invalidate");
    if (planet.invalidate) {
      resPlanet.classList.add("ogi-invalidate");
    }
    let metalRess = planetNode.querySelectorAll(".ogl-metal");
    let crystalRess = planetNode.querySelectorAll(".ogl-crystal");
    let deutRess = planetNode.querySelectorAll(".ogl-deut");
    if (metalRess.length > 0) {
      metalRess[0].textContent = toFormattedNumber(Math.floor(planet.metal), null, true);
      metalRess[0].setAttribute("data-title", toFormattedNumber(Math.floor(planet.metal)));
    }
    if (crystalRess.length > 0) {
      crystalRess[0].textContent = toFormattedNumber(Math.floor(planet.crystal), null, true);
      crystalRess[0].setAttribute("data-title", toFormattedNumber(Math.floor(planet.crystal)));
    }
    if (deutRess.length > 0) {
      deutRess[0].textContent = toFormattedNumber(Math.floor(planet.deuterium), null, true);
      deutRess[0].setAttribute("data-title", toFormattedNumber(Math.floor(planet.deuterium)));
    }
    if (metalRess.length > 0) metalRess[0].classList = "ogl-metal tooltip " + isFullM + isaFullM;
    if (crystalRess.length > 0) crystalRess[0].classList = "ogl-crystal tooltip " + isFullC + isaFullC;
    if (deutRess.length > 0) deutRess[0].classList = "ogl-deut tooltip " + isFullD + isaFullD;
    mSumP += planet.metal;
    cSumP += planet.crystal;
    dSumP += planet.deuterium;
    if (planet.moon != undefined && metalRess.length > 0 && metalRess[1]) {
      resMoon.classList.remove("ogi-invalidate");
      if (planet.moon.invalidate) {
        resMoon.classList.add("ogi-invalidate");
      }
      metalRess[1].textContent = toFormattedNumber(Math.floor(planet.moon.metal), null, true);
      metalRess[1].setAttribute("data-title", toFormattedNumber(Math.floor(planet.moon.metal)));
      crystalRess[1].textContent = toFormattedNumber(Math.floor(planet.moon.crystal), null, true);
      crystalRess[1].setAttribute("data-title", toFormattedNumber(Math.floor(planet.moon.crystal)));
      deutRess[1].textContent = toFormattedNumber(Math.floor(planet.moon.deuterium), null, true);
      deutRess[1].setAttribute("data-title", toFormattedNumber(Math.floor(planet.moon.deuterium)));
      mSumM += planet.moon.metal;
      cSumM += planet.moon.crystal;
      dSumM += planet.moon.deuterium;
    }
    let sumNodes = document.querySelectorAll(".ogl-summary");
    sumNodes[0].querySelectorAll(".ogl-metal")[0].textContent = toFormattedNumber(Math.floor(mSumP), null, true);
    sumNodes[0].querySelectorAll(".ogl-metal")[0].setAttribute("data-title", toFormattedNumber(Math.floor(mSumP)));
    sumNodes[0].querySelectorAll(".ogl-metal")[0].setAttribute("class", "ogl-metal tooltip");
    sumNodes[0].querySelectorAll(".ogl-crystal")[0].textContent = toFormattedNumber(Math.floor(cSumP), null, true);
    sumNodes[0].querySelectorAll(".ogl-crystal")[0].setAttribute("data-title", toFormattedNumber(Math.floor(cSumP)));
    sumNodes[0].querySelectorAll(".ogl-crystal")[0].setAttribute("class", "ogl-crystal tooltip");
    sumNodes[0].querySelectorAll(".ogl-deut")[0].textContent = toFormattedNumber(Math.floor(dSumP), null, true);
    sumNodes[0].querySelectorAll(".ogl-deut")[0].setAttribute("data-title", toFormattedNumber(Math.floor(dSumP)));
    sumNodes[0].querySelectorAll(".ogl-deut")[0].setAttribute("class", "ogl-deut tooltip");

    sumNodes[0].querySelectorAll(".ogl-metal")[1].textContent = toFormattedNumber(Math.floor(mSumM), null, true);
    sumNodes[0].querySelectorAll(".ogl-metal")[1].setAttribute("data-title", toFormattedNumber(Math.floor(mSumM)));
    sumNodes[0].querySelectorAll(".ogl-metal")[1].setAttribute("class", "ogl-metal tooltip");
    sumNodes[0].querySelectorAll(".ogl-crystal")[1].textContent = toFormattedNumber(Math.floor(cSumM), null, true);
    sumNodes[0].querySelectorAll(".ogl-crystal")[1].setAttribute("data-title", toFormattedNumber(Math.floor(cSumM)));
    sumNodes[0].querySelectorAll(".ogl-crystal")[1].setAttribute("class", "ogl-crystal tooltip");
    sumNodes[0].querySelectorAll(".ogl-deut")[1].textContent = toFormattedNumber(Math.floor(dSumM), null, true);
    sumNodes[0].querySelectorAll(".ogl-deut")[1].setAttribute("data-title", toFormattedNumber(Math.floor(dSumM)));
    sumNodes[0].querySelectorAll(".ogl-deut")[1].setAttribute("class", "ogl-deut tooltip");

    sumNodes[1].querySelector(".ogl-metal").textContent = toFormattedNumber(
      Math.floor(OGBIData.json.flying.metal),
      null,
      true
    );
    sumNodes[1]
      .querySelector(".ogl-metal")
      .setAttribute("data-title", toFormattedNumber(Math.floor(OGBIData.json.flying.metal)));
    sumNodes[1].querySelector(".ogl-metal").setAttribute("class", "ogl-metal tooltip");

    sumNodes[1].querySelector(".ogl-crystal").textContent = toFormattedNumber(
      Math.floor(OGBIData.json.flying.crystal),
      null,
      true
    );
    sumNodes[1]
      .querySelector(".ogl-crystal")
      .setAttribute("data-title", toFormattedNumber(Math.floor(OGBIData.json.flying.crystal)));
    sumNodes[1].querySelector(".ogl-crystal").setAttribute("class", "ogl-crystal tooltip");

    sumNodes[1].querySelector(".ogl-deut").textContent = toFormattedNumber(
      Math.floor(OGBIData.json.flying.deuterium),
      null,
      true
    );
    sumNodes[1]
      .querySelector(".ogl-deut")
      .setAttribute("data-title", toFormattedNumber(Math.floor(OGBIData.json.flying.deuterium)));
    sumNodes[1].querySelector(".ogl-deut").setAttribute("class", "ogl-deut tooltip");

    sumNodes[2].querySelector(".ogl-metal").textContent = toFormattedNumber(
      Math.floor(mSumP + mSumM + OGBIData.json.flying.metal),
      null,
      true
    );
    sumNodes[2]
      .querySelector(".ogl-metal")
      .setAttribute("data-title", toFormattedNumber(Math.floor(mSumP + mSumM + OGBIData.json.flying.metal)));
    sumNodes[2].querySelector(".ogl-metal").setAttribute("class", "ogl-metal tooltip");
    sumNodes[2].querySelector(".ogl-crystal").textContent = toFormattedNumber(
      Math.floor(cSumP + cSumM + OGBIData.json.flying.crystal),
      null,
      true
    );
    sumNodes[2]
      .querySelector(".ogl-crystal")
      .setAttribute("data-title", toFormattedNumber(Math.floor(cSumP + cSumM + OGBIData.json.flying.crystal)));
    sumNodes[2].querySelector(".ogl-crystal").setAttribute("class", "ogl-crystal tooltip");
    sumNodes[2].querySelector(".ogl-deut").textContent = toFormattedNumber(
      Math.floor(dSumP + dSumM + OGBIData.json.flying.deuterium),
      null,
      true
    );
    sumNodes[2]
      .querySelector(".ogl-deut")
      .setAttribute("data-title", toFormattedNumber(Math.floor(dSumP + dSumM + OGBIData.json.flying.deuterium)));
    sumNodes[2].querySelector(".ogl-deut").setAttribute("class", "ogl-deut tooltip");
  });

  const valueSumStandardUnit = standardUnit.standardUnit([
    mSumP + mSumM + OGBIData.json.flying.metal,
    cSumP + cSumM + OGBIData.json.flying.crystal,
    dSumP + dSumM + OGBIData.json.flying.deuterium,
  ]);
  const sumMSU = document.querySelector(".ogl-sum-symbol.tooltip").nextElementSibling;
  sumMSU.title = `${toFormattedNumber(Math.floor(valueSumStandardUnit))} ${standardUnit.unitType()}`;
  sumMSU.textContent = toFormattedNumber(Math.floor(valueSumStandardUnit), null, true);
}

export { resourceDetail, updateresourceDetail };
