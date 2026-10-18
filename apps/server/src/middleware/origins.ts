const LOCAL_ORIGINS = [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];

export function allowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string, path: string): boolean {
  if (LOCAL_ORIGINS.some((re) => re.test(origin))) return true;
  if (allowedOrigins().includes(origin)) return true;
  return origin.startsWith("chrome-extension://") && (path.startsWith("/api/import-element") || path.startsWith("/api/tray"));
}
