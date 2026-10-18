import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  chats: [] as Array<Record<string, unknown>>,
  projects: [] as Array<{ id: string; name: string }>,
  activeChatId: null as string | null,
  newChat: vi.fn(),
  selectChat: vi.fn(),
  createProject: vi.fn(),
  archiveChat: vi.fn(),
};

vi.mock("../store/workspaceStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../store/workspaceStore")>()),
  useWorkspaceStore: (selector: (s: typeof state) => unknown) => selector(state),
}));

const { Sidebar } = await import("./Sidebar");

describe("Sidebar unassigned chats heading", () => {
  beforeEach(() => {
    state.chats = [];
    state.projects = [];
    state.activeChatId = null;
  });

  it("with no projects, a lone chat sits under a Chats heading and there is no Projects heading", () => {
    state.chats = [{ id: "c1", title: "Untitled chat", projectId: null, messages: [{}] }];
    const html = renderToStaticMarkup(<Sidebar />);
    expect(html).toContain(">Chats<");
    expect(html).not.toContain(">Projects<");
    expect(html).toContain("Untitled chat");
    expect(html.indexOf(">Chats<")).toBeLessThan(html.indexOf("Untitled chat"));
    expect(html).toContain("New project");
  });

  it("with projects present, the Projects heading and the Chats heading both render", () => {
    state.projects = [{ id: "p1", name: "Alpha" }];
    state.chats = [{ id: "c1", title: "Loose", projectId: null, messages: [{}] }];
    const html = renderToStaticMarkup(<Sidebar />);
    expect(html).toContain(">Projects<");
    expect(html).toContain(">Chats<");
  });

  it("with no projects and no unassigned chats, no Chats heading is rendered", () => {
    const html = renderToStaticMarkup(<Sidebar />);
    expect(html).not.toContain(">Chats<");
    expect(html).not.toContain(">Projects<");
  });
});
