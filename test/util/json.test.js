import test from "node:test";
import assert from "node:assert/strict";

import { toJSON, fromJSON, toNative, fromNative, extractJSON, InvalidJSONError } from "../../src/util/json.js";

test("toJSON/fromJSON round-trips plain values unchanged", () => {
  const value = { a: 1, b: "two", c: [3, null, true], d: { nested: false } };
  assert.deepEqual(fromJSON(toJSON(value)), value);
});

test("toJSON encodes a Map and fromJSON revives it", () => {
  const value = new Map([
    ["a", 1],
    ["b", 2],
  ]);
  const text = toJSON(value);

  assert.equal(text, '{"@DT":"map","@v":[["a",1],["b",2]]}');

  const revived = fromJSON(text);
  assert.ok(revived instanceof Map);
  assert.equal(revived.get("b"), 2);
  assert.equal(revived.size, 2);
});

test("toJSON encodes a Set and fromJSON revives it", () => {
  const revived = fromJSON(toJSON(new Set(["x", "y", "x"])));
  assert.ok(revived instanceof Set);
  assert.deepEqual([...revived], ["x", "y"]);
});

test("Maps and Sets survive nesting inside plain objects and arrays", () => {
  const value = {
    players: new Map([[1, { name: "Xtro", planets: new Set(["1:2:3"]) }]]),
    list: [new Set([1, 2])],
  };

  const revived = fromJSON(toJSON(value));

  assert.ok(revived.players instanceof Map);
  assert.ok(revived.players.get(1).planets instanceof Set);
  assert.ok(revived.list[0] instanceof Set);
  assert.deepEqual([...revived.players.get(1).planets], ["1:2:3"]);
});

test("Map keys keep their type through a round-trip", () => {
  const revived = fromJSON(toJSON(new Map([[42, "answer"]])));
  assert.equal(revived.get(42), "answer");
  assert.equal(revived.get("42"), undefined);
});

test("toJSON honours the space argument", () => {
  assert.equal(toJSON({ a: 1 }, 2), '{\n  "a": 1\n}');
});

test("toNative produces a structured-clone-safe plain object", () => {
  // chrome.storage.local cannot hold Maps; universe.storage.js goes through
  // toNative() before writing and fromNative() after reading.
  const native = toNative({ scanned: new Map([["1:1:1", { player: 7 }]]) });

  assert.equal(typeof native, "object");
  assert.ok(!(native.scanned instanceof Map));
  assert.deepEqual(native, { scanned: { "@DT": "map", "@v": [["1:1:1", { player: 7 }]] } });

  // and it must be a real clone, not a reference to the input
  assert.deepEqual(JSON.parse(JSON.stringify(native)), native);
});

test("fromNative reverses toNative", () => {
  const original = { scanned: new Map([["1:1:1", { player: 7 }]]), tags: new Set(["a"]) };
  const revived = fromNative(toNative(original));

  assert.ok(revived.scanned instanceof Map);
  assert.ok(revived.tags instanceof Set);
  assert.deepEqual(revived.scanned.get("1:1:1"), { player: 7 });
});

test("a plain object carrying the @DT marker is revived as its encoded type", () => {
  // Documents a real constraint: "@DT"/"@v" are reserved key names. Data that
  // legitimately contains them will be transformed on the way back in.
  const revived = fromJSON(JSON.stringify({ "@DT": "set", "@v": [1, 2] }));
  assert.ok(revived instanceof Set);
});

test("extractJSON finds an object embedded in surrounding text", () => {
  const [result, open, close] = extractJSON('var data = {"id":42,"name":"x"}; more junk');

  assert.deepEqual(result, { id: 42, name: "x" });
  assert.equal(open, 11);
  assert.equal(close, 31);
});

test("extractJSON returns the first complete object when several follow each other", () => {
  const [result] = extractJSON('{"first":1} {"second":2}');
  assert.deepEqual(result, { first: 1 });
});

test("extractJSON handles nested braces", () => {
  const [result] = extractJSON('prefix {"a":{"b":{"c":1}}} suffix');
  assert.deepEqual(result, { a: { b: { c: 1 } } });
});

test("extractJSON revives Maps like fromJSON does", () => {
  const [result] = extractJSON('junk {"@DT":"map","@v":[["k","v"]]} junk');
  assert.ok(result instanceof Map);
  assert.equal(result.get("k"), "v");
});

test("extractJSON throws InvalidJSONError when there is no object at all", () => {
  assert.throws(() => extractJSON("no braces here"), InvalidJSONError);
});

test("extractJSON throws InvalidJSONError on an unterminated object", () => {
  assert.throws(() => extractJSON('{"a": 1'), InvalidJSONError);
});

test("InvalidJSONError carries its own name", () => {
  const error = new InvalidJSONError("boom");
  assert.equal(error.name, "InvalidJSONError");
  assert.ok(error instanceof Error);
});
