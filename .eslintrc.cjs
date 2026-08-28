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
  // Falls OGame eigene globale Variablen nutzt, die du im Script abrufst (z.B. jQuery),
  // musst du sie hier definieren, damit 'no-undef' nicht meckert:
  globals: {
    $: "readonly",
    jQuery: "readonly",
  },
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
