import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertAllowedPackage } from "./allowlist";
import {
  MAX_ROUTES,
  MAX_SESSION_CODE_BYTES,
  SandboxError,
  validateBackendRoutes,
  type BackendRouteInput,
  type ValidatedRoute,
} from "./validate";

const DEFAULT_SANDBOX_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..", "sandboxes");
const RUNNER = resolve(dirname(fileURLToPath(import.meta.url)), "runner.cjs");
const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_INSTALL_TIMEOUT_MS = 60_000;
const MAX_STDOUT_CHARS = 2_000_000;

export const SESSION_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;
const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/;
const ROUTE_PATH_RE = /^\/[a-zA-Z0-9/_-]{1,64}$/;
const METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH"]);

export type DeployedRoute = {
  path: string;
  method: string;
  dependencies: string[];
  codeBytes: number;
};

export type SandboxResult = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

/** Directory that holds per-session backends. Override with SANDBOX_ROOT in tests. */
export function sandboxRoot(): string {
  const override = process.env.SANDBOX_ROOT?.trim();
  return override ? resolve(override) : DEFAULT_SANDBOX_ROOT;
}

export function publishedSandboxId(slug: string): string {
  if (!SLUG_RE.test(slug)) {
    throw new SandboxError("Invalid slug");
  }
  const sessionId = `published_${slug}`;
  if (!SESSION_ID_RE.test(sessionId)) {
    throw new SandboxError("Invalid slug");
  }
  return sessionId;
}

function requestTimeoutMs(): number {
  const raw = Number(process.env.SANDBOX_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 50 && raw <= 60_000) return raw;
  return DEFAULT_REQUEST_TIMEOUT_MS;
}

function installTimeoutMs(): number {
  const raw = Number(process.env.SANDBOX_INSTALL_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 1_000 && raw <= 120_000) return raw;
  return DEFAULT_INSTALL_TIMEOUT_MS;
}

/** Child environment: PATH and NODE_ENV only. Host keys never cross this boundary. */
export function sandboxChildEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    NODE_ENV: "production",
  };
}

function sessionDir(sessionId: string): string {
  if (!SESSION_ID_RE.test(sessionId)) {
    throw new SandboxError("Invalid session id");
  }
  return join(sandboxRoot(), sessionId);
}

export function sandboxExists(sessionId: string): boolean {
  return existsSync(sessionDir(sessionId));
}

function routeFileName(method: string, routePath: string): string {
  const safe = routePath.replace(/^\//, "").replace(/\//g, "__");
  return `${method.toUpperCase()}__${safe}.cjs`;
}

function isSafeRoutePath(routePath: string): boolean {
  return ROUTE_PATH_RE.test(routePath) && !routePath.includes("..");
}

function ensureSession(sessionId: string): string {
  const dir = sessionDir(sessionId);
  mkdirSync(join(dir, "routes"), { recursive: true });
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) {
    writeFileSync(
      pkgPath,
      JSON.stringify(
        {
          name: `create-sandbox-${sessionId.slice(0, 8)}`,
          private: true,
          type: "commonjs",
          dependencies: {},
        },
        null,
        2,
      ),
    );
  }
  return dir;
}

function readManifest(dir: string): DeployedRoute[] {
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) return [];
  try {
    const data = JSON.parse(readFileSync(manifestPath, "utf8")) as { routes?: DeployedRoute[] };
    return Array.isArray(data.routes) ? data.routes : [];
  } catch {
    return [];
  }
}

function storedCodeBytes(dir: string, route: DeployedRoute): number {
  if (typeof route.codeBytes === "number" && Number.isFinite(route.codeBytes) && route.codeBytes >= 0) {
    return route.codeBytes;
  }
  const file = join(dir, "routes", routeFileName(route.method, route.path));
  if (!existsSync(file)) return 0;
  return statSync(file).size;
}

async function npmInstall(dir: string, packages: string[]): Promise<void> {
  if (packages.length === 0) return;

  let unique: string[];
  try {
    unique = [...new Set(packages.map(assertAllowedPackage))];
  } catch (error) {
    throw new SandboxError(error instanceof Error ? error.message : "Package not allowed");
  }

  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  pkg.dependencies = pkg.dependencies || {};
  for (const name of unique) {
    pkg.dependencies[name] = pkg.dependencies[name] || "*";
  }
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));

  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--omit=dev", ...unique],
      {
        cwd: dir,
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          npm_config_update_notifier: "false",
          npm_config_ignore_scripts: "true",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 8_000) stderr = stderr.slice(-8_000);
    });

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new SandboxError("npm install timed out", 500));
    }, installTimeoutMs());

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolvePromise();
      else reject(new SandboxError(`npm install failed: ${stderr.slice(0, 500)}`, 500));
    });
  });
}

function wrapHandlerCode(code: string): string {
  const trimmed = code.trim();
  if (
    /\bmodule\.exports\b/.test(trimmed) ||
    /\bexports\.handler\b/.test(trimmed) ||
    /\bfunction\s+handler\b/.test(trimmed) ||
    /\bconst\s+handler\b/.test(trimmed) ||
    /\blet\s+handler\b/.test(trimmed)
  ) {
    return `${trimmed}\n;module.exports = typeof handler === "function" ? handler : (module.exports.handler || module.exports.default || module.exports);\n`;
  }
  return `"use strict";\nmodule.exports = async function handler(req, res) {\n${trimmed}\n};\n`;
}

