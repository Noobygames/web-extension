/**
 * Every name `src/` reads must come from somewhere.
 *
 * This exists because of what the Phase 3 split did in silence. The split tool rebuilt
 * files from their function bodies, so a module-level `const` sitting between two
 * functions was dropped; a later pass removed imports that looked unused. Neither
 * shows up anywhere else: `no-undef` is off for this codebase, the bundle builds, the
 * tests pass, and the extension then fails on whichever page touches the name first —
 * which is how `empirePrefetch is not defined` reached a running browser.
 *
 * The check is deliberately an over-approximation of "declared": a binding anywhere in
 * the file counts, even if it is only in scope in one function. That misses some real
 * problems, but it produces no false alarms, which is what makes a guard worth having.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parse } from "acorn";

const projectRoot = path.resolve(import.meta.dirname, "..");

/**
 * What the browser and the OGame page provide.
 *
 * The second half is the interesting one: OGame's own page scripts define these, and
 * the extension reads them off the global scope on purpose. Adding a name here is a
 * claim that the game provides it — check before you do.
 */
const PROVIDED = new Set([
  // language and browser
  "globalThis",
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "console",
  "location",
  "history",
  "performance",
  "fetch",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "queueMicrotask",
  "Math",
  "JSON",
  "Object",
  "Array",
  "String",
  "Number",
  "Boolean",
  "Date",
  "Promise",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "RegExp",
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "DOMException",
  "Symbol",
  "Proxy",
  "Reflect",
  "BigInt",
  "Intl",
  "URL",
  "URLSearchParams",
  "AbortController",
  "AbortSignal",
  "CustomEvent",
  "Event",
  "EventTarget",
  "KeyboardEvent",
  "DOMParser",
  "XMLSerializer",
  "MutationObserver",
  "IntersectionObserver",
  "Element",
  "HTMLElement",
  "Node",
  "NodeList",
  "NodeFilter",
  "Image",
  "Blob",
  "FileReader",
  "FormData",
  "Headers",
  "Request",
  "Response",
  "TextEncoder",
  "TextDecoder",
  "structuredClone",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "encodeURIComponent",
  "decodeURIComponent",
  "encodeURI",
  "decodeURI",
  "btoa",
  "atob",
  "undefined",
  "NaN",
  "Infinity",
  "arguments",
  "getComputedStyle",
  "alert",
  "confirm",
  "prompt",
  "screen",
  "event",
  "scrollTo",
  "chrome",
  "browser",
  "cloneInto",
  // OGame page globals
  "$",
  "jQuery",
  "fleetDispatcher",
  "FleetDispatcher",
  "technologyDetails",
  "playerId",
  "fadeBox",
  "getFormatedDate",
  "getFormatedTime",
  "formatTimeWrapper",
  "formatTime",
  "clampInt",
  "LocalizationStrings",
  "DOMPurify",
  "Chart",
  "LZString",
  "Tipped",
  "token",
  "errorBoxDecision",
  "errorBoxAsArray",
  "showNotification",
  "setNewTokenData",
  "openJumpgate",
  "jumpgateDone",
  "removeTooltip",
  "getTooltipSelector",
  "initTooltips",
  "loadTimers",
  "localTime",
  "serverTime",
  "timeDiff",
  "timeZoneDiffSeconds",
  "miniFleetToken",
  "ogame",
  "resourcesBar",
  "premium",
  "toggleShipDetails",
  "sendShipsWithPopup",
  "submitForm",
  "doExpedition",
  "displayContentGalaxy",
  "renderContentGalaxy",
  "ajaxCall",
  "highscoreContentUrl",
  "currentCategory",
  "currentType",
  "initHighscoreContent",
  "userWantsFocus",
  "searchPosition",
  "initBuddyRequestForm",
  "galaxy",
  "system",
  "ajaxEventboxURI",
  "toggleEvents",
  "unions",
  "expeditionFleetTemplates",
  "standardFleetTemplates",
  "shipsOnPlanet",
  "spionageAmount",
  "playerName",
  "honorScore",
]);

function sourceFiles() {
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
  })(path.join(projectRoot, "src"));
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

test("every identifier src/ reads is declared, imported, or provided by the page", () => {
  const offenders = [];

  for (const file of sourceFiles()) {
    const source = fs.readFileSync(file, "utf8");
    const ast = parse(source, { ecmaVersion: "latest", sourceType: "module", locations: true });

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

    const seen = new Set();
    each(ast, (node, parent) => {
      if (node.type !== "Identifier" || isNotAReference(node, parent)) return;
      if (bound.has(node.name) || PROVIDED.has(node.name) || seen.has(node.name)) return;
      seen.add(node.name);
      offenders.push(`${path.relative(projectRoot, file).replaceAll("\\", "/")}:${node.loc.start.line} ${node.name}`);
    });
  }

  assert.deepEqual(offenders, [], "these read a name nothing provides — a ReferenceError on the page that uses them");
});
