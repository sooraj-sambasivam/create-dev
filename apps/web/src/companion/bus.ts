import { useEffect, useRef } from "react";

/** Window event the narrate flow (or anything else) fires to drive the companion. */
export const COMPANION_EVENT = "create:companion";

export const EVENT_TYPES = [
  "listening",
  "interim",
  "final",
  "thinking",
  "done",
  "confused",
  "error",
  "cancelled",
  "note",
  "celebrate",
  "level",
] as const;

export type CompanionEventType = (typeof EVENT_TYPES)[number];

export interface CompanionEvent {
  type: CompanionEventType;
  /** Spoken line or message. */
  text?: string;
  /** Target element label, for example "Heading". */
  label?: string;
  /** Mic level, 0..1. */
  level?: number;
}

const MAX_TEXT = 120;

function clean(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  if (!s) return undefined;
  return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT - 1) + "…" : s;
}

/** Validate an untrusted event payload. Unknown types and non-objects return null. */
export function parseCompanionEvent(detail: unknown): CompanionEvent | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;
  if (typeof d.type !== "string" || !(EVENT_TYPES as readonly string[]).includes(d.type)) return null;
  const evt: CompanionEvent = { type: d.type as CompanionEventType };
  const text = clean(d.text);
  const label = clean(d.label);
  if (text) evt.text = text;
  if (label) evt.label = label;
  if (typeof d.level === "number" && Number.isFinite(d.level)) evt.level = Math.min(1, Math.max(0, d.level));
  return evt;
}

/** Fire a companion event. Safe on the server and in tests (no window). */
export function emitCompanion(evt: CompanionEvent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COMPANION_EVENT, { detail: evt }));
}

let lastLevel = 0;
let lastLevelAt = 0;

/** Latest mic level and when it arrived; read from rAF, never through React state. */
export function getCompanionLevel(): { level: number; at: number } {
  return { level: lastLevel, at: lastLevelAt };
}

/** Listen for companion events. Returns the unsubscribe function. */
export function subscribeCompanion(handler: (evt: CompanionEvent) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const on = (e: Event) => {
    const evt = parseCompanionEvent((e as CustomEvent).detail);
    if (!evt) return;
    if (evt.type === "level") {
      lastLevel = evt.level ?? 0;
      lastLevelAt = Date.now();
    }
    handler(evt);
  };
  window.addEventListener(COMPANION_EVENT, on);
  return () => window.removeEventListener(COMPANION_EVENT, on);
}

export function useCompanionEvents(handler: (evt: CompanionEvent) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribeCompanion((e) => ref.current(e)), []);
}