function mergeRoutes(existing: DeployedRoute[], incoming: ValidatedRoute[]): DeployedRoute[] {
  const byKey = new Map(existing.map((route) => [`${route.method}:${route.path}`, route] as const));
  for (const route of incoming) {
    byKey.set(`${route.method}:${route.path}`, {
      path: route.path,
      method: route.method,
      dependencies: route.dependencies,
      codeBytes: route.codeBytes,
    });
  }
  return [...byKey.values()];
}

function assertMergedBudget(routes: DeployedRoute[]): void {
  if (routes.length > MAX_ROUTES) {
    throw new SandboxError(`At most ${MAX_ROUTES} backend routes allowed`);
  }
  const total = routes.reduce((sum, route) => sum + route.codeBytes, 0);
  if (total > MAX_SESSION_CODE_BYTES) {
    throw new SandboxError("Sandbox code exceeds 1 MB for this session");
  }
}

export async function deployBackend(args: {
  sessionId: string;
  routes: BackendRouteInput[];
}): Promise<{ sessionId: string; routes: DeployedRoute[]; apiBase: string }> {
  const validated = validateBackendRoutes(args.routes);
  const dir = sessionDir(args.sessionId);
  const existing = existsSync(dir)
    ? readManifest(dir).map((route) => ({ ...route, codeBytes: storedCodeBytes(dir, route) }))
    : [];
  const merged = mergeRoutes(existing, validated);
  assertMergedBudget(merged);

  const ready = ensureSession(args.sessionId);
  await npmInstall(ready, validated.flatMap((route) => route.dependencies));

  for (const route of validated) {
    const file = join(ready, "routes", routeFileName(route.method, route.path));
    writeFileSync(file, wrapHandlerCode(route.code), "utf8");
  }
  writeFileSync(
    join(ready, "manifest.json"),
    JSON.stringify({ routes: merged, updatedAt: Date.now() }, null, 2),
  );

  return {
    sessionId: args.sessionId,
    routes: merged,
    apiBase: `/api/u/${args.sessionId}`,
  };
}

export function listRoutes(sessionId: string): DeployedRoute[] {
  const dir = sessionDir(sessionId);
  return readManifest(dir);
}

export function resetSandbox(sessionId: string): void {
  const dir = sessionDir(sessionId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

export function createSessionId(): string {
  return randomUUID().replace(/-/g, "");
}

export async function invokeSandbox(args: {
  sessionId: string;
  method: string;
  routePath: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}): Promise<SandboxResult> {
  const method = args.method.toUpperCase();
  if (!METHODS.has(method) || !isSafeRoutePath(args.routePath)) {
    return {
      status: 404,
      headers: { "content-type": "application/json" },
      body: { error: `No handler for ${method} ${args.routePath}` },
    };
  }

  const dir = sessionDir(args.sessionId);
  const file = join(dir, "routes", routeFileName(method, args.routePath));
  if (!existsSync(file)) {
    return {
      status: 404,
      headers: { "content-type": "application/json" },
      body: { error: `No handler for ${method} ${args.routePath}` },
    };
  }

  const payloadPath = join(dir, `.invoke-${randomUUID()}.json`);
  writeFileSync(
    payloadPath,
    JSON.stringify({
      sandboxDir: dir,
      routeFile: file,
      method,
      urlPath: args.routePath,
      query: args.query,
      headers: args.headers,
      body: args.body,
    }),
  );

  try {
    const result = await new Promise<{
      ok: boolean;
      status?: number;
      headers?: Record<string, string>;
      body?: unknown;
      error?: string;
    }>((resolvePromise, reject) => {
      const child = spawn(process.execPath, [RUNNER, payloadPath], {
        cwd: dir,
        env: sandboxChildEnv(),
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      child.stdout.on("data", (chunk: Buffer) => {
        if (stdout.length < MAX_STDOUT_CHARS) stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
        if (stderr.length > 8_000) stderr = stderr.slice(-8_000);
      });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        reject(new SandboxError("Sandbox request timed out", 500));
      }, requestTimeoutMs());

      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          const parsed = JSON.parse(stdout || "{}") as {
            ok: boolean;
            status?: number;
            headers?: Record<string, string>;
            body?: unknown;
            error?: string;
          };
          if (!parsed.ok) {
            resolvePromise({
              ok: false,
              error: parsed.error || stderr.slice(0, 400) || "Sandbox failed",
            });
            return;
          }
          resolvePromise(parsed);
        } catch {
          reject(new SandboxError(stderr.slice(0, 400) || "Sandbox returned invalid JSON", 500));
        }
      });
    });

    if (!result.ok) {
      return {
        status: 500,
        headers: { "content-type": "application/json" },
        body: { error: result.error || "Sandbox error" },
      };
    }

    return {
      status: result.status || 200,
      headers: result.headers || { "content-type": "application/json" },
      body: result.body,
    };
  } finally {
    try {
      rmSync(payloadPath, { force: true });
    } catch {
      // The payload is inside the session directory, which is gitignored.
    }
  }
}
