# Ogame Beyond Infinity

This is a fork of the original Ogame Infinity Extension, but extended and reworked to my own needs.
All credits go to [Ogame Infinity](https://github.com/ogame-infinity/web-extension)

This repository contains the monolithic code mess for the Ogame Infinity extension.

Note: since version 2.3.7 the `src/` folder can no longer be loaded directly as an unpacked extension — it needs a build step first. See [Local development](#local-development).

## Downloads

- Firefox: https://addons.mozilla.org/en-US/firefox/addon/ogame-infinity/
- Chrome: https://chrome.google.com/webstore/detail/ogame-infinity/hfojakphgokgpbnejoobfamojbgolcbo
- Edge: https://microsoftedge.microsoft.com/addons/detail/ogame-infinity/eejkmenlfccjjekgmcjkladejfhklgkm

### Third party dependencies

This extension uses 3 external js libraries:

- https://github.com/chartjs/Chart.js/releases/download/v2.9.3/Chart.bundle.min.js
- https://github.com/emn178/chartjs-plugin-labels/blob/v1.1.0/build/chartjs-plugin-labels.min.js
- https://github.com/cure53/DOMPurify/releases/tag/2.4.1
- https://github.com/pieroxy/lz-string/releases/tag/1.5.0

## Contributing

Did you encounter a bug or have a suggestion for a new feature? Please join our Discord:

Did you fix it already? Please fork the latest `master` branch and raise a Pull Request

| Type        | Branch naming convention          |
| ----------- | --------------------------------- |
| Bugfix      | `fix/name_of_fix`                 |
| Improvement | `improvement/name_of_improvement` |
| Feature     | `feature/name_of_feature`         |

## Local development

A `Makefile` wraps the common tasks. It needs `node`/`npm` on your PATH and works from PowerShell, cmd and a POSIX shell.

    make help          # list all targets
    make install       # install dev dependencies
    make dev           # build an unpacked extension into dist/unpacked/chrome
    make dev-firefox   # build an unpacked extension into dist/unpacked/firefox
    make test          # run the unit test suite
    make coverage      # run the suite and print a coverage report
    make format        # prettier
    make check         # eslint
    make build         # release zips via packaging.sh
    make clean         # remove dist/

### Tests

`make test` (or `npm test`) runs the unit test suite in `test/`, built on Node's own test runner plus `jsdom` for the modules that need a DOM. The suite also runs in CI on every push and pull request.

Please add tests for the code you change, and run `make test` before opening a pull request. [docs/testing.md](docs/testing.md) explains the harness, what is covered today, and the conventions — including the tests deliberately marked `KNOWN BUG:`, which pin down behaviour that is currently wrong so that fixing it registers as an intentional change.

### Testing your local build in Brave (or Chrome / Edge)

    make brave

This builds `dist/unpacked/chrome` and starts Brave with the extension loaded into a throwaway profile under `dist/.brave-dev-profile`, so it never interferes with your everyday browser profile. Use `make brave-main` to use your normal Brave profile instead (close Brave first, otherwise the running instance ignores the command line flags).

**The Web Store version is switched off automatically.** Both builds match the same OGame hosts, both inject `ogkush.js` and both write the same `localStorage["ogk-data"]` key, so running them side by side gives you duplicated UI and corrupted data. The launcher therefore passes `--disable-extensions-except`, which disables every other extension _for that browser session only_ — nothing is uninstalled, and a normal Brave start has all your extensions back. Pass `--keep-extensions` to `scripts/launch-brave.mjs` if you explicitly want them enabled.

If you load the build by hand instead (see below) into a profile that already has OGI from the store, disable the store version yourself on `brave://extensions` first.

If Brave is not found automatically, point at it explicitly:

    make brave BRAVE_PATH="C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"

You can always load the build by hand: `brave://extensions` → enable _Developer mode_ → _Load unpacked_ → pick `dist/unpacked/chrome`. After changing something in `src/`, run `make dev` again and hit the reload button on the extension card.

For Firefox: run `make dev-firefox`, then `about:debugging#/runtime/this-firefox` → _Load Temporary Add-on_ → pick `dist/unpacked/firefox/manifest.json`.

The unpacked build stamps the version (defaults to the one in `package.json`, override with `make dev VERSION=9.9.9`) and drops two manifest keys that only apply to store releases: `update_url`, and the `extension_ids` whitelist in `web_accessible_resources` — a locally loaded build gets a different extension id, so that whitelist would lock out the build itself.

## Code formatting

Please install the tools once by running: `npm install`

Then, make sure to format the code according to our rules before doing any new _commit_/_pull request_ by using the following command:

`npm run format`

## Automatic packaging and deployment

GitHub's actions are used to automatically package and deploy new updates.

### Manual packaging

#### Install dev dependencies

    npm install -g terser
    npm install -g clean-css
    npm install -g clean-css-cli

#### Run the packer

    ./packaging.sh {version_number}

Example:

    ./packaging.sh 1.5.3

Version number is optional and can be omitted, for example doing test builds, by default the version number will be built based on time and date.
