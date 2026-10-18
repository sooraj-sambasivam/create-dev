import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { COST_LIMITS, createApp } from "./app";

describe("cost route rate limits", () => {
  it("returns 429 JSON with retryAfterSec past the intent cap", async () => {
    const server = createApp().listen(0);
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/route-intent`;
      const cap = COST_LIMITS["/route-intent"];
      let last: Response | undefined;
      for (let i = 0; i <= cap; i++) last = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      expect(last?.status).toBe(429);
      const body = (await last!.json()) as { error: string; retryAfterSec: number };
      expect(body.retryAfterSec).toBeGreaterThan(0);
      expect(body.error).toMatch(/too many/i);
    } finally {
      server.close();
    }
  });
});
