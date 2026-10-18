import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mockGenerate, type Screen, type SharedPrototype } from "@create/shared";
import {
  FileStore,
  isValidPrototypeId,
  newPrototypeId,
  createPrototypeStore,
  MongoStore,
  type PrototypeStore,
} from "../store/prototypes";
import {
  MAX_FILE_PROTOTYPES,
  SHARE_CREATE_PER_MINUTE,
  createShareRouter,
  describeStoreChoice,
  shareOrigin,
} from "./share";

const screen: Screen = mockGenerate("Coffee shop landing").screen;

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "prototypes-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("isValidPrototypeId", () => {
  it("accepts 10 url-safe characters", () => {
    expect(isValidPrototypeId("abcDEF0123")).toBe(true);
    expect(isValidPrototypeId("a-b_c-d_e-")).toBe(true);
  });

  it("rejects wrong length, bad characters and traversal attempts", () => {
    expect(isValidPrototypeId("abc")).toBe(false);
    expect(isValidPrototypeId("abcdefghijk")).toBe(false);
    expect(isValidPrototypeId("abc/def.jo")).toBe(false);
    expect(isValidPrototypeId("../../etc.x")).toBe(false);
    expect(isValidPrototypeId("..%2F..%2Fx")).toBe(false);
    expect(isValidPrototypeId("abcdefghi\n")).toBe(false);
    expect(isValidPrototypeId(undefined)).toBe(false);
    expect(isValidPrototypeId(42)).toBe(false);
  });

  it("generated ids are valid and distinct", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newPrototypeId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(isValidPrototypeId(id)).toBe(true);
  });
});

describe("FileStore", () => {
  it("saves a prototype and reads it back", async () => {
    const store = new FileStore(dir);
    const saved = await store.save({ title: "Cafe", screen });
    expect(isValidPrototypeId(saved.id)).toBe(true);
    expect(saved.title).toBe("Cafe");
    expect(Number.isNaN(Date.parse(saved.createdAt))).toBe(false);

    const again = await store.get(saved.id);
    expect(again).toEqual(saved);
    const raw = JSON.parse(await readFile(join(dir, `${saved.id}.json`), "utf8")) as SharedPrototype;
    expect(raw.id).toBe(saved.id);
  });

  it("returns null for an unknown id", async () => {
    const store = new FileStore(dir);
    expect(await store.get("abcdefghij")).toBeNull();
  });

  it("returns null without touching disk for a malformed id", async () => {
    const store = new FileStore(dir);
    expect(await store.get("../escape-probe")).toBeNull();
    expect(await store.get("../../etc/passwd")).toBeNull();
    expect(await store.get("")).toBeNull();
  });
});

describe("createPrototypeStore", () => {
  it("picks FileStore when MONGODB_URI is unset", () => {
    expect(createPrototypeStore({})).toBeInstanceOf(FileStore);
    expect(createPrototypeStore({ MONGODB_URI: "   " })).toBeInstanceOf(FileStore);
  });

  it("picks MongoStore when MONGODB_URI is set (no connection is made until used)", () => {
    expect(createPrototypeStore({ MONGODB_URI: "mongodb://127.0.0.1:1" })).toBeInstanceOf(MongoStore);
  });
});

describe("share routes", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = express();
    app.use("/api", createShareRouter(new FileStore(dir)));
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const post = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}/api/prototypes`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("POST returns id and a viewer url built from the request origin", async () => {
    const res = await post({ screen, title: "My page" }, { origin: "http://localhost:5174" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; url: string };
    expect(isValidPrototypeId(body.id)).toBe(true);
    expect(body.url).toBe(`http://localhost:5174/?p=${body.id}`);
  });

  it("POST falls back to PUBLIC_URL, then localhost:5173", async () => {
    const prev = process.env.PUBLIC_URL;
    try {
      process.env.PUBLIC_URL = "https://share.example.test/";
      const withEnv = (await (await post({ screen })).json()) as { id: string; url: string };
      expect(withEnv.url).toBe(`https://share.example.test/?p=${withEnv.id}`);

      delete process.env.PUBLIC_URL;
      const withDefault = (await (await post({ screen })).json()) as { id: string; url: string };
      expect(withDefault.url).toBe(`http://localhost:5173/?p=${withDefault.id}`);
    } finally {
      if (prev === undefined) delete process.env.PUBLIC_URL;
      else process.env.PUBLIC_URL = prev;
    }
  });

  it("POST rejects an invalid screen with 400", async () => {
    const res = await post({ screen: { title: "x", children: [{ type: "nope" }] } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBeTruthy();
  });

  it("POST rejects a missing body and malformed JSON with 400", async () => {
    expect((await post({})).status).toBe(400);
    const malformed = await post("{not json");
    expect(malformed.status).toBeGreaterThanOrEqual(400);
    expect(malformed.status).toBeLessThan(500);
  });

  it("GET returns the saved prototype", async () => {
    const created = (await (await post({ screen, title: "Saved" })).json()) as { id: string };
    const res = await fetch(`${base}/api/prototypes/${created.id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as SharedPrototype;
    expect(body.id).toBe(created.id);
    expect(body.title).toBe("Saved");
    expect(body.screen).toEqual(screen);
  });

  it("GET returns 404 for an unknown but well-formed id", async () => {
    const res = await fetch(`${base}/api/prototypes/abcdefghij`);
    expect(res.status).toBe(404);
  });

  it("GET returns 400 for a malformed id", async () => {
    const res = await fetch(`${base}/api/prototypes/bad.id`);
    expect(res.status).toBe(400);
  });
});

describe("share routes hide store failures", () => {
  const leaky = "MongoServerSelectionError: cluster0-shard-00.internal.example.net:27017 auth failed";
  let server: Server;
  let base: string;
  let failing: { save: boolean; get: boolean };
  let logged: unknown[];

  beforeAll(async () => {
    const store: PrototypeStore = {
      async save() {
        if (failing.save) throw new Error(leaky);
        throw new Error("unused");
      },
      async get() {
        if (failing.get) throw new Error(`EACCES: permission denied, open '/srv/app/.data/prototypes/x.json'`);
        return null;
      },
    };
    const app = express();
    app.use("/api", createShareRouter(store));
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    failing = { save: true, get: true };
    logged = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POST save failure returns a generic 500 and logs the real error server-side", async () => {
    const res = await fetch(`${base}/api/prototypes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ screen }),
    });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "Could not save prototype." });
    expect(text).not.toContain("cluster0");
    const loggedError = logged.flat().find((v): v is Error => v instanceof Error);
    expect(loggedError?.message).toContain("cluster0-shard-00");
  });

  it("GET store failure returns a generic 500 with no absolute server path", async () => {
    const res = await fetch(`${base}/api/prototypes/abcdefghij`);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "Could not load prototype." });
    expect(text).not.toContain("/srv/app");
    expect(text).not.toContain("EACCES");
    expect(logged.length).toBeGreaterThan(0);
  });
});

