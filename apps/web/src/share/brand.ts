/** The product name shown in the UI. The repository stays create-dev. */
export const APP_NAME = "Create";

/** Document title for a shared prototype, e.g. "Landing · Create". Falls back to the app name. */
export function sharedDocumentTitle(prototypeTitle: string | null | undefined): string {
  const title = typeof prototypeTitle === "string" ? prototypeTitle.trim() : "";
  return title ? `${title} · ${APP_NAME}` : APP_NAME;
}
