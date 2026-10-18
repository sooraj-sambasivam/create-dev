import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { bigJson } from "./bodyLimit";

afterEach(() => delete process.env.VERCEL);

async function post(bytes: number) {
  const app = express();
  app.post("/x", bigJson("Too big."), (_req, res) => void res.json({ ok: true }));
  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    return await fetch(`http://127.0.0.1:${port}/x`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: "x".repeat(bytes) }),
    });
  } finally {
    server.close();
  }
}

describe("bigJson", () => {
  it("accepts 5mb locally", async () => {
    expect((await post(5 * 1024 * 1024)).status).toBe(200);
  });
  it("returns a friendly 413 over 4mb when VERCEL is set", async () => {
    process.env.VERCEL = "1";
    const res = await post(5 * 1024 * 1024);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Too big." });
  });
});
