/**
 * The entries waiting behind the order OGame is actually building.
 *
 * The empire page reports only the running order, one per build list - which is also
 * the only one the game has charged for. Everything behind it is unpaid and therefore a
 * real need, and it exists only in the production box in the page.
 *
 * Two tables per box, and they are shaped differently:
 *
 *   <table class="construction active">   the running order
 *     <img class="queuePic" alt="Hyperraumtechnik">      alt is the localised NAME
 *     <span class="level">Stufe 11</span>
 *
 *   <table class="queue">                 everything queued behind it
 *     <a class="queue_link" onclick="cancelresearch(106, 3188742, ...)">
 *       <img class="queuePic" alt="Spionagetechnik">13</a>
 *
 * So a queued entry carries no `.level` at all: its target level is the bare text next
 * to the icon, and its technology id is the first argument of the cancel handler. For
 * lifeform technologies there is no `alt` either and the id is on the icon's own class
 * (`lifeformTech11204`). Verified against s282-de, OGame 13.0.0-r16.
 *
 * `ctxpage/empire/production.js` reads the running order out of the first table; this
 * module reads the second one and nothing else.
 */

/** The production boxes worth reading, and which build list each one is. */
export const QUEUE_BOXES = Object.freeze({
  productionboxbuildingcomponent: "building",
  productionboxlfbuildingcomponent: "lfbuilding",
  productionboxresearchcomponent: "research",
  productionboxlfresearchcomponent: "lfresearch",
});

/**
 * The technology a queued entry stands for.
 *
 * @param {Element} link the `a.queue_link` wrapping the icon
 * @returns {number} 0 when neither the icon's class nor the cancel handler said
 */
function technoIdOf(link) {
  const icon = link.querySelector(".queuePic");
  const lifeform = icon && [...icon.classList].find((name) => name.startsWith("lifeformTech"));
  if (lifeform) return Number(lifeform.replace("lifeformTech", "")) || 0;

  // cancelresearch(106, 3188742, "...") - the technology is the first argument. The
  // second is the build-list entry id, which is of no use here.
  const onclick = link.getAttribute("onclick");
  if (!onclick || !onclick.includes("(")) return 0;

  return Number(onclick.split("(")[1].split(",")[0]) || 0;
}

/**
 * The level a queued entry builds to: the text beside the icon, and nothing else on the
 * anchor contributes any.
 *
 * @param {Element} link
 * @returns {number}
 */
function levelOf(link) {
  return Number(String(link.textContent || "").replace(/[^0-9]/g, "")) || 0;
}

/**
 * What one production box has queued behind the order it is building.
 *
 * An entry that cannot be read takes the whole queue down with it: half a queue is
 * worse than none, because the total would be short by exactly the row that failed and
 * nothing on screen would say so.
 *
 * @param {Element|null} box
 * @returns {Array<{technoId: number, tolvl: number}>}
 */
export function queuedInBox(box) {
  const links = box ? [...box.querySelectorAll("table.queue a")] : [];
  const queued = [];

  for (const link of links) {
    if (!link.querySelector(".queuePic")) continue;

    const technoId = technoIdOf(link);
    const tolvl = levelOf(link);

    if (!technoId || !tolvl) return [];

    queued.push({ technoId, tolvl });
  }

  return queued;
}

/**
 * Every production box on the page, as `{research: [...], lfresearch: [...]}`.
 *
 * The shipyard box is deliberately absent: ships and defences are charged in full when
 * the order is placed, so nothing there is still owed.
 *
 * Reads the DOM, so it must not run at module-evaluation time - `production.js` calls
 * it from `updateProductionProgress()`, which is well past `DOMContentLoaded`.
 *
 * @returns {Record<string, Array<{technoId: number, tolvl: number}>>}
 */
export function readBuildQueues() {
  const queues = {};

  for (const [id, kind] of Object.entries(QUEUE_BOXES)) {
    const queued = queuedInBox(document.getElementById(id));
    if (queued.length) queues[kind] = queued;
  }

  return queues;
}

export default readBuildQueues;
