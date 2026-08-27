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
 * `ogkush.js` immediately, instead of waiting for this module to load first.
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

    document.addEventListener(
      _buildRefererEvent(detail.referer),
      function (evt) {
        /** @type {ResponseCallbackEvent} */
        const detail = evt.detail;
        detail.success ? resolve(detail) : reject(detail);
      },
      { once: true }
    );

    const eRequest = new CustomEvent(DATASET_NAME.concat(callbackToken), { detail });
    document.dispatchEvent(eRequest);
  });
}
