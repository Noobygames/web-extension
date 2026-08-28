/*
 * This module implements the functionality to send a request from the page
 * context to the extension context and get a response from it.
 */

/** @type {string} */
let callbackToken = undefined;
const DATASET_NAME = "ogiCallbackEventToken";

function _createToken() {
  return (Math.floor(Math.random() * 0xffffffffffff) + 1e6).toString(16).padStart(12, "0");
}

function _buildRefererEvent(referer) {
  return DATASET_NAME.concat(callbackToken).concat("-").concat(referer);
}

function _isFirefox() {
  return navigator.userAgent.indexOf("Firefox") > 0;
}

/**
 * @typedef {object} RequestCallbackEvent
 * @property {string} referer - Unique request identifier
 * @property {string} command - Main command
 * @property {string} action - Callback to execute
 * @property {(string|number|boolean|undefined)[]} args - Arguments
 */

/**
 * @typedef {object} ResponseCallbackEvent
 * @property {boolean} success - Indicates if callback execution is success or not
 * @property {string} referer - Unique request identifier
 * @property {any} response - Result of callback execution
 */

/** @typedef {{[action:string]: Function}} CallbackCommandActionMap */
/** @typedef {{[command:string] : CallbackCommandActionMap}} CallbackCommandMap */

class CallbackRouter {
  #callbackCommandMap;

  /**
   * @param {CallbackCommandMap} callbackCommandMap
   */
  constructor(callbackCommandMap) {
    this.#callbackCommandMap = callbackCommandMap;
  }

  /**
   *
   * @param {RequestCallbackEvent} request
   * @return {CallbackCommandActionMap | undefined}
   */
  #getAction(request) {
    return Object.hasOwn(this.#callbackCommandMap, request.command) &&
      Object.hasOwn(this.#callbackCommandMap[request.command], request.action)
      ? this.#callbackCommandMap[request.command][request.action]
      : undefined;
  }

  /**
   *
   * @param {RequestCallbackEvent} request
   * @return {Promise<ResponseCallbackEvent>}
   */
  async resolve(request) {
    if (!this.#getAction(request)) {
      return { referer: request.referer, success: false, response: "Request callback not found" };
    }

    let success = true;
    let response;

    try {
      response = await this.#callbackCommandMap[request.command][request.action].call(
        this.#callbackCommandMap[request.command],
        ...request.args
      );
    } catch (e) {
      success = false;
      response = String(e);
    }

    return { referer: request.referer, success, response };
  }
}

/** Guards against a second initialisation in this realm. */
let contentInitialized = false;

/**
 * Mints a token for the page <-> content handshake.
 *
 * Exported so `main.js` can publish the token at `document_start` and inject
 * `ogCore.js` immediately, instead of waiting for this module to load first.
 * `main.js` is a classic content script and cannot import, so it carries its
 * own copy of this one-liner - keep the two in step.
 *
 * @returns {string} 12 hex characters
 */
export function createCallbackToken() {
  return _createToken();
}

/**
 * @param {CallbackCommandMap} callbackCommandMap
 * @param {string} [presetToken] a token already published on `<html>` by the
 *   caller. Without it this function mints one and publishes it itself, which
 *   forces whoever injects the page script to wait for this module to load.
 *   With it, the injection and this module can load in parallel.
 */
export function contentContextInit(callbackCommandMap, presetToken = undefined) {
  if (!chrome.runtime) {
    throw new Error("Invalid context execution");
  }

  if (contentInitialized) {
    throw new Error("service callback event is already initialized");
  }

  // Only meaningful without a preset token: with one, the dataset already holds
  // it - or the placeholder "1", if the page context got there first.
  if (presetToken === undefined && Boolean(document.documentElement.dataset[DATASET_NAME]) === true) {
    throw new Error("service callback event is already initialized");
  }

  const router = new CallbackRouter(callbackCommandMap);

  callbackToken = presetToken ?? _createToken();
  contentInitialized = true;
  if (presetToken === undefined) document.documentElement.dataset[DATASET_NAME] = callbackToken;
  document.addEventListener(DATASET_NAME.concat(callbackToken), (eRequest) => {
    router.resolve(eRequest.detail).then((response) => {
      let clone = response;
      if (_isFirefox()) {
        clone = cloneInto(response, document.defaultView);
      }

      const eResponse = new CustomEvent(_buildRefererEvent(response.referer), { detail: clone });
      document.dispatchEvent(eResponse);
    });
  });
}

/**
 * How long a page-context request waits for its reply before it gives up.
 *
 * Generous on purpose: the commands behind the bridge (`ptre.galaxy`,
 * `messages.expeditionType`) do cross-origin network work in the content script, so
 * this is a deadlock guard, not a latency budget.
 */
const REQUEST_TIMEOUT_MS = 30_000;

export function pageContextInit() {
  if (window.chrome !== undefined && window.chrome?.runtime) {
    throw new Error("Invalid context execution");
  }

  if (!document.documentElement.dataset[DATASET_NAME]) {
    throw new Error("service callback event is not initialized");
  }

  callbackToken = document.documentElement.dataset[DATASET_NAME];
  document.documentElement.dataset[DATASET_NAME] = "1";
}

/**
 * @param {string} command
 * @param {string }action
 * @param {any[]} args
 * @return {Promise<ResponseCallbackEvent>}
 */
export function pageContextRequest(command, action, ...args) {
  return new Promise((resolve, reject) => {
    /** @type {RequestCallbackEvent} */
    const detail = {
      referer: `${_createToken()}[${command}.${action}]`,
      command,
      action,
      args: args,
    };

    // The reply arrives as a one-shot event, and there is no guarantee it ever
    // arrives: the content half may not be listening on this token (see the
    // pageContextInit() placeholder), the command may not be registered, or the
    // page may be mid-navigation. Without the timeout the promise stayed pending
    // forever and its caller - and everything awaiting that caller - stalled
    // silently, which is the worst possible failure for a bridge.
    const eventName = _buildRefererEvent(detail.referer);

    const onResponse = (evt) => {
      clearTimeout(timer);
      /** @type {ResponseCallbackEvent} */
      const response = evt.detail;
      response.success ? resolve(response) : reject(response);
    };

    // Plain removeEventListener rather than an AbortController: this module runs in
    // the page context, where an AbortSignal built from a different realm's
    // AbortController is not accepted by addEventListener.
    const timer = setTimeout(() => {
      document.removeEventListener(eventName, onResponse);
      /** @type {ResponseCallbackEvent} */
      reject({
        referer: detail.referer,
        success: false,
        data: `No response for "${command}.${action}" within ${REQUEST_TIMEOUT_MS} ms`,
      });
    }, REQUEST_TIMEOUT_MS);

    document.addEventListener(eventName, onResponse, { once: true });

    const eRequest = new CustomEvent(DATASET_NAME.concat(callbackToken), { detail });
    document.dispatchEvent(eRequest);
  });
}
