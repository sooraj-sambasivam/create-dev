import { describe, expect, it } from "vitest";
import type { Screen } from "@create/shared";
import { deriveAppBackend, curlExample, hasBackend } from "./appBackend";
import { findForms } from "../../components/forms";

const screen = {
  title: "Cafe",
  theme: "light",
  font: "sans",
  children: [
    { id: "h", type: "heading", text: "Hi", level: 1 },
    { id: "l", type: "link", text: "Menu", href: "#menu" },
    { id: "d", type: "data", source: { route: "/weather" }, field: "display", format: "text", label: "Weather", fallback: "-", refreshSec: 60 },
    { id: "d2", type: "data", source: { route: "/mystery" }, field: "x", format: "text", fallback: "-" },
    {
      id: "f", type: "container", direction: "column", gap: "md", align: "stretch", justify: "start", padding: "none", background: "none", width: "full", wrap: false, overlay: "dark",
      children: [
        { id: "fh", type: "heading", text: "Join the list", level: 2 },
        { id: "e", type: "textbox", label: "Email", placeholder: "", multiline: false },
        { id: "e2", type: "textbox", label: "Email", placeholder: "", multiline: false },
        { id: "c", type: "checkbox", label: "Weekly news" },
        { id: "b", type: "button", label: "Sign up", variant: "primary" },
      ],
    },
    { id: "b2", type: "button", label: "Learn more", variant: "ghost", href: "https://x.test" },
  ],
} as unknown as Screen;

describe("deriveAppBackend", () => {
  it("is empty without a page", () => {
    expect(deriveAppBackend(null, { appId: "a" }).pages).toEqual([]);
  });
  it("finds forms with unique field names", () => {
    const [f] = findForms(screen);
    expect(f.id).toBe("f");
    expect(f.submitId).toBe("b");
    expect(f.fields.map((x) => x.name)).toEqual(["email", "email_e2", "weekly_news"]);
  });
  it("derives forms, data, actions, hosting and env", () => {
    const b = deriveAppBackend(screen, { appId: "app1", shareUrl: "http://x/?p=1" });
    expect(b.pages[0]).toMatchObject({ title: "Cafe", path: "/" });
    expect(b.forms[0]).toMatchObject({ label: "Join the list", endpoint: "/api/forms/app1", status: "connected" });
    expect(b.data.map((d) => d.status)).toEqual(["connected", "setup"]);
    expect(b.data[0].refreshSec).toBe(60);
    expect(b.actions.map((a) => a.kind)).toEqual(["link", "submit", "link"]);
    expect(b.actions[1].target).toBe("f");
    expect(b.hosting).toEqual({ shareUrl: "http://x/?p=1", published: true });
    expect(b.env).toEqual(["FORMS_API_URL"]);
  });
  it("marks live data as sample in mock mode", () => {
    expect(deriveAppBackend(screen, { appId: "a", mock: true }).data[0].status).toBe("sample");
  });
  it("builds a curl example", () => {
    const b = deriveAppBackend(screen, { appId: "a" });
    expect(curlExample(b.forms[0], "http://h")).toContain("http://h/api/forms/a");
  });
});

describe("hasBackend", () => {
  const page = (children: unknown[]) => ({ title: "t", theme: "light", font: "sans", children }) as unknown as Screen;
  it("is false without a page or with static content", () => {
    expect(hasBackend(null)).toBe(false);
    expect(hasBackend(page([{ id: "h", type: "heading", text: "Hi", level: 1 }, { id: "b", type: "button", label: "Go", variant: "ghost" }]))).toBe(false);
  });
  it("is true for forms, data nodes and form-fed tables or charts", () => {
    expect(hasBackend(screen)).toBe(true);
    expect(hasBackend(page([{ id: "d", type: "data", source: { route: "/time" }, field: "x", format: "text", fallback: "-" }]))).toBe(true);
    expect(hasBackend(page([{ id: "t", type: "table", columns: ["a"], rows: [], liveFormId: "f" }]))).toBe(true);
    expect(hasBackend(page([{ id: "c", type: "chart", kind: "bar", labels: [], series: [{ name: "s", values: [] }], liveFormId: "f" }]))).toBe(true);
    expect(hasBackend(page([{ id: "t", type: "table", columns: ["a"], rows: [] }]))).toBe(false);
  });
});
