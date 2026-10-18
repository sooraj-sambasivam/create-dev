import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { IMAGE_BYTES_MAX, imageRouter, isAllowedImageUrl } from "./image";

let server: Server;
let base: string;
const realFetch = globalThis.fetch;

beforeAll(async () => {
  const app = express();
  app.use("/api", imageRouter);
  await new Promise<void>((r) => {
    server = app.listen(0, "127.0.0.1", () => r());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockUpstream(...responses: Response[]) {
  const fn = vi.fn(async () => responses.shift() as Response);
  globalThis.fetch = ((input: unknown, init?: unknown) =>
    String(input).startsWith(base) ? realFetch(input as string, init as RequestInit) : fn()) as typeof fetch;
  return fn;
}

const get = (u: string) => realFetch(`${base}/api/image/bytes?url=${encodeURIComponent(u)}`);

describe("isAllowedImageUrl", () => {
  it("accepts allow-listed https hosts and subdomains only", () => {
    expect(isAllowedImageUrl(new URL("https://live.staticflickr.com/a.jpg"))).toBe(true);
    expect(isAllowedImageUrl(new URL("https://upload.wikimedia.org/a.jpg"))).toBe(true);
    expect(isAllowedImageUrl(new URL("https://evilstaticflickr.com/a.jpg"))).toBe(false);
    expect(isAllowedImageUrl(new URL("https://127.0.0.1/a.jpg"))).toBe(false);
    expect(isAllowedImageUrl(new URL("https://[::1]/a.jpg"))).toBe(false);
    expect(isAllowedImageUrl(new URL("https://localhost/a.jpg"))).toBe(false);
  });
});

describe("GET /api/image/bytes", () => {
  it("rejects a host that is not allow-listed", async () => {
    const f = mockUpstream();
    expect((await get("https://example.com/a.jpg")).status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it("rejects http", async () => {
    expect((await get("http://upload.wikimedia.org/a.jpg")).status).toBe(400);
  });

  it("rejects a redirect to a disallowed host", async () => {
    mockUpstream(new Response(null, { status: 302, headers: { location: "https://169.254.169.254/x" } }));
    expect((await get("https://upload.wikimedia.org/a.jpg")).status).toBe(400);
  });

  it("rejects svg with 415", async () => {
    mockUpstream(new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }));
    expect((await get("https://upload.wikimedia.org/a.svg")).status).toBe(415);
  });

  it("rejects oversize bodies with 413", async () => {
    mockUpstream(new Response(new Uint8Array(IMAGE_BYTES_MAX + 1), { headers: { "content-type": "image/jpeg" } }));
    expect((await get("https://upload.wikimedia.org/big.jpg")).status).toBe(413);
  });

  it("streams an image, following an allowed redirect", async () => {
    mockUpstream(
      new Response(null, { status: 302, headers: { location: "https://live.staticflickr.com/b.jpg" } }),
      new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }),
    );
    const res = await get("https://upload.wikimedia.org/a.jpg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);
  });
});
