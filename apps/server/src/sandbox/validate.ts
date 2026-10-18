export class SandboxError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SandboxError";
    this.status = status;
  }
}

/** Incoming deploy batches, and the merged session, cannot exceed this. */
export const MAX_ROUTES = 20;

/** Total handler source bytes stored for one session. */
export const MAX_SESSION_CODE_BYTES = 1_000_000;

export const MAX_DEPS = 8;

const PRIVATE_NET_RE =
  /(?:\blocalhost\b|\b0\.0\.0\.0\b|\[::1\]|\b::1\b|\b127(?:\.\d{1,3}){3}\b|\b10(?:\.\d{1,3}){3}\b|\b192\.168(?:\.\d{1,3}){2}\b|\b172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}\b|\b169\.254(?:\.\d{1,3}){2}\b|\bfc[0-9a-f]{2}:|\bfd[0-9a-f]{2}:|\bfe80:)/i;

const DANGEROUS_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /\b(?:node:)?child_process\b/, reason: "child_process is not allowed" },
  { re: /\b(?:node:)?worker_threads\b/, reason: "worker_threads is not allowed" },
  { re: /\bcluster\b/, reason: "cluster is not allowed" },
  { re: /\brequire\s*\(\s*['"](?:node:)?fs(?:\/promises)?['"]/, reason: "fs is not allowed" },
  { re: /\bfrom\s+['"](?:node:)?fs(?:\/promises)?['"]/, reason: "fs is not allowed" },
  { re: /\bprocess\s*(?:\.\s*env|\[\s*['"]env['"]\s*\])/, reason: "process.env is not allowed" },
  { re: /\bprocess\s*\.\s*exit\b/, reason: "process.exit is not allowed" },
  { re: /\bprocess\s*\.\s*kill\b/, reason: "process.kill is not allowed" },
  { re: /\bprocess\s*\.\s*(?:binding|dlopen|mainModule)\b/, reason: "process internals are not allowed" },
  { re: /\beval\s*\(/, reason: "eval is not allowed" },
  { re: /\bnew\s+Function\b/, reason: "Function constructor is not allowed" },
  { re: /\bFunction\s*\(/, reason: "Function constructor is not allowed" },
  { re: /\bimport\s*\(/, reason: "dynamic import is not allowed" },
  {
    re: /\b(?:global(?:This)?|globalThis)\s*\.\s*process\b/,
    reason: "process access via global is not allowed",
  },
  { re: PRIVATE_NET_RE, reason: "localhost / private network access is not allowed" },
  { re: /\bfile:\/\//i, reason: "file:// URLs are not allowed" },
];

const PATH_RE = /^\/[a-zA-Z0-9/_-]{1,64}$/;
const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

export type BackendMethod = (typeof METHODS)[number];

export type BackendRouteInput = {
  path: string;
  method: string;
  code: string;
  dependencies?: string[];
};

export type ValidatedRoute = {
  path: string;
  method: BackendMethod;
  code: string;
  dependencies: string[];
  codeBytes: number;
};

export function validateBackendRoute(route: BackendRouteInput, index: number): ValidatedRoute {
  if (!route || typeof route !== "object") {
    throw new SandboxError(`Backend route ${index} is invalid`);
  }

  const method = String(route.method || "GET").toUpperCase();
  if (!METHODS.includes(method as BackendMethod)) {
    throw new SandboxError(`Backend route ${index} has invalid method`);
  }

  let path = String(route.path || "").trim();
  if (!path.startsWith("/")) path = `/${path}`;
  if (!PATH_RE.test(path) || path.includes("..")) {
    throw new SandboxError(
      `Backend route ${index} path must be like /my-route (letters, numbers, /, _, -)`,
    );
  }

  const code = String(route.code || "");
  if (!code.trim()) {
    throw new SandboxError(`Backend route ${index} is missing code`);
  }
  const codeBytes = Buffer.byteLength(code, "utf8");
  if (codeBytes > MAX_SESSION_CODE_BYTES) {
    throw new SandboxError(`Backend route ${index} code exceeds 1 MB session limit`);
  }

  for (const { re, reason } of DANGEROUS_PATTERNS) {
    if (re.test(code)) {
      throw new SandboxError(`Backend route ${index}: ${reason}`);
    }
  }

  const deps = Array.isArray(route.dependencies) ? route.dependencies : [];
  if (deps.length > MAX_DEPS) {
    throw new SandboxError(`Backend route ${index} lists too many dependencies`);
  }

  return {
    path,
    method: method as BackendMethod,
    code,
    dependencies: deps.map(String),
    codeBytes,
  };
}

export function validateBackendRoutes(routes: BackendRouteInput[]): ValidatedRoute[] {
  if (!Array.isArray(routes)) {
    throw new SandboxError("backend must be an array");
  }
  if (routes.length > MAX_ROUTES) {
    throw new SandboxError(`At most ${MAX_ROUTES} backend routes allowed`);
  }
  const validated = routes.map((route, i) => validateBackendRoute(route, i));
  const total = validated.reduce((sum, route) => sum + route.codeBytes, 0);
  if (total > MAX_SESSION_CODE_BYTES) {
    throw new SandboxError("Sandbox code exceeds 1 MB for this session");
  }
  return validated;
}
