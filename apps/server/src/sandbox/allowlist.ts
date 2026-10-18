/** Packages AI-generated backend code may install. Keep this list intentional. */
export const ALLOWED_NPM_PACKAGES = new Set([
  "cheerio",
  "node-html-parser",
  "axios",
  "zod",
  "uuid",
  "date-fns",
  "lodash",
  "lodash-es",
  "rss-parser",
  "marked",
  "sanitize-html",
  "he",
  "qs",
  "nanoid",
]);

/** Node builtins that sandboxed handlers may import. */
export const ALLOWED_BUILTINS = new Set([
  "assert",
  "buffer",
  "crypto",
  "events",
  "http",
  "https",
  "net",
  "path",
  "querystring",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "url",
  "util",
  "zlib",
]);

export const BLOCKED_BUILTINS = new Set([
  "child_process",
  "cluster",
  "dgram",
  "fs",
  "fs/promises",
  "module",
  "os",
  "process",
  "v8",
  "vm",
  "worker_threads",
]);

const PACKAGE_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

export function assertAllowedPackage(name: string): string {
  const trimmed = name.trim();
  if (!PACKAGE_NAME_RE.test(trimmed)) {
    throw new Error(`Invalid package name: ${name}`);
  }
  const bare = trimmed.split("@").filter(Boolean);
  const pkg =
    trimmed.startsWith("@") && bare.length >= 2
      ? `@${bare[0]}/${bare[1]?.split("@")[0] ?? ""}`
      : bare[0]?.split("@")[0] || trimmed;

  if (!ALLOWED_NPM_PACKAGES.has(pkg)) {
    throw new Error(
      `Package "${pkg}" is not on the allowlist. Allowed: ${[...ALLOWED_NPM_PACKAGES].join(", ")}`,
    );
  }
  return pkg;
}
