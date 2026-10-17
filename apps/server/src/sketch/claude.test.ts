import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GenerationError } from "../ai/claude";
import {
  MAX_SKETCH_IMAGE_BYTES,
  assertSketchImageSize,
  decodedBase64Bytes,
  generateSketchWithClaude,
  parseSketchImage,
  toBase64,
} from "./claude";

const PNG_HEAD = "iVBORw0KGgo=";

describe("parseSketchImage media types", () => {
  it.each([
    ["data:image/png;base64,", "image/png"],
    ["data:image/jpeg;base64,", "image/jpeg"],
    ["data:image/jpg;base64,", "image/jpeg"],
    ["data:image/webp;base64,", "image/webp"],
    ["data:image/gif;base64,", "image/gif"],
  ])("maps %s to its media type", (prefix, mediaType) => {
    const out = parseSketchImage(`${prefix}${PNG_HEAD}`);
    expect(out).toEqual({ mediaType, data: PNG_HEAD });
  });

  it("treats a bare base64 string as png", () => {
    expect(parseSketchImage(PNG_HEAD)).toEqual({ mediaType: "image/png", data: PNG_HEAD });
  });

  it("strips whitespace inside the payload", () => {
    expect(parseSketchImage(`data:image/webp;base64,iVBO\nRw0K  Gg==`).data).toBe("iVBORw0KGg==");
  });

  it("refuses other data URL types with 415", () => {
    for (const bad of ["data:image/svg+xml;base64,PHN2Zy8+", "data:image/bmp;base64,Qk0=", "data:text/plain;base64,aGk="]) {
      expect(() => parseSketchImage(bad)).toThrow(GenerationError);
      try {
        parseSketchImage(bad);
      } catch (err) {
        expect((err as GenerationError).status).toBe(415);
      }
    }
  });

  it("refuses a data URL that is not base64-encoded", () => {
    expect(() => parseSketchImage("data:image/png,rawbytes")).toThrow(GenerationError);
  });

  it("toBase64 returns the payload for every accepted type", () => {
    expect(toBase64(`data:image/jpeg;base64,${PNG_HEAD}`)).toBe(PNG_HEAD);
    expect(toBase64(`data:image/gif;base64,${PNG_HEAD}`)).toBe(PNG_HEAD);
    expect(toBase64(PNG_HEAD)).toBe(PNG_HEAD);
  });
});

describe("decodedBase64Bytes", () => {
  it("computes decoded length from length and padding", () => {
    expect(decodedBase64Bytes("AAAA")).toBe(3);
    expect(decodedBase64Bytes("AAA=")).toBe(2);
    expect(decodedBase64Bytes("AA==")).toBe(1);
    expect(decodedBase64Bytes("")).toBe(0);
  });
});

describe("assertSketchImageSize", () => {
  it("accepts an image at or under 5 MiB decoded", () => {
    expect(MAX_SKETCH_IMAGE_BYTES).toBe(5 * 1024 * 1024);
    // 4 * 1747626 chars decode to 5242878 bytes, just under the limit.
    expect(() => assertSketchImageSize(`data:image/png;base64,${"A".repeat(4 * 1747626)}`)).not.toThrow();
  });

  it("rejects an image over 5 MiB decoded with 413", () => {
    // 4 * 1747627 chars decode to 5242881 bytes, one step over the limit.
    const image = `data:image/png;base64,${"A".repeat(4 * 1747627)}`;
    expect(() => assertSketchImageSize(image)).toThrow(GenerationError);
    try {
      assertSketchImageSize(image);
    } catch (err) {
      expect((err as GenerationError).status).toBe(413);
    }
  });

  it("measures the decoded size, not the encoded length", () => {
    // Encoded length is over 5 MiB, decoded size is under it.
    const encoded = "A".repeat(4 * 1747626 - 4) + "QQ==";
    expect(encoded.length).toBeGreaterThan(MAX_SKETCH_IMAGE_BYTES);
    expect(() => assertSketchImageSize(encoded)).not.toThrow();
  });
});

describe("generateSketchWithClaude guards run before Anthropic", () => {
  let savedKey: string | undefined;
  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY; // without the guard, this would fail with 503 instead
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  });

  it("returns 413 for an oversize image before the client is built", async () => {
    const req = { image: `data:image/png;base64,${"A".repeat(4 * 1747627)}`, shapes: [] };
    await expect(generateSketchWithClaude(req)).rejects.toMatchObject({ status: 413 });
  });

  it("returns 415 for an unsupported image type before the client is built", async () => {
    const req = { image: "data:image/svg+xml;base64,PHN2Zy8+", shapes: [] };
    await expect(generateSketchWithClaude(req)).rejects.toMatchObject({ status: 415 });
  });
});
