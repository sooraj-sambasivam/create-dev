import { afterEach, describe, expect, it } from "vitest";
import { GenerationError } from "../ai/claude";
import { getVisionProvider, resolveVisionProviderId } from "./registry";

const KEYS = ["VISION_PROVIDER", "PERCEPTRON_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "XAI_API_KEY", "GROK_API_KEY"] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("resolveVisionProviderId", () => {
  it("defaults to perceptron when its key is set", () => {
    delete process.env.VISION_PROVIDER;
    process.env.PERCEPTRON_API_KEY = "pk";
    expect(resolveVisionProviderId()).toBe("perceptron");
    expect(getVisionProvider().id).toBe("perceptron");
  });

  it("defaults to anthropic when perceptron has no key", () => {
    delete process.env.VISION_PROVIDER;
    delete process.env.PERCEPTRON_API_KEY;
    expect(resolveVisionProviderId()).toBe("anthropic");
    expect(getVisionProvider().id).toBe("anthropic");
  });

  it("lets VISION_PROVIDER override the default", () => {
    process.env.PERCEPTRON_API_KEY = "pk";
    process.env.VISION_PROVIDER = "OpenAI";
    expect(resolveVisionProviderId()).toBe("openai");
    expect(getVisionProvider().id).toBe("openai");
  });

  it("rejects an unknown provider", () => {
    process.env.VISION_PROVIDER = "nope";
    expect(() => resolveVisionProviderId()).toThrow(GenerationError);
    try {
      resolveVisionProviderId();
    } catch (err) {
      expect((err as GenerationError).status).toBe(400);
    }
  });
});
