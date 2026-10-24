// Installs or removes the built helper for the current user, the way an end user's installer would:
// the helper copies itself to a per-user folder and registers with the browsers it finds.
//
//   node scripts/register-helper.ts            install
//   node scripts/register-helper.ts --remove   uninstall
//
// Build the helper first: npm run helper:build
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { resolve } from "node:path";

const exe = resolve(
  import.meta.dirname,
  "../helper/bin",
  platform() === "win32" ? "bookpass-helper.exe" : "bookpass-helper",
);
if (!existsSync(exe))
  throw new Error(`Build the helper first: ${exe} is missing`);

const command = process.argv.includes("--remove") ? "uninstall" : "install";
// With arguments the helper never waits for a key press, so this also works in scripts.
process.stdout.write(execFileSync(exe, [command], { encoding: "utf8" }));
