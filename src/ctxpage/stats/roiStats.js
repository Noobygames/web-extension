import * as DOM from "../../ui/dom.js";
import { createDOM } from "../../ui/dom.js";
import { toFormattedNumber } from "../../format/numbers.js";
import Translator from "../../format/i18n/translate.js";
import OGBIData from "../../store/OGBIData.js";
import PlayerClass from "../../game/playerClass.js";
import { CRAWLER_OVERLOAD_MAX } from "../../game/gameConstants.js";
import { getBestRoi } from "../../game/gameFormulas.js";
import * as tradeRateInput from "../../ui/tradeRateInput.js";

import { statsState } from "./state.js";

/** The ROI tab: which upgrade pays for itself soonest, across the whole empire. */
function roiStats() {
  let that = this;
  let content = createDOM("div", { class: "ogk-stats" });
  let details = content.appendChild(createDOM("div", { class: "ogk-roi-details" }));
  let settings = details.appendChild(createDOM("div", { class: "ogk-settings-box" }));
  let tradeRateBox = settings.appendChild(createDOM("div", { class: "ogk-tradeRate-box" }));
  let crawler = settings.appendChild(createDOM("div", { class: "ogk-crawler-box" }));
  let filter = settings.appendChild(createDOM("div", { class: "ogk-filter-box" }));
  let header = details.appendChild(createDOM("h1"));
  header.appendChild(createDOM("p", {}, Translator.translate(88)));
  let tradeRateText = createDOM("p", { class: "ogk-tradeRate-text" }, Translator.translate(119));
  let tradeRateGrid = tradeRateInput.tradeRateInputs(() => updateRoi());
  let box = details.appendChild(createDOM("div", { class: "ogk-box" }));
  tradeRateBox.appendChild(tradeRateText);
  tradeRateBox.appendChild(tradeRateGrid);

  let filterOptions = `<option value="1">${Translator.translate(
    1,
    "tech"
  )}</option><option  value="2">${Translator.translate(2, "tech")}</option><option  value="3">${Translator.translate(
    3,
    "tech"
  )}</option><option  value="0">${Translator.translate(52)}</option>`;
  OGBIData.empire.forEach(
    (planet) => (filterOptions += `<option  value="${planet.id}">${planet.coordinates}\t${planet.name}</option>`)
  );

  filter.appendChild(createDOM("p", { class: "ogk-filter-text" }, Translator.translate(130)));
  filter.appendChild(
    DOM.createDOMSanitized(
      "div",
      { class: "ogk-filter-grid" },
      `<select id="filterRoi" size="1"><option value="-1" selected="selected">-</option>${filterOptions}</select><input id="reverseFilter" type="checkbox" title="${Translator.translate(
        135
      )}" class="tooltip"></input>`
    )
  );
  filter.querySelector("#filterRoi").addEventListener("change", () => updateRoi());
  filter.querySelector("#reverseFilter").checked = OGBIData.json.options.reverseFilter;

  filter.querySelector("#reverseFilter").addEventListener("change", () => {
    OGBIData.json.options.reverseFilter = filter.querySelector("#reverseFilter").checked;
    OGBIData.Save();
    updateRoi();
  });

  let crawlerPercent = Math.min(
    OGBIData.json.options.crawlerPercent,
    statsState.context.playerClass == PlayerClass.MINER ? CRAWLER_OVERLOAD_MAX : 1
  );
  function crawlerClass(crawlerPercent) {
    let selectClass = "undermark";
    if (crawlerPercent <= 0.3) {
      selectClass = "overmark";
    } else if (crawlerPercent <= 0.6) {
      selectClass = "middlemark";
    } else if (crawlerPercent > 1) {
      selectClass = "overcharge";
    }
    return selectClass;
  }
  let options;
  if (statsState.context.playerClass == PlayerClass.MINER) {
    options = `<option class="overcharge" value="150">${toFormattedNumber(
      150
    )}%</option><option class="overcharge" value="140">${toFormattedNumber(
      140
    )}%</option><option class="overcharge" value="130">${toFormattedNumber(
      130
    )}%</option><option class="overcharge" value="120">${toFormattedNumber(
      120
    )}%</option><option class="overcharge" value="110">${toFormattedNumber(
      110
    )}%</option><option class="undermark" value="100">${toFormattedNumber(
      100
    )}%</option><option class="undermark" value="90">${toFormattedNumber(
      90
    )}%</option><option class="undermark" value="80">${toFormattedNumber(
      80
    )}%</option><option class="undermark" value="70">${toFormattedNumber(
      70
    )}%</option><option class="middlemark" value="60">${toFormattedNumber(
      60
    )}%</option><option class="middlemark" value="50">${toFormattedNumber(
      50
    )}%</option><option class="middlemark" value="40">${toFormattedNumber(
      40
    )}%</option><option class="overmark" value="30">${toFormattedNumber(
      30
    )}%</option><option class="overmark" value="20">${toFormattedNumber(
      20
    )}%</option><option class="overmark" value="10">${toFormattedNumber(
      10
    )}%</option><option class="overmark" value="0" >0%</option>`;
  } else {
    options = `<option class="undermark" value="100">${toFormattedNumber(
      100
    )}%</option><option class="undermark" value="90">${toFormattedNumber(
      90
    )}%</option><option class="undermark" value="80">${toFormattedNumber(
      80
    )}%</option><option class="undermark" value="70">${toFormattedNumber(
      70
    )}%</option><option class="middlemark" value="60">${toFormattedNumber(
      60
    )}%</option><option class="middlemark" value="50">${toFormattedNumber(
      50
    )}%</option><option class="middlemark" value="40">${toFormattedNumber(
      40
    )}%</option><option class="overmark" value="30">${toFormattedNumber(
      30
    )}%</option><option class="overmark" value="20">${toFormattedNumber(
      20
    )}%</option><option class="overmark" value="10">${toFormattedNumber(
      10
    )}%</option><option class="overmark" value="0" >0%</option>`;
  }

  crawler.appendChild(createDOM("p", { class: "ogk-crawler-text" }, Translator.translate(217, "tech")));
  crawler.appendChild(
    DOM.createDOMSanitized(
      "div",
      { class: "ogk-crawler-grid" },
      `<select id="crawlerPercent" size="1" class="${crawlerClass(
        crawlerPercent
      )} tooltip" title="${Translator.translate(126)}"><option value="${
        crawlerPercent * 100
      }" selected="selected" hidden="hidden">${toFormattedNumber(
        crawlerPercent * 100
      )}%</option>${options}</select><input id="optLimitCrawler" type="checkbox" class="tooltip" title="${Translator.translate(
        125
      )}"> </input>`
    )
  );
  crawler.querySelector("#optLimitCrawler").checked = OGBIData.json.options.limitCrawler;

  crawler.querySelector("#optLimitCrawler").addEventListener("change", () => {
    OGBIData.json.options.limitCrawler = crawler.querySelector("#optLimitCrawler").checked;
    OGBIData.Save();
    updateRoi();
  });

  crawler.querySelector("#crawlerPercent").addEventListener("change", () => {
    OGBIData.json.options.crawlerPercent = crawler.querySelector("#crawlerPercent").value / 100;
    crawler.querySelector("#crawlerPercent").classList.remove("overcharge", "undermark", "middlemark", "overmark");
    crawler.querySelector("#crawlerPercent").classList.add(crawlerClass(OGBIData.json.options.crawlerPercent));
    OGBIData.Save();
    updateRoi();
  });

  let updateRoi = () => {
    let roi = document.querySelector(".ogk-roi");
    if (roi) roi.remove();
    roi = box.appendChild(createDOM("div", { class: "ogk-roi" }));
    let bestRoi = getBestRoi(statsState.context.playerBonuses);
    let filter = document.querySelector("#filterRoi") ? document.querySelector("#filterRoi").value : -1;
    let rev = document.querySelector("#reverseFilter") ? document.querySelector("#reverseFilter").checked : false;

    if (filter > 0 && filter <= 3)
      bestRoi = rev ? bestRoi.filter((roi) => roi.technoId != filter) : bestRoi.filter((roi) => roi.technoId == filter);
    if (filter == 0)
      bestRoi = rev ? bestRoi.filter((roi) => roi.technoId <= 100) : bestRoi.filter((roi) => roi.technoId > 100);
    if (filter > 5000)
      bestRoi = rev ? bestRoi.filter((roi) => roi.planetId != filter) : bestRoi.filter((roi) => roi.planetId == filter);
    for (let n = 0; n < Math.min(20, Object.keys(bestRoi).length); n++) {
      let cons = bestRoi[n];
      let component = cons.technoId <= 3 ? "supplies" : "research";
      let planetList = document.querySelectorAll('[id^="planet-"]');
      let currentId =
        planetList.length == 1
          ? planetList[0]
          : document.querySelector("#planetList .hightlightPlanet") ||
            document.querySelector("#planetList .moonlink.active").parentElement;
      currentId = currentId.getAttribute("id").split("-")[1];
      let link = `?page=ingame&component=${component}&cp=${cons.planetId || currentId}&technoDetails=${cons.technoId}`;
      link = "https://" + window.location.host + window.location.pathname + link;
      roi.appendChild(
        DOM.createDOMSanitized(
          "div",
          {
            class: "value tooltip",
            "data-title": `${formatTimeWrapper(
              Math.max(0, (new Date(cons.endDate).getTime() - new Date().getTime()) / 1000),
              2,
              true,
              " ",
              false,
              ""
            )}`,
          },
          `<a href=${link} class="ogl-option ogl-roi-tech ogl-tech-${cons.technoId} ${
            cons.inConstruction ? "inConstruction" : cons.construction ? "construction" : " "
          }"><div><span>${toFormattedNumber(cons.lvl)}</span></div><div><p>${
            cons.coords ? "[" + cons.coords + "]" : " "
          }</p></div><div><p>${formatTimeWrapper(cons.time, 2, true, " ", false, "")}</p></div></a>`
        )
      );
    }
  };
  updateRoi();
  details.appendChild(createDOM("p", { class: "ogk-roi-desc" }, Translator.translate(121)));
  return content;
}

export { roiStats };
