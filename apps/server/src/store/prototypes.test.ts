import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mockGenerate } from "@create/shared";

// In-memory stand-in for the MongoDB driver. Each test sets the failures it wants via `state`.
const state = vi.hoisted(() => ({
  connectFailures: 0,
  createIndexFailures: 0,
  insertErrors: [] as unknown[],
  inserted: [] as Record<string, unknown>[],
  clientOptions: [] as Record<string, unknown>[],
  clientsOpened: 0,
  clientsClosed: 0,
  createIndexCalls: 0,
}));

vi.mock("mongodb", () => {
  class MongoClient {
    constructor(_uri: string, options: Record<string, unknown> = {}) {
      state.clientOptions.push(options);
      state.clientsOpened++;
    }
    async connect() {
      if (state.connectFailures > 0) {
        state.connectFailures--;
        throw new Error("connect failed");
      }
    }
    db() {
      return {
        collection: () => ({
          createIndex: async () => {
            state.createIndexCalls++;
            if (state.createIndexFailures > 0) {
              state.createIndexFailures--;
              throw new Error("createIndex failed");
            }
          },
          insertOne: async (doc: Record<string, unknown>) => {
            const next = state.insertErrors.shift();
            if (next !== undefined) throw next;
            state.inserted.push(doc);
          },
          findOne: async (filter: { id: string }) => state.inserted.find((d) => d.id === filter.id) ?? null,
        }),
      };
    }
    async close() {
      state.clientsClosed++;
    }
  }
  return { MongoClient };
});

// Imported after the mock is registered (vi.mock is hoisted, so a static import is fine).
const { FileStore, MongoStore, StoredDataError } = await import("./prototypes");
const { resetMongoForTests } = await import("./mongo");
const { MongoFormStore } = await import("../forms/store");

const screen = mockGenerate("Store test").screen;

function resetState() {
  state.connectFailures = 0;
  state.createIndexFailures = 0;
  state.insertErrors = [];
  state.inserted = [];
  state.clientOptions = [];
  state.clientsOpened = 0;
  state.clientsClosed = 0;
  state.createIndexCalls = 0;
}

beforeEach(() => {
  resetState();
  resetMongoForTests();
});

describe("MongoStore duplicate-key retry", () => {
  it("retries a save when Mongo reports a duplicate key (numeric code 11000)", async () => {
    const dup = Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
    state.insertErrors = [dup];
    const store = new MongoStore("mongodb://unused");

    const saved = await store.save({ title: "Dup", screen });

    expect(saved.title).toBe("Dup");
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]?.id).toBe(saved.id);
  });

  it("rethrows errors that are not duplicate keys", async () => {
    state.insertErrors = [Object.assign(new Error("write concern failed"), { code: 64 })];
    const store = new MongoStore("mongodb://unused");

    await expect(store.save({ title: "x", screen })).rejects.toThrow("write concern failed");
    expect(state.inserted).toHaveLength(0);
  });

  it("gives up after repeated collisions with a generic allocation error", async () => {
    state.insertErrors = Array.from({ length: 5 }, () => Object.assign(new Error("dup"), { code: 11000 }));
    const store = new MongoStore("mongodb://unused");

    await expect(store.save({ title: "x", screen })).rejects.toThrow("Could not allocate a unique prototype id");
  });
});

describe("MongoStore connection lifecycle", () => {
  it("uses a bounded server selection timeout", async () => {
    const store = new MongoStore("mongodb://unused");
    await store.save({ title: "t", screen });
    expect(state.clientOptions[0]?.serverSelectionTimeoutMS).toBe(5000);
  });

  it("recovers after createIndex fails: keeps the shared client and retries the index on the next call", async () => {
    state.createIndexFailures = 1;
    const store = new MongoStore("mongodb://unused");

    await expect(store.save({ title: "first", screen })).rejects.toThrow("createIndex failed");

    const second = await store.save({ title: "second", screen });
    expect(second.title).toBe("second");
    expect(state.clientsOpened).toBe(1);
    expect(state.createIndexCalls).toBe(2);
  });

  it("reuses one client for prototypes and form submissions", async () => {
    await new MongoStore("mongodb://unused").save({ title: "a", screen });
    await new MongoFormStore("mongodb://unused").add("app1", {} as never);
    expect(state.clientsOpened).toBe(1);
  });

  it("recovers after connect fails: closes the client and retries on the next call", async () => {
    state.connectFailures = 1;
    const store = new MongoStore("mongodb://unused");

    await expect(store.get("abcdefghij")).rejects.toThrow("connect failed");
    expect(state.clientsClosed).toBe(1);

    expect(await store.get("abcdefghij")).toBeNull();
    expect(state.clientsOpened).toBe(2);
  });

  it("shares one initialised client across concurrent calls", async () => {
    const store = new MongoStore("mongodb://unused");
    await Promise.all([store.save({ title: "a", screen }), store.save({ title: "b", screen })]);
    expect(state.clientsOpened).toBe(1);
    expect(state.createIndexCalls).toBe(1);
  });
});

describe("FileStore corrupt data", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "prototypes-store-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("throws a StoredDataError for a file that is not valid JSON", async () => {
    const store = new FileStore(dir);
    await writeFile(join(dir, "abcdefghij.json"), "{not json", "utf8");

    const err = await store.get("abcdefghij").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StoredDataError);
    expect((err as Error).message).not.toContain(dir);
  });
});
