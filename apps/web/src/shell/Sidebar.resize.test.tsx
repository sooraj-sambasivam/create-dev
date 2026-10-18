import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

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

const {
  Sidebar,
  clampSidebarWidth,
  readSidebarWidth,
  writeSidebarWidth,
  SIDEBAR_DEFAULT,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
  SIDEBAR_RAIL,
  SIDEBAR_WIDTH_KEY,
} = await import("./Sidebar");

describe("sidebar width", () => {
  beforeEach(() => {
    state.chats = [];
    state.projects = [];
    state.activeChatId = null;
  });

  it("clamps to 220 to 420 px and falls back to the default for non-finite input", () => {
    expect(clampSidebarWidth(100)).toBe(SIDEBAR_MIN);
    expect(clampSidebarWidth(999)).toBe(SIDEBAR_MAX);
    expect(clampSidebarWidth(300.4)).toBe(300);
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_DEFAULT);
    expect(clampSidebarWidth(Number.POSITIVE_INFINITY)).toBe(SIDEBAR_DEFAULT);
  });

  it("uses the create-sidebar-width key and defaults to 260 without a DOM", () => {
    expect(SIDEBAR_WIDTH_KEY).toBe("create-sidebar-width");
    expect(readSidebarWidth()).toBe(SIDEBAR_DEFAULT);
    expect(() => writeSidebarWidth(300)).not.toThrow();
  });

  it("exposes the handle as a vertical separator with value bounds", () => {
    const html = renderToStaticMarkup(<Sidebar />);
    expect(html).toContain('role="separator"');
    expect(html).toContain(`aria-valuemin="${SIDEBAR_MIN}"`);
    expect(html).toContain(`aria-valuemax="${SIDEBAR_MAX}"`);
    expect(html).toContain(`aria-valuenow="${SIDEBAR_DEFAULT}"`);
  });

  it("expanded state offers the collapse toggle, and the rail width is 48px", () => {
    const html = renderToStaticMarkup(<Sidebar />);
    expect(html).toContain('aria-label="Collapse sidebar"');
    expect(SIDEBAR_RAIL).toBe(48);
  });
});
