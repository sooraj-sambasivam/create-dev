import { describe, expect, it } from "vitest";
import { isAgentRowCommand } from "./command";

describe("isAgentRowCommand", () => {
  it.each([
    "add a row for me",
    "Can you add the next row for me?",
    "let the agent do it",
    "have the agent add one",
    "do it for me",
    "fill in the form for me",
    "put another entry in there for me please",
  ])("takes %s", (t) => expect(isAgentRowCommand(t)).toBe(true));

  it.each([
    "add a row",
    "make this heading bigger",
    "what is this table",
    "for me the heading should be blue",
    "",
    "a".repeat(300),
  ])("leaves %s alone", (t) => expect(isAgentRowCommand(t)).toBe(false));
});
