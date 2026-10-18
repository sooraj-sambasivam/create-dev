import type { Node, Screen } from "@create/shared";
import { findForms } from "../../components/forms";

export type BackendStatus = "connected" | "sample" | "setup";

export type AppBackend = {
  pages: { id: string; title: string; path: string; elements: number }[];
  forms: { id: string; label: string; fields: { name: string; type: string; label: string }[]; endpoint: string; status: BackendStatus }[];
  data: { id: string; label: string; source: string; refreshSec: number | null; status: BackendStatus }[];
  actions: { id: string; label: string; kind: "link" | "button" | "submit"; target: string }[];
  hosting: { shareUrl?: string; published: boolean };
  env: string[];
};

export type BackendContext = { appId: string; shareUrl?: string | null; mock?: boolean };

/** Live sources the server can fetch, and the key each needs when the page runs outside Create. */
const LIVE_ENV: Record<string, string | null> = {
  weather: null,
  "github-stars": "GITHUB_TOKEN",
  "crypto-price": null,
  "hn-top": null,
  time: null,
  "youtube-views": "YOUTUBE_API_KEY",
};

function walk(nodes: Node[], visit: (n: Node) => void) {
  for (const n of nodes) {
    visit(n);
    if (n.type === "container") walk(n.children, visit);
  }
}

/** What the page would need on a server, read straight from the Screen. */
export function deriveAppBackend(screen: Screen | null | undefined, ctx: BackendContext): AppBackend {
  const empty: AppBackend = { pages: [], forms: [], data: [], actions: [], hosting: { published: false }, env: [] };
  if (!screen) return empty;

  let elements = 0;
  const forms = findForms(screen);
  const submitIds = new Map(forms.map((f) => [f.submitId, f.id]));
  const data: AppBackend["data"] = [];
  const actions: AppBackend["actions"] = [];
  const env = new Set<string>();

  walk(screen.children, (n) => {
    elements++;
    if (n.type === "data") {
      const id = n.source.route.replace(/^\/+/, "").split("/")[0] ?? "";
      const known = id in LIVE_ENV;
      data.push({
        id: n.id,
        label: n.label || id || n.source.route,
        source: n.source.route,
        refreshSec: n.refreshSec ?? null,
        status: !known ? "setup" : ctx.mock ? "sample" : "connected",
      });
      const key = LIVE_ENV[id];
      if (key) env.add(key);
    } else if (n.type === "button") {
      const form = submitIds.get(n.id);
      if (form) actions.push({ id: n.id, label: n.label || "Submit", kind: "submit", target: form });
      else actions.push({ id: n.id, label: n.label || n.icon || "Button", kind: n.href ? "link" : "button", target: n.href ?? "" });
    } else if (n.type === "link" && n.href) {
      actions.push({ id: n.id, label: n.text || n.href, kind: "link", target: n.href });
    }
  });

  const endpoint = `/api/forms/${ctx.appId}`;
  if (forms.length) env.add("FORMS_API_URL");
  return {
    pages: [{ id: "home", title: screen.title, path: "/", elements }],
    forms: forms.map((f) => ({
      id: f.id,
      label: f.label,
      fields: f.fields.map(({ name, type, label }) => ({ name, type, label })),
      endpoint,
      status: "connected",
    })),
    data,
    actions,
    hosting: { shareUrl: ctx.shareUrl ?? undefined, published: !!ctx.shareUrl },
    env: [...env],
  };
}

/** True when the page has something a server would do: a form with a submit button, a data node, or a table/chart fed by a form. */
export function hasBackend(screen: Screen | null | undefined): boolean {
  if (!screen) return false;
  if (findForms(screen).length > 0) return true;
  let found = false;
  walk(screen.children, (n) => {
    if (n.type === "data" || ((n.type === "table" || n.type === "chart") && n.liveFormId)) found = true;
  });
  return found;
}

/** The JSON body a form posts, with sample values per field type. */
export function sampleBody(form: AppBackend["forms"][number]) {
  const sample = (type: string) => (type === "checkbox" ? "true" : type === "select" ? "Option" : "Example");
  return { formId: form.id, fields: Object.fromEntries(form.fields.map((f) => [f.name, sample(f.type)])) };
}

export function curlExample(form: AppBackend["forms"][number], origin: string): string {
  return `curl -X POST ${origin}${form.endpoint} \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(sampleBody(form))}'\n\n# Read submissions (owner key from POST ${origin}${form.endpoint}/token)\ncurl ${origin}${form.endpoint} \\\n  -H 'Authorization: Bearer <token from POST ${form.endpoint}/token>'`;
}
