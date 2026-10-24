# Spike: native messaging to a Go helper

The spike helper in `spikes/native/helper/` speaks the browser native messaging protocol: a 4 byte length in native byte order, then JSON, on stdin and stdout. This spike shows that Chrome and Firefox on Windows can talk to it, run Argon2id and move a 50 MiB vault through it in both directions.

## Run it

Needs Go, Node 22.18 or newer, Chrome and Firefox installed in their default Windows folders.

```bash
cd spikes/native/helper && go build -o bin/bookpass-helper.exe . && cd ../../..
node spikes/native/stdio-test.ts          # helper alone, no browser
node spikes/native/run.ts chrome          # or firefox
```

`run.ts` registers the helper for the current user (`HKCU`, no administrator rights), starts the browser with a throwaway profile and the extension in `extension/`, waits for `tests/output/spikes/native/<browser>/report.json`, prints it and removes the registration. If a run produces no report, `node spikes/native/debug.ts` shows what the Chrome service worker is doing.

## Findings

| Question                        | Answer                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does it work?                   | Yes in Chrome 156 and Firefox 158 on Windows 11. One extension manifest covers both: it lists both `background.service_worker` and `background.scripts`, and each browser uses the one it supports.                                                                                                                                                                        |
| Chunk size                      | Browser to helper accepts very large messages: one 32 MiB chunk (a 43 MB message) worked in both browsers. Helper to browser is capped at 1 MiB including the JSON. 760,000 raw bytes (about 1.01 MB after base64) passed and 1,100,000 failed. Use 512 KiB chunks, which leaves room for the JSON around its roughly 683 KB of base64.                                    |
| What happens over the cap       | Chrome drops the connection with "Error when communicating with the native messaging host". Firefox says "tried to send a message of N bytes, which exceeds the limit of 1048576 bytes". The helper must therefore never send more than 1 MiB. It now answers an oversize reply with a small error message instead. A later `connectNative` starts a fresh helper process. |
| 50 MiB speed                    | Chrome moves 50 MiB up in about 0.4 s and down in about 0.5 s. Firefox takes about 0.4 s up and 0.3 to 0.4 s down. Chunk sizes from 64 KiB to 700 KiB make little difference apart from Firefox being slower at 64 KiB (0.7 s each way). The helper alone does 50 MiB each way in about 0.25 s.                                                                            |
| Integrity                       | Each write carries the SHA-256 of the whole file and the helper refuses to swap in a file that does not match. A bad hash was rejected and a path outside the root was refused.                                                                                                                                                                                            |
| Argon2id in the background      | `hash-wasm` runs in the Chrome service worker and the Firefox event page with the CSP `script-src 'self' 'wasm-unsafe-eval'`. 64 MiB with 3 iterations takes about 145 ms and 256 MiB with 3 iterations about 600 to 700 ms, the same as in Node. I did not test without `wasm-unsafe-eval`.                                                                               |
| kdbxweb in the background       | 10,000 entries without thumbnails: save 0.9 to 1.2 s, open 1.1 to 1.2 s. 10,000 entries with 5 KB thumbnails (a 48 MiB file): save 2.4 s (Firefox 4.8 s), upload 0.4 s (Firefox 1.7 s), download 0.5 s, open 1.4 to 1.5 s. Both browsers kept the vault in memory without trouble. The saves include one 256 MiB Argon2id run.                                             |
| Bundling kdbxweb                | Its UMD build asks for Node's `crypto` at load time, which crashed the Chrome service worker with no visible error. The spike aliases `crypto` to an empty module (`rolldown.config.js`). Dynamic `import()` is also not allowed in a service worker, so the real build must not code split the background script.                                                         |
| Loading the extension for tests | Chrome 156 ignores `--load-extension` on the command line. `puppeteer-core` with `enableExtensions` works and needs no browser download. Firefox works through `web-ext run`.                                                                                                                                                                                              |
| Chrome extension id             | The manifest `key` pins the id, so the native host manifest can list `allowed_origins` before the extension is published. The spike key is throwaway. Firefox needs a fixed `browser_specific_settings.gecko.id` for `allowed_extensions`.                                                                                                                                 |

## Not covered

- macOS and Linux: the helper builds for `linux/amd64`, `linux/arm64`, `darwin/amd64`, `darwin/arm64` and `windows/arm64`, but I could only run it on Windows. Host manifest locations, Snap and Flatpak browsers are untested.
- Killing the helper mid-write. The write goes to a temporary file, is synced and then renamed over the target, but no kill test has been run yet.
- Thumbnail and favicon capture with only `activeTab`, and the rest of the M0 list.
