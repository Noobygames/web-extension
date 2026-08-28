/**
 * The state the fleet-dispatch parts share.
 *
 * An object rather than a dozen exported bindings: the parts live in separate files
 * after the Phase 3 split, and an imported binding cannot be reassigned from another
 * module. Every one of these was a field on OGBeyondInfinity that only this page ever read -
 * one dispatch page per page load, which is the scope they have here.
 */
export const fleetState = {
  /** The redirect a dispatch should land on, set by whichever shortcut sent it. */
  onFleetSentRedirectUrl: undefined,

  /** Union-combat countdown rows and their timer. */
  delayDiv2: undefined,
  delayDiv3: undefined,
  delayTimeDiv: undefined,
  delayTimeDiv2: undefined,
  delayTimeDiv3: undefined,
  unionInterval: undefined,

  /** Galaxy scan bookkeeping for the expedition picker. */
  emptySystems: undefined,
  inactiveSystems: undefined,

  /**
   * Which shortcut set up the current dispatch.
   *
   * These were `this.expedition` and `this.collect` on OGBeyondInfinity - the same two names
   * as the methods, which `start()` then overwrote with `false`. That is why each
   * method could only ever run once, and why they carry the `…Mode` suffix here.
   */
  expeditionMode: false,
  collectMode: false,

  /** The resource inputs the cargo helpers write into. */
  ressourceFiller: undefined,
};
