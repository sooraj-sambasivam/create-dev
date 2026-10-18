import { MongoClient } from "mongodb";
import { isServerless } from "../runtime";

/** Fail fast when Mongo is unreachable instead of letting requests hang for the driver's ~30s default. */
const SERVER_SELECTION_TIMEOUT_MS = 5000;

let shared: { uri: string; promise: Promise<MongoClient> } | null = null;

/** One connected client per process, shared by every store. A failed connect is not cached. */
export function getMongoClient(uri: string): Promise<MongoClient> {
  if (shared && shared.uri === uri) return shared.promise;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS });
  const promise = client.connect().then(
    () => client,
    async (err) => {
      await client.close().catch(() => {});
      throw err;
    },
  );
  const entry = { uri, promise };
  shared = entry;
  promise.catch(() => {
    if (shared === entry) shared = null;
  });
  return promise;
}

/** Test hook: forget the shared client and the one-time warning. */
export function resetMongoForTests(): void {
  shared = null;
  warned = false;
}

let warned = false;

/** On Vercel without MONGODB_URI the file stores fall back to /tmp, which is lost between instances. Warn once. */
export function warnIfEphemeral(env: NodeJS.ProcessEnv = process.env): void {
  if (warned || !(isServerless || env.VERCEL) || env.MONGODB_URI?.trim()) return;
  warned = true;
  console.warn("[store] MONGODB_URI is not set on Vercel: prototypes and form submissions are kept in /tmp and will be lost.");
}
