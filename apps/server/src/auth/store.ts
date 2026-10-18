import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { dataDir } from "../runtime";
import { getMongoClient } from "../store/mongo";

export type UserRecord = { id: string; email: string; name?: string; passwordHash: string; createdAt: string };

export interface UserStore {
  byEmail(email: string): Promise<UserRecord | null>;
  byId(id: string): Promise<UserRecord | null>;
  /** Throws DuplicateEmailError when the email is taken. */
  create(input: { email: string; name?: string; passwordHash: string }): Promise<UserRecord>;
}

export class DuplicateEmailError extends Error {
  constructor() {
    super("Email already registered");
    this.name = "DuplicateEmailError";
  }
}

/** In-memory store for tests. */
export class MemoryUserStore implements UserStore {
  private users: UserRecord[] = [];
  async byEmail(email: string) { return this.users.find((u) => u.email === email) ?? null; }
  async byId(id: string) { return this.users.find((u) => u.id === id) ?? null; }
  async create(input: { email: string; name?: string; passwordHash: string }) {
    if (this.users.some((u) => u.email === input.email)) throw new DuplicateEmailError();
    const u: UserRecord = { id: randomUUID(), createdAt: new Date().toISOString(), ...input };
    this.users.push(u);
    return u;
  }
}

/** apps/server/.data/users.json, rewritten atomically (temp file then rename), writes serialized. */
export class FileUserStore implements UserStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly file: string = join(dataDir("data"), "users.json")) {}

  private async read(): Promise<UserRecord[]> {
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as unknown;
      return Array.isArray(parsed) ? (parsed as UserRecord[]) : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async byEmail(email: string) { return (await this.read()).find((u) => u.email === email) ?? null; }
  async byId(id: string) { return (await this.read()).find((u) => u.id === id) ?? null; }

  create(input: { email: string; name?: string; passwordHash: string }): Promise<UserRecord> {
    const run = async () => {
      const users = await this.read();
      if (users.some((u) => u.email === input.email)) throw new DuplicateEmailError();
      const u: UserRecord = { id: randomUUID(), createdAt: new Date().toISOString(), ...input };
      users.push(u);
      await mkdir(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(users, null, 2), { mode: 0o600 });
      await rename(tmp, this.file);
      return u;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }
}

/** Mongo collection `users` with a unique index on email. */
export class MongoUserStore implements UserStore {
  constructor(private readonly uri: string) {}
  private async col() {
    const client = await getMongoClient(this.uri);
    const col = client.db().collection<UserRecord>("users");
    await col.createIndex({ email: 1 }, { unique: true });
    await col.createIndex({ id: 1 }, { unique: true });
    return col;
  }
  async byEmail(email: string) { return (await (await this.col()).findOne({ email }, { projection: { _id: 0 } })) as UserRecord | null; }
  async byId(id: string) { return (await (await this.col()).findOne({ id }, { projection: { _id: 0 } })) as UserRecord | null; }
  async create(input: { email: string; name?: string; passwordHash: string }) {
    const u: UserRecord = { id: randomUUID(), createdAt: new Date().toISOString(), ...input };
    try {
      await (await this.col()).insertOne({ ...u });
    } catch (err) {
      if ((err as { code?: unknown }).code === 11000) throw new DuplicateEmailError();
      throw err;
    }
    return u;
  }
}

export function defaultUserStore(env: NodeJS.ProcessEnv = process.env): UserStore {
  const uri = env.MONGODB_URI?.trim();
  return uri ? new MongoUserStore(uri) : new FileUserStore();
}
