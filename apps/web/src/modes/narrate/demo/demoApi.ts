import { z } from "zod";
import { ScreenSchema, type DemoChunk, type NarrationSession, type Screen } from "@create/shared";

/** The finished demo, as the client keeps it after the stream's `result` chunk. */
export type DemoOutcome = {
  summary: string;
  screen: Screen;
  mock: boolean;
};

/** Local mirror of the DemoChunk contract (shared exports only the TypeScript type). */
const DemoChunkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("step"), label: z.string(), pct: z.number() }),
  z.object({ type: z.literal("result"), summary: z.string(), screen: ScreenSchema, mock: z.boolean() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

/**
 * Incremental NDJSON reader. Input can split a line across network reads, so the
 * unfinished tail is kept in a buffer until its newline arrives. Blank lines are skipped.
 * `onValue` receives each parsed JSON value; a malformed line throws.
 */
export function createNdjsonReader(onValue: (value: unknown) => void) {
  let buffer = "";

  const emit = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch {
      throw new Error("Demo stream sent a malformed line");
    }
    onValue(value);
  };

  return {
    /** Feed the next text fragment from the stream. */
    push(text: string) {
      buffer += text;
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        emit(line);
        newline = buffer.indexOf("\n");
      }
    },
    /** Call once the stream ends; flushes a final line that had no trailing newline. */
    end() {
      const rest = buffer;
      buffer = "";
      emit(rest);
    },
  };
}

async function readErrorMessage(res: Response): Promise<string> {
  const fallback = `Demo request failed (${res.status})`;
  try {
    const data = (await res.json()) as { error?: unknown };
    return typeof data.error === "string" && data.error ? data.error : fallback;
  } catch {
    return fallback;
  }
}

/**
 * POST /api/demo and stream DemoChunk NDJSON lines to `onChunk`.
 * Resolves with the `result` chunk. Rejects when the request fails, the stream sends an
 * `error` chunk or a malformed/unknown line, the stream ends without a `result`, or `signal` aborts.
 */
export async function generateDemo(
  session: NarrationSession,
  screen: Screen | null | undefined,
  onChunk: (chunk: DemoChunk) => void,
  signal?: AbortSignal,
): Promise<DemoOutcome> {
  const res = await fetch("/api/demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session, screen: screen ?? null }),
    signal,
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));

  let outcome: DemoOutcome | null = null;
  const handleValue = (value: unknown) => {
    const parsed = DemoChunkSchema.safeParse(value);
    if (!parsed.success) throw new Error("Demo stream sent an unexpected message");
    const chunk = parsed.data as DemoChunk;
    if (chunk.type === "error") throw new Error(chunk.message || "Demo generation failed");
    onChunk(chunk);
    if (chunk.type === "result") {
      outcome = { summary: chunk.summary, screen: chunk.screen, mock: chunk.mock };
    }
  };

  const reader = createNdjsonReader(handleValue);
  if (!res.body) {
    reader.push(await res.text());
    reader.end();
  } else {
    const streamReader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await streamReader.read();
      if (done) break;
      reader.push(decoder.decode(value, { stream: true }));
    }
    reader.push(decoder.decode());
    reader.end();
  }

  if (!outcome) throw new Error("Demo stream ended without a result");
  return outcome;
}
