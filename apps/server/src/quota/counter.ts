import { getMongoClient } from "../store/mongo";

/** Atomic "take one if under the limit" counter keyed by string. */
export interface Counter {
  /** Returns the count after the attempt; ok=false means the limit was already reached (nothing taken). */
  take(key: string, limit: number, expiresAt: number): Promise<{ ok: boolean; used: number }>;
  peek(key: string): Promise<number>;
}

export class MemoryCounter implements Counter {
  private counts = new Map<string, { n: number; exp: number }>();
  private sweep(now = Date.now()) {
    if (this.counts.size < 5000) return;
    for (const [k, v] of this.counts) if (v.exp <= now) this.counts.delete(k);
  }
  async take(key: string, limit: number, expiresAt: number) {
    this.sweep();
    const cur = this.counts.get(key) ?? { n: 0, exp: expiresAt };
    if (cur.n >= limit) return { ok: false, used: cur.n };
    cur.n += 1;
    this.counts.set(key, cur);
    return { ok: true, used: cur.n };
  }
  async peek(key: string) { return this.counts.get(key)?.n ?? 0; }
}

/** Collection `usage`; one document per key, expired by a TTL index. Works across serverless instances. */
export class MongoCounter implements Counter {
  constructor(private readonly uri: string) {}
  private async col() {
    const client = await getMongoClient(this.uri);
    const col = client.db().collection<{ _id: string; n: number; exp: Date }>("usage");
    await col.createIndex({ exp: 1 }, { expireAfterSeconds: 0 });
    return col;
  }
  async take(key: string, limit: number, expiresAt: number) {
    const col = await this.col();
    try {
      const doc = await col.findOneAndUpdate(
        { _id: key, n: { $lt: limit } },
        { $inc: { n: 1 }, $setOnInsert: { exp: new Date(expiresAt + 3600_000) } },
        { upsert: true, returnDocument: "after" },
      );
      return { ok: true, used: doc?.n ?? 1 };
    } catch (err) {
      // The upsert collides with the existing at-limit document.
      if ((err as { code?: unknown }).code === 11000) return { ok: false, used: limit };
      throw err;
    }
  }
  async peek(key: string) { return (await (await this.col()).findOne({ _id: key }))?.n ?? 0; }
}

export function defaultCounter(env: NodeJS.ProcessEnv = process.env): Counter {
  const uri = env.MONGODB_URI?.trim();
  return uri ? new MongoCounter(uri) : new MemoryCounter();
}
