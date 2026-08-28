/**
 * Identifiers a src module reads that nothing anywhere in it binds, and that neither
 * the browser nor the OGame page provides.
 *
 * Deliberately an over-approximation of "declared": any binding anywhere in the file
 * counts, so a name shadowed in one function still counts as known. That misses some
 * real problems but produces no false alarms, which is what makes the output usable.
 *
 * The failure it exists for: the Phase 3 split tool rebuilt files from their function
 * bodies only, so a module-level `const` sitting between two functions was dropped -
 * a ReferenceError on first use, invisible to lint, build and bundle.
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "acorn";

const PROVIDED = new Set([
  "globalThis","window","document","navigator","localStorage","sessionStorage","console","location",
  "history","performance","fetch","setTimeout","clearTimeout","setInterval","clearInterval",
  "requestAnimationFrame","cancelAnimationFrame","queueMicrotask","Math","JSON","Object","Array",
  "String","Number","Boolean","Date","Promise","Map","Set","WeakMap","WeakSet","RegExp","Error",
  "TypeError","RangeError","SyntaxError","Symbol","Proxy","Reflect","BigInt","Intl","URL",
  "URLSearchParams","AbortController","AbortSignal","CustomEvent","Event","EventTarget","DOMParser",
  "XMLSerializer","MutationObserver","IntersectionObserver","Element","HTMLElement","Node","NodeList",
  "NodeFilter","Image","Blob","FileReader","FormData","Headers","Request","Response","TextEncoder",
  "TextDecoder","structuredClone","parseInt","parseFloat","isNaN","isFinite","encodeURIComponent",
  "decodeURIComponent","encodeURI","decodeURI","btoa","atob","undefined","NaN","Infinity","arguments",
  "getComputedStyle","alert","confirm","prompt","chrome","browser","cloneInto",
  "$","jQuery","fleetDispatcher","FleetDispatcher","technologyDetails","playerId","fadeBox",
  "getFormatedDate","formatTimeWrapper","LocalizationStrings","DOMPurify","Chart","LZString","Tipped",
  "token","errorBoxDecision","errorBoxAsArray","showNotification","setNewTokenData","openJumpgate",
  "removeTooltip","getTooltipSelector","initTooltips","loadTimers","localTime","serverTime",
  "miniFleetToken","ogame","resourcesBar","premium","toggleShipDetails","sendShipsWithPopup",
]);

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
    } else if (value && typeof value.type === "string") {
      each(value, visit, node);
    }
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

let total = 0;
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = parse(source, { ecmaVersion: "latest", sourceType: "module", locations: true });
  } catch (error) {
    console.log(`${file}: PARSE ${error.message}`);
    total++;
    continue;
  }

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

  const missing = new Map();
  each(ast, (node, parent) => {
    if (node.type !== "Identifier") return;
    if (!parent) return;
    if (parent.type === "MemberExpression" && parent.property === node && !parent.computed) return;
    if ((parent.type === "Property" || parent.type === "PropertyDefinition") && parent.key === node && !parent.computed) return;
    if (parent.type === "MethodDefinition" && parent.key === node) return;
    if (parent.type === "LabeledStatement" || parent.type === "BreakStatement" || parent.type === "ContinueStatement") return;
    if (parent.type === "ImportSpecifier" || parent.type === "ImportDefaultSpecifier" || parent.type === "ImportNamespaceSpecifier") return;
    if (parent.type === "ExportSpecifier") return;
    if (bound.has(node.name) || PROVIDED.has(node.name)) return;
    if (!missing.has(node.name)) missing.set(node.name, node.loc.start.line);
  });

  if (!missing.size) continue;
  total += missing.size;
  console.log(file);
  for (const [name, line] of [...missing].sort((a, b) => a[1] - b[1])) console.log(`   ${line}: ${name}`);
}
console.log(total ? `\n${total} unaufgeloeste Referenzen` : "\nkeine unaufgeloesten Referenzen");
