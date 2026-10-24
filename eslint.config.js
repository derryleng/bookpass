import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [".output/", ".wxt/", "node_modules/", "helper/", "tests/output/"],
  },
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
);
