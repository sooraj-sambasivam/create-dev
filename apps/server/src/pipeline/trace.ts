import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PipelineTraceSchema, type PipelineTrace } from "@create/shared";

/** apps/server/.traces (gitignored). TRACE_DIR overrides it. */
export function traceDir(override?: string): string {
  return override ?? process.env.TRACE_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.traces");
}

const dayStamp = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");

/** Appends one JSON line. Never throws: a trace failure must not fail the request. Skipped on read-only hosts. */
export async function writeTrace(trace: PipelineTrace, dir?: string): Promise<boolean> {
  if (process.env.VERCEL) return false;
  try {
    const d = traceDir(dir);
    await mkdir(d, { recursive: true });
    await appendFile(path.join(d, `pipeline-${dayStamp(trace.startedAt)}.jsonl`), JSON.stringify(trace) + "\n");
    return true;
  } catch (err) {
    console.warn("[trace] write failed:", err instanceof Error ? err.message : "unknown");
    return false;
  }
}

/** Newest-first traces across day files. */
export async function readTraces(limit: number, dir?: string): Promise<PipelineTrace[]> {
  const d = traceDir(dir);
  let files: string[];
  try {
    files = (await readdir(d)).filter((f) => /^pipeline-\d{8}\.jsonl$/.test(f)).sort().reverse();
  } catch {
    return [];
  }
  const out: PipelineTrace[] = [];
  for (const f of files) {
    const lines = (await readFile(path.join(d, f), "utf8")).split("\n").filter(Boolean).reverse();
    for (const line of lines) {
      try {
        const parsed = PipelineTraceSchema.safeParse(JSON.parse(line));
        if (parsed.success) out.push(parsed.data);
      } catch {
        // skip a corrupt line
      }
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export const newTraceId = (): string => `tr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Appends client-side stage timings (extension, web) to client-YYYYMMDD.jsonl next to the pipeline traces. Never throws. */
export async function writeClientTrace(entry: { source: string; traceId?: string; stages: unknown[] }, dir?: string): Promise<boolean> {
  if (process.env.VERCEL) return false;
  try {
    const d = traceDir(dir);
    await mkdir(d, { recursive: true });
    const at = Date.now();
    await appendFile(path.join(d, `client-${dayStamp(at)}.jsonl`), JSON.stringify({ at, ...entry }) + "\n");
    return true;
  } catch (err) {
    console.warn("[trace] client write failed:", err instanceof Error ? err.message : "unknown");
    return false;
  }
}
