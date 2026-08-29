# Context - Content Commands

Source: `callbackEvents` [service.callbackEvent.js](../src/util/service.callbackEvent.js)

[toc]

## Content Context

Declaration `callbackEvents.contentContextInit(callbackCommandMap)`

```json
{
  "ptre": {
    "galaxy": "PtreGalaxyScannerFunction"
  },
  "messages": {
    "expeditionType": "GetExpeditionTypeFunction"
  },
  "serverData": {
    "get": "GetServerDataXmlFunction"
  }
}
```

## Page Context

The commands can be called from the page context using the function.

```ts
callbackEvents.pageContextRequest(command, action, ...functionArgs);
// Returns: Promise<ResponseCallbackEvent>
```

Result: **ResponseCallbackEvent**

- _success_: Indicates if callback execution is success or not.
- _referer_: Unique request identifier.
- _response_: Result of callback execution.

---

### PtreGalaxyScannerFunction (ptre.galaxy)

**Arguments**

- _changes_:
- _ptreKey_: PTRE Team Key
- _serverTime_:

How to call from the page context.

```js
callbackEvents.pageContextRequest("ptre", "galaxy", changes, ptreKey, serverTime);
```

### GetExpeditionTypeFunction (messages.expeditionType)

**Arguments**

- message:

**Result**

- _type_:
- _busy_: (deprecated)

How to call from the page context.

```js
callbackEvents.pageContextRequest("messages", "expeditionType", rawMessage);
```

### GetServerDataXmlFunction (serverData.get)

Fetches `serverData.xml` for the current universe, cached in `chrome.storage.local`
with a 24h TTL (`src/ctxcontent/helpers/universe.data.js`). Returns the raw XML
**text**, not a parsed `Document` - a `Document` cannot cross this bridge, only
structured-cloneable values can. `OGBeyondInfinity.updateServerSettings()`
(`src/ogCore.js`) is the one caller; it parses the text itself with `DOMParser` on
the page side, exactly as it did before this command existed.

**Arguments**

- _force_ (optional, default `false`): bypasses the cache and re-fetches.

**Result**

The XML text (`string`).

How to call from the page context.

```js
const { response } = await callbackEvents.pageContextRequest("serverData", "get", force);
const xml = new DOMParser().parseFromString(response, "text/xml");
```

---

## Notes and considerations

- Page initialization: you must call `pageContextInit()` before using `pageContextRequest` from the page context (see its usage in `src/ogCore.js`).
- Promise behavior: `pageContextRequest` RESOLVES when `success === true` and REJECTS when `success === false` (e.g., unknown command/action or an error during callback execution). It is recommended to use `try/catch` or `.catch(...)`.
- Firefox compatibility: the response is cloned with `cloneInto`; this is transparent to the consumer.
- Arguments: parameters must be cloneable/serializable data.
- Import alias: this document uses the alias `callbackEvents` for illustration purposes. In code you can import it as a namespace `import * as callbackEvents from "../src/util/service.callbackEvent.js";` or via named imports `import { pageContextInit, pageContextRequest } from "../src/util/service.callbackEvent.js"`.

Error-handling example:

```js
try {
  const { response } = await callbackEvents.pageContextRequest("messages", "expeditionType", rawMessage);
  console.log(response.type);
} catch (err) {
  console.error("expeditionType failed:", err.response);
}
```
