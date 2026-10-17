import { afterEach, describe, expect, it, vi } from "vitest";
import { mockGenerate, type DemoChunk, type NarrationSession } from "@create/shared";
import { createNdjsonReader, generateDemo } from "./demoApi";

const screen = mockGenerate("a landing page").screen;
const session: NarrationSession = {
  id: "s1",
  context: "page",
  startedAt: 0,
  events: [],
  snapshots: [],
};

const resultLine = (summary = "Built it") =>
  JSON.stringify({ type: "result", summary, screen, mock: true });

function streamOf(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}

function stubFetch(response: Response) {
  const fn = vi.fn(async () => response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createNdjsonReader", () => {
  it("parses lines that arrive split across fragments", () => {
    const values: unknown[] = [];
    const reader = createNdjsonReader((v) => values.push(v));
    reader.push('{"a":1}\n{"b"');
    reader.push(':2}\n{"c":');
    reader.push("3}\n");
    reader.end();
    expect(values).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it("flushes a final line that has no trailing newline on end()", () => {
    const values: unknown[] = [];
    const reader = createNdjsonReader((v) => values.push(v));
    reader.push('{"x":true}');
    expect(values).toEqual([]);
    reader.end();
    expect(values).toEqual([{ x: true }]);
  });

  it("skips blank lines and handles CRLF endings", () => {
    const values: unknown[] = [];
    const reader = createNdjsonReader((v) => values.push(v));
    reader.push('\n{"n":1}\r\n\n   \n{"n":2}\r\n');
    reader.end();
    expect(values).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("throws on a malformed line", () => {
    const reader = createNdjsonReader(() => {});
    expect(() => reader.push("{not json}\n")).toThrow("malformed line");
  });
});

describe("generateDemo", () => {
  it("posts session and screen to /api/demo and resolves with the result", async () => {
    const fetchMock = stubFetch(
      new Response(
        streamOf([
          '{"type":"step","label":"Reading the session","pct":10}\n',
          '{"type":"step","label":"Drafting pages","pct":60}\n',
          `${resultLine("Demo ready")}\n`,
        ]),
        { status: 200 },
      ),
    );
    const chunks: DemoChunk[] = [];

    const outcome = await generateDemo(session, screen, (c) => chunks.push(c));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/demo");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ session, screen });
    expect(chunks.map((c) => c.type)).toEqual(["step", "step", "result"]);
    expect(outcome).toEqual({ summary: "Demo ready", screen, mock: true });
  });

  it("sends screen as null when none is loaded", async () => {
    const fetchMock = stubFetch(new Response(streamOf([`${resultLine()}\n`]), { status: 200 }));
    await generateDemo(session, null, () => {});
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ session, screen: null });
  });

  it("reassembles lines split across network reads", async () => {
    const line = `${JSON.stringify({ type: "step", label: "Splitting", pct: 30 })}\n${resultLine()}\n`;
    const parts = [line.slice(0, 7), line.slice(7, 40), line.slice(40)];
    stubFetch(new Response(streamOf(parts), { status: 200 }));
    const labels: string[] = [];
    await generateDemo(session, screen, (c) => {
      if (c.type === "step") labels.push(c.label);
    });
    expect(labels).toEqual(["Splitting"]);
  });

  it("accepts a final result line without a trailing newline", async () => {
    stubFetch(new Response(streamOf([resultLine("Tail")]), { status: 200 }));
    const outcome = await generateDemo(session, screen, () => {});
    expect(outcome.summary).toBe("Tail");
  });

  it("rejects with the stream's error message and stops", async () => {
    stubFetch(
      new Response(
        streamOf(['{"type":"step","label":"Start","pct":5}\n', '{"type":"error","message":"Model timed out"}\n']),
        { status: 200 },
      ),
    );
    const chunks: DemoChunk[] = [];
    await expect(generateDemo(session, screen, (c) => chunks.push(c))).rejects.toThrow("Model timed out");
    expect(chunks.map((c) => c.type)).toEqual(["step"]);
  });

  it("rejects when the stream ends without a result", async () => {
    stubFetch(new Response(streamOf(['{"type":"step","label":"Only step","pct":20}\n']), { status: 200 }));
    await expect(generateDemo(session, screen, () => {})).rejects.toThrow("ended without a result");
  });

  it("rejects with the server error for a non-ok response", async () => {
    stubFetch(
      new Response(JSON.stringify({ error: "Session too long" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(generateDemo(session, screen, () => {})).rejects.toThrow("Session too long");
  });

  it("falls back to a status message when the error body is not JSON", async () => {
    stubFetch(new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(generateDemo(session, screen, () => {})).rejects.toThrow("Demo request failed (502)");
  });

  it("rejects on an unexpected chunk shape", async () => {
    stubFetch(new Response(streamOf(['{"type":"step","label":"No pct"}\n']), { status: 200 }));
    await expect(generateDemo(session, screen, () => {})).rejects.toThrow("unexpected message");
  });

  it("rejects when the signal aborts before the response", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      }),
    );
    const pending = generateDemo(session, screen, () => {}, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow("Aborted");
  });
});
