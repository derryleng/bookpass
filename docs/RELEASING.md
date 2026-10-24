# Releasing

## How a release is made

1. Work is on `dev` and feature branches cut from `dev`. When a milestone is ready, open a pull request from `dev` to `main`.
2. Decide the version (semantic versioning, `0.x` before 1.0). Set `version` in `package.json` and move the entries under Unreleased in `CHANGELOG.md` to a new heading for that version. The Chrome manifest takes its version from `package.json`. Pre-releases cannot use a suffix in the manifest, so a label such as `-beta.1` would go in `version_name`.
3. After the pull request is merged, tag `main` (`git tag v0.5.0 && git push origin v0.5.0`). The `Release` workflow checks that the tag matches `package.json`, builds the store zips and the helper for Windows, macOS and Linux, and creates a **draft** GitHub Release with the changelog entry as its notes.
4. Look over the draft, then publish it.
5. Upload the zips to the stores (below).

The extension and the helper are versioned apart. The `protocol` number in the helper's `hello` reply decides whether they work together. Raise it for a change that breaks older helpers or older extensions, and say so in the changelog.

Pushing, merging to `main`, tagging and publishing all wait for the maintainer.

## Building the store zips

```bash
npm run zip:store
```

This writes `.output/bookpass-<version>-chrome.zip`, `-firefox.zip` and `-sources.zip`. Store builds leave out the fixed development key that the normal Chrome build carries, because the stores assign their own extension id.

## Helper installers

The helper installs itself: running `bookpass-helper` (a double click on Windows) copies it to a per-user folder and registers it with the browsers it finds, with no administrator rights. `bookpass-helper uninstall` removes it and leaves the vault alone.

| System  | Files in the release                                          | Notes                                                                                                                  |
| ------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Windows | `bookpass-helper-windows-amd64.exe`, `-arm64.exe`             | Unsigned until 1.0, so SmartScreen shows a warning the first time: More info, then Run anyway                          |
| macOS   | `bookpass-helper-macos-intel.tar.gz`, `-apple-silicon.tar.gz` | Unsigned until 1.0. Run `xattr -d com.apple.quarantine bookpass-helper` once after unpacking, then `./bookpass-helper` |
| Linux   | `bookpass-helper-linux-amd64.tar.gz`, `-arm64.tar.gz`         | `.deb` and `.rpm` packages come later                                                                                  |

## What the maintainer has to provide

Nothing here blocks the code. The workflows skip the signing and store steps until these exist.

### For 1.0

- **Windows code signing certificate.** An OV or EV certificate from a certificate authority, or Azure Trusted Signing. Add the secrets `WINDOWS_CERT_PFX_BASE64` (the .pfx file in base64) and `WINDOWS_CERT_PASSWORD`. The `sign-windows` job then signs the helper. It has not been run, so expect to adjust it. EV certificates usually live on a hardware token, which cannot be used on a hosted runner, so Azure Trusted Signing or a self hosted runner may suit better.
- **Apple Developer Program membership** (99 USD a year). Needed to sign with a Developer ID and notarize. The workflow has no macOS signing job yet. It will need `codesign` and `xcrun notarytool` with an app specific password or an API key, run on a macOS runner, then a `.pkg` or a notarized zip.
- **Linux packages**: nothing is needed from outside, only the work.

### Stores

- **Chrome Web Store**: a developer account with the one time 5 USD fee, then upload the Chrome zip. The store assigns the extension id. Add that id to `chromeIds` in `helper/ids.json`, rebuild the helper and publish it, or the store version cannot reach it.
- **Firefox add-ons (AMO)**: a free account. Upload the Firefox zip and the sources zip. Reviewers build it with `npm ci && npm run build:firefox` (Node 24 or newer). The add-on id `bookpass@derryleng.github.io` is fixed.
- A **privacy policy** at a public address (`docs/PRIVACY.md` is the text), screenshots and the descriptions in `docs/STORE.md`.
- The public GitHub repository address, which is also what `helperDownloadUrl` in `src/constants.ts` points at (`github.com/derryleng/bookpass`). It links to the releases page, because `/releases/latest` skips pre-releases and every `0.x` release is one. Change it to `/releases/latest` at 1.0.

### Decisions only the maintainer can make

- The public name of the repository and the contact address for the privacy policy and security reports.
- Whether to keep the "never lock" setting in store builds. Reviewers may ask about it.
