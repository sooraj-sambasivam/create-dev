import type { CompanionEvent } from "./bus";

export type FaceKind =
  | "idle"
  | "listening"
  | "hearing"
  | "noting"
  | "thinking"
  | "done"
  | "confused"
  | "error"
  | "cancelled"
  | "celebrate";

export type NoteKind = "heard" | "ok" | "ask" | "bad";
export interface Note {
  id: number;
  kind: NoteKind;
  text: string;
}

export interface MachineState {
  face: FaceKind;
  /** When the current timed face ends (ms epoch); null for sustained faces. Timers are data. */
  until: number | null;
  notes: Note[];
  notesUntil: number | null;
  /** Bumps on every face transition so one-shot animations can replay. */
  nonce: number;
  /** Bumps each time roughly three more words were heard (a nod). */
  nod: number;
  words: number;
  lastEventAt: number | null;
  /** Time of the last reduce; forces a render when a tick expires nothing visible. */
  now: number;
  seq: number;
}

export type MachineEvent = CompanionEvent | { type: "tick" };

export const DURATIONS = {
  done: 1200,
  celebrate: 1600,
  cancelled: 1500,
  error: 4000,
  confused: 5000,
  noting: 1400,
  hearing: 900,
  listening: 10000,
  thinking: 60000,
  notes: 6000,
  visible: 20000,
} as const;

export const MAX_NOTES = 4;

const PRIORITY: Record<FaceKind, number> = {
  idle: 0,
  listening: 1,
  hearing: 2,
  celebrate: 3,
  done: 4,
  cancelled: 4,
  noting: 5,
  thinking: 6,
  confused: 7,
  error: 8,
};

export const initialState: MachineState = {
  face: "idle",
  until: null,
  notes: [],
  notesUntil: null,
  nonce: 0,
  nod: 0,
  words: 0,
  lastEventAt: null,
  now: 0,
  seq: 0,
};

function expire(s: MachineState, now: number): MachineState {
  let next = s;
  if (s.until !== null && now >= s.until) {
    next =
      s.face === "hearing"
        ? { ...next, face: "listening", until: now + DURATIONS.listening, nonce: s.nonce + 1 }
        : { ...next, face: "idle", until: null, nonce: s.nonce + 1 };
  }
  if (s.notesUntil !== null && now >= s.notesUntil) next = { ...next, notes: [], notesUntil: null };
  return next;
}

function canApply(cur: FaceKind, next: FaceKind): boolean {
  if (cur === "thinking" && (next === "done" || next === "cancelled")) return true;
  return PRIORITY[next] >= PRIORITY[cur];
}

function setFace(s: MachineState, face: FaceKind, now: number, ms: number | null): MachineState {
  if (!canApply(s.face, face)) return s;
  return { ...s, face, until: ms === null ? null : now + ms, nonce: s.nonce + 1 };
}

function addNote(s: MachineState, kind: NoteKind, text: string, now: number): MachineState {
  const note: Note = { id: s.seq + 1, kind, text };
  return {
    ...s,
    seq: s.seq + 1,
    notes: [...s.notes, note].slice(-MAX_NOTES),
    notesUntil: now + DURATIONS.notes,
  };
}

const wordCount = (t?: string) => (t ? t.split(/\s+/).filter(Boolean).length : 0);
const join = (label: string | undefined, text: string) => (label ? `${label} · ${text}` : text);

/** Pure reducer. `now` is passed in so tests and timers stay deterministic. */
export function reduce(prev: MachineState, evt: MachineEvent, now: number): MachineState {
  if (evt.type === "level") return prev;
  let s = expire(prev, now);
  if (evt.type === "tick") return { ...s, now };
  s = { ...s, now, lastEventAt: now };
  switch (evt.type) {
    case "listening":
      return setFace({ ...s, words: 0 }, "listening", now, DURATIONS.listening);
    case "interim": {
      const words = wordCount(evt.text);
      const nod = Math.floor(words / 3) > Math.floor(s.words / 3) ? s.nod + 1 : s.nod;
      const heard = setFace({ ...s, words, nod }, "hearing", now, DURATIONS.hearing);
      // A lower-priority interim must not shorten a running timer, but it keeps listening alive.
      return heard;
    }
    case "final":
      return setFace(addNote({ ...s, words: 0 }, "heard", evt.text ?? "Heard you", now), "noting", now, DURATIONS.noting);
    case "note":
      return setFace(addNote(s, "ok", join(evt.label, evt.text ?? "Noted"), now), "noting", now, DURATIONS.noting);
    case "thinking":
      return setFace(s, "thinking", now, DURATIONS.thinking);
    case "done":
      return setFace(addNote(s, "ok", join(evt.label, evt.text ?? "Done"), now), "done", now, DURATIONS.done);
    case "confused": {
      const q = evt.text ?? "Which one?";
      return setFace(addNote(s, "ask", evt.label ? `${q.replace(/\?$/, "")}: ${evt.label}` : q, now), "confused", now, DURATIONS.confused);
    }
    case "error": {
      const msg = (evt.text ?? "Something went wrong").slice(0, 60);
      return setFace(addNote(s, "bad", msg, now), "error", now, DURATIONS.error);
    }
    case "cancelled":
      return setFace(s, "cancelled", now, DURATIONS.cancelled);
    case "celebrate":
      return setFace(s, "celebrate", now, DURATIONS.celebrate);
    default:
      return prev;
  }
}

/** Next time something in the state changes by itself, or null when nothing is pending. */
export function nextWake(s: MachineState): number | null {
  const times = [s.until, s.notesUntil, s.lastEventAt === null ? null : s.lastEventAt + DURATIONS.visible].filter(
    (t): t is number => t !== null && t > s.now,
  );
  return times.length ? Math.min(...times) : null;
}

/** Shown without Narrate mode only while events keep arriving (idle for 20s hides it). */
export function activeByEvents(s: MachineState): boolean {
  return s.lastEventAt !== null && s.now - s.lastEventAt < DURATIONS.visible;
}
