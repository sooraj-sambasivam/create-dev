import { afterEach, describe, expect, it, vi } from "vitest";
import { deflateSync } from "node:zlib";
import { imageSize, judgeImage } from "./image";
import { extractEntity } from "../extract/extract";

function png(w: number, h: number): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  const head = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  const buf = Buffer.concat([head, Buffer.from("IHDR"), ihdr, Buffer.alloc(8), deflateSync(Buffer.alloc(1))]);
  return `data:image/png;base64,${buf.toString("base64")}`;
}
const reply = (noul: number, box = { top: 0.2, bottom: 0.8, left: 0.1, right: 0.9 }) =>
  vi.fn(async () => new Response(JSON.stringify({ answers: { present: { type: "noul", noul }, where: { type: "box", box, confidence: 0.17 } } })));

afterEach(() => {
  delete process.env.MOCK_AI;
  delete process.env.TYPESAFE_API_KEY;
  delete process.env.PERCEPTRON_API_KEY;
  vi.restoreAllMocks();
});

describe("jev image", () => {
  it("reads PNG size", () => {
    expect(imageSize(Buffer.from(png(640, 400).split(",")[1]!, "base64"))).toEqual({ width: 640, height: 400 });
  });
  it("sends the multipart shape and returns the box when present", async () => {
    const f = reply(0.95);
    const r = await judgeImage(png(640, 400), { fetchImpl: f as never, apiKey: "k" });
    expect(r).toMatchObject({ hasData: true, box: { top: 0.2, bottom: 0.8, left: 0.1, right: 0.9 } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect((init.headers as Record<string, string>)["TypeSafe-Danger-Zone-Images"]).toBe("true");
    const form = init.body as FormData;
    const req = JSON.parse(await (form.get("request") as Blob).text());
    expect(req.model).toBe("jev-1.14.0");
    expect(req.questions.present.instructions).toBe("Is there a data table or chart in `shot`?");
    expect(req.questions.where.instructions).toBe("Where is the table or chart in `shot`?");
    expect(form.get("img")).toBeTruthy();
  });
  it("drops the box when the answer is no", async () => {
    const r = await judgeImage(png(640, 400), { fetchImpl: reply(0.1) as never, apiKey: "k" });
    expect(r).toMatchObject({ hasData: false, box: null });
  });
  it("skips Jev outside 280-1568px and without a key", async () => {
    const f = reply(0.9);
    expect(await judgeImage(png(200, 400), { fetchImpl: f as never, apiKey: "k" })).toBeNull();
    expect(await judgeImage(png(2000, 900), { fetchImpl: f as never, apiKey: "k" })).toBeNull();
    expect(await judgeImage(png(640, 400), { fetchImpl: f as never })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it("returns null on HTTP error, junk and timeout", async () => {
    expect(await judgeImage(png(640, 400), { fetchImpl: vi.fn(async () => new Response("no", { status: 500 })) as never, apiKey: "k" })).toBeNull();
    expect(await judgeImage(png(640, 400), { fetchImpl: vi.fn(async () => new Response("{}")) as never, apiKey: "k" })).toBeNull();
    const hang = vi.fn((_u: string, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener("abort", () => rej(new Error("aborted")))));
    expect(await judgeImage(png(640, 400), { fetchImpl: hang as never, apiKey: "k", timeoutMs: 20 })).toBeNull();
  });
  it("extract adds jev and focus without blocking the chain; Jev failure keeps the result", async () => {
    process.env.MOCK_AI = "1";
    process.env.TYPESAFE_API_KEY = "k";
    const ok = await extractEntity(png(640, 400), "chart", { jevFetch: reply(0.9) as never });
    expect(ok.provider).toBe("mock");
    expect(ok.focus).toEqual({ top: 0.2, bottom: 0.8, left: 0.1, right: 0.9 });
    expect(ok.jev?.hasData).toBe(true);
    const bad = await extractEntity(png(640, 400), "chart", { jevFetch: vi.fn(async () => new Response("x", { status: 500 })) as never });
    expect(bad.provider).toBe("mock");
    expect(bad.jev).toBeUndefined();
  });
});
