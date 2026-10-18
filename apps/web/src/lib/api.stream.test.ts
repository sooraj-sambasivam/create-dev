import { afterEach, describe, expect, it, vi } from "vitest";
import { mockGenerate } from "@create/shared";
import { generateStream, readNdjsonLines } from "./api";

const enc = new TextEncoder();
function streamOf(chunks: Array<string | Uint8Array>): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(typeof ch === "string" ? enc.encode(ch) : ch);
      c.close();
    },
  });
}

async function lines(chunks: Array<string | Uint8Array>) {
  const out: string[] = [];
  await readNdjsonLines(streamOf(chunks), (l) => out.push(l));
  return out;
}

describe("readNdjsonLines", () => {
  const text = '{"a":1}\n{"b":"é\\n"}\r\n\n{"c":3}';
  const expected = ['{"a":1}', '{"b":"é\\n"}', '{"c":3}'];

  it("splits lines across chunks at every byte position (incl. multi-byte chars)", async () => {
    const bytes = enc.encode(text);
    for (let i = 0; i <= bytes.length; i++) {
      expect(await lines([bytes.slice(0, i), bytes.slice(i)])).toEqual(expected);
    }
  });

  it("handles one byte at a time and a missing trailing newline", async () => {
    const bytes = enc.encode(text);
    expect(await lines(Array.from(bytes, (b) => new Uint8Array([b])))).toEqual(expected);
  });
});

describe("generateStream", () => {
  afterEach(() => vi.unstubAllGlobals());
  const mock = mockGenerate("x");
  const ndjson = (chunks: string[]) =>
    new Response(streamOf(chunks), { headers: { "Content-Type": "application/x-ndjson" } });
  const frame = (f: unknown) => JSON.stringify(f) + "\n";

  it("sends stream:true, reports partials, resolves with done", async () => {
    const partial = { ...mock.screen, children: mock.screen.children.slice(0, 1) };
    const wire = frame({ type: "partial", screen: partial }) + frame({ type: "done", summary: "ok", screen: mock.screen });
    const fetchMock = vi.fn(async () => ndjson([wire.slice(0, 40), wire.slice(40, 400), wire.slice(400)]));
    vi.stubGlobal("fetch", fetchMock);
    const onPartial = vi.fn();
    const result = await generateStream({ prompt: "x" }, onPartial);
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).stream).toBe(true);
    expect(onPartial).toHaveBeenCalledTimes(1);
    expect(onPartial.mock.calls[0]![0].children).toHaveLength(1);
    expect(result.summary).toBe("ok");
    expect(result.screen.children).toHaveLength(mock.screen.children.length);
  });

  it("rejects on an error frame", async () => {
    vi.stubGlobal("fetch", async () => ndjson([frame({ type: "error", message: "too big" })]));
    await expect(generateStream({ prompt: "x" }, vi.fn())).rejects.toThrow("too big");
  });

  it("rejects when the stream ends without done", async () => {
    vi.stubGlobal("fetch", async () => ndjson([frame({ type: "partial", screen: mock.screen })]));
    await expect(generateStream({ prompt: "x" }, vi.fn())).rejects.toThrow(/closed/);
  });

  it("falls back to a plain JSON response (non-stream server or replay)", async () => {
    vi.stubGlobal("fetch", async () => Response.json(mock));
    const onPartial = vi.fn();
    expect((await generateStream({ prompt: "x" }, onPartial)).summary).toBe(mock.summary);
    expect(onPartial).not.toHaveBeenCalled();
  });

  it("surfaces JSON error bodies from non-ok responses", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: "no key" }, { status: 503 }));
    await expect(generateStream({ prompt: "x" }, vi.fn())).rejects.toThrow("no key");
  });
});
