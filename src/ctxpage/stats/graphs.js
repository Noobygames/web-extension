import { createDOM } from "../../ui/dom.js";
import { toFormattedNumber } from "../../format/numbers.js";
import * as standardUnit from "../../game/standardUnit.js";
import Translator from "../../format/i18n/translate.js";

import { statsState } from "./state.js";

/**
 * The Chart.js drawings the tabs share.
 *
 * `profitGraph` is the one with the date-range buttons; the range a tab wants selected
 * afterwards travels through `statsState.initialRange`.
 */
function profitGraph(profits, max, useStandardUnit, callback) {
  let content = createDOM("div", { class: "ogk-profit" });
  let title = content.appendChild(createDOM("div", { class: "ogk-date" }));
  let div = content.appendChild(createDOM("div", { class: "ogk-scroll-wrapper" }));
  max = -Infinity;
  profits.forEach((elem, index) => {
    if (Math.abs(elem.profit) > max) max = Math.abs(elem.profit);
  });
  let spans = [];
  profits
    .slice()
    .reverse()
    .forEach((elem, index) => {
      let span = div.appendChild(
        createDOM("span", {
          style: `height: ${elem.profit == 0 ? 5 : Math.max(10, (Math.abs(elem.profit) / max) * 60)}px`,
          class: elem.profit >= 0 ? "" : "ogk-minus",
        })
      );
      spans.push(span);
      span.addEventListener("click", () => {
        spans.forEach((elem) => elem.classList.remove("ogk-active"));
        span.classList.add("ogk-active");
        title.replaceChildren(
          createDOM("strong", {}, `${getFormatedDate(elem.date.getTime(), "[d].[m].[y]")}`),
          createDOM(
            "span",
            {
              class: `tooltip ${elem.profit >= 0 ? "undermark" : "overmark"}`,
              title: `${useStandardUnit ? standardUnit.unitType(true) + " : " : ""}${toFormattedNumber(
                Math.abs(elem.profit),
                0
              )}`,
            },
            `${elem.profit >= 0 ? " + " : " - "}${toFormattedNumber(Math.abs(elem.profit), 2, true)}${
              useStandardUnit ? " " + standardUnit.unitType() : ""
            }`
          )
        );
        if (elem.start) {
          title.appendChild(createDOM("strong", {}, `${getFormatedDate(elem.start.getTime(), "[d].[m].[y]")}`));
        }
        callback(elem.range, index);
      });
    });
  if (statsState.initialRange) {
    spans[statsState.initialRange].click();
    statsState.initialRange = undefined;
  } else {
    spans[11].click();
  }
  return content;
}

function repartitionGraph(eco, tech, fleet, def, lf) {
  let div = createDOM("div", { class: "ogk-repartition" });
  let chartNode = div.appendChild(
    createDOM("canvas", {
      id: "piechart",
      width: "200px",
      height: "150px",
    })
  );
  let data = lf ? [eco, tech, fleet, def, lf] : [eco, tech, fleet, def];
  let colors = lf
    ? ["#656565", "#83ba33", "#b73536", "#3d4800", "#9556ce"]
    : ["#656565", "#83ba33", "#b73536", "#3d4800"];
  let labels = lf
    ? [
        Translator.translate(51, "text"),
        Translator.translate(52, "text"),
        Translator.translate(53, "text"),
        Translator.translate(54, "text"),
        Translator.translate(89, "text"),
      ]
    : [
        Translator.translate(51, "text"),
        Translator.translate(52, "text"),
        Translator.translate(53, "text"),
        Translator.translate(54, "text"),
      ];
  let config = {
    type: "doughnut",
    data: {
      datasets: [
        {
          data: data,
          backgroundColor: colors,
          borderColor: "#1b232c",
        },
      ],
      labels: labels,
    },
    options: {
      circumference: Math.PI,
      rotation: -Math.PI,
      legend: { display: false },
      title: { display: false },
      animation: { animateScale: true, animateRotate: true },
      plugins: {
        outsidePadding: 20,
        labels: [
          {
            fontSize: 12,
            fontStyle: "bold",
            textMargin: 5,
            render: "label",
            position: "outside",
            outsidePadding: 65,
            fontColor: "#ccc",
          },
          {
            fontSize: 12,
            fontStyle: "bold",
            fontColor: "#1b232c",
            render: "percentage",
          },
        ],
      },
    },
  };
  var ctx = chartNode.getContext("2d");
  let chart = new Chart(ctx, config);
  return div;
}

