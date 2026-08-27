#!/usr/bin/env node
/**
 * Generates and reads the local development signing key that pins the extension's id.
 *
 * Why this exists: Chromium derives an unpacked extension's id from the ABSOLUTE PATH it was
 * loaded from, unless the manifest carries a `key`. A path-derived id means that moving the
 * build directory, or rebuilding somewhere else, produces a *different extension* as far as the
 * browser is concerned - and `chrome.storage.local`, which holds the per-universe DataHelper
 * data, is keyed by extension id. So the galaxy/player cache would silently reset.
 *
 * With a `key` in the manifest the id is derived from the key instead, and stays put forever.
 *
 * The private key never leaves this machine and is gitignored. It is NOT the Web Store key and
 * has nothing to do with publishing - it only makes the local install stable.
 *
 * Usage:
 *   node scripts/dev-key.mjs            print the id (creating the key on first run)
 *   node scripts/dev-key.mjs --print-key  print the manifest `key` value
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const keyPath = path.join(projectRoot, ".local-extension-key.pem");

/** Creates the keypair on first use; every later call reuses it. */
export function ensureDevKey() {
  if (!fs.existsSync(keyPath)) {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    fs.writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  }

  return crypto.createPrivateKey(fs.readFileSync(keyPath, "utf8"));
}

/** The base64 SPKI public key that goes into `manifest.key`. */
export function devManifestKey() {
  const publicKey = crypto.createPublicKey(ensureDevKey());

  return publicKey.export({ type: "spki", format: "der" }).toString("base64");
}

/**
 * The extension id Chromium will derive from that key: the first 32 hex characters of the
 * SHA-256 of the DER public key, with 0-9a-f mapped onto a-p.
 */
export function devExtensionId() {
  const der = Buffer.from(devManifestKey(), "base64");
  const hash = crypto.createHash("sha256").update(der).digest("hex").slice(0, 32);

  return hash.replace(/[0-9a-f]/g, (character) => String.fromCharCode(97 + parseInt(character, 16)));
}

export const devKeyPath = keyPath;

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes("--print-key")) {
    console.log(devManifestKey());
  } else {
    const existed = fs.existsSync(keyPath);
    const id = devExtensionId();
    if (!existed) console.log(`Created ${path.relative(projectRoot, keyPath)} (keep it; it pins the id)`);
    console.log(id);
  }
}
