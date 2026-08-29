// Re-exported: see the note in ctxpage/empire/index.js.
export { resourceDetail, updateresourceDetail } from "./resourceDetail.js";

/**
 * The overview popup moved to `./overview.js` in Phase 5 of refactoring.md - it is
 * loaded as a chunk when the sidebar button is pressed, so it must not be reachable
 * from here by a static import.
 */
