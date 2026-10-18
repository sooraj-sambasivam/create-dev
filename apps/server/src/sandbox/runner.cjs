/**
 * Child-process entry for one sandboxed backend request.
 * Reads a JSON payload path from argv[2].
 * The parent launches this with a stripped environment (PATH + NODE_ENV only).
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const ALLOWED_BUILTINS = new Set([
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

const BLOCKED_BUILTINS = new Set([
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

function isInsideRoot(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(target);
  return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep);
}

function installRequireGuard(sandboxDir) {
  const sandboxRoot = path.resolve(sandboxDir);
  const originalLoad = Module._load;

  Module._load = function guardedLoad(request, parent, isMain) {
    const id = String(request);

    if (id === "fs" || id === "fs/promises" || id.startsWith("node:fs")) {
      throw new Error(`Module "${id}" is blocked in the sandbox`);
    }
    if (id.startsWith("node:")) {
      const bare = id.slice(5);
      if (BLOCKED_BUILTINS.has(bare) || !ALLOWED_BUILTINS.has(bare)) {
        throw new Error(`Builtin "${id}" is not allowed in the sandbox`);
      }
      return originalLoad.call(this, request, parent, isMain);
    }
    if (BLOCKED_BUILTINS.has(id)) {
      throw new Error(`Module "${id}" is blocked in the sandbox`);
    }
    if (ALLOWED_BUILTINS.has(id)) {
      return originalLoad.call(this, request, parent, isMain);
    }

    if (id.startsWith(".") || id.startsWith("/") || path.isAbsolute(id)) {
      const base = parent && parent.filename ? path.dirname(parent.filename) : sandboxRoot;
      const resolved = path.resolve(base, id);
      if (!isInsideRoot(sandboxRoot, resolved)) {
        throw new Error("Relative require escaped the sandbox");
      }
      return originalLoad.call(this, request, parent, isMain);
    }

    try {
      const resolved = require.resolve(id, { paths: [sandboxRoot] });
      if (!isInsideRoot(sandboxRoot, resolved)) {
        throw new Error(`Package "${id}" resolved outside sandbox`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("outside sandbox")) {
        throw error;
      }
    }

    return originalLoad.call(this, request, parent, isMain);
  };
}

function stripEnv() {
  const pathEnv = process.env.PATH;
  const nodeEnv = process.env.NODE_ENV;
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  if (pathEnv) process.env.PATH = pathEnv;
  process.env.NODE_ENV = nodeEnv || "production";
}

function buildRes() {
  const state = {
    statusCode: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: null,
    status(code) {
      state.statusCode = code;
      return state;
    },
    setHeader(key, value) {
      state.headers[String(key).toLowerCase()] = String(value);
      return state;
    },
    json(data) {
      state.headers["content-type"] = "application/json; charset=utf-8";
      state.body = data;
    },
    text(data) {
      state.headers["content-type"] = "text/plain; charset=utf-8";
      state.body = data;
    },
    send(data) {
      state.body = data;
    },
  };
  return state;
}

async function main() {
  const raw =
    process.argv[2] && process.argv[2] !== "-"
      ? fs.readFileSync(process.argv[2], "utf8")
      : fs.readFileSync(0, "utf8");

  const payload = JSON.parse(raw);
  const sandboxDir = path.resolve(payload.sandboxDir);
  installRequireGuard(sandboxDir);
  stripEnv();

  const mod = require(path.resolve(payload.routeFile));
  const handler =
    typeof mod === "function"
      ? mod
      : typeof mod?.default === "function"
        ? mod.default
        : typeof mod?.handler === "function"
          ? mod.handler
          : null;

  if (typeof handler !== "function") {
    throw new Error("Backend route must export async function handler(req, res)");
  }

  const res = buildRes();
  const req = {
    method: payload.method,
    path: payload.urlPath,
    query: payload.query || {},
    headers: payload.headers || {},
    body: payload.body ?? null,
  };

  await handler(req, res);

  process.stdout.write(
    JSON.stringify({
      ok: true,
      status: res.statusCode,
      headers: res.headers,
      body: res.body,
    }),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(JSON.stringify({ ok: false, error: message }));
  process.exitCode = 1;
});
