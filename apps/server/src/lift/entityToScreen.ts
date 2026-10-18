import { ScreenSchema, type Entity, type Node, type Screen } from "@create/shared";
import { cleanEntity, fallbackTitle, isEchoTitle, planChart } from "./clean";

export const DEFAULT_FORM_ID = "add-row";


/** "$1,234.50" / "12%" / "(3)" -> number; anything unreadable is 0 so a chart never breaks. */
export function parseNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const neg = /^\(.*\)$/.test(raw.trim()) || /^-/.test(raw.trim());
  const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

export type LiftCopy = { title?: string; summary?: string; footer?: string };

/**
 * Deterministic entity -> page: header, live table, optional live chart, add-row form, footer.
 * The form container's id is the formId, which is what the renderer posts submissions under.
 * Row values are copied verbatim; `copy` may only change title, summary and footer text.
 */
export function entityToScreen(raw: Entity, formId: string = DEFAULT_FORM_ID, copy: LiftCopy = {}, instruction?: string): Screen {
  const entity = cleanEntity(raw);
  const copyTitle = copy.title?.trim();
  const title = (
    (copyTitle && !isEchoTitle(copyTitle, instruction) ? copyTitle : "") ||
    (!isEchoTitle(entity.title, instruction) ? entity.title.trim() : "") ||
    fallbackTitle(entity)
  ).slice(0, 120);
  const sourceTitle = entity.source.title?.trim() || entity.source.url?.trim();
  const children: Node[] = [];

  const header: Node[] = [{ id: "title", type: "heading", level: 1, text: title }];
  if (copy.summary?.trim()) header.push({ id: "summary", type: "text", tone: "default", text: copy.summary.trim() } as Node);
  if (sourceTitle) header.push({ id: "source", type: "text", tone: "muted", text: `From ${sourceTitle}` } as Node);
  children.push({ id: "header", type: "container", direction: "column", gap: "sm", padding: "lg", background: "none", children: header } as Node);

  const cells = (r: Record<string, string>) => entity.columns.map((c) => r[c.key] ?? "");
  const body: Node[] = [
    { id: "data-table", type: "table", columns: entity.columns.map((c) => c.label), rows: entity.rows.map(cells), liveFormId: formId } as Node,
  ];

  const plan = planChart(entity);
  if (plan && "transposed" in plan) {
    // A row of values across plan columns: static, since new form rows do not add a plan.
    body.push({ id: "data-chart", type: "chart", kind: "bar", title: plan.title, labels: plan.labels, series: [{ name: plan.seriesName, values: plan.values.map(parseNumber) }] } as Node);
  } else if (plan) {
    body.push({
      id: "data-chart",
      type: "chart",
      kind: plan.kind,
      title: plan.title,
      labels: plan.labels,
      series: plan.series.map((c) => ({ name: c.name, values: plan.rowIdx.map((i) => parseNumber(entity.rows[i]![c.key])) })),
      liveFormId: formId,
    } as Node);
  }
  children.push({ id: "data", type: "container", direction: "column", gap: "lg", padding: "lg", background: "none", children: body } as Node);

  children.push({
    id: formId,
    type: "container",
    direction: "column",
    gap: "md",
    padding: "lg",
    background: "surface",
    children: [
      { id: "form-title", type: "heading", level: 2, text: "Add a row" },
      ...entity.columns.map(
        (c, i): Node => ({ id: `field-${i + 1}`, type: "textbox", label: c.label, placeholder: c.label, multiline: false }) as Node,
      ),
      { id: "form-submit", type: "button", label: "Add row", variant: "primary" } as Node,
    ],
  } as Node);

  children.push({
    id: "footer",
    type: "container",
    direction: "column",
    gap: "sm",
    padding: "md",
    background: "none",
    children: [{ id: "footer-text", type: "text", tone: "muted", text: copy.footer?.trim() || "Rows you add show up here for everyone with this link." }],
  } as Node);

  return ScreenSchema.parse({ title, theme: "light", font: "sans", children });
}
