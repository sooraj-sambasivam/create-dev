import { ScreenSchema, type Node, type Screen } from "@create/shared";
import { MAX_SECTIONS, takeId, type Plan, type PlanSection } from "./plan";

const ICONS = ["lucide:sparkles", "lucide:layers", "lucide:zap", "lucide:heart", "lucide:compass", "lucide:star"];

export function mockSectionNode(section: PlanSection, index: number, id: string, taken: Set<string>): Node {
  const t = (suffix: string) => takeId(taken, `${id}-${suffix}`);
  return {
    id,
    type: "container",
    direction: "column",
    align: "start",
    padding: "lg",
    gap: "md",
    background: index % 2 === 1 ? "muted" : "none",
    children: [
      { id: t("icon"), type: "icon", name: ICONS[index % ICONS.length], size: "lg" },
      { id: t("title"), type: "heading", text: section.purpose, level: 2 },
      { id: t("text"), type: "text", text: section.content || `More about ${section.purpose.toLowerCase()} goes here.`, tone: "default" },
    ],
  } as Node;
}

/**
 * Assemble a Screen from a plan and its built sections. `built` maps a plan section id to the
 * nodes built for it. If `current` is given its sections are reused first, then the new ones follow.
 */
export function assembleScreen(plan: Plan, built: Map<string, Node>, current: Screen | null | undefined, accent?: string | null): Screen {
  const taken = new Set<string>();
  const reused = (current?.children ?? []).map((n) => ({ ...n }));
  const collect = (nodes: Node[]) => nodes.forEach((n) => { taken.add(n.id); if (n.type === "container") collect(n.children); });
  collect(reused);

  // Re-id every built node against what is already on the page, so nothing collides.
  const reid = (n: Node): Node => {
    const id = takeId(taken, n.id);
    return n.type === "container" ? { ...n, id, children: n.children.map(reid) } : { ...n, id };
  };
  const sections = plan.sections.slice(0, MAX_SECTIONS).map((s, i) => {
    const node = reid(built.get(s.id) ?? mockSectionNode(s, i, s.id, new Set()));
    return { plan: s, node };
  });
  const navLinks: Node[] = sections.map(({ plan: p, node }) => ({
    id: takeId(taken, `nav-${node.id}`),
    type: "link",
    text: p.purpose.length > 22 ? `${p.purpose.slice(0, 20)}…` : p.purpose,
    href: `#${node.id}`,
  })) as Node[];

  const nav: Node = {
    id: takeId(taken, "nav"), type: "container", direction: "row", justify: "between", align: "center", padding: "md",
    children: [
      { id: takeId(taken, "brand"), type: "heading", text: plan.title, level: 3 },
      { id: takeId(taken, "nav-links"), type: "container", direction: "row", align: "center", width: "auto", children: navLinks.slice(0, 5) },
    ],
  } as Node;
  const hero: Node = {
    id: takeId(taken, "hero"), type: "container", direction: "column", align: "center", padding: "xl",
    children: [
      { id: takeId(taken, "hero-title"), type: "heading", text: plan.title, level: 1, style: { align: "center" } },
      { id: takeId(taken, "hero-sub"), type: "text", text: plan.sections[0]?.content || plan.sections[0]?.purpose || "", tone: "muted", style: { align: "center" } },
      ...(sections[0] ? [{ id: takeId(taken, "hero-cta"), type: "button", label: "Learn more", icon: "lucide:arrow-down", href: `#${sections[0].node.id}` } as Node] : []),
    ],
  } as Node;

  const head = current && reused.length ? [] : [nav, hero];
  const children = [...reused, ...head, ...sections.map((s) => s.node)];
  return ScreenSchema.parse({
    title: current?.title || plan.title,
    theme: current?.theme ?? "light",
    accent: current?.accent ?? accent ?? "#4f46e5",
    font: current?.font ?? "sans",
    children,
  });
}