describe("share store choice and limits", () => {
  const fakeStore = (stored: number | (() => Promise<number>)) => {
    const save = vi.fn(async (p: { title: string; screen: Screen }) => ({
      id: newPrototypeId(),
      title: p.title,
      screen: p.screen,
      createdAt: new Date().toISOString(),
    }));
    const store: PrototypeStore & { count: () => Promise<number> } = {
      save,
      async get() {
        return null;
      },
      count: typeof stored === "number" ? async () => stored : stored,
    };
    return { store, save };
  };

  async function startRouter(store: PrototypeStore) {
    const app = express();
    app.use("/api", createShareRouter(store));
    const server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return { server, base };
  }

  const postTo = (base: string, body: unknown) =>
    fetch(`${base}/api/prototypes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  it("describeStoreChoice names the active store and never prints the URI", () => {
    const secretUri = "mongodb+srv://user:hunter2@cluster0.example.net/create-dev";
    const withMongo = describeStoreChoice({ MONGODB_URI: secretUri });
    expect(withMongo).toContain("MongoDB");
    expect(withMongo).not.toContain("hunter2");
    expect(withMongo).not.toContain("cluster0");
    expect(describeStoreChoice({})).toContain("local JSON files");
    expect(describeStoreChoice({ MONGODB_URI: "   " })).toContain("local JSON files");
  });

  it("returns 507 when the file store already holds 2000 prototypes, and does not save", async () => {
    const { store, save } = fakeStore(MAX_FILE_PROTOTYPES);
    const { server, base } = await startRouter(store);
    try {
      const res = await postTo(base, { screen });
      expect(res.status).toBe(507);
      expect(((await res.json()) as { error: string }).error).toBeTruthy();
      expect(save).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("still saves at 1999 prototypes", async () => {
    const { store, save } = fakeStore(MAX_FILE_PROTOTYPES - 1);
    const { server, base } = await startRouter(store);
    try {
      expect((await postTo(base, { screen })).status).toBe(200);
      expect(save).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("stores without a count are not capped", async () => {
    const { store, save } = fakeStore(async () => 0);
    delete (store as Partial<typeof store>).count;
    const { server, base } = await startRouter(store);
    try {
      expect((await postTo(base, { screen })).status).toBe(200);
      expect(save).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("limits share creation to 20 per minute per IP with 429", async () => {
    const { store } = fakeStore(0);
    const { server, base } = await startRouter(store);
    try {
      const statuses: number[] = [];
      for (let i = 0; i < SHARE_CREATE_PER_MINUTE + 1; i++) {
        statuses.push((await postTo(base, { screen })).status);
      }
      expect(statuses.slice(0, SHARE_CREATE_PER_MINUTE).every((s) => s === 200)).toBe(true);
      expect(statuses[SHARE_CREATE_PER_MINUTE]).toBe(429);
      const last = await postTo(base, { screen });
      expect(last.headers.get("retry-after")).toBeTruthy();
      expect(await last.json()).toEqual({ error: expect.any(String) });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe("shareOrigin", () => {
  it("prefers PUBLIC_URL over the request Origin and trims trailing slashes", () => {
    expect(shareOrigin("http://localhost:5173", { PUBLIC_URL: "https://x.trycloudflare.com/" })).toBe(
      "https://x.trycloudflare.com",
    );
  });

  it("falls back to the request Origin, then the dev client", () => {
    expect(shareOrigin("http://192.168.1.5:5173", {})).toBe("http://192.168.1.5:5173");
    expect(shareOrigin(undefined, { PUBLIC_URL: "  " })).toBe("http://localhost:5173");
  });
});
