import { pageSignal } from "./abort.js";

const domParser = new DOMParser();

/** @template T */
export class FetchResponse {
  /** @type {T} */
  document;
  /** @type {Headers}  */
  headers;
  /** @type {number} */
  #expirationTimestamp = -1;

  /**
   * @param {T} document
   * @param {Headers} headers
   */
  constructor(document, headers) {
    this.document = document;
    this.headers = headers;

    if (headers.has("Expires")) {
      this.#expirationTimestamp = new Date(headers.get("Expires")).getTime();
    }
  }

  /** @return {number} */
  get expires() {
    return this.#expirationTimestamp;
  }
}

/**
 * @param {RequestInfo|URL} input
 * @param {RequestInit} [init]
 * @return {Promise<FetchResponse<Document>>}
 */
export function fetchXml(input, init) {
  init = fixInit(init);
  return fetch(input, init).then(async (response) => {
    // Neither of these was checked before: an HTTP error response was parsed as if
    // it were XML anyway and only failed later, deep inside a mapping function, as
    // an opaque "node.getAttribute is not a function" - and a caller catching a
    // broad error (DataHelper.update() does) silently kept stale data instead of
    // seeing an actual fetch failure. Fixed in refactoring-new.md Phase A.2 #7.
    if (!response.ok) {
      throw new Error(`fetchXml: ${input} responded with HTTP ${response.status}`);
    }

    const document = domParser.parseFromString(await response.text(), "text/xml");
    // DOMParser does not throw on malformed XML - it replaces the document with a
    // <parsererror> node instead, in every implementation that follows the
    // long-standing de-facto convention (Firefox, Chromium and jsdom all do).
    if (document.getElementsByTagName("parsererror").length > 0) {
      throw new Error(`fetchXml: ${input} did not return valid XML`);
    }

    return new FetchResponse(document, response.headers);
  });
}

/**
 * @param {RequestInfo|URL} input
 * @param {RequestInit} [init]
 * @return {Promise<FetchResponse<Object>>}
 */
export function fetchJson(input, init) {
  init = fixInit(init);
  return fetch(input, init).then(async (response) => {
    return new FetchResponse(await response.json(), response.headers);
  });
}

/**
 *
 * @param {RequestInit} init
 * @return {RequestInit}
 */
function fixInit(init) {
  if (!init) {
    return {
      signal: pageSignal(),
      cache: "default",
    };
  }

  if (!Object.hasOwn(init, "signal")) {
    init.signal = pageSignal();
  }

  if (!Object.hasOwn(init, "cache")) {
    init.cache = "default";
  }

  return init;
}
