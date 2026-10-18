import { ROUTES, type Health, type RouteInfo } from "../routes";

export type Status = "connected" | "fallback" | "unused" | "unknown";
export type Col = 0 | 1 | 2;
export type IconName = "message" | "canvas" | "narrate" | "share" | "server" | "database" | "sonnet" | "haiku" | "jev" | "scribe" | "photos" | "icons";

export type SvcNode = { id: string; col: Col; name: string; role: string; icon: IconName };
export type SvcEdge = { from: string; to: string; label: string };

export const NODES: SvcNode[] = [
  { id: "composer", col: 0, name: "Composer & thread", role: "Chat that builds the page", icon: "message" },
  { id: "canvas", col: 0, name: "Canvas (tldraw)", role: "Sketch a layout to generate", icon: "canvas" },
  { id: "narrate", col: 0, name: "Narrate", role: "Talk through a demo", icon: "narrate" },
  { id: "share", col: 0, name: "Share viewer", role: "Open a published page", icon: "share" },
  { id: "api", col: 1, name: "Express API", role: "localhost:3001", icon: "server" },
  { id: "store", col: 1, name: "Prototype store", role: "MongoDB Atlas or local files", icon: "database" },
  { id: "sonnet", col: 2, name: "Claude Sonnet 5.5", role: "Pages, sketches, demo", icon: "sonnet" },
  { id: "haiku", col: 2, name: "Claude Haiku 5.5", role: "Edits, intent, demo plan", icon: "haiku" },
  { id: "jev", col: 2, name: "TypeSafe Jev", role: "Instant intent: command, element, action", icon: "jev" },
  { id: "scribe", col: 2, name: "ElevenLabs Scribe", role: "Realtime speech-to-text", icon: "scribe" },
  { id: "openverse", col: 2, name: "Openverse", role: "Stock photos", icon: "photos" },
  { id: "iconify", col: 2, name: "Iconify", role: "Icons", icon: "icons" },
];

export const EDGES: SvcEdge[] = [
  { from: "composer", to: "api", label: "prompt → page tree" },
  { from: "canvas", to: "api", label: "sketch PNG + shapes" },
  { from: "narrate", to: "api", label: "transcript + pointed ids" },
  { from: "share", to: "api", label: "share links" },
  { from: "api", to: "store", label: "save and load pages" },
  { from: "api", to: "sonnet", label: "pages, sketches, demo" },
  { from: "api", to: "haiku", label: "edits and intent" },
  { from: "api", to: "jev", label: "instant intent" },
  { from: "api", to: "scribe", label: "voice token" },
  { from: "api", to: "openverse", label: "photos" },
  { from: "api", to: "iconify", label: "icons" },
];

const STATUS_LABEL: Record<Status, string> = {
  connected: "Connected",
  fallback: "Fallback",
  unused: "Not used",
  unknown: "Checking",
};

export function statusLabel(s: Status, id?: string, h?: Health | null): string {
  if (s !== "fallback" || !id) return STATUS_LABEL[s];
  const why = fallbackReason(id, h ?? {});
  return why ? `Fallback: ${why}` : STATUS_LABEL[s];
}

function fallbackReason(id: string, h: Health): string {
  switch (id) {
    case "composer":
    case "canvas":
    case "sonnet":
    case "haiku":
      return h.mock ? "mock mode" : "no Anthropic key";
    case "jev":
      return "keyword router";
    case "scribe":
    case "narrate":
      return "browser speech";
    case "store":
    case "share":
      return "file store";
    default:
      return "";
  }
}

/** Maps GET /api/health to a node status. `null` means health has not loaded or failed. */
export function nodeStatus(id: string, h: Health | null): Status {
  if (!h) return "unknown";
  const live = !h.mock && !!h.hasAnthropic;
  switch (id) {
    case "composer":
    case "canvas":
    case "sonnet":
    case "haiku":
      return live ? "connected" : "fallback";
    case "jev":
      return h.hasTypesafe ? "connected" : "fallback";
    case "scribe":
    case "narrate":
      return h.hasElevenLabs ? "connected" : "fallback";
    case "store":
    case "share":
      return h.hasMongo ? "connected" : "fallback";
    case "api":
    case "openverse":
    case "iconify":
      return "connected";
    default:
      return "unused";
  }
}

/** Ids of nodes joined to `id` by an edge, plus itself. */
export function neighbours(id: string, edges: SvcEdge[] = EDGES): Set<string> {
  const out = new Set([id]);
  for (const e of edges) {
    if (e.from === id) out.add(e.to);
    if (e.to === id) out.add(e.from);
  }
  return out;
}

/** Routes a node serves, from routes.ts. Secondary info for the tooltip. */
export function routesFor(id: string, routes: RouteInfo[] = ROUTES): RouteInfo[] {
  switch (id) {
    case "api":
      return routes;
    case "composer":
      return routes.filter((r) => r.clients.includes("text") || r.path === "/api/generate");
    case "canvas":
      return routes.filter((r) => r.clients.includes("canvas"));
    case "narrate":
      return routes.filter((r) => r.clients.includes("narrate"));
    case "share":
      return routes.filter((r) => r.path.startsWith("/api/prototypes"));
    case "store":
      return routes.filter((r) => r.providers.includes("store"));
    case "sonnet":
      return routes.filter((r) => r.model.includes("Sonnet"));
    case "haiku":
      return routes.filter((r) => r.model.includes("Haiku"));
    case "jev":
      return routes.filter((r) => r.path === "/api/route-intent");
    case "scribe":
      return routes.filter((r) => r.providers.includes("elevenlabs"));
    case "openverse":
      return routes.filter((r) => r.providers.includes("openverse"));
    case "iconify":
      return routes.filter((r) => r.providers.includes("iconify"));
    default:
      return [];
  }
}
