import { describe, expect, it } from "vitest";
import { askHistory } from "./askHistory";

describe("askHistory", () => {
  it("maps entries to user/assistant turns and skips prompt-less edits", () => {
    expect(
      askHistory([
        { prompt: "a page", summary: "Built it", kind: "page" },
        { prompt: "(edited)", summary: "Moved a card" },
        { prompt: "what is 4.9?", summary: "A rating.", kind: "answer" },
      ]),
    ).toEqual([
      { role: "user", text: "a page" },
      { role: "assistant", text: "Built it" },
      { role: "assistant", text: "Moved a card" },
      { role: "user", text: "what is 4.9?" },
      { role: "assistant", text: "A rating." },
    ]);
  });
  it("keeps only the last 10 turns and clamps long text", () => {
    const h = Array.from({ length: 8 }, (_, i) => ({ prompt: `q${i}`, summary: "x".repeat(5000) }));
    const t = askHistory(h);
    expect(t).toHaveLength(10);
    expect(t[0]).toMatchObject({ role: "user", text: "q3" });
    expect(t[1].text).toHaveLength(4000);
  });
});
