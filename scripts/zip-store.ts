// Builds the zips to upload to the stores: Chrome and Firefox with its sources.
//
//   npm run zip:store
//
// The stores assign their own extension id, so these builds leave out the fixed development key (see wxt.config.ts).
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const wxt = resolve(import.meta.dirname, "../node_modules/wxt/bin/wxt.mjs");
const env = { ...process.env, BOOKPASS_STORE_BUILD: "1" };
for (const args of [["zip"], ["zip", "-b", "firefox"]]) {
  execFileSync(process.execPath, [wxt, ...args], { stdio: "inherit", env });
}
