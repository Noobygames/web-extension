/**
 * How much of the browser's localStorage quota this origin is using, and a way to
 * reclaim the part that is not ours.
 *
 * OGame and OGI share one 5 MB origin quota. When it fills up, `ogk-data` stops being
 * writable and the extension loses everything it has not persisted yet - which is why
 * `start()` checks the total on every page load and clears the other keys past 4.5 MB.
 *
 * Lifted out of `OGBeyondInfinity` in Phase 3 of refactoring.md; both the settings dialog
 * and the boot path need it, so it could not stay a method on either.
 */
export function getLocalStorageSize() {
  var other = 0;
  var ogi = 0;
  for (var x in localStorage) {
    var amount = localStorage[x].length / 1024 / 1024;
    if (!isNaN(amount) && Object.hasOwn(localStorage, x)) {
      if (x == "ogk-data") {
        ogi += amount;
      } else {
        other += amount;
      }
    }
  }
  return {
    ogi: ogi.toFixed(2),
    other: other.toFixed(2),
    total: (ogi + other).toFixed(2),
  };
}

/**
 * Drops every localStorage key except `ogk-data`.
 *
 * Deliberately blunt: what else is in there belongs to OGame, and the game rebuilds
 * its own entries. `ogk-data` is the one thing that cannot be recovered.
 */
export function purgeLocalStorage() {
  for (var x in localStorage) {
    if (x != "ogk-data") {
      delete localStorage[x];
    }
  }
}
