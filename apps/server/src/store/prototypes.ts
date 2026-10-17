import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient, type Collection } from "mongodb";
import type { Screen, SharedPrototype } from "@create/shared";

/** What a caller provides; the store assigns the id and timestamp. */
export type NewPrototype = { title: string; screen: Screen };

export interface PrototypeStore {
  save(p: NewPrototype): Promise<SharedPrototype>;
  get(id: string): Promise<SharedPrototype | null>;
}

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const ID_LENGTH = 10;
const ID_PATTERN = /^[A-Za-z0-9_-]{10}$/;
const MAX_ID_ATTEMPTS = 5;

/** True only for a 10-char url-safe id. Anything else is rejected before touching storage. */
export function isValidPrototypeId(id: unknown): id is string {
  return typeof id === "string" && ID_PATTERN.test(id);
}

/** 10 url-safe chars. 64-symbol alphabet and 256 % 64 === 0, so the mapping has no modulo bias. */
export function newPrototypeId(): string {
  const bytes = randomBytes(ID_LENGTH);
  let id = "";
  for (const b of bytes) id += ID_ALPHABET[b & 63];
  return id;
}

/**
 * True when err carries the given error code. Node fs errors use string codes ("EEXIST"),
 * MongoServerError uses a number (11000), so both forms are compared by their string value.
 */
function isDuplicateError(err: unknown, code: string | number): boolean {
  if (typeof err !== "object" || err === null) return false;
  const actual = (err as { code?: unknown }).code;
  return (typeof actual === "string" || typeof actual === "number") && String(actual) === String(code);
}

/** The stored file or document exists but cannot be decoded. Callers should treat this as a server fault. */
export class StoredDataError extends Error {
  constructor(id: string, options?: ErrorOptions) {
    super(`Stored prototype ${id} is not valid JSON`, options);
    this.name = "StoredDataError";
  }
}

const DEFAULT_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".data", "prototypes");

/** One JSON file per prototype: <dir>/<id>.json. Good for local dev without MongoDB. */
export class FileStore implements PrototypeStore {
  constructor(private readonly dir: string = DEFAULT_DATA_DIR) {}

  private pathFor(id: string): string {
    // Validate before building any path so a crafted id can never escape the directory.
    if (!isValidPrototypeId(id)) throw new Error("Invalid prototype id");
    return join(this.dir, `${id}.json`);
  }

  async save(p: NewPrototype): Promise<SharedPrototype> {
    await mkdir(this.dir, { recursive: true });
    const createdAt = new Date().toISOString();
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
      const record: SharedPrototype = { id: newPrototypeId(), title: p.title, screen: p.screen, createdAt };
      try {
        // flag "wx" fails if the file exists, so an id collision never overwrites a prototype.
        await writeFile(this.pathFor(record.id), JSON.stringify(record), { flag: "wx" });
        return record;
      } catch (err) {
        if (!isDuplicateError(err, "EEXIST")) throw err;
      }
    }
    throw new Error("Could not allocate a unique prototype id");
  }

  async get(id: string): Promise<SharedPrototype | null> {
    if (!isValidPrototypeId(id)) return null;
    let raw: string;
    try {
      raw = await readFile(this.pathFor(id), "utf8");
    } catch (err) {
      if (isDuplicateError(err, "ENOENT")) return null;
      throw err;
    }
    try {
      return JSON.parse(raw) as SharedPrototype;
    } catch (err) {
      throw new StoredDataError(id, { cause: err });
    }
  }
}

type PrototypeDoc = SharedPrototype;

/** Fail fast when Mongo is unreachable instead of letting requests hang for the driver's ~30s default. */
const SERVER_SELECTION_TIMEOUT_MS = 5000;

/** MongoDB collection "prototypes" in database "create-dev". One client per process, connected lazily. */
export class MongoStore implements PrototypeStore {
  private collectionPromise: Promise<Collection<PrototypeDoc>> | null = null;

  constructor(
    private readonly uri: string,
    private readonly dbName = "create-dev",
  ) {}

  private collection(): Promise<Collection<PrototypeDoc>> {
    if (!this.collectionPromise) {
      const attempt = (async () => {
        const client = new MongoClient(this.uri, { serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS });
        try {
          await client.connect();
          const col = client.db(this.dbName).collection<PrototypeDoc>("prototypes");
          await col.createIndex({ id: 1 }, { unique: true });
          return col;
        } catch (err) {
          // Do not keep a half-initialised client alive; the next call starts from scratch.
          await client.close().catch(() => {});
          throw err;
        }
      })();
      this.collectionPromise = attempt;
      // Any failure (connect or createIndex) clears the cache so the next call retries.
      // Handlers run in registration order, so this reset runs before any caller's await sees the rejection.
      attempt.catch(() => {
        if (this.collectionPromise === attempt) this.collectionPromise = null;
      });
    }
    return this.collectionPromise;
  }

  async save(p: NewPrototype): Promise<SharedPrototype> {
    const col = await this.collection();
    const createdAt = new Date().toISOString();
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
      const record: SharedPrototype = { id: newPrototypeId(), title: p.title, screen: p.screen, createdAt };
      try {
        await col.insertOne({ ...record });
        return record;
      } catch (err) {
        // MongoServerError.code is the number 11000 for a duplicate key.
        if (!isDuplicateError(err, 11000)) throw err;
      }
    }
    throw new Error("Could not allocate a unique prototype id");
  }

  async get(id: string): Promise<SharedPrototype | null> {
    if (!isValidPrototypeId(id)) return null;
    const col = await this.collection();
    const doc = await col.findOne({ id }, { projection: { _id: 0, id: 1, title: 1, screen: 1, createdAt: 1 } });
    return doc ?? null;
  }
}

/** MongoStore when MONGODB_URI is set, otherwise FileStore. */
export function createPrototypeStore(env: NodeJS.ProcessEnv = process.env): PrototypeStore {
  const uri = env.MONGODB_URI?.trim();
  return uri ? new MongoStore(uri) : new FileStore();
}
