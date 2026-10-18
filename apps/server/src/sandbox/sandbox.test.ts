import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertAllowedPackage } from "./allowlist";
import { invokeSandbox, publishedSandboxId, sandboxChildEnv } from "./manager";
import { createSandboxRouter } from "./router";
import { MAX_ROUTES, MAX_SESSION_CODE_BYTES, validateBackendRoutes } from "./validate";

const SESSION = "testsession01";

let root: string;
let previousRoot: string | undefined;
let previousTimeout: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "create-sandbox-"));
  previousRoot = process.env.SANDBOX_ROOT;
  previousTimeout = process.env.SANDBOX_TIMEOUT_MS;
  process.env.SANDBOX_ROOT = root;
  delete process.env.SANDBOX_TIMEOUT_MS;
});

afterEach(async () => {
  if (previousRoot === undefined) delete process.env.SANDBOX_ROOT;
  else process.env.SANDBOX_ROOT = previousRoot;
  if (previousTimeout === undefined) delete process.env.SANDBOX_TIMEOUT_MS;
  else process.env.SANDBOX_TIMEOUT_MS = previousTimeout;
  await rm(root, { recursive: true, force: true });
});

function start(max = 60): Promise<{ server: Server; base: string }> {
  const app = express();
  app.use(express.json({ limit: "3mb" }));
  app.use("/api", createSandboxRouter({ max }));
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      resolve({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    });
  });
}

async function stop(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe("validateBackendRoutes", () => {
  it("rejects fs, child_process, eval, process.env, and private network targets", () => {
    const samples = [
      ["require('fs').readFileSync('/etc/passwd')", /fs is not allowed/],
      ["require('node:fs/promises')", /fs is not allowed/],
      ["require('child_process').exec('id')", /child_process is not allowed/],
      ["eval('1')", /eval is not allowed/],
      ["process.env.ANTHROPIC_API_KEY", /process\.env is not allowed/],
      ["process['env']", /process\.env is not allowed/],
      ["fetch('http://localhost:3001/api')", /private network/],
      ["fetch('http://127.0.0.1:9/')", /private network/],
      ["fetch('http://10.1.2.3/secret')", /private network/],
      ["fetch('http://192.168.0.5/')", /private network/],
      ["fetch('http://172.16.0.4/')", /private network/],
      ["fetch('http://169.254.169.254/latest')", /private network/],
    ] as const;

    for (const [code, reason] of samples) {
      expect(() => validateBackendRoutes([{ path: "/x", method: "GET", code }])).toThrow(reason);
    }
  });

  it("allows a public fetch and a 172.15 address that is not private", () => {
    const routes = validateBackendRoutes([
      {
        path: "/ok",
        method: "GET",
        code: "res.json({ url: 'https://example.com', other: '172.15.0.1' });",
      },
    ]);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.codeBytes).toBeGreaterThan(0);
  });

  it("rejects more than 20 routes and more than 1 MB of code", () => {
    const tooMany = Array.from({ length: MAX_ROUTES + 1 }, (_, i) => ({
      path: `/r${i}`,
      method: "GET",
      code: "res.json({ ok: true });",
    }));
    expect(() => validateBackendRoutes(tooMany)).toThrow(/20 backend routes/);

    expect(() =>
      validateBackendRoutes([{ path: "/big", method: "GET", code: "x".repeat(MAX_SESSION_CODE_BYTES + 1) }]),
    ).toThrow(/1 MB/);

    expect(() =>
      validateBackendRoutes([
        { path: "/a", method: "GET", code: "a".repeat(600_000) },
        { path: "/b", method: "GET", code: "b".repeat(600_000) },
      ]),
    ).toThrow(/1 MB/);
  });

  it("rejects packages that are not on the allowlist", () => {
    expect(assertAllowedPackage("zod")).toBe("zod");
    expect(() => assertAllowedPackage("fs-extra")).toThrow(/not on the allowlist/);
    expect(() => assertAllowedPackage("../evil")).toThrow(/Invalid package name/);
  });
});

