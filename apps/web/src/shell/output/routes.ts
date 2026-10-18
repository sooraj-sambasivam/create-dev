// Backend map data for the Output pane's "Backend" tab. Keep it in step with apps/server/src/routes.

export type RouteInfo = {
  method: "GET" | "POST";
  path: string;
  summary: string;
  /** Model or provider that answers the route. */
  model: string;
  streams: boolean;
  /** What answers when no key is set (MOCK_AI=1). */
  fallback: string;
  /** Diagram node ids of the client surfaces that call it, and of the providers behind it. */
  clients: string[];
  providers: string[];
  owner: "core" | "ours";
};

export const ROUTES: RouteInfo[] = [
  { method: "POST", path: "/api/generate", summary: "Prompt (+ current screen, history, assets) to a Screen tree", model: "Sonnet 5.5", streams: false, fallback: "Canned screen", clients: ["text", "voice"], providers: ["claude"], owner: "core" },
  { method: "POST", path: "/api/edit-node", summary: "Rewrite one element; may add siblings or remove it", model: "Haiku 5.5", streams: false, fallback: "Canned edit", clients: ["editor"], providers: ["claude"], owner: "core" },
  { method: "POST", path: "/api/transcribe", summary: "Recorded audio to text", model: "ElevenLabs Scribe", streams: false, fallback: "Fixed transcript", clients: ["voice"], providers: ["elevenlabs"], owner: "core" },
  { method: "POST", path: "/api/upload", summary: "Store a PNG, JPG, WebP or GIF", model: "Local disk", streams: false, fallback: "Same", clients: ["editor"], providers: ["files"], owner: "core" },
  { method: "GET", path: "/api/uploads/:name", summary: "Serve an uploaded file", model: "Local disk", streams: false, fallback: "Same", clients: ["editor"], providers: ["files"], owner: "core" },
  { method: "GET", path: "/api/image", summary: "Redirect to a matching stock photo", model: "Openverse", streams: false, fallback: "404 placeholder", clients: ["editor"], providers: ["openverse"], owner: "core" },
  { method: "GET", path: "/api/image/resolve", summary: "Real photo URL for Publish", model: "Openverse", streams: false, fallback: "404 placeholder", clients: ["output"], providers: ["openverse"], owner: "core" },
  { method: "GET", path: "/api/icons/search", summary: "Search icons by style", model: "Iconify", streams: false, fallback: "Same", clients: ["editor"], providers: ["iconify"], owner: "core" },
  { method: "GET", path: "/api/icons/svg", summary: "One icon as SVG, cached 24 h", model: "Iconify", streams: false, fallback: "Last cached copy, or 502 when offline", clients: ["editor", "canvas"], providers: ["iconify"], owner: "core" },
  { method: "GET", path: "/api/health", summary: "Which keys are present, and mock mode", model: "none", streams: false, fallback: "Same", clients: ["output"], providers: [], owner: "core" },
  { method: "POST", path: "/api/generate-sketch", summary: "Canvas PNG + shapes to a Screen", model: "Sonnet 5.5", streams: false, fallback: "Layout from shapes", clients: ["canvas"], providers: ["claude"], owner: "ours" },
  { method: "POST", path: "/api/canvas-ops", summary: "Canvas drawing to edit ops on the current Screen", model: "Perceptron, Sonnet 5.5", streams: false, fallback: "Mock ops (MOCK_AI=1)", clients: ["canvas"], providers: ["perceptron", "claude"], owner: "ours" },
  { method: "POST", path: "/api/demo", summary: "Narration session to a clickable page, with progress steps", model: "Sonnet 5.5", streams: true, fallback: "Page from session text", clients: ["narrate"], providers: ["claude"], owner: "ours" },
  { method: "POST", path: "/api/route-intent", summary: "Spoken line to command, target and action", model: "Haiku 5.5", streams: false, fallback: "Keyword router", clients: ["narrate"], providers: ["claude"], owner: "ours" },
  { method: "GET", path: "/api/voice-token", summary: "Single-use realtime Scribe token; the key stays on the server", model: "ElevenLabs Scribe", streams: false, fallback: "Batch transcription", clients: ["narrate", "voice"], providers: ["elevenlabs"], owner: "ours" },
  { method: "POST", path: "/api/prototypes", summary: "Save a page and return a share link", model: "MongoDB or file store", streams: false, fallback: "File store", clients: ["output"], providers: ["store"], owner: "ours" },
  { method: "GET", path: "/api/prototypes/:id", summary: "Load a shared page", model: "MongoDB or file store", streams: false, fallback: "File store", clients: ["output"], providers: ["store"], owner: "ours" },
  { method: "GET", path: "/api/live", summary: "Catalog of live sources and their params", model: "none", streams: false, fallback: "Same", clients: [], providers: [], owner: "ours" },
  { method: "GET", path: "/api/live/:id", summary: "Live value: weather, GitHub stars, crypto, HN top, local time, YouTube views (60 s cache)", model: "Open-Meteo, GitHub, CoinGecko, HN, YouTube", streams: false, fallback: "No YouTube value without its key", clients: [], providers: ["live-apis"], owner: "ours" },
];

export type DiagramNode = { id: string; label: string; col: 0 | 1 | 2 };

export const DIAGRAM_NODES: DiagramNode[] = [
  { id: "text", label: "Text", col: 0 },
  { id: "voice", label: "Voice", col: 0 },
  { id: "canvas", label: "Canvas", col: 0 },
  { id: "narrate", label: "Narrate", col: 0 },
  { id: "editor", label: "Editor", col: 0 },
  { id: "output", label: "Output pane", col: 0 },
  { id: "api", label: "API :3001", col: 1 },
  { id: "claude", label: "Anthropic Claude", col: 2 },
  { id: "elevenlabs", label: "ElevenLabs", col: 2 },
  { id: "openverse", label: "Openverse", col: 2 },
  { id: "iconify", label: "Iconify", col: 2 },
  { id: "store", label: "MongoDB / file", col: 2 },
  { id: "files", label: "Local uploads", col: 2 },
  { id: "perceptron", label: "Perceptron", col: 2 },
  { id: "live-apis", label: "Live data APIs", col: 2 },
];

/** Edges derived from the route table so the diagram cannot drift from it. */
export function diagramEdges(routes: RouteInfo[] = ROUTES): [string, string][] {
  const set = new Set<string>();
  for (const r of routes) {
    for (const c of r.clients) set.add(`${c}>api`);
    for (const p of r.providers) set.add(`api>${p}`);
  }
  return [...set].map((s) => s.split(">") as [string, string]);
}

/** Node ids lit up when a route row is hovered. */
export function nodesForRoute(path: string, routes: RouteInfo[] = ROUTES): Set<string> {
  const r = routes.find((x) => x.path === path);
  return r ? new Set([...r.clients, "api", ...r.providers]) : new Set();
}

export type Health = { ok?: boolean; mock?: boolean; model?: string; hasAnthropic?: boolean; hasElevenLabs?: boolean; hasTypesafe?: boolean; hasMongo?: boolean };

export type KeyRowInfo = { label: string; ok: boolean };

/** Rows for the keys panel; the Mongo row appears only when the server reports it. */
export function keyRows(h: Health): KeyRowInfo[] {
  const rows: KeyRowInfo[] = [
    { label: "Anthropic", ok: !!h.hasAnthropic },
    { label: "ElevenLabs", ok: !!h.hasElevenLabs },
  ];
  if (typeof h.hasMongo === "boolean") rows.push({ label: "MongoDB", ok: h.hasMongo });
  rows.push({ label: "Mock mode", ok: !h.mock });
  return rows;
}
