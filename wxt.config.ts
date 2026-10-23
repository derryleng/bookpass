import { defineConfig } from 'wxt';
import { chromeDevKey, firefoxId } from './scripts/ids';

// One codebase, two builds. WXT turns the background entrypoint into a
// service worker for Chrome and an event page for Firefox.
export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'BookPass',
    description: 'Encrypted bookmarks in a KeePass file on your own disk.',
    // No access to all sites. activeTab covers reading the page you save, and nativeMessaging reaches the helper.
    permissions: ['storage', 'alarms', 'idle', 'activeTab', 'scripting', 'nativeMessaging'],
    // Pins the Chrome extension id so the helper can name it. Firefox uses the id below.
    ...(browser === 'firefox' ? {} : { key: chromeDevKey }),
    // The Firefox add-on id is permanent once published.
    browser_specific_settings: {
      gecko: { id: firefoxId, data_collection_permissions: { required: ['none'] } },
    },
    // Argon2id runs as WebAssembly, which needs wasm-unsafe-eval.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  }),
});
