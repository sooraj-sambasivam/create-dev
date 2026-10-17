import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const state = {
  chats: [] as Array<Record<string, unknown>>,
  projects: [] as Array<{ id: string; name: string }>,
  activeChatId: null as string | null,
  newChat: vi.fn(),
  selectChat: vi.fn(),
  createProject: vi.fn(),
  archiveChat: vi.fn(),
};

vi.mock("../store/workspaceStore", () => ({
  useWorkspaceStore: (selector: (s: typeof state) => unknown) => selector(state),
}));

const { Sidebar } = await import("./Sidebar");

function render() {
  return renderToStaticMarkup(<Sidebar />);
}

describe("Sidebar", () => {
  beforeEach(() => {
    state.chats = [];
    state.projects = [];
    state.activeChatId = null;
  });

  it("renders the 260px expanded shell with New chat, collapse toggle and avatar", () => {
    const html = render();
    expect(html).toContain("width:260px");
    expect(html).toContain("bg-shell");
    expect(html).toContain('aria-label="Collapse sidebar"');
    expect(html).toContain("New chat");
    expect(html).toContain("SS");
    expect(html).toContain("New project");
  });

  it("lists numbered projects with their chats beneath and the Chats group", () => {
    state.projects = [
      { id: "p1", name: "Alpha" },
      { id: "p2", name: "Beta" },
    ];
    state.chats = [
      { id: "c1", title: "Inside alpha", projectId: "p1", messages: [{}] },
      { id: "c2", title: "Loose chat", projectId: null, messages: [{}] },
    ];
    const html = render();
    expect(html).toContain("1.");
    expect(html).toContain("2.");
    // Each project number appears exactly once, and no <ol> applies its own counter.
    expect(html.match(/>1\.</g)?.length).toBe(1);
    expect(html.match(/>2\.</g)?.length).toBe(1);
    expect(html).not.toContain("<ol");
    expect(html).toContain("Alpha");
    expect(html).toContain("Inside alpha");
    expect(html).toContain("No chats yet");
    expect(html).toContain("Loose chat");
    expect(html).toContain(">Chats<");
  });

  it("hides blank untitled chats and marks the active chat", () => {
    state.chats = [
      { id: "blank", title: "New chat", messages: [] },
      { id: "c1", title: "Real", messages: [{}] },
    ];
    state.activeChatId = "c1";
    const html = render();
    expect(html).toContain("Real");
    expect(html).toContain('aria-current="true"');
    expect(html.match(/New chat/g)?.length).toBe(1);
  });

  it("groups archived chats under a collapsed Archived toggle", () => {
    state.chats = [{ id: "a1", title: "Old one", archived: true, messages: [{}] }];
    const html = render();
    expect(html).toContain("Archived");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Old one");
  });
});
