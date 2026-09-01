import { createDOM } from "./dom.js";
import OGBIData from "../store/OGBIData.js";
import Translator from "../format/i18n/translate.js";

const senders = [];
let keepTooltip = OGBIData.keepTooltip || true;
let currentSender = null;
let bodyClickBound = false;
/** Only one tooltip is ever pending/active at a time, so one shared timer id is enough. */
let activeTooltipTimer = null;

/**
 * Bound once, not per tooltip() call. Each call used to add its own
 * document.body click listener and never remove it - a permanent leak that
 * grew with every hover cycle. Reads the live ".ogl-tooltip" instead of
 * closing over one instance, since tooltip() replaces that element on
 * every call.
 */
function bindBodyClickOnce() {
  if (bodyClickBound) return;
  bodyClickBound = true;

  document.body.addEventListener("click", (event) => {
    const current = document.querySelector(".ogl-tooltip");
    if (!current) return;

    if (
      !event.target.getAttribute("rel") &&
      !event.target.closest(".tooltipRel") &&
      !event.target.classList.contains("ogl-colors") &&
      !current.contains(event.target)
    ) {
      current.classList.remove("ogl-active");
      keepTooltip = false;
      OGBIData.keepTooltip = keepTooltip;
    }
  });
}

export function tooltip(sender, content, autoHide, side, timer, mouseoverEnable = false) {
  side = side || {};
  timer = timer || 500;

  let tooltip = document.querySelector(".ogl-tooltip");

  if (currentSender === sender && !!tooltip?.classList.contains("ogl-active")) {
    return;
  }

  currentSender = sender;

  if (tooltip) {
    tooltip.remove();
  }

  tooltip = document.body.appendChild(createDOM("div", { class: "ogl-tooltip" }));
  const close = tooltip.appendChild(createDOM("a", { class: "close-tooltip", title: Translator.translate(340) }));
  close.addEventListener("click", (e) => {
    e.stopPropagation();
    tooltip.classList.remove("ogl-active");
  });

  bindBodyClickOnce();

  tooltip.classList.remove("ogl-update");

  if (!senders.includes(sender)) {
    tooltip.classList.remove("ogl-active");
  }

  tooltip.classList.remove("ogl-autoHide");
  tooltip.classList.remove("ogl-tooltipLeft");
  tooltip.classList.remove("ogl-tooltipRight");
  tooltip.classList.remove("ogl-tooltipBottom");

  senders.push(sender);

  const copy = content.cloneNode(true);
  copy.style.opacity = 0;
  document.querySelector("body").appendChild(copy);
  const contentHeight = copy.offsetHeight;
  copy.remove();

  const rect = sender.getBoundingClientRect();
  const win = sender.ownerDocument.defaultView;
  const position = {
    x: rect.left + win.scrollX,
    y: rect.top + win.scrollY,
  };

  if (side.auto) {
    if (contentHeight > position.y) side.bottom = true;
  }

  if (side.left) {
    tooltip.classList.add("ogl-tooltipLeft");
    position.y -= 20;
    position.y += rect.height / 2;
  } else if (side.right) {
    tooltip.classList.add("ogl-tooltipRight");
    position.x += rect.width;
    position.y -= 20;
    position.y += rect.height / 2;
  } else if (side.bottom) {
    tooltip.classList.add("ogl-tooltipBottom");
    position.x += rect.width / 2;
    position.y += rect.height;
  } else {
    position.x += rect.width / 2;
  }
  if (sender.classList.contains("tooltipOffsetX")) {
    position.x += 33;
  }
  if (autoHide) {
    tooltip.classList.add("ogl-autoHide");
  }
  tooltip.appendChild(content);
  tooltip.style.top = position.y + "px";
  tooltip.style.left = position.x + "px";
  activeTooltipTimer = setTimeout(() => tooltip.classList.add("ogl-active"), timer);

  // tooltip is a fresh element every call, so this listener has to be
  // re-attached every time - it goes away with the node once removed, so
  // unlike the sender listener below it does not accumulate.
  tooltip.addEventListener("mouseleave", (e) => {
    if (e.relatedTarget === sender || !mouseoverEnable) return;

    if (autoHide) {
      tooltip.classList.remove("ogl-active");
    }

    clearTimeout(activeTooltipTimer);
  });

  // sender stays on the page for as long as its message/row does, so this
  // side must bind exactly once. The old code cleared "ogl-tooltipInit" in
  // both handlers above, which defeated this very guard: every hover cycle
  // added one more permanent mouseleave listener to `sender` that was never
  // removed - a leak that grew with every coordinate hovered in chat.
  if (!sender.classList.contains("ogl-tooltipInit")) {
    sender.classList.add("ogl-tooltipInit");

    sender.addEventListener("mouseleave", (e) => {
      if (e?.relatedTarget?.classList?.contains("ogl-tooltip") && mouseoverEnable) return;

      const current = document.querySelector(".ogl-tooltip");
      if (autoHide && current) {
        current.classList.remove("ogl-active");
      }

      clearTimeout(activeTooltipTimer);
    });
  }
  return tooltip;
}
