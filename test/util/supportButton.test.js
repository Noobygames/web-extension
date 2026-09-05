/**
 * The Ko-fi link.
 *
 * A donation button is one of the two things AGENTS.md 1.8 explicitly allows, and the
 * list of things it forbids around it is long: a fee, a premium tier, a paid
 * subscription, an injected advert. What keeps this on the allowed side is that it is a
 * plain outbound link with no feature behind it, drawn entirely from our own markup -
 * so the assertions below are about exactly that, not about how it looks.
 *
 * Page-context module - no `chrome: true` on setupBrowser.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { setupBrowser } from "../helpers/globals.js";

const bootstrap = setupBrowser();
const { supportButton, KOFI_URL } = await import("../../src/ui/supportButton.js");
bootstrap.cleanup();

const srcRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

test("the button is a link to the donation page and nothing else", () => {
  const browser = setupBrowser();

  try {
    const link = supportButton();

    assert.equal(link.tagName, "A");
    assert.equal(link.getAttribute("href"), "https://ko-fi.com/nerzal");
    assert.equal(KOFI_URL, "https://ko-fi.com/nerzal");
    assert.equal(link.getAttribute("target"), "_blank", "the game page is not navigated away from");
    // Opener isolation, and no Referer telling ko-fi.com which universe the player is on.
    assert.equal(link.getAttribute("rel"), "noopener noreferrer");
    assert.ok(link.textContent.trim().length > 0, "it says what it is rather than being a bare icon");
  } finally {
    browser.cleanup();
  }
});

test("the icon is drawn, not fetched", () => {
  const browser = setupBrowser();

  try {
    const link = supportButton();

    // No <img>, no background-image, no third-party widget script: OGame's CSP would
    // block the first two and the third would be a beacon (AGENTS.md 1.9).
    assert.ok(link.querySelector("svg"), "the cup is inline SVG");
    assert.equal(link.querySelector("img"), null);
    assert.equal(link.querySelector("script"), null);
    assert.equal(link.querySelector("iframe"), null);
  } finally {
    browser.cleanup();
  }
});

test("both variants render, and differ only by a class", () => {
  const browser = setupBrowser();

  try {
    assert.ok(supportButton("card").classList.contains("ogl-kofi-card"));
    assert.ok(supportButton("inline").classList.contains("ogl-kofi-inline"));
    assert.ok(supportButton().classList.contains("ogl-kofi-card"), "card is the default");
  } finally {
    browser.cleanup();
  }
});

/**
 * The guard that outlives this file's other tests: a Ko-fi widget is one `<script src>`
 * away and it would be a third-party request from inside the game page. If someone
 * reaches for the official button later, this fails and points at the reason.
 */
test("ko-fi is referenced from exactly one file, as a URL and never as a script", () => {
  const offenders = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);

      // Vendored third party, excluded from lint and format too.
      if (entry.isDirectory()) {
        if (entry.name !== "libs") walk(full);
        continue;
      }

      if (!entry.name.endsWith(".js") && !entry.name.endsWith(".css")) continue;
      // The domain, not the word: `ogl-kofi-*` class names and translated labels are
      // not what this guards against - a request to ko-fi.com from the game page is.
      if (!/ko-fi\.com/i.test(fs.readFileSync(full, "utf8"))) continue;

      const relative = path.relative(srcRoot, full).replace(/\\/g, "/");
      // The module that owns the link, and the six translation tables that name the
      // domain in the tooltip so the player knows where the click goes.
      if (relative === "ui/supportButton.js") continue;
      if (/^format\/i18n\/translations\//.test(relative)) continue;

      offenders.push(relative);
    }
  };

  walk(srcRoot);

  assert.deepEqual(offenders, [], "ko-fi belongs in ui/supportButton.js; a widget script belongs nowhere");
});
