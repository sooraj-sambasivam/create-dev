#!/usr/bin/env node
// Pre-deploy check. Prints env NAMES only, never values.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const required = ["ANTHROPIC_API_KEY", "TYPESAFE_API_KEY", "MONGODB_URI", "ELEVENLABS_API_KEY", "PERCEPTRON_API_KEY", "PUBLIC_URL", "ALLOWED_ORIGINS"];
let failed = false;

for (const name of required) {
  const ok = Boolean(process.env[name]?.trim());
  console.log(`${ok ? "set    " : "MISSING"} ${name}`);
  if (!ok) failed = true;
}

console.log("\nBuilding apps/web ...");
const r = spawnSync("pnpm", ["-C", "apps/web", "build"], { cwd: root, stdio: "inherit" });
if (r.status !== 0) {
  console.log("FAIL web build");
  failed = true;
} else console.log("ok     web build");

console.log(failed ? "\nCheck FAILED" : "\nCheck passed");
process.exit(failed ? 1 : 0);
