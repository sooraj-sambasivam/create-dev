/**
 * Fixed live-data sources. Every source is code we wrote: it validates its params against an
 * allowlist, calls ONE fixed https host, and parses the reply into { value, display }.
 * Nothing here is model-written, and no user text ever picks the host.
 */

export type LiveId = "weather" | "github-stars" | "crypto-price" | "hn-top" | "time" | "youtube-views";

export type LiveParams = Record<string, string>;

export type LiveResult = { value: string | number; display: string; source: string };

export type LiveCatalogEntry = {
  id: LiveId;
  label: string;
  params: { name: string; example: string }[];
};

export const UPSTREAM_TIMEOUT_MS = 5000;

export class LiveError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type SourceContext = {
  fetch: Fetcher;
  now: () => Date;
  env: Record<string, string | undefined>;
};

type Source = {
  entry: LiveCatalogEntry;
  /** Returns the cleaned params (defaults filled in) or throws LiveError(400). */
  validate(params: LiveParams): LiveParams;
  load(params: LiveParams, ctx: SourceContext): Promise<LiveResult>;
};

const bad = (msg: string) => new LiveError(400, msg);

function only(params: LiveParams, allowed: string[]): void {
  for (const k of Object.keys(params)) {
    if (!allowed.includes(k)) throw bad(`Unknown parameter "${k.slice(0, 30)}".`);
  }
}

function field(params: LiveParams, name: string, re: RegExp, max: number, fallback?: string): string {
  const raw = params[name] ?? fallback;
  if (raw === undefined || raw === "") throw bad(`Missing parameter "${name}".`);
  if (raw.length > max) throw bad(`Parameter "${name}" is too long (max ${max}).`);
  if (!re.test(raw)) throw bad(`Parameter "${name}" has characters that are not allowed.`);
  return raw;
}

/**
 * Fixed-host GET with a hard timeout. Redirects are refused outright, so an upstream can never
 * bounce us to a private address.
 */
export async function getJson(ctx: SourceContext, url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await ctx.fetch(url, {
      signal: controller.signal,
      redirect: "error",
      headers: { Accept: "application/json", "User-Agent": "create-dev-live/1.0", ...headers },
    });
    if (res.status === 404) throw new LiveError(404, "The source could not find that.");
    if (res.status === 403 || res.status === 429) throw new LiveError(502, "The data provider is rate limiting us. Try again soon.");
    if (!res.ok) throw new LiveError(502, `The data provider failed (${res.status}).`);
    return await res.json();
  } catch (err) {
    if (err instanceof LiveError) throw err;
    if (controller.signal.aborted) throw new LiveError(504, "The data provider took too long to answer.");
    throw new LiveError(502, "Could not reach the data provider.");
  } finally {
    clearTimeout(timer);
  }
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const unreadable = () => new LiveError(502, "The data provider sent something unexpected.");

const nf = new Intl.NumberFormat("en-US");

/** WMO weather interpretation codes -> short words. */
export function weatherWords(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return "Unsettled";
}

export function parseGeocode(data: unknown): { name: string; lat: number; lon: number } {
  const first = rec(Array.isArray(rec(data).results) ? (rec(data).results as unknown[])[0] : undefined);
  const lat = num(first.latitude);
  const lon = num(first.longitude);
  const name = str(first.name);
  if (lat === null || lon === null || !name) throw new LiveError(404, "No city matched that name.");
  return { name, lat, lon };
}

export function parseForecast(data: unknown, city: string): LiveResult {
  const cur = rec(rec(data).current);
  const c = num(cur.temperature_2m);
  const code = num(cur.weather_code);
  if (c === null) throw unreadable();
  const f = Math.round((c * 9) / 5 + 32);
  const rc = Math.round(c);
  const words = code === null ? "" : weatherWords(code);
  return {
    value: rc,
    display: `${city} ${rc}°C / ${f}°F${words ? `, ${words}` : ""}`,
    source: "open-meteo.com",
  };
}

export function parseStars(data: unknown, repo: string): LiveResult {
  const n = num(rec(data).stargazers_count);
  if (n === null) throw unreadable();
  return { value: n, display: `${nf.format(n)} stars`, source: `github.com/${repo}` };
}

export function parseCrypto(data: unknown, coin: string, currency: string): LiveResult {
  const n = num(rec(rec(data)[coin])[currency]);
  if (n === null) throw new LiveError(404, "No price found for that coin and currency.");
  const display = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase().slice(0, 3),
    maximumFractionDigits: n < 1 ? 6 : 2,
  });
  let shown: string;
  try {
    shown = display.format(n);
  } catch {
    shown = `${n} ${currency.toUpperCase()}`;
  }
  return { value: n, display: shown, source: "coingecko.com" };
}

export function parseHn(data: unknown): LiveResult {
  const d = rec(data);
  const title = str(d.title);
  const score = num(d.score);
  if (!title || score === null) throw unreadable();
  return { value: title, display: `${title} (${nf.format(score)} points)`, source: "news.ycombinator.com" };
}

