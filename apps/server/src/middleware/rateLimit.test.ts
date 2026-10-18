import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { createRateLimiter } from "./rateLimit";

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res;
}

function run(limiter: ReturnType<typeof createRateLimiter>, ip: string) {
  const res = fakeRes();
  const next = vi.fn() as unknown as NextFunction;
  limiter({ ip } as Request, res as unknown as Response, next);
  return { res, next: next as unknown as ReturnType<typeof vi.fn> };
}

describe("createRateLimiter", () => {
  it("allows up to max requests in a window, then returns 429 with an error body", () => {
    let t = 0;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3, now: () => t });
    for (let i = 0; i < 3; i++) {
      const { next } = run(limiter, "1.2.3.4");
      expect(next).toHaveBeenCalledTimes(1);
    }
    const blocked = run(limiter, "1.2.3.4");
    expect(blocked.next).not.toHaveBeenCalled();
    expect(blocked.res.statusCode).toBe(429);
    expect(blocked.res.body).toEqual({ error: expect.any(String), retryAfterSec: expect.any(Number) });
    expect(blocked.res.headers["Retry-After"]).toBe("60");
  });

  it("slides: a request is allowed again once its timestamp leaves the window", () => {
    let t = 0;
    const limiter = createRateLimiter({ windowMs: 1_000, max: 2, now: () => t });
    run(limiter, "a");
    t = 400;
    run(limiter, "a");
    expect(run(limiter, "a").res.statusCode).toBe(429);
    t = 1_001; // first hit (t=0) has aged out; second (t=400) is still inside
    expect(run(limiter, "a").next).toHaveBeenCalledTimes(1);
    expect(run(limiter, "a").res.statusCode).toBe(429);
    t = 1_401; // second hit has aged out too
    expect(run(limiter, "a").next).toHaveBeenCalledTimes(1);
  });

  it("keys limits by client IP independently", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, now: () => 0 });
    expect(run(limiter, "10.0.0.1").next).toHaveBeenCalledTimes(1);
    expect(run(limiter, "10.0.0.1").res.statusCode).toBe(429);
    expect(run(limiter, "10.0.0.2").next).toHaveBeenCalledTimes(1);
  });

  it("does not count refused requests against the window", () => {
    let t = 0;
    const limiter = createRateLimiter({ windowMs: 1_000, max: 1, now: () => t });
    run(limiter, "x");
    t = 500;
    for (let i = 0; i < 5; i++) run(limiter, "x");
    t = 1_000; // only the t=0 hit counted, and it has now aged out
    expect(run(limiter, "x").next).toHaveBeenCalledTimes(1);
  });

  it("keeps working after many distinct keys have gone stale", () => {
    let t = 0;
    const limiter = createRateLimiter({ windowMs: 1_000, max: 1, now: () => t });
    for (let i = 0; i < 10_001; i++) run(limiter, `ip-${i}`);
    t = 5_000;
    expect(run(limiter, "ip-0").next).toHaveBeenCalledTimes(1);
    expect(run(limiter, "ip-0").res.statusCode).toBe(429);
  });
});
