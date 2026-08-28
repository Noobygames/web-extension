/**
 * Restores the imports the Phase 3 split lost.
 *
 * Builds an export map of every module under src/, then for each unresolved
 * identifier finds the module that exports it and adds the import. Anything no module
 * exports is left alone and reported - those are OGame page globals.
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "acorn";

const PROVIDED = new Set(
  JSON.parse(fs.readFileSync(".tmp-globals.json", "utf8"))
);

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      if (entry.name === "libs") continue;
      walk(full);
    } else if (entry.name.endsWith(".js")) files.push(full);
  }
})("src");

function each(node, visit, parent = null) {
  if (!node || typeof node.type !== "string") return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end" || key === "loc") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child.type === "string") each(child, visit, node);
    } else if (value && typeof value.type === "string") each(value, visit, node);
  }
}

function bindNames(node, out) {
  if (!node) return;
  if (node.type === "Identifier") out.add(node.name);
  else if (node.type === "ObjectPattern")
    for (const p of node.properties) bindNames(p.type === "RestElement" ? p.argument : p.value, out);
  else if (node.type === "ArrayPattern") for (const e of node.elements) bindNames(e, out);
  else if (node.type === "AssignmentPattern") bindNames(node.left, out);
  else if (node.type === "RestElement") bindNames(node.argument, out);
}

const asts = new Map();
for (const file of files) {
  asts.set(file, parse(fs.readFileSync(file, "utf8"), { ecmaVersion: "latest", sourceType: "module", locations: true }));
}

/** name -> [{file, kind}] where kind is "named" or "default" */
const exportsByName = new Map();
const add = (name, file, kind) => {
  if (!exportsByName.has(name)) exportsByName.set(name, []);
  exportsByName.get(name).push({ file, kind });
};

for (const [file, ast] of asts) {
  for (const node of ast.body) {
    if (node.type === "ExportNamedDeclaration") {
      if (node.declaration) {
        if (node.declaration.type === "VariableDeclaration")
          for (const d of node.declaration.declarations) {
            const names = new Set();
            bindNames(d.id, names);
            for (const n of names) add(n, file, "named");
          }
        else if (node.declaration.id) add(node.declaration.id.name, file, "named");
      }
      for (const s of node.specifiers) add(s.exported.name, file, "named");
    } else if (node.type === "ExportDefaultDeclaration") {
      const guess = path.basename(file, ".js");
      add(guess, file, "default");
    }
  }
}

// Default exports are used under whatever name the importer picks; collect the names
// files already use for them so the same name can be reused.
for (const [file, ast] of asts) {
  for (const node of ast.body) {
    if (node.type !== "ImportDeclaration" || !node.source.value.startsWith(".")) continue;
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), node.source.value));
    for (const s of node.specifiers) {
      if (s.type === "ImportDefaultSpecifier") add(s.local.name, target, "default");
      if (s.type === "ImportNamespaceSpecifier") add(s.local.name, target, "namespace");
    }
  }
}

const unresolvedReport = [];
let added = 0;

for (const [file, ast] of asts) {
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

  const missing = new Set();
  each(ast, (node, parent) => {
    if (node.type !== "Identifier" || !parent) return;
    if (parent.type === "MemberExpression" && parent.property === node && !parent.computed) return;
    if ((parent.type === "Property" || parent.type === "PropertyDefinition") && parent.key === node && !parent.computed) return;
    if (parent.type === "MethodDefinition" && parent.key === node) return;
    if (["LabeledStatement", "BreakStatement", "ContinueStatement"].includes(parent.type)) return;
    if (["ImportSpecifier", "ImportDefaultSpecifier", "ImportNamespaceSpecifier", "ExportSpecifier"].includes(parent.type)) return;
    if (bound.has(node.name) || PROVIDED.has(node.name)) return;
    missing.add(node.name);
  });

  if (!missing.size) continue;

  const toAdd = new Map(); // specifier line -> set
  for (const name of missing) {
    const candidates = (exportsByName.get(name) || []).filter((c) => c.file !== file);
    if (!candidates.length) {
      unresolvedReport.push(`${file}: ${name}`);
      continue;
    }
    // Prefer a named export; among several, the shortest path (most specific util).
    const named = candidates.filter((c) => c.kind === "named");
    const chosen = (named.length ? named : candidates)[0];
    const rel = (() => {
      let r = path.posix.relative(path.posix.dirname(file), chosen.file);
      if (!r.startsWith(".")) r = "./" + r;
      return r;
    })();
    const key = `${rel}|${chosen.kind}`;
    if (!toAdd.has(key)) toAdd.set(key, new Set());
    toAdd.get(key).add(name);
  }

  if (!toAdd.size) continue;

  const lines = [];
  for (const [key, names] of toAdd) {
    const [rel, kind] = key.split("|");
    if (kind === "named") lines.push(`import { ${[...names].sort().join(", ")} } from "${rel}";`);
    else if (kind === "default") for (const n of names) lines.push(`import ${n} from "${rel}";`);
    else for (const n of names) lines.push(`import * as ${n} from "${rel}";`);
    added += names.size;
  }

  const source = fs.readFileSync(file, "utf8");
  const lastImport = [...source.matchAll(/^import .*;$/gm)].pop();
  const at = lastImport ? lastImport.index + lastImport[0].length : 0;
  fs.writeFileSync(file, source.slice(0, at) + "\n" + lines.join("\n") + source.slice(at));
  console.log(file);
  for (const l of lines) console.log("   + " + l);
}

console.log(`\n${added} Importe ergaenzt`);
if (unresolvedReport.length) {
  console.log("\nnicht aufloesbar (vermutlich OGame-Seitenglobals):");
  for (const r of unresolvedReport) console.log("   " + r);
}