function winGraph(win, draw, count) {
  let div = createDOM("div", { class: "ogk-win" });
  let chartNode = div.appendChild(
    createDOM("canvas", {
      id: "piechart",
      width: "200px",
      height: "150px",
    })
  );
  let config = {
    type: "doughnut",
    data: {
      datasets: [
        {
          data: [win, count - win - draw, draw],
          backgroundColor: ["#83ba33", "#b73536", "#d29d00"],
          borderColor: "#1b232c",
        },
      ],
      labels: [
        Translator.translate(55, "text", false),
        Translator.translate(56, "text", false),
        Translator.translate(57, "text", false),
      ],
    },
    options: {
      circumference: Math.PI,
      rotation: -Math.PI,
      legend: { display: false },
      title: { display: false },
      animation: { animateScale: true, animateRotate: true },
      plugins: {
        outsidePadding: 20,
        labels: [
          {
            fontSize: 12,
            fontStyle: "bold",
            textMargin: 5,
            render: "label",
            position: "outside",
            outsidePadding: 65,
            fontColor: "rgb(34, 42, 51)",
          },
          {
            fontSize: 12,
            fontStyle: "bold",
            fontColor: "#1b232c",
            render: "percentage",
          },
        ],
      },
    },
  };
  var ctx = chartNode.getContext("2d");
  let chart = new Chart(ctx, config);
  return div;
}

function expeditionGraph(sums) {
  let div = createDOM("div");
  let chartNode = div.appendChild(createDOM("canvas", { id: "piechart", width: "400px", height: "300px" }));
  let config = {
    type: "doughnut",
    data: {
      datasets: [
        {
          data: [
            sums["Metal"] || 0,
            sums["Crystal"] || 0,
            sums["Deuterium"] || 0,
            sums["AM"] || 0,
            sums["Object"] || 0,
            sums["Fleet"] || 0,
            sums["Aliens"] || 0,
            sums["Pirates"] || 0,
            sums["Late"] || 0,
            sums["Early"] || 0,
            sums["Bhole"] || 0,
            sums["Void"] || 0,
            sums["Merchant"] || 0,
          ],
          label: "expeditions",
          backgroundColor: [
            "#ffaacca1",
            "#73e5ffc7",
            "#a6e0b0",
            "#ddd",
            "#c08931",
            "#782c2f",
            "#35b700",
            "#734a26",
            "#656565",
            "#adadad",
            "#614bb1",
            "#344051",
            "#a0c02b",
          ],
          borderColor: "#1b232c",
        },
      ],
      labels: [
        Translator.translate(0, "res", false),
        Translator.translate(1, "res", false),
        Translator.translate(2, "res", false),
        Translator.translate(3, "res", false),
        Translator.translate(78, "text", false),
        Translator.translate(63, "text", false),
        Translator.translate(79, "text", false),
        Translator.translate(80, "text", false),
        Translator.translate(81, "text", false),
        Translator.translate(82, "text", false),
        Translator.translate(71, "text", false),
        Translator.translate(83, "text", false),
        Translator.translate(84, "text", false),
      ],
    },
    options: {
      legend: { display: false },
      title: { display: false },
      animation: { animateScale: true, animateRotate: true },
      plugins: {
        labels: [
          {
            fontSize: 12,
            fontStyle: "bold",
            textMargin: 10,
            render: "label",
            fontColor: "#ccc",
            position: "outside",
          },
          {
            fontSize: 12,
            fontStyle: "bold",
            fontColor: "#0d1117",
            precision: 1,
            render: "percentage",
          },
        ],
      },
    },
  };
  var ctx = chartNode.getContext("2d");
  let chart = new Chart(ctx, config);
  return div;
}

function discoveryGraph(sums) {
  let div = createDOM("div");
  let chartNode = div.appendChild(createDOM("canvas", { id: "piechart", width: "400px", height: "300px" }));
  let config = {
    type: "doughnut",
    data: {
      datasets: [
        {
          data: [
            sums["lifeform1"] || 0,
            sums["lifeform2"] || 0,
            sums["lifeform3"] || 0,
            sums["lifeform4"] || 0,
            sums["artefacts"] || 0,
            sums["void"] || 0,
          ],
          label: "Discovery",
          backgroundColor: ["#7fc200", "#ec752f", "#3c93f0", "#9c64ed", "#fdeca6", "#344051"],
          borderColor: "#1b232c",
        },
      ],
      labels: [
        Translator.translate(140, "text", false),
        Translator.translate(141, "text", false),
        Translator.translate(142, "text", false),
        Translator.translate(143, "text", false),
        Translator.translate(145, "text", false),
        Translator.translate(83, "text", false),
      ],
    },
    options: {
      legend: { display: false },
      title: { display: false },
      animation: { animateScale: true, animateRotate: true },
      plugins: {
        labels: [
          {
            fontSize: 12,
            fontStyle: "bold",
            textMargin: 10,
            render: "label",
            fontColor: "#ccc",
            position: "outside",
          },
          {
            fontSize: 12,
            fontStyle: "bold",
            fontColor: "#0d1117",
            render: "percentage",
          },
        ],
      },
    },
  };
  var ctx = chartNode.getContext("2d");
  let chart = new Chart(ctx, config);
  return div;
}

export { profitGraph, repartitionGraph, winGraph, expeditionGraph, discoveryGraph };
