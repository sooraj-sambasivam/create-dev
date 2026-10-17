import type { GenerateResponse } from "./schema";

/** Canned result used when MOCK_AI=1 so the UI works without any API keys. */
export function mockGenerate(prompt: string): GenerateResponse {
  const title = prompt.trim() ? titleCase(prompt.trim().slice(0, 40)) : "Untitled screen";
  return {
    summary: `Mock mode: built a sample layout for "${prompt.trim() || "your idea"}".`,
    screen: {
      title,
      theme: "light",
      children: [
        {
          id: "nav",
          type: "container",
          direction: "row",
          gap: "md",
          align: "center",
          justify: "between",
          padding: "md",
          background: "surface",
          width: "full",
          children: [
            { id: "brand", type: "heading", text: title, level: 3 },
            {
              id: "nav-links",
              type: "container",
              direction: "row",
              gap: "md",
              align: "center",
              justify: "end",
              padding: "none",
              background: "none",
              width: "auto",
              children: [
                { id: "nav-features", type: "link", text: "Features" },
                { id: "nav-pricing", type: "link", text: "Pricing" },
                { id: "nav-cta", type: "button", label: "Get started", variant: "primary" },
              ],
            },
          ],
        },
        {
          id: "hero",
          type: "container",
          direction: "row",
          gap: "lg",
          align: "center",
          justify: "between",
          padding: "lg",
          background: "none",
          width: "full",
          children: [
            {
              id: "hero-copy",
              type: "container",
              direction: "column",
              gap: "md",
              align: "start",
              justify: "start",
              padding: "none",
              background: "none",
              width: "half",
              children: [
                { id: "hero-title", type: "heading", text: "Describe it. See it.", level: 1 },
                {
                  id: "hero-sub",
                  type: "text",
                  text: "Type, talk, or draw and watch a real interface appear. This is a mock response, so set MOCK_AI=0 to use the model.",
                  tone: "muted",
                },
                {
                  id: "hero-form",
                  type: "container",
                  direction: "row",
                  gap: "sm",
                  align: "center",
                  justify: "start",
                  padding: "none",
                  background: "none",
                  width: "full",
                  children: [
                    { id: "hero-email", type: "textbox", label: "", placeholder: "you@example.com", multiline: false },
                    { id: "hero-submit", type: "button", label: "Join waitlist", variant: "primary" },
                  ],
                },
              ],
            },
            { id: "hero-image", type: "image", alt: "Product preview", aspect: "video" },
          ],
        },
        { id: "divider-1", type: "divider" },
        {
          id: "features",
          type: "container",
          direction: "row",
          gap: "md",
          align: "stretch",
          justify: "between",
          padding: "lg",
          background: "muted",
          width: "full",
          children: ["Fast", "Flexible", "Fun"].map((name, i) => ({
            id: `feature-${i}`,
            type: "container" as const,
            direction: "column" as const,
            gap: "sm" as const,
            align: "start" as const,
            justify: "start" as const,
            padding: "md" as const,
            background: "surface" as const,
            width: "third" as const,
            children: [
              { id: `feature-${i}-title`, type: "heading" as const, text: name, level: 3 as const },
              {
                id: `feature-${i}-text`,
                type: "text" as const,
                text: "A short sentence explaining why this matters to the person reading it.",
                tone: "default" as const,
              },
            ],
          })),
        },
      ],
    },
  };
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
