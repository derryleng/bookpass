# Releasing

1. Work happens directly on `main`. Run `npm run check` and the scripts in [TESTING.md](TESTING.md).
2. Set `version` in `package.json` (semantic versioning, `0.x` before 1.0). The Chrome manifest takes its version from it. A label such as `-beta.1` goes in `version_name`.
3. Push `main`, then tag it: `git tag v0.5.0 && git push origin v0.5.0`. The `Release` workflow checks that the tag matches `package.json`, builds the store zips and the helper for Windows, macOS and Linux, and creates a draft GitHub release with generated notes.
4. Review the draft, publish it, and upload the zips to the stores.

The extension and the helper are versioned apart. The `protocol` number in the helper's `hello` reply decides whether they work together. Raise it for a change that breaks older helpers or extensions.

Tagging and publishing wait for the maintainer.

## Store zips

`npm run zip:store` writes `.output/bookpass-<version>-chrome.zip`, `-firefox.zip` and `-sources.zip`. Store builds leave out the fixed development key, because the stores assign their own extension id.

## Helper

Running `bookpass-helper` copies it to a per-user folder and registers it with the browsers it finds. `bookpass-helper uninstall` removes it and leaves the vault alone. Release files are `bookpass-helper-windows-{amd64,arm64}.exe`, `bookpass-helper-macos-{intel,apple-silicon}.tar.gz` and `bookpass-helper-linux-{amd64,arm64}.tar.gz`. They are unsigned until 1.0: SmartScreen shows a warning on Windows, and macOS needs `xattr -d com.apple.quarantine bookpass-helper` once.

## Still needed from the maintainer

The workflow skips signing and store steps until these exist.

- Windows signing: add the secrets `WINDOWS_CERT_PFX_BASE64` and `WINDOWS_CERT_PASSWORD`. The `sign-windows` job has not been run. EV certificates on a hardware token cannot be used on a hosted runner, so Azure Trusted Signing or a self hosted runner may suit better.
- macOS signing and notarizing needs an Apple Developer Program membership. The workflow has no job for it yet.
- Chrome Web Store: a developer account. The store assigns the extension id. Add it to `chromeIds` in `helper/ids.json` (never the development id from `helper/ids.dev.json`), rebuild and publish the helper, or the store version cannot reach it. Until then a release helper registers with Firefox only, and says so for Chrome.
- Firefox add-ons: a free account. Upload the Firefox and sources zips. The add-on id `bookpass@derryleng.github.io` is fixed.
- A privacy policy at a public address (the README Privacy section is the text), screenshots and the text in [STORE.md](STORE.md).
- `helperDownloadUrl` in `src/constants.ts` links to the releases page, because `/releases/latest` skips pre-releases and every `0.x` release is one. Change it to `/releases/latest` at 1.0.
