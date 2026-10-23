// Bundles vault.ts for the spike extension. kdbxweb's UMD build asks for Node's
// "crypto" module at load time, which browsers do not have. It only uses it on
// Node, so an empty stub is enough here.
import { fileURLToPath } from 'node:url';

export default {
  input: fileURLToPath(new URL('./vault.ts', import.meta.url)),
  platform: 'browser',
  resolve: { alias: { crypto: fileURLToPath(new URL('./empty.js', import.meta.url)) } },
  output: { file: fileURLToPath(new URL('./extension/vault.js', import.meta.url)), format: 'esm' },
};
