import { defineConfig } from 'wxt';

// One codebase, two builds. WXT turns the background entrypoint into a
// service worker for Chrome and an event page for Firefox.
export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'BookPass',
    description: 'Encrypted bookmarks in a KeePass file on your own disk.',
    permissions: [
      'storage',
      'alarms',
      'idle',
      'activeTab',
      'contextMenus',
      'scripting',
      'nativeMessaging',
    ],
    // The Firefox add-on id is permanent once published. Placeholder until Derry picks one.
    browser_specific_settings: {
      gecko: { id: 'bookpass@local', data_collection_permissions: { required: ['none'] } },
    },
    // Argon2id runs as WebAssembly, which needs wasm-unsafe-eval.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  },
});
