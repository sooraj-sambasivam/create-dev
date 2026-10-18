import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Header, copyShareLink, type WorkspaceActions } from "./Header";
import { archiveLabel, assetLabel, nextTitle, ChatMenu } from "./ChatMenu";
import { applyTheme, nextTheme, resolveTheme, useThemeStore, THEME_STORAGE_KEY } from "./theme";
import { LookSwitch } from "./Header";

const actions: WorkspaceActions = {
  renameChat: vi.fn(),
  archiveChat: vi.fn(),
  deleteChat: vi.fn(),
  moveChat: vi.fn(),
  createProject: vi.fn(),
  toggleOutput: vi.fn(),
};

const baseProps = {
  pageTitle: "Coffee shop",
  chat: { id: "chat_1", title: "Coffee chat", archived: false, projectId: null },
  projects: [{ id: "p1", name: "Ideas" }],
  outputOpen: false,
  actions,
};

describe("pure helpers", () => {
  it("labels archive toggle", () => {
    expect(archiveLabel(false)).toBe("Archive");
    expect(archiveLabel(true)).toBe("Unarchive");
  });

  it("trims rename input and skips empty or unchanged titles", () => {
    expect(nextTitle("  New name ", "Old")).toBe("New name");
    expect(nextTitle("   ", "Old")).toBeNull();
    expect(nextTitle("Old", "Old")).toBeNull();
  });

  it("names assets, falling back to the URL tail", () => {
    expect(assetLabel({ url: "/api/uploads/a.png", name: "Logo" }, 0)).toBe("Logo");
    expect(assetLabel({ url: "/api/uploads/a.png", name: "  " }, 0)).toBe("a.png");
    expect(assetLabel({ url: "", name: "" }, 2)).toBe("File 3");
  });

  it("copies the link through the clipboard and reports failure without throwing", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyShareLink("https://x.test/p", { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("https://x.test/p");

    const refuses = { writeText: vi.fn().mockRejectedValue(new Error("denied")) };
    await expect(copyShareLink("https://x.test/p", refuses)).resolves.toBe(false);
    await expect(copyShareLink("https://x.test/p", undefined)).resolves.toBe(false);
  });
});

describe("theme", () => {
  it("cycles light, dark, system, light", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
    expect(nextTheme("system")).toBe("light");
  });

  it("resolves system from the OS setting and keeps explicit choices", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("uses the create-theme storage key and defaults to system", () => {
    expect(THEME_STORAGE_KEY).toBe("create-theme");
    expect(useThemeStore.getState().theme).toBe("system");
  });

  it("applyTheme is a no-op without a DOM", () => {
    expect(() => applyTheme("dark")).not.toThrow();
  });

  it("renders the look switch with Paper and Luminous", () => {
    const html = renderToStaticMarkup(<LookSwitch />);
    expect(html).toContain('aria-label="Look"');
    expect(html).toContain("Paper");
    expect(html).toContain("Luminous");
  });
});

describe("share link copy", () => {
  it("returns false for a refused clipboard so the caller can show the link", async () => {
    const refuses = { writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")) };
    await expect(copyShareLink("https://x.test/s/1", refuses)).resolves.toBe(false);
  });
});

describe("Header markup", () => {
  it("places the look switch next to Share", () => {
    const html = renderToStaticMarkup(<Header {...baseProps} />);
    expect(html).toContain('data-testid="look-switch"');
  });

  it("shows the page title, Share, the chat menu trigger and the Output toggle", () => {
    const html = renderToStaticMarkup(<Header {...baseProps} />);
    expect(html).toContain("Coffee shop");
    expect(html).toContain(">Share<");
    expect(html).toContain('aria-label="Chat options"');
    expect(html).toContain('aria-label="Show side panel"');
    expect(html).toContain('aria-pressed="false"');
  });

  it("reflects the open side panel in aria-pressed", () => {
    const html = renderToStaticMarkup(<Header {...baseProps} outputOpen />);
    expect(html).toContain('aria-pressed="true"');
  });

  it("keeps the closed chat menu free of menu panels", () => {
    const html = renderToStaticMarkup(
      <ChatMenu
        title="Coffee chat"
        archived={false}
        projectId={null}
        projects={[]}
        assets={[]}
        onRename={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
        onMoveToProject={vi.fn()}
        onCreateProject={vi.fn()}
      />,
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="menu"');
  });
});

describe("Chat | Work toggle", () => {
  it("renders in the header with Work as the second label", async () => {
    const { ModeToggle, MODE_LABEL } = await import("./Header");
    expect(MODE_LABEL).toEqual({ chat: "Chat", code: "Work" });
    const html = renderToStaticMarkup(<ModeToggle />);
    expect(html).toContain("Work");
    expect(html).not.toContain(">Code<");
    expect(renderToStaticMarkup(<Header {...baseProps} />)).toContain('data-testid="work-mode"');
  });
});
