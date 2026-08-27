# Ogame Infinity - developer tasks
#
# Works from PowerShell, cmd and Git Bash as long as node and npm are on PATH.
# Recipes shell out to node scripts instead of using shell builtins so they
# behave the same on Windows, macOS and Linux.

.DEFAULT_GOAL := help

# Version stamped into manifest.json and util/version.js.
# Empty by default: the unpacked build then falls back to the package.json
# version, and packaging.sh falls back to its date-based version.
# Override per invocation: make dev VERSION=9.9.9
VERSION ?=

UNPACKED_DIR := dist/unpacked
CHROME_DIR   := $(UNPACKED_DIR)/chrome
FIREFOX_DIR  := $(UNPACKED_DIR)/firefox
BRAVE_PROFILE ?= dist/.brave-dev-profile

# consumed by scripts/help.mjs
export OGI_VERSION := $(VERSION)
export OGI_CHROME_DIR := $(CHROME_DIR)
export OGI_FIREFOX_DIR := $(FIREFOX_DIR)

.PHONY: help install install-brave install-brave-id format check test test-watch coverage bench build dev dev-firefox brave brave-main brave-open clean clean-profile

help:
	@node scripts/help.mjs

install:
	npm install

format:
	npm run format

check:
	npm run check

test:
	npm test

test-watch:
	npm run test:watch

coverage:
	npm run coverage

bench:
	npm run bench

# Unpacked builds - loadable via "Load unpacked" / "Load Temporary Add-on".
dev:
	node scripts/build-unpacked.mjs --target=chrome --version=$(VERSION) --out=$(CHROME_DIR)

install-brave:
	node scripts/install-local.mjs

install-brave-id:
	node scripts/dev-key.mjs

dev-firefox:
	node scripts/build-unpacked.mjs --target=firefox --version=$(VERSION) --out=$(FIREFOX_DIR)

brave: dev
	node scripts/launch-brave.mjs --dir=$(CHROME_DIR) --profile=$(BRAVE_PROFILE)

brave-main: dev
	node scripts/launch-brave.mjs --dir=$(CHROME_DIR) --profile=default

brave-open: dev
	node scripts/launch-brave.mjs --dir=$(CHROME_DIR) --profile=$(BRAVE_PROFILE) --extensions-page

# Release zips for the stores (chrome, edge, firefox).
build:
	bash packaging.sh $(VERSION)

clean:
	node -e "require('fs').rmSync('dist',{recursive:true,force:true});console.log('removed dist/')"

clean-profile:
	node -e "require('fs').rmSync('$(BRAVE_PROFILE)',{recursive:true,force:true});console.log('removed $(BRAVE_PROFILE)')"
