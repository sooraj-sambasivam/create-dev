import { GenerateResponseSchema, type GenerateResponse } from "./schema";

/** Canned result used when MOCK_AI=1 so the UI works without any API keys. */
export function mockGenerate(prompt: string): GenerateResponse {
  const title = prompt.trim() ? prompt.trim().slice(0, 40).replace(/\b\w/g, (c) => c.toUpperCase()) : "Untitled screen";
  return GenerateResponseSchema.parse({
    summary: `Mock mode: built a sample layout for "${prompt.trim() || "your idea"}".`,
    screen: {
      title,
      accent: "#4f46e5",
      children: [
        {
          id: "nav", type: "container", direction: "row", justify: "between", align: "center", padding: "md",
          children: [
            { id: "brand", type: "heading", text: title, level: 3 },
            {
              id: "nav-links", type: "container", direction: "row", align: "center",
              children: [
                { id: "nav-features", type: "link", text: "Features", href: "#features" },
                { id: "nav-cta", type: "button", label: "Get started", icon: "lucide:arrow-right" },
              ],
            },
          ],
        },
        {
          id: "hero", type: "container", direction: "column", align: "center", padding: "xl",
          children: [
            { id: "hero-badge", type: "badge", text: "Mock mode" },
            { id: "hero-title", type: "heading", text: "Describe it. See it.", level: 1, style: { align: "center" } },
            { id: "hero-sub", type: "text", text: "Set MOCK_AI=0 to build real pages with Claude.", tone: "muted", style: { align: "center" } },
            { id: "hero-rating", type: "rating", value: 4.9, label: "from 1,200 makers" },
          ],
        },
        {
          id: "features", type: "container", direction: "row", padding: "lg", background: "muted",
          children: ["Type", "Talk", "Draw"].map((name, i) => ({
            id: `feature-${i}`, type: "container", width: "third", padding: "md", background: "surface", gap: "sm",
            children: [
              { id: `feature-${i}-icon`, type: "icon", name: ["lucide:keyboard", "lucide:mic", "lucide:pencil"][i], size: "lg" },
              { id: `feature-${i}-title`, type: "heading", text: name, level: 3 },
              { id: `feature-${i}-text`, type: "text", text: "A short sentence explaining why this matters.", tone: "muted" },
            ],
          })),
        },
      ],
    },
  });
}
