#!/bin/bash
#set -x     #- for debug

# Fail loudly. Without this the script kept going past a failed step and still exited 0
# because bash reports the *last* command's status - so a build that produced a broken
# or half-empty zip looked exactly like a good one, in CI as much as locally.
set -euo pipefail

npm i -D
rm -rf ./dist
mkdir ./dist

VERSION="${1:-$(date +%-m.%-d.%-H.%-M)}"
echo "Build version $VERSION"

MANIFEST_FILE_NAME="manifest.json"
MANIFEST_FIREFOX_NAME="manifest-firefox.json"
CSS_BUNDLE_FILE="global.css"
VERSION_JS_FILE_NAME="platform/version.js"

##
## $1: string version in format x.x.x
##
function sed_version {
  echo "Stream version"
  sed -i "s/0\.0\.0/$VERSION/g" "${DIST_MODULE}/${MANIFEST_FILE_NAME}"
  sed -i "s/__VERSION__/$VERSION/g" "${DIST_MODULE}/${VERSION_JS_FILE_NAME}"
}

##
## Collapses the ES module graph into one file per context (rollup, no
## minification - see scripts/bundle.mjs). Must run after sed_version, or the
## stamped platform/version.js is not the one that ends up in the bundle.
##
function bundle_modules {
  echo "Bundling modules"
  node scripts/bundle.mjs "${DIST_MODULE}"
}

function minified() {
  for v in "$@"; do
    npx terser "$v" -o "$v"
    echo "Minified: $v"
  done
}
export -f minified

function cleancss() {
  for v in "$@"; do
    npx cleancss "$v" -o "$v"
    echo "Minified: $v"
  done
}


DIST_MODULE="./dist/firefox"
echo '------------------------------------------------------------'
echo 'MODULE -- Firefox'
echo '------------------------------------------------------------'
echo ''
mkdir "${DIST_MODULE}"
cp -r src/* "${DIST_MODULE}"
cp "${DIST_MODULE}/${MANIFEST_FIREFOX_NAME}" "${DIST_MODULE}/${MANIFEST_FILE_NAME}"
rm "${DIST_MODULE}/${MANIFEST_FIREFOX_NAME}"
sed_version

## The extension's own asset URLs, and only those. This used to be a bare
## s/chrome/moz/g over the whole stylesheet, which also rewrote every vendor prefix
## and comment that happened to contain the word - the source still carried four
## `-chrome-*` declarations that were `-moz-*` before someone ran the substitution the
## other way, and any future comment mentioning Chrome would have been corrupted the
## same way.
sed -i "s|chrome-extension://|moz-extension://|g" "${DIST_MODULE}/${CSS_BUNDLE_FILE}"
bundle_modules
node scripts/zip.mjs "./dist/ogi-firefox.zip" "${DIST_MODULE}"
echo "Packing zip for firefox complete!"
rm -rf "${DIST_MODULE}"


DIST_MODULE="./dist/chrome"
echo '------------------------------------------------------------'
echo 'MODULE -- Edge, Chrome and Chromium'
echo '------------------------------------------------------------'
echo ''
mkdir "${DIST_MODULE}"
cp -r src/* "${DIST_MODULE}"
sed_version
rm "${DIST_MODULE}/${MANIFEST_FIREFOX_NAME}"
bundle_modules

<<'REMOVE_MINIFYING'
find "${DIST_MODULE}" \
  -type f -iname '*.js' \
  -not -path '*/libs/*' \
  -exec bash -c 'minified "$@"' bash {} +
cleancss "${DIST_MODULE}/${CSS_BUNDLE_FILE}"
REMOVE_MINIFYING

node scripts/zip.mjs "./dist/ogi-chrome.zip" "${DIST_MODULE}"
echo "Packing zip for chrome complete!"

## Edge hosts its own updates, so the Chrome Web Store update_url has to go. This was
## `sed -i '31d'`, a bare line number with a "what is this line for?" comment next to
## it - and the manifest has grown since, so line 31 had drifted onto the 512px icon:
## Edge builds were shipping the update_url they must not have and missing an icon.
node -e '
  const fs = require("fs");
  const file = process.argv[1];
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  delete manifest.update_url;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
' "${DIST_MODULE}/${MANIFEST_FILE_NAME}"
node scripts/zip.mjs "./dist/ogi-edge.zip" "${DIST_MODULE}"
echo "Packing zip for edge complete!"
rm -rf "${DIST_MODULE}"

node scripts/verify-package.mjs
