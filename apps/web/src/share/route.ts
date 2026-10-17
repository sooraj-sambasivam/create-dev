/**
 * Shared prototype links look like `/?p=<id>`. The app has no router, so the
 * entry point checks this once and renders <SharedView> instead of the builder.
 */

/** Ids the server issues are short URL-safe tokens. Anything else is ignored. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Pure form of sharedIdFromLocation, for a query string such as "?p=abc". */
export function sharedIdFromSearch(search: string): string | null {
  let raw: string | null;
  try {
    raw = new URLSearchParams(search).get("p");
  } catch {
    return null;
  }
  if (raw === null) return null;
  const id = raw.trim();
  return ID_PATTERN.test(id) ? id : null;
}

/** The shared prototype id in the current URL (`?p=<id>`), or null for the builder. */
export function sharedIdFromLocation(): string | null {
  if (typeof window === "undefined" || !window.location) return null;
  return sharedIdFromSearch(window.location.search);
}
