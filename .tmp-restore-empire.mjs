import fs from "node:fs";

const p = "src/ctxpage/empire/index.js";
let s = fs.readFileSync(p, "utf8");

const anchor = `function empireRefreshDue(json, mode, force = false) {`;
if (!s.includes(anchor)) {
  console.error("anchor missing");
  process.exit(1);
}

const restored = `const EMPIRE_PLANETS_PARAMS = new URLSearchParams({ page: "standalone", component: "empire" });
const EMPIRE_MOONS_PARAMS = new URLSearchParams({ page: "standalone", component: "empire", planetType: "1" });

/**
 * One request for the standalone empire page, parsed out of the inline
 * \`createImperiumHtml\` call the page carries.
 *
 * @param {URLSearchParams} href
 * @returns {Promise<object>}
 */
const empireRequest = (href) =>
  fetch(\`?\${href.toString()}\`, { signal: pageSignal() })
    .then((response) => response.text())
    .then((string) =>
      JSON.parse(
        string.substring(string.indexOf("createImperiumHtml") + 47, string.indexOf("initEmpire") - 16),
        (key, value) => {
          if (value === "0") return 0;
          return value;
        }
      )
    );

/** @type {Promise<object>|null} in-flight prefetch of the empire planets page */
let empirePrefetch = null;

`;

s = s.replace(anchor, restored + anchor);
fs.writeFileSync(p, s);
console.log("empire: 4 Deklarationen wiederhergestellt");

// The fleet-dispatch state object owns this one.
const q = "src/ctxpage/fleetdispatch/index.js";
let f = fs.readFileSync(q, "utf8");
const before = f;
f = f.replace(/(?<![.\w$])onFleetSentRedirectUrl\b/g, "fleetState.onFleetSentRedirectUrl");
f = f.replace(/fleetState\.fleetState\./g, "fleetState.");
if (f === before) {
  console.error("fleetdispatch: nothing to fix?");
} else {
  fs.writeFileSync(q, f);
  console.log("fleetdispatch: onFleetSentRedirectUrl auf fleetState umgestellt");
}
