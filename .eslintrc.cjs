// The globals OGame's page scripts provide. One shared list, also read by
// test/src-references.test.js - see config/ogame-globals.cjs for what belongs in it.
const ogameGlobals = require("./config/ogame-globals.cjs");

module.exports = {
  env: {
    browser: true,
    es2020: true,
    webextensions: true, // WICHTIG: Erlaubt globale Variablen für Extensions (chrome, browser)
    // greasemonkey: true, // Falls du das Addon erst als Userscript (Tampermonkey) schreibst, das hier einkommentieren
  },
  extends: [
    "eslint:recommended",
    "prettier", // Prettier muss immer am Ende stehen
  ],
  plugins: ["prettier"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  // OGame's own page globals. Without these 'no-undef' fired on every read of the
  // game's variables and the real findings drowned in the noise.
  globals: ogameGlobals.eslintGlobals,
  // scripts/ and test/ run in node and use process, Buffer and friends, which the
  // browser env alone does not cover. The tests keep the browser env too: the jsdom
  // harness puts document, window and localStorage on globalThis.
  overrides: [
    {
      files: ["scripts/**/*.mjs", "test/**/*.js", "*.cjs"],
      env: { node: true },
    },
  ],
  rules: {
    "prettier/prettier": ["error"],

    // --- Bessere Alternativen zu deinen abgeschalteten Regeln ---

    // Statt 'no-unused-vars' komplett abzuschalten (0), lieber auf Warnung setzen
    // und Variablen mit Unterstrich (z.B. _event) erlauben:
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],

    // Leere Blöcke sind oft ein Zeichen für vergessenen Code. Als Warnung behalten:
    "no-empty": "warn",
  },
};
