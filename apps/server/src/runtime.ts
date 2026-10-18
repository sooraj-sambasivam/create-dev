import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** True on Vercel, where the filesystem is read-only except for an ephemeral /tmp. */
export const isServerless = Boolean(process.env.VERCEL);

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Where a named folder lives. Local: apps/server/.<name> (for example "cache/uploads" ->
 * apps/server/.cache/uploads). Vercel: <tmp>/create/<name>. Never creates the folder.
 */
export function dataDir(name: string): string {
  if (isServerless) return join(tmpdir(), "create", name);
  const [first = "", ...rest] = name.split("/");
  return join(SERVER_ROOT, `.${first}`, ...rest);
}
