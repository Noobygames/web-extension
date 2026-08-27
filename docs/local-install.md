# Permanent local install (Brave / Chrome / Edge)

`make dev` + `make brave` is a _throwaway_ setup: it launches a separate browser profile with
`--load-extension`, and everything is gone when that window closes. That is right for a quick
test, wrong for actually playing with your own build.

This is the permanent path: the build lands in a stable directory, you load it **once**, and it
survives browser restarts.

```bash
make install-brave
```

Then, once:

1. open `brave://extensions`
2. turn on **Developer mode** (top right)
3. **Load unpacked** → select `local-extension/` in this repo

That last step is manual on purpose — Chromium deliberately offers no command line to install an
unpacked extension into your real profile, so no script can do it for you.

After changing anything in `src/`:

```bash
make install-brave        # refreshes local-extension/ in place
```

then press the **reload icon** on the extension's card in `brave://extensions`. The path never
changes, so you never have to re-add it.

---

## Why it is stable

**It does not build into `dist/`.** `dist/` is wiped by `make clean` and by every other build
target. If the directory an unpacked extension points at disappears, the browser drops the
extension and you have to add it again. `local-extension/` is only ever touched by this command.

**The extension id is pinned.** Without a `key` in the manifest, Chromium derives an unpacked
extension's id from the _absolute path_ it was loaded from. That matters because
`chrome.storage.local` — where the content script keeps the per-universe `DataHelper` data, and
where PR #533's `ogi-galaxy-<UNIVERSE>` snapshot lives — is keyed by extension id. Move the repo,
or build somewhere else, and the browser would treat it as a brand new extension with an empty
store.

`make install-brave` therefore generates a local keypair on first run and stamps its public half
into the manifest, so the id is derived from the key instead:

```
$ make install-brave-id
hdniggggckafedecehnkdekdbfnkapee
```

The private key sits in `.local-extension-key.pem`, is gitignored, and never leaves the machine.
It is **not** a Web Store key and has nothing to do with publishing — it only keeps the local
install stable. Deleting it changes the id and orphans the stored data, so keep it.

`local-extension/`, the key, and the install marker are all gitignored.

---

## What the build does to the source

Same as `make dev` (both call `scripts/build-unpacked.mjs`):

- stamps the real version into `manifest.json` and `util/version.js` (the source carries `0.0.0`
  and `__VERSION__` placeholders, which is why `src/` cannot be loaded directly)
- drops `manifest-firefox.json`
- removes `update_url` — Chromium ignores or rejects it for unpacked builds
- strips the `extension_ids` whitelist from `web_accessible_resources`. That list pins those
  resources to the _published_ extension id; a local build has a different id, so leaving it in
  would lock this very build out. `matches` still restricts access to the OGame origins.

Plus, for this target only: `manifest.key`, as described above.

---

## Firefox

Firefox will not install an unsigned extension permanently — `about:debugging` → "Load Temporary
Add-on" is dropped on restart. For a permanent Firefox install the build has to be signed through
AMO. The script says as much if you ask it for a Firefox build:

```bash
node scripts/install-local.mjs --target=firefox
```

---

## Troubleshooting

**The extension vanished after a restart.** Check `local-extension/` still exists. If you ran
`git clean -xdf` it is gone (it is gitignored); re-run `make install-brave` and re-add it once.

**My galaxy/player data reset.** The id changed, which means `.local-extension-key.pem` was
deleted or regenerated. `make install-brave-id` prints the current id; compare it with the one on
the extension's card in `brave://extensions`.

**Brave shows "Developer mode extensions" warnings on startup.** Expected for any unpacked
extension; there is no way around it short of publishing to the store.

**Changes are not showing up.** `make install-brave` only rewrites the files — the browser still
needs the reload icon pressed, and the OGame tab reloaded.
