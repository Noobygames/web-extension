module.exports = {
  env: {
    browser: true,
    es2020: true,
  },
  // "prettier" (eslint-config-prettier) turns off every stylistic rule that
  // Prettier already owns. Do not re-enable any of them below: indent, quotes,
  // semi and linebreak-style used to be listed in `rules` and fought with
  // prettier/prettier over the same code, which kept `npm run check` red on
  // correctly formatted files and buried the real findings.
  extends: ["eslint:recommended", "prettier"],
  plugins: ["prettier"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  rules: {
    "prettier/prettier": ["error"],
    "no-undef": 0,
    "no-unused-vars": 0,
    "no-async-promise-executor": 0,
    "no-empty": 0,
    "no-inner-declarations": 0,
    "no-global-assign": 0,
    "no-prototype-builtins": 0,
  },
};
