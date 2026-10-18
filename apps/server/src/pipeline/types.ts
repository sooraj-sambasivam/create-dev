import type Anthropic from "@anthropic-ai/sdk";
import type { CaptureInput, LocateResult, LocateSource } from "@create/shared";

export type FetchFn = typeof fetch;

/** Image facts shared by every pixel provider. `coord` is the space cursor/AX/DOM/result boxes live in. */
export interface ImageCtx {
  dataUrl: string;
  mime: "image/png" | "image/jpeg";
  bytes: Buffer;
  /** Decoded pixel size (PNG/JPEG header), when readable. */
  decoded: { w: number; h: number } | null;
  /** Coordinate space of the input: input.imageSize, else decoded size. */
  coord: { w: number; h: number } | null;
  /** Downscaled copy of the same frame from input.imageSmall (PNG/JPEG only), when supplied and readable. */
  small?: { bytes: Buffer; mime: "image/png" | "image/jpeg"; decoded: { w: number; h: number } } | null;
}

export interface LocateDeps {
  fetchImpl?: FetchFn;
  client?: Anthropic;
  /** Per-provider timeouts in ms; omitted keys use PROVIDER_TIMEOUT_MS. */
  timeouts?: Partial<Record<LocateSource, number>>;
  /** After the first pixel result, wait this long for others before fusing. */
  graceMs?: number;
  traceDir?: string;
  /** false disables trace file writes (tests). Default true. */
  writeTrace?: boolean;
}

export interface ProviderCtx {
  input: CaptureInput;
  image: ImageCtx | null;
  deps: LocateDeps;
  timeoutMs: number;
}

/** A provider returns candidates (possibly empty), or throws to report an error in the trace. */
export type LocateProvider = (ctx: ProviderCtx) => Promise<LocateResult[]>;
