import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";
import { chromeDevKey, firefoxId } from "./scripts/ids";

// One codebase, two builds. WXT turns the background entrypoint into a
// service worker for Chrome and an event page for Firefox.
export default defineConfig({
  srcDir: "src",
  // The end to end build goes to its own folder so it never replaces the real one.
  outDir: process.env.WXT_E2E ? "tests/output/build" : ".output",
  // The license and the notices for the libraries and icons ship inside every build, as the GPL asks.
  hooks: {
    "build:publicAssets": (_wxt, files) => {
      for (const name of ["LICENSE", "THIRD_PARTY_LICENSES.md"])
        files.push({
          absoluteSrc: resolve(import.meta.dirname, name),
          relativeDest: name,
        });
    },
  },
  // Whatever a test run left in tests/output is not source.
  zip: { excludeSources: ["tests/output/**"] },
  vite: () => ({
    plugins: [tailwindcss()],
    define: { __E2E__: JSON.stringify(!!process.env.WXT_E2E) },
  }),
  manifestVersion: 3,
  modules: ["@wxt-dev/module-react"],
  manifest: ({ browser }) => ({
    name: "BookPass",
    description: "Encrypted bookmarks in a KeePass file on your own disk.",
    // No access to all sites. activeTab covers reading the page you save, and nativeMessaging reaches the helper.
    permissions: [
      "storage",
      "alarms",
      "idle",
      "activeTab",
      "scripting",
      "contextMenus",
      "nativeMessaging",
    ],
    // Asked for only when you use the feature: saving several tabs, and importing your browser's bookmarks.
    optional_permissions: [
      "tabs",
      "bookmarks",
      ...(browser === "firefox" ? ["*://*/*"] : []),
    ],
    // Reaching the sites a bookmark points to, to fetch their pictures. Asked for when you press the button.
    ...(browser === "firefox"
      ? {}
      : { optional_host_permissions: ["*://*/*"] }),
    ...(process.env.WXT_E2E ? { host_permissions: ["<all_urls>"] } : {}),
    commands: {
      _execute_action: {
        suggested_key: { default: "Alt+Shift+B" },
        description: "Save the current page to BookPass",
      },
    },
    // Pins the Chrome extension id for development builds so the helper can name it. Store builds get the id the
    // store assigns. Firefox uses the id below.
    ...(browser === "firefox" || process.env.BOOKPASS_STORE_BUILD
      ? {}
      : { key: chromeDevKey }),
    // The Firefox add-on id is permanent once published.
    browser_specific_settings: {
      gecko: {
        id: firefoxId,
        data_collection_permissions: { required: ["none"] },
      },
    },
    // Argon2id runs as WebAssembly, which needs wasm-unsafe-eval.
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  }),
});
