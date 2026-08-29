/**
 * Classic trailing-edge debounce.
 *
 * Used where OGame fires an event far more often than the extension needs to react -
 * the fleet dispatcher's mission updates, most of all. Lifted out of `ogCore.js` in
 * Phase 3 of refactoring.md, unchanged, including the `var context = this` that makes
 * it usable as a method.
 *
 * @param {Function} func
 * @param {number} wait milliseconds of quiet before it runs
 * @param {boolean} [immediate] run on the leading edge instead
 */
const debounce = function (func, wait, immediate) {
  var timeout;
  return function () {
    var context = this,
      args = arguments;
    var later = function () {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
};

export default debounce;
