/**
 * The six language tables have to keep the same keys.
 *
 * Before Phase 5 of refactoring.md there was one table, one entry per key holding
 * all six strings, so a key either existed in every language or in none. Splitting
 * it into `src/util/translations/<lang>.js` bought 67 KB off the core bundle and
 * cost that guarantee: adding a string is now six edits, and forgetting five of
 * them is invisible - the missing languages fall back to English and look fine to
 * whoever wrote the key.
 *
 * So this says which file is missing which key. It is the whole reason the split is
 * safe to live with.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import de from "../../src/util/translations/de.js";
import en from "../../src/util/translations/en.js";
import es from "../../src/util/translations/es.js";
import fr from "../../src/util/translations/fr.js";
import tr from "../../src/util/translations/tr.js";
import br from "../../src/util/translations/br.js";

const tables = { de, en, es, fr, tr, br };
const TYPES = ["tech", "res", "text"];

test("every language file carries the same three types", () => {
  for (const [lang, table] of Object.entries(tables)) {
    assert.deepEqual(Object.keys(table).sort(), [...TYPES].sort(), `${lang}.js has the wrong types`);
  }
});

test("every language has every key English has", () => {
  for (const [lang, table] of Object.entries(tables)) {
    if (lang === "en") continue;

    for (const type of TYPES) {
      const missing = Object.keys(en[type]).filter((key) => table[type][key] === undefined);
      assert.deepEqual(missing, [], `translations/${lang}.js is missing ${type}: ${missing.join(", ")}`);
    }
  }
});

test("no language carries a key English does not", () => {
  // The other direction matters too: a key only `de` has can never be read, because
  // `#translate()` is called with ids the code knows and English is what the code
  // was written against.
  for (const [lang, table] of Object.entries(tables)) {
    if (lang === "en") continue;

    for (const type of TYPES) {
      const extra = Object.keys(table[type]).filter((key) => en[type][key] === undefined);
      assert.deepEqual(extra, [], `translations/${lang}.js has ${type} keys English does not: ${extra.join(", ")}`);
    }
  }
});

test("no string is empty", () => {
  // An empty string is what `#translate()` returns for a key nobody translated. A
  // file that stores one directly defeats the English fallback: the lookup succeeds
  // and the player sees a blank label instead of the English word.
  for (const [lang, table] of Object.entries(tables)) {
    for (const type of TYPES) {
      for (const [key, value] of Object.entries(table[type])) {
        assert.equal(typeof value, "string", `translations/${lang}.js ${type}.${key} is not a string`);
        assert.notEqual(value.trim(), "", `translations/${lang}.js ${type}.${key} is empty`);
      }
    }
  }
});

test("the tables are frozen", () => {
  // They are module singletons shared between the core bundle and five chunks.
  for (const [lang, table] of Object.entries(tables)) {
    assert.equal(Object.isFrozen(table), true, `translations/${lang}.js is not frozen`);
  }
});

test("translate.js keeps English static and the other five behind import()", () => {
  // The split only pays if `en` is the one that ships in the core: it is the
  // fallback for every key, so a dynamic `en` would make every lookup wait for a
  // fetch. And a computed specifier would bundle to nothing - see importLanguage().
  const source = fs.readFileSync(path.resolve(import.meta.dirname, "..", "..", "src", "util", "translate.js"), "utf8");

  assert.ok(source.includes('import EN from "./translations/en.js";'), "English is no longer statically imported");
  for (const lang of ["de", "es", "fr", "tr", "br"]) {
    assert.ok(source.includes(`import("./translations/${lang}.js")`), `${lang} is not a literal import()`);
  }
  assert.ok(!source.includes("import(`"), "a path built from a variable splits into no chunk at all");
});
