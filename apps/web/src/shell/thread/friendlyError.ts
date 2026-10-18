/** Plain-language text for a failed request. Server-written messages pass through; transport and status failures do not. */
export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const msg = raw.trim();
  if (!msg) return "Something went wrong. Try again.";
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed|err_internet|offline/i.test(msg)) {
    return "Couldn't reach the server — check your connection and try again.";
  }
  if (/\b429\b|too many requests|rate.?limit/i.test(msg)) return "Too many requests right now — wait a moment and try again.";
  if (/\(5\d\d\)\s*$|\b50[0-4]\b|bad gateway|service unavailable|gateway timeout|internal server error/i.test(msg)) {
    return "The server had a problem. Try again in a moment.";
  }
  return msg;
}
