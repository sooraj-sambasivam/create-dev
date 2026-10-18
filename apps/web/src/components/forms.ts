import type { Container, FormSubmission, Node, Screen, StoredSubmission } from "@create/shared";
import { sharedIdFromLocation } from "../share/route";
import { useWorkspaceStore } from "../store/workspaceStore";

export type FormField = { nodeId: string; name: string; type: "text" | "longtext" | "checkbox" | "select"; label: string };
export type FormInfo = { id: string; label: string; submitId: string; fields: FormField[] };

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

/** Collect inputs under a container, stopping at nested forms (they own their inputs). */
function inputsOf(node: Container, out: Node[] = []): Node[] {
  for (const c of node.children) {
    if (c.type === "textbox" || c.type === "checkbox" || c.type === "select") out.push(c);
    else if (c.type === "container" && !formOf(c)) inputsOf(c, out);
  }
  return out;
}

/** A container is a form when it holds at least one input and a button of its own that navigates nowhere. */
export function formOf(node: Container): FormInfo | null {
  const submit = node.children.find((c) => c.type === "button" && !c.href);
  if (!submit) return null;
  const inputs = inputsOf(node);
  if (inputs.length === 0) return null;
  const used = new Set<string>();
  const fields = inputs.map((n): FormField => {
    const label = ("label" in n && n.label) || ("placeholder" in n && n.placeholder) || "";
    let name = slug(label) || `field_${n.id}`;
    while (used.has(name)) name = `${name}_${n.id}`;
    used.add(name);
    const type = n.type === "textbox" ? (n.multiline ? "longtext" : "text") : (n.type as "checkbox" | "select");
    return { nodeId: n.id, name, type, label: label || name };
  });
  const heading = node.children.find((c) => c.type === "heading");
  const buttonLabel = submit.type === "button" ? submit.label : "";
  return { id: node.id, label: (heading && "text" in heading && heading.text) || buttonLabel || "Form", submitId: submit.id, fields };
}

/** Every form on the page, in document order. */
export function findForms(screen: Screen): FormInfo[] {
  const out: FormInfo[] = [];
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.type !== "container") continue;
      const f = formOf(n);
      if (f) out.push(f);
      walk(n.children);
    }
  };
  walk(screen.children);
  return out;
}

/** The shared prototype id when viewing a share link, else the active chat, else a draft bucket. */
export function resolveAppId(): string {
  return sharedIdFromLocation() ?? useWorkspaceStore.getState().activeChatId ?? "draft";
}

/** Read a form's current values out of the rendered DOM (the inputs are uncontrolled). */
export function readFormFields(form: FormInfo, root: HTMLElement): FormSubmission["fields"] {
  const fields: FormSubmission["fields"] = {};
  for (const f of form.fields) {
    const el = root.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(f.nodeId)}"]`);
    const input = el?.querySelector<HTMLInputElement>("input, textarea, select");
    if (!input) continue;
    fields[f.name] = f.type === "checkbox" ? String(input.checked) : input.value.trim();
  }
  return fields;
}

export function clearFormFields(form: FormInfo, root: HTMLElement) {
  for (const f of form.fields) {
    const input = root.querySelector<HTMLInputElement>(`[data-node-id="${CSS.escape(f.nodeId)}"] :is(input, textarea, select)`);
    if (!input) continue;
    if (input.type === "checkbox") input.checked = false;
    else input.value = "";
  }
}

export async function submitForm(appId: string, body: FormSubmission): Promise<void> {
  const res = await fetch(`/api/forms/${encodeURIComponent(appId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Couldn't send (${res.status})`);
}

/** Owner read token for an app; the server only issues it to the web app's own origin. */
export async function fetchFormsToken(appId: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`/api/forms/${encodeURIComponent(appId)}/token`, { method: "POST", signal });
  if (!res.ok) throw new Error(`forms token ${res.status}`);
  const data = (await res.json()) as { token?: unknown };
  if (typeof data.token !== "string" || !data.token) throw new Error("forms token missing");
  return data.token;
}

export async function listSubmissions(appId: string, signal?: AbortSignal): Promise<StoredSubmission[]> {
  const token = await fetchFormsToken(appId, signal);
  const res = await fetch(`/api/forms/${encodeURIComponent(appId)}`, { signal, headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`forms ${res.status}`);
  const data = (await res.json()) as StoredSubmission[] | { submissions: StoredSubmission[] };
  return Array.isArray(data) ? data : data.submissions ?? [];
}
