# Ogame Beyond Infinity

This is a fork of the original Ogame Infinity Extension, but extended and reworked to my own needs.
All credits go to [Ogame Infinity](https://github.com/ogame-infinity/web-extension)

This repository contains the monolithic code mess for the Ogame Beyond Infinity extension.

### What's different from upstream Ogame Infinity

| Area           | What changed                                                                                                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture   | Monolithic `ogCore.js` split into modules (`ctxpage/`, `game/`, `store/`, `ui/`, `format/`, `platform/`); one file per module, bundled at build time                                                                                                                                                               |
| Performance    | Removed a permanent 100ms DOM poll, killed redundant re-parsing on every cargo calc, faster startup draw order                                                                                                                                                                                                     |
| New features   | [Upgrade plans](#upgrade-plans) (plan builds, see what each planet is short of, set up the transport), raid list (best profit/hour targets), spy-report cache with resource-now estimate + stale warning, harvest planner, expedition slot balancing, alliance target claims in galaxy view, active-planet counter |
| Notifications  | Rewritten fleet-arrival/browser notification system: scheduling, dedup, sync across tabs                                                                                                                                                                                                                           |
| Galaxy data    | Dedicated galaxy storage with per-(galaxy,system) diff snapshots, instead of piggybacking the general data blob                                                                                                                                                                                                    |
| Fleet dispatch | Fixed cargo-capacity math (hyperspace + miner-class bonuses now applied, and the count is corrected against the game's own cargo total), donut-system distance fix, empty/inactive system display                                                                                                                  |
| Dev tooling    | Makefile, `node:test` + jsdom test suite, ESLint/Prettier gate, benchmarks, permanent local install, docs under `docs/`                                                                                                                                                                                            |
| OGame version  | v13+ only, v12 support dropped                                                                                                                                                                                                                                                                                     |

Fast-moving fork — expect this list to lag behind `master`.

Note: since version 2.3.7 the `src/` folder can no longer be loaded directly as an unpacked extension — it needs a build step first. See [Local development](#local-development).

## Upgrade plans

Keep a list of the upgrades you actually intend to build, see what every planet is still
short of, and set up the transport that fixes it — without adding up costs by hand.

**Planning an upgrade.** Two ways, both leading to the same list:

- On any build page, open a technology and click the padlock in the detail panel. It
  takes the level range shown next to it, so stepping the target up to +4 first plans all
  four levels. The badge turns into a tick once the technology is in the plan.
- In the plans panel itself: pick planet, category, technology and target level. Useful
  for planets you are not standing on.

Buildings, research, lifeform buildings and lifeform research are all supported. Ships and
defences have no level, so they land on a free-hand pile instead of becoming an entry.

**Orders you already placed count automatically.** The build list is read from the empire
data and the production box, so what you queued on your phone shows up on your desktop.
OGame charges a build order when it _starts_, so the one currently building is listed at a
cost of zero — it is paid for — while the entries queued behind it are a real shortfall and
are counted. A planned range that overlaps a queued one starts where the queue ends, so no
level is ever counted twice. Finished upgrades drop out of the plan on their own.

**Seeing what is missing.** The panel opens with one row per planet and moon showing what
still has to be sent — cost, minus what is on the planet, minus what is already in flight;
hover any figure for that arithmetic and the exact number. Below it, each planet lists its
entries with a per-category subtotal, and the category chips hide what you are not
interested in right now (lifeform buildings, say). The filter shapes those lists only; the
amounts at the top stay the full requirement.

**Sending it.** Each row has one button. It opens OGame's own fleet dispatch page with the
target, the transport mission and the amounts filled in, starting from your RSS moon —
which defaults to the collect target you already configured. The ship count is checked
against the game's own cargo capacity, so it accounts for bonuses the extension does not
know about.

The button stops there. It never sends a fleet, and there is deliberately no "send to all":
one row, one click, one fleet, with OGame's own send button doing the sending. The planet
bar keeps showing the same shortfall as a lock icon, as it always has.

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

    make help             # list all targets
    make install          # install dev dependencies
    make install-brave    # build a permanent local install into local-extension/
    make install-brave-id # print the pinned extension id
    make dev              # build an unpacked extension into dist/unpacked/chrome
    make dev-firefox      # build an unpacked extension into dist/unpacked/firefox
    make brave            # build + launch Brave with the extension (throwaway profile)
    make test             # run the unit test suite
    make coverage         # run the suite and print a coverage report
    make bench            # micro-benchmark the hot paths
    make format           # prettier
    make check            # eslint
    make build            # release zips via packaging.sh
    make clean            # remove dist/

### Tests

`make test` (or `npm test`) runs the unit test suite in `test/`, built on Node's own test runner plus `jsdom` for the modules that need a DOM. The suite also runs in CI on every push and pull request.

Please add tests for the code you change, and run `make test` before opening a pull request. [docs/testing.md](docs/testing.md) explains the harness, what is covered today, and the conventions — including the tests deliberately marked `KNOWN BUG:`, which pin down behaviour that is currently wrong so that fixing it registers as an intentional change.

### Installing your local build permanently (Brave / Chrome / Edge)

    make install-brave

Builds into `local-extension/`, then load it **once**: `brave://extensions` → enable _Developer mode_ → _Load unpacked_ → pick that folder. It survives browser restarts from then on. After changing something in `src/`, run `make install-brave` again and press the reload icon on the extension card — the path never changes, so you never have to re-add it.

That last click is manual because Chromium deliberately offers no command line for installing an unpacked extension into a real profile.

Two things make this stick where `make dev` does not:

- It builds into `local-extension/`, **not** `dist/`. `dist/` is wiped by `make clean` and by every other build target, and a browser drops an unpacked extension whose directory disappears.
- The extension id is pinned by a local keypair, so it no longer depends on the absolute path. That matters because `chrome.storage.local` — the per-universe `DataHelper` data and the galaxy snapshot — is keyed by extension id, so moving the repo would otherwise orphan all of it. `make install-brave-id` prints the id; the private key lives in `.local-extension-key.pem`, is gitignored, never leaves your machine, and is unrelated to the Web Store key. Keep it: deleting it changes the id.

If the profile you load it into already has OGBI from the store, disable the store version on `brave://extensions` first — see the note below on why.

Firefox cannot do this: unsigned add-ons are always temporary there and are dropped on restart. A permanent Firefox install has to be signed through AMO.

[docs/local-install.md](docs/local-install.md) has the details and troubleshooting.

### Benchmarks

`make bench` runs `scripts/bench.mjs`, a micro-benchmark harness over the hot paths (the flight and profit maths, the claim index, the harvest planner, and the repeated DOM work). It is not a substitute for profiling in the real game — treat the numbers as lower bounds — but it gives any change a reproducible baseline. [docs/performance.md](docs/performance.md) records what has been measured and fixed so far.

### Testing your local build in Brave (or Chrome / Edge)

For a quick throwaway test instead of a permanent install:

    make brave

This builds `dist/unpacked/chrome` and starts Brave with the extension loaded into a throwaway profile under `dist/.brave-dev-profile`, so it never interferes with your everyday browser profile. Use `make brave-main` to use your normal Brave profile instead (close Brave first, otherwise the running instance ignores the command line flags).

**The Web Store version is switched off automatically.** Both builds match the same OGame hosts, both inject `ogCore.js` and both write the same `localStorage["ogk-data"]` key, so running them side by side gives you duplicated UI and corrupted data. The launcher therefore passes `--disable-extensions-except`, which disables every other extension _for that browser session only_ — nothing is uninstalled, and a normal Brave start has all your extensions back. Pass `--keep-extensions` to `scripts/launch-brave.mjs` if you explicitly want them enabled.

If you load the build by hand instead (see below) into a profile that already has OGBI from the store, disable the store version yourself on `brave://extensions` first.

If Brave is not found automatically, point at it explicitly:

    make brave BRAVE_PATH="C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"

You can always load the build by hand: `brave://extensions` → enable _Developer mode_ → _Load unpacked_ → pick `dist/unpacked/chrome`. After changing something in `src/`, run `make dev` again and hit the reload button on the extension card.

For Firefox: run `make dev-firefox`, then `about:debugging#/runtime/this-firefox` → _Load Temporary Add-on_ → pick `dist/unpacked/firefox/manifest.json`.

The unpacked build stamps the version (defaults to the one in `package.json`, override with `make dev VERSION=9.9.9`) and drops two manifest keys that only apply to store releases: `update_url`, and the `extension_ids` whitelist in `web_accessible_resources` — a locally loaded build gets a different extension id, so that whitelist would lock out the build itself.

The build also bundles the ES modules: `src/` stays one file per module, but the
browser is handed one file per execution context — `ogCore.js` (69 modules,
1.15 MB, seven levels of imports deep) and `ctxcontent/index.js`. That module
graph was a request waterfall in front of every single page load, and OGame
reloads on every view change. It is a plain concatenation with the imports
resolved: **no minification, no obfuscation**, all comments intact. Run
`OGBI_NO_BUNDLE=1 make dev` to load the raw per-file graph instead, which is
easier to step through in a debugger.

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
