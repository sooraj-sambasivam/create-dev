import type { Node } from "@create/shared";

export interface SectionTemplate {
  id: string;
  label: string;
  description: string;
  nodes: Node[];
}

const card = (id: string, children: Node[], extra: Record<string, unknown> = {}): Node =>
  ({ id, type: "container", direction: "column", gap: "sm", align: "stretch", justify: "start", padding: "md", background: "surface", width: "full", wrap: false, overlay: "dark", style: { radius: "lg", border: true }, children, ...extra }) as Node;

const section = (id: string, children: Node[], extra: Record<string, unknown> = {}): Node =>
  ({ id, type: "container", direction: "column", gap: "md", align: "center", justify: "start", padding: "xl", background: "none", width: "full", wrap: false, overlay: "dark", children, ...extra }) as Node;

const row = (id: string, children: Node[]): Node =>
  ({ id, type: "container", direction: "row", gap: "md", align: "stretch", justify: "between", padding: "none", background: "none", width: "full", wrap: true, overlay: "dark", children }) as Node;

const heading = (id: string, text: string, level: 1 | 2 | 3 = 2): Node => ({ id, type: "heading", text, level });
const text = (id: string, t: string, tone: "default" | "muted" = "muted"): Node => ({ id, type: "text", text: t, tone });
const button = (id: string, label: string, variant: "primary" | "secondary" | "ghost" = "primary", href = "#contact"): Node => ({ id, type: "button", label, variant, href });
const icon = (id: string, name: string): Node => ({ id, type: "icon", name, size: "lg" });

export const SECTION_TEMPLATES: SectionTemplate[] = [
  {
    id: "hero", label: "Hero", description: "Headline, subhead and two buttons",
    nodes: [
      section("hero", [
        { id: "hero-badge", type: "badge", text: "New" },
        heading("hero-title", "A clear promise in one line", 1),
        text("hero-sub", "One or two sentences that say who this is for and why it matters."),
        row("hero-actions", [button("hero-cta", "Get started"), button("hero-secondary", "Learn more", "secondary", "#features")]),
        { id: "hero-image", type: "image", alt: "Product preview", query: "modern workspace", aspect: "wide", size: "full" },
      ], { gap: "lg" }),
    ],
  },
  {
    id: "features", label: "Features grid", description: "Three feature cards",
    nodes: [
      section("features", [
        heading("features-title", "Everything you need"),
        row("features-grid", [
          card("feature-1", [icon("feature-1-icon", "lucide:zap"), heading("feature-1-title", "Fast", 3), text("feature-1-text", "Short line about this benefit.")]),
          card("feature-2", [icon("feature-2-icon", "lucide:shield-check"), heading("feature-2-title", "Secure", 3), text("feature-2-text", "Short line about this benefit.")]),
          card("feature-3", [icon("feature-3-icon", "lucide:sparkles"), heading("feature-3-title", "Simple", 3), text("feature-3-text", "Short line about this benefit.")]),
        ]),
      ]),
    ],
  },
  {
    id: "pricing", label: "Pricing", description: "Three tiers",
    nodes: [
      section("pricing", [
        heading("pricing-title", "Simple pricing"),
        row("pricing-grid", [
          card("tier-1", [heading("tier-1-name", "Starter", 3), heading("tier-1-price", "$0", 1), { id: "tier-1-list", type: "list", items: ["One project", "Community support"], marker: "check" }, button("tier-1-cta", "Start free", "secondary")]),
          card("tier-2", [{ id: "tier-2-badge", type: "badge", text: "Most popular" }, heading("tier-2-name", "Pro", 3), heading("tier-2-price", "$12", 1), { id: "tier-2-list", type: "list", items: ["Unlimited projects", "Priority support", "Custom domain"], marker: "check" }, button("tier-2-cta", "Choose Pro")], { background: "accent" }),
          card("tier-3", [heading("tier-3-name", "Team", 3), heading("tier-3-price", "$40", 1), { id: "tier-3-list", type: "list", items: ["Everything in Pro", "Shared workspace", "Admin controls"], marker: "check" }, button("tier-3-cta", "Contact us", "secondary")]),
        ]),
      ]),
    ],
  },
  {
    id: "testimonials", label: "Testimonials", description: "Three quotes with avatars",
    nodes: [
      section("testimonials", [
        heading("testimonials-title", "Loved by customers"),
        row("testimonials-grid", [1, 2, 3].map((n) =>
          card(`quote-${n}`, [
            { id: `quote-${n}-rating`, type: "rating", value: 5 },
            text(`quote-${n}-text`, "A short, specific quote about what changed for them.", "default"),
            { id: `quote-${n}-avatar`, type: "avatar", name: ["Alex Rivera", "Sam Chen", "Priya Patel"][n - 1]!, query: "smiling person portrait", size: "md" },
          ]),
        )),
      ]),
    ],
  },
  {
    id: "faq", label: "FAQ", description: "Accordion of common questions",
    nodes: [
      section("faq", [
        heading("faq-title", "Questions, answered"),
        { id: "faq-list", type: "accordion", items: [
          { question: "How does it work?", answer: "A clear, friendly answer in a sentence or two." },
          { question: "Can I cancel any time?", answer: "Yes. There are no contracts or hidden fees." },
          { question: "Do you offer support?", answer: "Yes. Reach us any time from the contact form." },
        ] },
      ]),
    ],
  },
  {
    id: "cta", label: "CTA band", description: "Accent band with one action",
    nodes: [
      section("cta", [
        heading("cta-title", "Ready to get started?"),
        text("cta-sub", "Join today. It takes a minute.", "default"),
        button("cta-button", "Get started", "secondary"),
      ], { background: "accent", style: { radius: "lg" } }),
    ],
  },
  {
    id: "footer", label: "Footer", description: "Brand, links and copyright",
    nodes: [
      section("footer", [
        row("footer-row", [
          heading("footer-brand", "Brand", 3),
          row("footer-links", [
            { id: "footer-link-1", type: "link", text: "About", href: "#hero" },
            { id: "footer-link-2", type: "link", text: "Pricing", href: "#pricing" },
            { id: "footer-link-3", type: "link", text: "Contact", href: "#contact" },
          ]),
        ]),
        { id: "footer-divider", type: "divider" },
        text("footer-copy", "© 2026 Brand. All rights reserved."),
      ], { background: "muted", align: "stretch", padding: "lg" }),
    ],
  },
  {
    id: "contact", label: "Contact form", description: "Name, email, message and send",
    nodes: [
      section("contact", [
        heading("contact-title", "Get in touch"),
        text("contact-sub", "We usually reply within a day."),
        card("contact-form", [
          { id: "contact-name", type: "textbox", label: "Name", placeholder: "Your name", multiline: false },
          { id: "contact-email", type: "textbox", label: "Email", placeholder: "you@example.com", multiline: false },
          { id: "contact-message", type: "textbox", label: "Message", placeholder: "How can we help?", multiline: true },
          button("contact-send", "Send message", "primary", "mailto:hello@example.com"),
        ], { width: "half" }),
      ]),
    ],
  },
];
