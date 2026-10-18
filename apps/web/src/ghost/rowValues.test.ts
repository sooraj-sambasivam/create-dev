import { describe, expect, it } from "vitest";
import { deriveRowValues, nextCell } from "./rowValues";

describe("nextCell", () => {
  it("continues a clock series by its step, keeping the format", () => {
    expect(nextCell("Time", ["9:00 AM", "9:30 AM", "10:00 AM"])).toBe("10:30 AM");
    expect(nextCell("Time", ["11:30 AM", "12:00 PM"])).toBe("12:30 PM");
    expect(nextCell("Time", ["09:00", "10:00"])).toBe("11:00");
    expect(nextCell("Time", ["11:30 PM"])).toBe("12:00 AM");
  });
  it("makes a fresh email on the same domain", () => {
    expect(nextCell("Email", ["ada@example.com", "ben@example.com"])).toBe("guest3@example.com");
  });
  it("continues prices and keeps the unit", () => {
    expect(nextCell("Price", ["$9/mo", "$19/mo", "$29/mo"])).toBe("$39/mo");
    expect(nextCell("Price", ["4.50", "5.00"])).toBe("5.50");
    expect(nextCell("Qty", ["5"])).toBe("6");
  });
  it("increments labelled counters and walks tier names", () => {
    expect(nextCell("Stop", ["Stop 1", "Stop 2"])).toBe("Stop 3");
    expect(nextCell("Name", ["Starter", "Team", "Business"])).toBe("Premium");
  });
  it("keeps a category column steady and falls back safely", () => {
    expect(nextCell("Status", ["Open", "Open", "Closed", "Open"])).toBe("Open");
    expect(nextCell("Name", [])).toBe("New entry");
    expect(nextCell("Features", ["1 workspace; 3 collaborators; Email"])).toBe("1 workspace; 3 collaborators");
  });
  it("does not treat mixed units as a series", () => {
    expect(nextCell("Price", ["Free", "$9/mo"])).toBe("$9/mo");
  });
});

describe("deriveRowValues", () => {
  const cols = ["Name", "Price", "Features"];
  const rows = [
    ["Starter", "$9/mo", "1 workspace"],
    ["Team", "$19/mo", "5 workspaces"],
  ];
  it("matches fields to columns by label", () => {
    const v = deriveRowValues(cols, rows, ["Price", "Name", "Features"]);
    expect(v[0]).toBe("$29/mo");
    expect(v[1]).toBe("Pro");
    expect(v).toHaveLength(3);
  });
  it("falls back to position and to a placeholder for extra fields", () => {
    const v = deriveRowValues(["Time", "Stop"], [["9:00", "Stop 1"], ["9:30", "Stop 2"]], ["When", "Where", "Extra"]);
    expect(v).toEqual(["10:00", "Stop 3", "New"]);
  });
});
