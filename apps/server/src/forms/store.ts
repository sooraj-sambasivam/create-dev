import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient, type Collection } from "mongodb";
import type { FormSubmission, StoredSubmission } from "@create/shared";

/** Submissions per app kept and returned, newest first. */
export const MAX_SUBMISSIONS = 200;

export interface FormStore {
  add(appId: string, s: FormSubmission): Promise<StoredSubmission>;
  list(appId: string): Promise<StoredSubmission[]>;
}

const APP_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

/** True only for a short url-safe app id. Anything else is rejected before touching storage. */
export function isValidAppId(id: unknown): id is string {
  return typeof id === "string" && APP_ID_PATTERN.test(id);
}

function newSubmissionId(): string {
  return randomBytes(8).toString("hex");
}

const DEFAULT_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".data", "forms");

/** One JSON array per app: <dir>/<appId>.json, newest first, capped. Good for local dev without MongoDB. */
export class FileFormStore implements FormStore {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly dir: string = DEFAULT_DATA_DIR) {}

  private pathFor(appId: string): string {
    // Validate before building any path so a crafted id can never escape the directory.
    if (!isValidAppId(appId)) throw new Error("Invalid app id");
    return join(this.dir, `${appId}.json`);
  }

  async list(appId: string): Promise<StoredSubmission[]> {
    if (!isValidAppId(appId)) return [];
    try {
      return JSON.parse(await readFile(this.pathFor(appId), "utf8")) as StoredSubmission[];
    } catch (err) {
      if ((err as { code?: unknown }).code === "ENOENT") return [];
      throw err;
    }
  }

  /** Writes are serialized in-process so concurrent submits never lose each other. */
  add(appId: string, s: FormSubmission): Promise<StoredSubmission> {
    const run = this.chain.then(async () => {
      const path = this.pathFor(appId);
      const record: StoredSubmission = { ...s, id: newSubmissionId(), appId, createdAt: new Date().toISOString() };
      const next = [record, ...(await this.list(appId))].slice(0, MAX_SUBMISSIONS);
      await mkdir(this.dir, { recursive: true });
      const tmp = `${path}.${randomBytes(4).toString("hex")}.tmp`;
      await writeFile(tmp, JSON.stringify(next));
      await rename(tmp, path);
      return record;
    });
    this.chain = run.catch(() => {});
    return run;
  }
}

const SERVER_SELECTION_TIMEOUT_MS = 5000;

/** MongoDB collection "form_submissions" in database "create-dev". One client per process, connected lazily. */
export class MongoFormStore implements FormStore {
  private collectionPromise: Promise<Collection<StoredSubmission>> | null = null;

  constructor(
    private readonly uri: string,
    private readonly dbName = "create-dev",
  ) {}

  private collection(): Promise<Collection<StoredSubmission>> {
    if (!this.collectionPromise) {
      const attempt = (async () => {
        const client = new MongoClient(this.uri, { serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS });
        try {
          await client.connect();
          const col = client.db(this.dbName).collection<StoredSubmission>("form_submissions");
          await col.createIndex({ appId: 1, createdAt: -1 });
          return col;
        } catch (err) {
          await client.close().catch(() => {});
          throw err;
        }
      })();
      this.collectionPromise = attempt;
      attempt.catch(() => {
        if (this.collectionPromise === attempt) this.collectionPromise = null;
      });
    }
    return this.collectionPromise;
  }

  async add(appId: string, s: FormSubmission): Promise<StoredSubmission> {
    if (!isValidAppId(appId)) throw new Error("Invalid app id");
    const col = await this.collection();
    const record: StoredSubmission = { ...s, id: newSubmissionId(), appId, createdAt: new Date().toISOString() };
    await col.insertOne({ ...record });
    return record;
  }

  async list(appId: string): Promise<StoredSubmission[]> {
    if (!isValidAppId(appId)) return [];
    const col = await this.collection();
    return col
      .find({ appId }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(MAX_SUBMISSIONS)
      .toArray();
  }
}

/** MongoFormStore when MONGODB_URI is set, otherwise FileFormStore. */
export function createFormStore(env: NodeJS.ProcessEnv = process.env): FormStore {
  const uri = env.MONGODB_URI?.trim();
  return uri ? new MongoFormStore(uri) : new FileFormStore();
}
