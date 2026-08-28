/**
 * The state the statistics popup shares across its tabs.
 *
 * An object rather than two exported bindings: the tabs live in separate files after
 * the Phase 3 split, and an imported binding cannot be reassigned from another module.
 */
export const statsState = {
  /**
   * The page facts the controller handed {@link statistics}: player class, whether
   * lifeforms are enabled, the universe number, the officer flags. Never a reference to
   * OGInfinity.
   */
  context: null,

  /**
   * Which of the date-range buttons to click once the next graph is drawn.
   *
   * Set by a tab while it renders and consumed by `profitGraph()`. It was an instance
   * field on OGInfinity for the same reason it is shared state now: there is one
   * statistics popup at a time.
   */
  initialRange: undefined,
};
