# Context - Content Commands

Source: `callbackEvents` [bridge.js](../src/platform/bridge.js)

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
  },
  "universe": {
    "inactives": "GetInactiveTargetsFunction"
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

### GetInactiveTargetsFunction (universe.inactives)

Inactive players in the given galaxies, read out of the universe database the content
script already caches (`players.xml` + `universe.xml`, hydrated by `DataHelper.update()`).
Makes **no** request of its own - opening the raid list costs nothing and produces no
in-game activity (AGENTS.md 4). Display data only; no probe or fleet action is attached
to it (AGENTS.md 1.5.1).

Guarded by `wait.waitFor(() => dataHelper)`, so a call that arrives before the universe
finished hydrating waits instead of throwing.

**Arguments**

- _galaxies_ (optional, default `[]`): galaxy numbers to keep. Empty means every galaxy -
  in a large universe that is a much bigger payload, so callers pass the galaxies the
  player actually owns a planet in.

**Result**

`Array<{playerId: number, name: string, status: string, coords: string, moon: boolean}>` -
plain primitives, since only structured-cloneable values cross this bridge. `status` is the
`players.xml` attribute verbatim (`"i"` = 7 days inactive, `"I"` = 28 days); players
carrying `v`, `b` or `a` are filtered out, they cannot be attacked.

How to call from the page context.

```js
const { response } = await callbackEvents.pageContextRequest("universe", "inactives", [1, 4]);
```

The page-context wrapper is `dataHelper.getInactiveTargets(galaxies)`
(`src/integrations/dataHelper.js`).

---

## Notes and considerations

- Page initialization: you must call `pageContextInit()` before using `pageContextRequest` from the page context (see its usage in `src/ogCore.js`).
- Promise behavior: `pageContextRequest` RESOLVES when `success === true` and REJECTS when `success === false` (e.g., unknown command/action or an error during callback execution). It is recommended to use `try/catch` or `.catch(...)`.
- Firefox compatibility: the response is cloned with `cloneInto`; this is transparent to the consumer.
- Arguments: parameters must be cloneable/serializable data.
- Import alias: this document uses the alias `callbackEvents` for illustration purposes. In code you can import it as a namespace `import * as callbackEvents from "../src/platform/bridge.js";` or via named imports `import { pageContextInit, pageContextRequest } from "../src/platform/bridge.js"`.

Error-handling example:

```js
try {
  const { response } = await callbackEvents.pageContextRequest("messages", "expeditionType", rawMessage);
  console.log(response.type);
} catch (err) {
  console.error("expeditionType failed:", err.response);
}
```
