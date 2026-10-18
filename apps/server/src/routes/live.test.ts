import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLiveRouter } from "./live";
import { createTtlCache } from "../live/cache";
import {
  LIVE_CATALOG,
  LiveError,
  SOURCES,
  UPSTREAM_TIMEOUT_MS,
  formatTime,
  getJson,
  parseCrypto,
  parseForecast,
  parseGeocode,
  parseHn,
  parseStars,
  parseYoutube,
  weatherWords,
  type Fetcher,
} from "../live/sources";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let server: Server | undefined;
afterEach(async () => {
  vi.useRealTimers();
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = undefined;
});

async function boot(fetchFn: Fetcher, extra: Parameters<typeof createLiveRouter>[0] = {}) {
  const app = express();
  app.use("/api", createLiveRouter({ fetch: fetchFn, env: {}, ...extra }));
  await new Promise<void>((r) => { server = app.listen(0, () => r()); });
  const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api`;
  return base;
}

describe("catalog", () => {
  it("lists all six sources", async () => {
    const base = await boot(vi.fn());
    const res = await fetch(`${base}/live`);
    const list = (await res.json()) as typeof LIVE_CATALOG;
    expect(list.map((s) => s.id).sort()).toEqual(["crypto-price", "github-stars", "hn-top", "time", "weather", "youtube-views"]);
  });
});

describe("param validation", () => {
  const v = (id: keyof typeof SOURCES, p: Record<string, string>) => SOURCES[id].validate(p);
  it("accepts good params and fills defaults", () => {
    expect(v("weather", { city: "São Paulo" })).toEqual({ city: "São Paulo" });
    expect(v("crypto-price", { coin: "bitcoin" })).toEqual({ coin: "bitcoin", currency: "usd" });
    expect(v("time", {})).toEqual({ tz: "UTC" });
    expect(v("github-stars", { owner: "vercel", repo: "next.js" })).toEqual({ owner: "vercel", repo: "next.js" });
  });
  it("rejects bad characters, length, unknown keys", () => {
    expect(() => v("weather", { city: "x&y=1" })).toThrow(LiveError);
    expect(() => v("weather", { city: "a".repeat(61) })).toThrow(/too long/);
    expect(() => v("weather", {})).toThrow(/Missing/);
    expect(() => v("weather", { city: "Rome", extra: "1" })).toThrow(/Unknown/);
    expect(() => v("github-stars", { owner: "a", repo: ".." })).toThrow(LiveError);
    expect(() => v("github-stars", { owner: "a/b", repo: "c" })).toThrow(LiveError);
    expect(() => v("crypto-price", { coin: "BTC;", currency: "usd" })).toThrow(LiveError);
    expect(() => v("time", { tz: "Not/AZone" })).toThrow(/time zone/);
    expect(() => v("youtube-views", { videoId: "short" })).toThrow(LiveError);
  });
  it("returns 400 over http and 404 for unknown ids", async () => {
    const base = await boot(vi.fn());
    expect((await fetch(`${base}/live/weather?city=%3Cscript%3E`)).status).toBe(400);
    expect((await fetch(`${base}/live/weather?city=a&city=b`)).status).toBe(400);
    expect((await fetch(`${base}/live/nope`)).status).toBe(404);
    expect((await fetch(`${base}/live/__proto__`)).status).toBe(404);
  });
});

describe("parsers", () => {
  it("weather", () => {
    expect(parseGeocode({ results: [{ name: "Seattle", latitude: 47.6, longitude: -122.3 }] }).name).toBe("Seattle");
    expect(() => parseGeocode({})).toThrow(/No city/);
    const r = parseForecast({ current: { temperature_2m: 20, weather_code: 0 } }, "Seattle");
    expect(r.display).toBe("Seattle 20°C / 68°F, Clear");
    expect(() => parseForecast({}, "x")).toThrow(LiveError);
    expect(weatherWords(95)).toBe("Thunderstorm");
  });
  it("github-stars", () => {
    expect(parseStars({ stargazers_count: 12345 }, "a/b")).toMatchObject({ value: 12345, display: "12,345 stars" });
    expect(() => parseStars({}, "a/b")).toThrow(LiveError);
  });
  it("crypto-price", () => {
    expect(parseCrypto({ bitcoin: { usd: 65000.5 } }, "bitcoin", "usd").display).toBe("$65,000.50");
    expect(() => parseCrypto({}, "bitcoin", "usd")).toThrow(/No price/);
  });
  it("hn-top", () => {
    expect(parseHn({ title: "Show HN: x", score: 321 }).display).toBe("Show HN: x (321 points)");
    expect(() => parseHn({})).toThrow(LiveError);
  });
  it("time", () => {
    const r = formatTime(new Date("2026-01-01T20:30:00Z"), "America/Los_Angeles");
    expect(r.display).toMatch(/12:30 PM/);
  });
  it("youtube-views", () => {
    expect(parseYoutube({ items: [{ statistics: { viewCount: "1500" } }] })).toMatchObject({ value: 1500, display: "1,500 views" });
    expect(() => parseYoutube({ items: [] })).toThrow(/No video/);
  });
});

describe("routes with mocked fetch", () => {
  it("weather chains geocode then forecast", async () => {
    const f = vi.fn<Fetcher>(async (url) =>
      url.includes("geocoding") ? json({ results: [{ name: "Oslo", latitude: 59.9, longitude: 10.7 }] }) : json({ current: { temperature_2m: 3.4, weather_code: 71 } }),
    );
    const base = await boot(f);
    const body = (await (await fetch(`${base}/live/weather?city=Oslo`)).json()) as { display: string; updatedAt: string; source: string };
    expect(body.display).toBe("Oslo 3°C / 38°F, Snow");
    expect(body.source).toBe("open-meteo.com");
    expect(Number.isNaN(Date.parse(body.updatedAt))).toBe(false);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("hn-top chains list then item", async () => {
    const f = vi.fn<Fetcher>(async (url) => (url.endsWith("topstories.json") ? json([42, 1]) : json({ title: "Hi", score: 9 })));
    const base = await boot(f);
    const body = (await (await fetch(`${base}/live/hn-top`)).json()) as { display: string };
    expect(body.display).toBe("Hi (9 points)");
    expect(f.mock.calls[1][0]).toContain("/item/42.json");
  });

  it("uses fixed hosts and refuses redirects", async () => {
    const f = vi.fn<Fetcher>(async () => json({ stargazers_count: 5 }));
    const base = await boot(f);
    await fetch(`${base}/live/github-stars?owner=a&repo=b`);
    expect(f.mock.calls[0][0]).toBe("https://api.github.com/repos/a/b");
    expect(f.mock.calls[0][1]?.redirect).toBe("error");
  });

  it("youtube-views returns 501 without a key and works with one", async () => {
    const f = vi.fn<Fetcher>(async () => json({ items: [{ statistics: { viewCount: "7" } }] }));
    const noKey = await boot(f);
    const res = await fetch(`${noKey}/live/youtube-views?videoId=dQw4w9WgXcQ`);
    expect(res.status).toBe(501);
    expect(f).not.toHaveBeenCalled();
    await new Promise<void>((r) => server!.close(() => r()));
    const withKey = await boot(f, { env: { YOUTUBE_API_KEY: "k" } });
    const ok = await fetch(`${withKey}/live/youtube-views?videoId=dQw4w9WgXcQ`);
    expect(((await ok.json()) as { value: number }).value).toBe(7);
  });

  it("maps upstream failures to 502/404", async () => {
    const base = await boot(async () => json({}, 500));
    expect((await fetch(`${base}/live/github-stars?owner=a&repo=b`)).status).toBe(502);
    await new Promise<void>((r) => server!.close(() => r()));
    const base2 = await boot(async () => json({}, 404));
    expect((await fetch(`${base2}/live/github-stars?owner=a&repo=b`)).status).toBe(404);
  });

  it("serves the time source with no upstream call", async () => {
    const f = vi.fn<Fetcher>();
    const base = await boot(f);
    const body = (await (await fetch(`${base}/live/time?tz=Asia/Tokyo`)).json()) as { display: string };
    expect(body.display).toMatch(/JST|GMT\+9/);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("cache", () => {
  it("expires after the ttl", () => {
    let t = 0;
    const c = createTtlCache<number>(1000, 10, () => t);
    c.set("a", 1);
    t = 999;
    expect(c.get("a")).toBe(1);
    t = 1000;
    expect(c.get("a")).toBeUndefined();
  });
  it("evicts the oldest past the cap", () => {
    const c = createTtlCache<number>(1000, 2, () => 0);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    expect(c.get("a")).toBeUndefined();
    expect(c.size).toBe(2);
  });
  it("route caches per (id, params) for 60s", async () => {
    let t = 1_000_000;
    const f = vi.fn<Fetcher>(async () => json({ stargazers_count: 1 }));
    const base = await boot(f, { now: () => t });
    await fetch(`${base}/live/github-stars?owner=a&repo=b`);
    await fetch(`${base}/live/github-stars?repo=b&owner=a`);
    expect(f).toHaveBeenCalledTimes(1);
    await fetch(`${base}/live/github-stars?owner=a&repo=c`);
    expect(f).toHaveBeenCalledTimes(2);
    t += 60_001;
    await fetch(`${base}/live/github-stars?owner=a&repo=b`);
    expect(f).toHaveBeenCalledTimes(3);
  });
});

describe("rate limit", () => {
  it("returns 429 past the cap", async () => {
    const base = await boot(vi.fn(), { perMinute: 2 });
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await fetch(`${base}/live/time`)).status);
    expect(codes).toEqual([200, 200, 429]);
  });
});

describe("timeout", () => {
  it("aborts a hung upstream after 5s and reports 504", async () => {
    vi.useFakeTimers();
    const hung: Fetcher = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const ctx = { fetch: hung, now: () => new Date(), env: {} };
    const p = getJson(ctx, "https://api.github.com/x");
    const assertion = expect(p).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(UPSTREAM_TIMEOUT_MS + 1);
    await assertion;
  });
  it("maps a network error to 502", async () => {
    const ctx = { fetch: (async () => Promise.reject(new Error("boom"))) as Fetcher, now: () => new Date(), env: {} };
    await expect(getJson(ctx, "https://api.github.com/x")).rejects.toMatchObject({ status: 502 });
  });
});