describe("sandbox child env", () => {
  it("keeps PATH and NODE_ENV and drops host keys", () => {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    const previousOptions = process.env.NODE_OPTIONS;
    process.env.ANTHROPIC_API_KEY = "sk-host-secret";
    process.env.NODE_OPTIONS = "--require /tmp/not-allowed.js";
    try {
      const env = sandboxChildEnv();
      expect(env).toEqual({ PATH: process.env.PATH ?? "", NODE_ENV: "production" });
      expect(env.ANTHROPIC_API_KEY).toBeUndefined();
      expect(env.NODE_OPTIONS).toBeUndefined();
    } finally {
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousKey;
      if (previousOptions === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = previousOptions;
    }
  });
});

describe("sandbox http", () => {
  it("deploys a hello route and serves it on the session and published prefixes", async () => {
    const { server, base } = await start();
    try {
      const deployed = await fetch(`${base}/api/sandbox/deploy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: SESSION,
          routes: [{ path: "/hello", method: "GET", code: "res.json({ hello: 'world' });" }],
        }),
      });
      expect(deployed.status).toBe(200);
      const body = (await deployed.json()) as { apiBase: string; routes: { path: string }[] };
      expect(body.apiBase).toBe(`/api/u/${SESSION}`);
      expect(body.routes.map((route) => route.path)).toEqual(["/hello"]);

      const hello = await fetch(`${base}/api/u/${SESSION}/hello`);
      expect(hello.status).toBe(200);
      expect(await hello.json()).toEqual({ hello: "world" });

      const publishedId = publishedSandboxId("cafe");
      const publishedDeploy = await fetch(`${base}/api/sandbox/deploy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: publishedId,
          routes: [{ path: "/hello", method: "GET", code: "res.json({ hello: 'published' });" }],
        }),
      });
      expect(publishedDeploy.status).toBe(200);
      const published = await fetch(`${base}/api/p/cafe/hello`);
      expect(published.status).toBe(200);
      expect(await published.json()).toEqual({ hello: "published" });

      const other = await fetch(`${base}/api/u/othersession1/hello`);
      expect(other.status).toBe(404);
    } finally {
      await stop(server);
    }
  });

  it("returns 400 for a dangerous deploy and does not install the route", async () => {
    const { server, base } = await start();
    try {
      const res = await fetch(`${base}/api/sandbox/deploy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: SESSION,
          routes: [{ path: "/pwn", method: "POST", code: "require('child_process').exec('id')" }],
        }),
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: expect.stringMatching(/child_process/) });
      const follow = await fetch(`${base}/api/u/${SESSION}/pwn`, { method: "POST" });
      expect(follow.status).toBe(404);
    } finally {
      await stop(server);
    }
  });

  it("returns 500 when a handler runs past the timeout", async () => {
    process.env.SANDBOX_TIMEOUT_MS = "400";
    const { server, base } = await start();
    try {
      const deployed = await fetch(`${base}/api/sandbox/deploy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: SESSION,
          routes: [
            {
              path: "/slow",
              method: "GET",
              code: "await new Promise((resolve) => setTimeout(resolve, 10000)); res.json({ ok: true });",
            },
          ],
        }),
      });
      expect(deployed.status).toBe(200);
      const res = await fetch(`${base}/api/u/${SESSION}/slow`);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: expect.stringMatching(/timed out/i) });
    } finally {
      await stop(server);
    }
  }, 10_000);

  it("strips host secrets inside the child even if the handler reads process.env", async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    const previousToken = process.env.SECRET_TOKEN;
    process.env.ANTHROPIC_API_KEY = "sk-host-secret";
    process.env.SECRET_TOKEN = "super-secret";
    const dir = join(root, SESSION, "routes");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "GET__env.cjs"),
      `module.exports = async function handler(req, res) {
        const keys = Object.keys(process.env);
        res.json({
          anthropic: process.env.ANTHROPIC_API_KEY || null,
          secret: process.env.SECRET_TOKEN || null,
          nodeEnv: process.env.NODE_ENV || null,
          secretKeyCount: keys.filter((key) => /key|secret|token|password|credential/i.test(key)).length,
        });
      };\n`,
    );
    try {
      const result = await invokeSandbox({
        sessionId: SESSION,
        method: "GET",
        routePath: "/env",
        query: {},
        headers: {},
        body: null,
      });
      expect(result.status).toBe(200);
      expect(result.body).toEqual({
        anthropic: null,
        secret: null,
        nodeEnv: "production",
        secretKeyCount: 0,
      });
    } finally {
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousKey;
      if (previousToken === undefined) delete process.env.SECRET_TOKEN;
      else process.env.SECRET_TOKEN = previousToken;
    }
  });

  it("blocks require('fs') at runtime when the static check is bypassed", async () => {
    const dir = join(root, SESSION, "routes");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "GET__fs.cjs"),
      "module.exports = async function handler() { require('fs'); };\n",
    );
    const result = await invokeSandbox({
      sessionId: SESSION,
      method: "GET",
      routePath: "/fs",
      query: {},
      headers: {},
      body: null,
    });
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: expect.stringMatching(/blocked/) });
  });

  it("rate limits sandbox calls per IP", async () => {
    const { server, base } = await start(2);
    try {
      const first = await fetch(`${base}/api/u/${SESSION}/hello`);
      const second = await fetch(`${base}/api/u/${SESSION}/hello`);
      const third = await fetch(`${base}/api/u/${SESSION}/hello`);
      expect(first.status).toBe(404);
      expect(second.status).toBe(404);
      expect(third.status).toBe(429);
      expect(await third.json()).toEqual({ error: expect.stringMatching(/Too many requests/) });
    } finally {
      await stop(server);
    }
  });
});
