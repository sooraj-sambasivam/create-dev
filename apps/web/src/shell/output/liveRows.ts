import type { StoredSubmission } from "@create/shared";

/** Newest-first submissions for one form. */
export function submissionsFor(rows: StoredSubmission[], formId: string): StoredSubmission[] {
  return rows.filter((r) => r.formId === formId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Table columns: the form's fields in order, then any extra keys seen in the rows. */
export function liveColumns(fields: { name: string; label: string }[], rows: StoredSubmission[]): { key: string; label: string }[] {
  const cols = fields.map((f) => ({ key: f.name, label: f.label }));
  const seen = new Set(cols.map((c) => c.key));
  for (const r of rows) {
    for (const k of Object.keys(r.fields)) {
      if (!seen.has(k)) {
        seen.add(k);
        cols.push({ key: k, label: k });
      }
    }
  }
  return cols;
}

/** Ids in `next` that were not in `prev`. Returns none on the first load (prev null) so nothing flashes. */
export function newIds(prev: ReadonlySet<string> | null, next: StoredSubmission[]): string[] {
  if (!prev) return [];
  return next.filter((r) => !prev.has(r.id)).map((r) => r.id);
}
