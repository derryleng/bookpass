import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '.output/',
      '.wxt/',
      'node_modules/',
      'helper/',
      'tests/output/',
      'spikes/native/extension/vault.js',
      'spikes/native/extension/hash-wasm.js',
    ],
  },
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
);
