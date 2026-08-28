import { createDOM } from "../../util/dom.js";
import { tabs } from "../../util/tabs.js";
import { toFormattedNumber } from "../../util/numbers.js";
import DateTime from "../../util/dateTime.js";
import Translator from "../../util/translate.js";
import OGBIData from "../../util/OGIData.js";

import { statsState } from "./state.js";
import { discoveryBox, discoveryCostsBox } from "./boxes.js";
import { discoveryGraph, profitGraph } from "./graphs.js";

/** The discovery tab: lifeform expeditions and what they turned up. */
function discoveryStats() {
  let discoveryCosts = [-5000, -1000, -500];
  let content = createDOM("div", { class: "ogk-stats-content" });
  let renderDetails = (sums, onchange) => {
    let content = createDOM("div", { class: "ogk-stats" });
    let globalDiv = content.appendChild(createDOM("div", { class: "ogk-global" }));
    let numDiscovery = 0;
    Object.values(sums.type).forEach((value) => (numDiscovery += value));
    globalDiv.appendChild(createDOM("span", { class: "ogk-center" }, numDiscovery));
    globalDiv.appendChild(discoveryGraph(sums.type));
    let details = content.appendChild(createDOM("div", { class: "ogk-details" }));

    let box = discoveryBox(
      [
        {
          title: Translator.translate(144),
          human: sums.found[0],
          rocktal: sums.found[1],
          mecha: sums.found[2],
          kaelesh: sums.found[3],
        },
      ],
      true
    );
    let costsBox = discoveryCostsBox(
      [
        {
          title: Translator.translate(40),
          metal: sums.costs[0],
          crystal: sums.costs[1],
          deut: sums.costs[2],
          artefacts: sums.costs[3],
        },
      ],
      true
    );
    details.appendChild(box);
    details.appendChild(costsBox);
    return content;
  };
  let computeRangeSums = (sums, start, stop) => {
    let weekSums = {
      found: [0, 0, 0, 0],
      type: {},
      artefacts: 0,
      costs: [0, 0, 0, 0],
    };
    for (var d = new Date(start); d >= new Date(stop); d.setDate(d.getDate() - 1)) {
      let dateStr = getFormatedDate(new Date(d).getTime(), "[d].[m].[y]");
      if (sums[dateStr]) {
        weekSums.costs[3]
          ? (weekSums.costs[3] += sums[dateStr].artefacts)
          : (weekSums.costs[3] = sums[dateStr].artefacts);
        sums[dateStr].found.forEach((value, index) => {
          weekSums.found[index] += sums[dateStr].found[index];
        });
        for (let [type, num] of Object.entries(sums[dateStr].type)) {
          weekSums.type[type] ? (weekSums.type[type] += num) : (weekSums.type[type] = num);
          discoveryCosts.forEach((costs, i) => {
            weekSums.costs[i] ? (weekSums.costs[i] += num * costs) : (weekSums.costs[i] = num * costs);
          });
        }
      }
    }
    return weekSums;
  };
  let getTotal = (sums) => {
    let total = 0;
    total += sums.found[0] + sums.found[1] + sums.found[2] + sums.found[3] + sums.artefacts;
    return total;
  };
  let refresh = (index) => {
    if (index) {
      statsState.initialRange = index;
    }
    document.querySelector(".ogk-stats-content .ogl-tab.ogl-active").click();
  };
  let tabNames = {};
  tabNames[LocalizationStrings.timeunits.short.day] = () => {
    let date = new Date();
    let sum = {
      found: [0, 0, 0, 0],
      artefacts: 0,
      type: {},
      costs: [0, 0, 0],
    };
    let profits = [];
    let max = 0;
    for (let i = 0; i < 12; i++) {
      let dateStr = getFormatedDate(date.getTime(), "[d].[m].[y]");
      let sums = computeRangeSums(OGBIData.json.discoveriesSums, date, date) || sum;
      let profit = sums ? getTotal(sums) : 0;
      if (Math.abs(profit) > max) max = profit;
      profits.push({
        date: new Date(date.getTime()),
        range: sums,
        profit: profit,
      });
      date.setDate(date.getDate() - 1);
    }
    let div = createDOM("div");
    let details = renderDetails(computeRangeSums(OGBIData.json.discoveriesSums, new Date(), new Date()), () =>
      refresh()
    );
    div.appendChild(
      profitGraph(profits, max, false, (range, index) => {
        details.remove();
        details = renderDetails(range, () => {
          refresh(index);
        });
        div.appendChild(details);
      })
    );
    div.appendChild(details);
    return div;
  };
  tabNames[LocalizationStrings.timeunits.short.week] = () => {
    let renderHeader = () => {};
    let weeks = [];
    let totals = [];
    let start = new Date();
    var prevMonday = new Date();
    let max = -Infinity;
    prevMonday.setDate(prevMonday.getDate() - ((prevMonday.getDay() + 6) % 7));
    for (let i = 0; i < 12; i++) {
      let range = computeRangeSums(OGBIData.json.discoveriesSums, start, prevMonday);
      weeks.push(range);
      let total = getTotal(range);
      totals.push({
        profit: total,
        range: range,
        date: prevMonday,
        start: start,
      });
      if (total > max) max = total;
      start = new Date(prevMonday);
      start.setDate(start.getDate() - 1);
      prevMonday = new Date(start);
      prevMonday.setDate(prevMonday.getDate() - ((prevMonday.getDay() + 6) % 7));
    }
    let div = createDOM("div");
    let details = renderDetails(weeks[0]);
    div.appendChild(
      profitGraph(totals, max, false, (range, index) => {
        details.remove();
        details = renderDetails(range);
        div.appendChild(details);
      })
    );
    div.appendChild(details);
    return div;
  };
  tabNames[LocalizationStrings.timeunits.short.month] = () => {
    var lastDay = new Date();
    var firstDay = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1);
    let max = -Infinity;
    let months = [];
    let totals = [];
    for (let i = 0; i < 12; i++) {
      let range = computeRangeSums(OGBIData.json.discoveriesSums, lastDay, firstDay);
      months.push(range);
      let total = getTotal(range);
      totals.push({
        profit: total,
        range: range,
        date: firstDay,
        start: lastDay,
      });
      if (total > max) max = total;
      lastDay = new Date(lastDay.getFullYear(), lastDay.getMonth(), 0);
      firstDay = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1);
    }
    let div = createDOM("div");
    let details = renderDetails(months[0]);
    div.appendChild(
      profitGraph(totals, max, false, (range, index) => {
        details.remove();
        details = renderDetails(range);
        div.appendChild(details);
      })
    );
    div.appendChild(details);
    return div;
  };
  tabNames["∞"] = () => {
    let keys = Object.keys(OGBIData.json.expeditionSums).sort(
      (a, b) => DateTime.dateStrToDate(a) - DateTime.dateStrToDate(b)
    );
    let minDate = keys[0];
    let maxDate = keys[keys.length - 1];
    let range = computeRangeSums(
      OGBIData.json.discoveriesSums,
      DateTime.dateStrToDate(maxDate),
      DateTime.dateStrToDate(minDate)
    );
    let total = getTotal(range);
    let content = createDOM("div", { class: "ogk-profit" });
    let title = content.appendChild(createDOM("div", { class: "ogk-date" }));
    content.appendChild(createDOM("div", { class: "ogk-scroll-wrapper" }));
    let contentHtml = `<strong>${getFormatedDate(
      DateTime.dateStrToDate(minDate).getTime(),
      "[d].[m].[y]"
    )}</strong> <span class="tooltip ${total > 0 ? "undermark" : "overmark"}" data-title=${toFormattedNumber(
      Math.abs(total),
      0
    )}>${total > 0 ? " + " : " - "}${toFormattedNumber(Math.abs(total), 2, true)}</strong></span>`;
    contentHtml += `<strong>${getFormatedDate(DateTime.dateStrToDate(maxDate).getTime(), "[d].[m].[y]")}</strong>`;
    title.html(contentHtml);
    let div = createDOM("div");
    div.appendChild(content);
    div.appendChild(renderDetails(range));
    return div;
  };
  content.appendChild(tabs(tabNames));
  return content;
}

export { discoveryStats };
