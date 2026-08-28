/**
 * Print every global `src/` reads that is not a standard browser or language name.
 *
 * The output is the raw material for `config/ogame-globals.cjs`: each line is a name
 * the extension expects OGame (or a library on the page) to provide, with up to three
 * places it is read and a leading `W` when `src/` assigns to it rather than only
 * reading it - which is what decides `readonly` vs `writable` in that file.
 *
 * This does not check that the game really defines a name. It cannot: only a live page
 * can answer that. `docs/ogame-globals.md` has the console snippet for that half.
 *
 *   node scripts/list-page-globals.mjs [dir]     # dir defaults to src
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { parse } from "acorn";

const require = createRequire(import.meta.url);
const browserGlobals = require("globals");
const known = require("../config/ogame-globals.cjs");

const projectRoot = path.resolve(import.meta.dirname, "..");

/** Names no page has to provide: the language, the browser and the extension APIs. */
const standard = new Set([
  ...Object.keys(browserGlobals.builtin),
  ...Object.keys(browserGlobals.browser),
  ...Object.keys(browserGlobals.es2021),
  ...Object.keys(browserGlobals.webextensions),
  "arguments",
  "undefined",
]);

function sourceFiles(root) {
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "libs") continue; // vendored third party
        walk(full);
      } else if (entry.name.endsWith(".js")) {
        files.push(full);
      }
    }
  })(root);
  return files;
}

function each(node, visit, parent = null) {
  if (!node || typeof node.type !== "string") return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child.type === "string") each(child, visit, node);
    } else if (value && typeof value.type === "string") {
      each(value, visit, node);
    }
  }
}

/** The names a binding pattern introduces, including destructuring and rest. */
function bindNames(node, out) {
  if (!node) return;
  if (node.type === "Identifier") out.add(node.name);
  else if (node.type === "ObjectPattern")
    for (const p of node.properties) bindNames(p.type === "RestElement" ? p.argument : p.value, out);
  else if (node.type === "ArrayPattern") for (const e of node.elements) bindNames(e, out);
  else if (node.type === "AssignmentPattern") bindNames(node.left, out);
  else if (node.type === "RestElement") bindNames(node.argument, out);
}

/** True for an identifier that names a property, a key or a label, not a value. */
function isNotAReference(node, parent) {
  if (!parent) return true;
  if (parent.type === "MemberExpression" && parent.property === node && !parent.computed) return true;
  if ((parent.type === "Property" || parent.type === "PropertyDefinition") && parent.key === node && !parent.computed)
    return true;
  if (parent.type === "MethodDefinition" && parent.key === node) return true;
  if (["LabeledStatement", "BreakStatement", "ContinueStatement"].includes(parent.type)) return true;
  if (
    ["ImportSpecifier", "ImportDefaultSpecifier", "ImportNamespaceSpecifier", "ExportSpecifier"].includes(parent.type)
  )
    return true;
  return false;
}

const where = new Map();
const assigned = new Set();

for (const file of sourceFiles(path.resolve(projectRoot, process.argv[2] ?? "src"))) {
  const ast = parse(fs.readFileSync(file, "utf8"), { ecmaVersion: "latest", sourceType: "module", locations: true });

  // Over-approximate: a binding anywhere in the file counts as declared. Same rule as
  // test/src-references.test.js, and for the same reason - it produces no false alarms.
  const bound = new Set();
  each(ast, (node) => {
    switch (node.type) {
      case "ImportDeclaration":
        for (const s of node.specifiers) bound.add(s.local.name);
        break;
      case "VariableDeclarator":
        bindNames(node.id, bound);
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ClassDeclaration":
      case "ClassExpression":
        if (node.id) bound.add(node.id.name);
        if (node.params) for (const p of node.params) bindNames(p, bound);
        break;
      case "ArrowFunctionExpression":
        for (const p of node.params) bindNames(p, bound);
        break;
      case "CatchClause":
        bindNames(node.param, bound);
        break;
    }
  });

  each(ast, (node, parent) => {
    if (node.type !== "Identifier" || isNotAReference(node, parent)) return;
    if (bound.has(node.name) || standard.has(node.name)) return;
    const at = `${path.relative(projectRoot, file).replaceAll("\\", "/")}:${node.loc.start.line}`;
    if (!where.has(node.name)) where.set(node.name, []);
    if (where.get(node.name).length < 3) where.get(node.name).push(at);
    if (parent?.type === "AssignmentExpression" && parent.left === node) assigned.add(node.name);
    if (parent?.type === "UpdateExpression") assigned.add(node.name);
  });
}

const names = [...where.keys()].sort();
for (const name of names) {
  const flags = [assigned.has(name) ? "W" : " ", known.all.includes(name) ? " " : "NEW"].join("");
  console.log(`${flags} ${name.padEnd(26)} ${where.get(name).join("  ")}`);
}

const unlisted = names.filter((n) => !known.all.includes(n));
const unused = known.all.filter((n) => !names.includes(n));
console.log(`\n${names.length} globals read by src/, ${known.all.length} listed in config/ogame-globals.cjs`);
if (unlisted.length) console.log(`not listed yet (NEW above): ${unlisted.join(", ")}`);
if (unused.length) console.log(`listed but unused: ${unused.join(", ")}`);
