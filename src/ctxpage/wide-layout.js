import { getOption } from "./conf-options.js";

/**
 * Wide-screen layout / zoom switches.
 *
 * Page context. The CSS lives in the "Wide-screen layout and zoom" block at the
 * bottom of src/global.css and matches nothing unless the classes below are on
 * <html>, so turning the options off is a real off, not a neutralised on.
 *
 * The manual zoom factor is written as an inline custom property. Inline styles
 * outrank the stepped media queries in global.css, which is what lets a
 * user-chosen factor apply from 1600px up instead of waiting for the 2100 /
 * 2560 / 3200 breakpoints.
 *
 * Nothing here touches the ad slot, the top bar, the menu or the footer — see
 * the AGENTS.md §1.7 note in global.css for why the zoom is scoped the way it
 * is.
 */

/**
 * Manual zoom is clamped to this range.
 *
 * The ceiling is not arbitrary. 1600px is the narrowest viewport the feature
 * activates on, and there the column is already pinned to its visual floor, so
 * any further zoom only pushes the ad slot right until it leaves the viewport.
 * Measured against the reference layout, 1600px overflows from 1.85 upwards;
 * 1.75 keeps a margin, because the planet bar is `max-content` and a player
 * with longer planet names carries a wider bar than the reference did.
 */
export const WIDE_ZOOM_MIN = 1;
export const WIDE_ZOOM_MAX = 1.75;

/**
 * Normalises the stored option into a usable factor.
 * @param {*} raw value of the wideZoomFactor option
 * @returns {number} 0 for "automatic", otherwise a clamped factor
 */
export function normalizeZoomFactor(raw) {
  const value = typeof raw === "string" ? Number(raw.replace(",", ".")) : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(WIDE_ZOOM_MAX, Math.max(WIDE_ZOOM_MIN, value));
}

/**
 * Applies the current options to <html>. Safe to call repeatedly; it is called
 * once at start-up and again whenever the settings dialog is saved.
 *
 * @param {HTMLElement} [root] defaults to document.documentElement
 */
export function applyWideLayout(root) {
  // `typeof` guard rather than `document?.` - a bare `document` that was never
  // declared throws a ReferenceError instead of yielding undefined.
  const target = root ?? (typeof document === "undefined" ? undefined : document.documentElement);
  if (!target) return;
  applyTo(target);
}

/**
 * localStorage key holding just the three switches this file needs.
 *
 * The real options live in the `ogk-data` blob, which is far too large to parse
 * at `document_start`. This tiny mirror lets `main.js` put the classes on
 * `<html>` before the game paints, so switching pages no longer shows the
 * vanilla-width layout for a moment and then jumps to the wide one. Kept in
 * step here, on every apply.
 */
export const BOOT_CACHE_KEY = "ogi-layout";

/**
 * @param {HTMLElement} root
 */
function applyTo(root) {
  const layoutOn = getOption("wideLayoutEnable") !== false;
  // The zoom needs the width stretching under it. `zoom` is a *layout* zoom, so the
  // column it scales takes up that much more room, and OGame's content column cannot
  // go below its ~670px intrinsic width - at zoom 1.25 it wants 838 real pixels the
  // vanilla layout has nowhere to put. Measured: #middle ended up with a 536px box
  // holding 667px of content, and the event box hung 164px over the planet bar, which
  // is what hid the fleet-recall column. So the switch is honoured only in company.
  const zoomOn = getOption("wideZoomEnable") !== false && layoutOn;

  root.classList.toggle("ogl-wide-layout", layoutOn);
  root.classList.toggle("ogl-wide-zoom", zoomOn);

  const factor = zoomOn ? normalizeZoomFactor(getOption("wideZoomFactor")) : 0;
  if (factor) {
    root.style.setProperty("--ogl-wide-zoom", String(factor));
  } else {
    // Hand control back to the stepped media queries in global.css.
    root.style.removeProperty("--ogl-wide-zoom");
  }

  writeBootCache(layoutOn, zoomOn, factor);
}

/**
 * @param {boolean} layoutOn
 * @param {boolean} zoomOn
 * @param {number} factor 0 means "let the media queries decide"
 */
function writeBootCache(layoutOn, zoomOn, factor) {
  try {
    localStorage.setItem(BOOT_CACHE_KEY, JSON.stringify({ layout: layoutOn, zoom: zoomOn, factor }));
  } catch (_) {
    // Storage full or blocked - the classes are applied either way, the next
    // page load just falls back to the defaults for one paint.
  }
}
