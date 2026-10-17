import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fetchVoiceToken, voiceRouter } from "./voice";

// Captured before any stubGlobal("fetch") so local requests to the test server stay real.
const realFetch = globalThis.fetch;

describe("fetchVoiceToken", () => {
  it("returns batch without calling upstream when no key is set", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchVoiceToken(undefined, fetchImpl);
    expect(result.provider).toBe("batch");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts to the single-use endpoint with xi-api-key and returns the token", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ token: "tok_123" }), { status: 200 }));
    const result = await fetchVoiceToken("sk-test-key", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("sk-test-key");
    expect(init.body).toBeUndefined();
    expect(result).toEqual({ provider: "elevenlabs", token: "tok_123", model: "scribe_v2_realtime", expiresInSec: 900 });
  });

  it("falls back to batch on an upstream error without leaking the key", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope sk-test-key", { status: 401 }));
    const result = await fetchVoiceToken("sk-test-key", fetchImpl);
    expect(result.provider).toBe("batch");
    expect(JSON.stringify(result)).not.toContain("sk-test-key");
  });

  it("falls back to batch when the response has no token", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    expect((await fetchVoiceToken("k", fetchImpl)).provider).toBe("batch");
  });

  it("falls back to batch when the network throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect((await fetchVoiceToken("k", fetchImpl)).provider).toBe("batch");
  });
});

describe("GET /api/voice-token", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = express();
    app.use("/api", voiceRouter);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ELEVENLABS_API_KEY;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("returns no-store and the batch fallback when no key is configured", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const res = await realFetch(`${base}/api/voice-token`);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { provider: string };
    expect(body.provider).toBe("batch");
  });

  it("returns an elevenlabs token and never the API key", async () => {
    process.env.ELEVENLABS_API_KEY = "sk-route-secret";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ token: "single-use" }), { status: 200 })));
    const res = await realFetch(`${base}/api/voice-token`);
    const text = await res.text();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(text)).toEqual({
      provider: "elevenlabs",
      token: "single-use",
      model: "scribe_v2_realtime",
      expiresInSec: 900,
    });
    expect(text).not.toContain("sk-route-secret");
  });

  it("is rate limited per IP: refuses with 429 and an error body once the window is full", async () => {
    // Earlier tests in this file have already used some of the 10-per-minute budget for 127.0.0.1,
    // so 12 more requests must hit the limit.
    delete process.env.ELEVENLABS_API_KEY;
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 12; i++) {
      last = await realFetch(`${base}/api/voice-token`);
      statuses.push(last.status);
    }
    expect(statuses).toContain(429);
    expect(statuses.slice(0, 1)).toEqual([200]);
    expect(last?.status).toBe(429);
    expect(last?.headers.get("retry-after")).toBeTruthy();
    expect(await last?.json()).toEqual({ error: expect.any(String) });
  });
});