export function formatTime(date: Date, tz: string): LiveResult {
  let text: string;
  try {
    text = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(date);
  } catch {
    throw bad("Unknown time zone.");
  }
  return { value: text, display: text, source: "system clock" };
}

export function parseYoutube(data: unknown): LiveResult {
  const items = rec(data).items;
  const stats = rec(rec(Array.isArray(items) ? items[0] : undefined).statistics);
  const raw = str(stats.viewCount);
  const n = raw === null ? null : Number(raw);
  if (n === null || !Number.isFinite(n)) throw new LiveError(404, "No video matched that id.");
  return { value: n, display: `${nf.format(n)} views`, source: "youtube.com" };
}

const NAME = /^[\p{L}\p{M}][\p{L}\p{M} .,'-]*$/u;

const weather: Source = {
  entry: { id: "weather", label: "Weather", params: [{ name: "city", example: "Seattle" }] },
  validate(p) {
    only(p, ["city"]);
    return { city: field(p, "city", NAME, 60) };
  },
  async load(p, ctx) {
    const geo = parseGeocode(
      await getJson(ctx, `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(p.city)}&count=1&language=en&format=json`),
    );
    const forecast = await getJson(
      ctx,
      `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=temperature_2m,weather_code`,
    );
    return parseForecast(forecast, geo.name);
  },
};

const githubStars: Source = {
  entry: {
    id: "github-stars",
    label: "GitHub stars",
    params: [
      { name: "owner", example: "vercel" },
      { name: "repo", example: "next.js" },
    ],
  },
  validate(p) {
    only(p, ["owner", "repo"]);
    const owner = field(p, "owner", /^[A-Za-z0-9](?:[A-Za-z0-9-]*)$/, 39);
    const repo = field(p, "repo", /^[A-Za-z0-9._-]+$/, 100);
    if (/^\.+$/.test(repo)) throw bad('Parameter "repo" has characters that are not allowed.');
    return { owner, repo };
  },
  async load(p, ctx) {
    const data = await getJson(ctx, `https://api.github.com/repos/${p.owner}/${p.repo}`, {
      Accept: "application/vnd.github+json",
    });
    return parseStars(data, `${p.owner}/${p.repo}`);
  },
};

const cryptoPrice: Source = {
  entry: {
    id: "crypto-price",
    label: "Crypto price",
    params: [
      { name: "coin", example: "bitcoin" },
      { name: "currency", example: "usd" },
    ],
  },
  validate(p) {
    only(p, ["coin", "currency"]);
    return {
      coin: field(p, "coin", /^[a-z0-9-]+$/, 50),
      currency: field(p, "currency", /^[a-z]{3,5}$/, 5, "usd"),
    };
  },
  async load(p, ctx) {
    const data = await getJson(
      ctx,
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(p.coin)}&vs_currencies=${encodeURIComponent(p.currency)}`,
    );
    return parseCrypto(data, p.coin, p.currency);
  },
};

const hnTop: Source = {
  entry: { id: "hn-top", label: "Hacker News top story", params: [] },
  validate(p) {
    only(p, []);
    return {};
  },
  async load(_p, ctx) {
    const ids = await getJson(ctx, "https://hacker-news.firebaseio.com/v0/topstories.json");
    const first = Array.isArray(ids) ? num(ids[0]) : null;
    if (first === null) throw unreadable();
    return parseHn(await getJson(ctx, `https://hacker-news.firebaseio.com/v0/item/${first}.json`));
  },
};

const time: Source = {
  entry: { id: "time", label: "Local time", params: [{ name: "tz", example: "America/Los_Angeles" }] },
  validate(p) {
    only(p, ["tz"]);
    const tz = field(p, "tz", /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/, 40, "UTC");
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
    } catch {
      throw bad("Unknown time zone.");
    }
    return { tz };
  },
  async load(p, ctx) {
    return formatTime(ctx.now(), p.tz);
  },
};

const youtubeViews: Source = {
  entry: { id: "youtube-views", label: "YouTube views", params: [{ name: "videoId", example: "dQw4w9WgXcQ" }] },
  validate(p) {
    only(p, ["videoId"]);
    return { videoId: field(p, "videoId", /^[A-Za-z0-9_-]{11}$/, 11) };
  },
  async load(p, ctx) {
    const key = ctx.env.YOUTUBE_API_KEY;
    if (!key) throw new LiveError(501, "YouTube views need a YOUTUBE_API_KEY on the server. Add one to turn this source on.");
    const data = await getJson(
      ctx,
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(p.videoId)}&key=${encodeURIComponent(key)}`,
    );
    return parseYoutube(data);
  },
};

export const SOURCES: Record<LiveId, Source> = {
  weather,
  "github-stars": githubStars,
  "crypto-price": cryptoPrice,
  "hn-top": hnTop,
  time,
  "youtube-views": youtubeViews,
};

export function isLiveId(id: string): id is LiveId {
  return Object.prototype.hasOwnProperty.call(SOURCES, id);
}

export const LIVE_CATALOG: LiveCatalogEntry[] = Object.values(SOURCES).map((s) => s.entry);
