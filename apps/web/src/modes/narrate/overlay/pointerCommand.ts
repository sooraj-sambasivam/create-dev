import type { IntentRequest, IntentResult } from "@create/shared";
import { ask } from "../../../lib/api";
import { captureNodeImage } from "../../../lib/capture";
import { useScreenStore } from "../../../store/screenStore";
import type { WorkMode } from "../../../store/modeStore";
import type { PointerPhase } from "./PointerBubble";
import { matchOffered } from "./pointerLogic";
import { emitCompanion } from "../../../companion/bus";
import { askText, isDeictic, MIN_INTENT_CONFIDENCE, PANEL_PAGE_ROOT, preResolve, prettyLabel } from "./targets";

type Add = (e: Record<string, unknown>) => void;

/** The candidates behind the last "Which one?", so a spoken reply can pick one. */
export type Offered = { t: number; text: string; candidates: IntentRequest["candidates"] };
/** A spoken reply to "Which one?" counts for this long. */
export const OFFER_TTL_MS = 15_000;

export type CommandCtx = {
  mode: () => WorkMode;
  setPhase(p: PointerPhase): void;
  /** Narration recorder; absent for hold-to-talk outside Narrate mode. */
  add?: Add;
  isDone(): boolean;
  /** Aborts the route-intent fetch when the user cancels. */
  signal?: AbortSignal;
  offer(o: Offered | null): void;
};

/** The live page element for a node id in the panel's page, or null. */
export function pageElement(id: string | null, host: Document = document): HTMLElement | null {
  return id ? host.querySelector<HTMLElement>(`${PANEL_PAGE_ROOT} [data-node-id="${CSS.escape(id)}"]`) : null;
}

/** A PNG/JPEG data URL (at most 1024px, 1.5MB) of the node's picture, or undefined. Never throws. */
export const pointerImage = captureNodeImage;

/** Chat answer for a spoken line about the page and the pointed-at element. Never edits. */
export async function runAsk(ctx: CommandCtx, question: string, target: { id: string | null; label: string | null }): Promise<void> {
  ctx.setPhase({ kind: "understanding", targetId: target.id, label: target.label });
  try {
    const image = await pointerImage(pageElement(target.id), ctx.signal);
    const res = await ask({
      question: question.slice(0, 4000),
      screen: useScreenStore.getState().screen,
      pointer: target.id ? { targetId: target.id, ...(target.label ? { label: target.label.slice(0, 200) } : {}), ...(image ? { image } : {}) } : undefined,
      history: [],
    });
    if (ctx.isDone()) return;
    ctx.setPhase({ kind: "answer", targetId: target.id, label: target.label, question, answer: res.answer, suggestCode: res.suggestCode });
  } catch (e) {
    if (!ctx.isDone()) ctx.setPhase({ kind: "failed", targetId: target.id, label: target.label, message: e instanceof Error ? e.message : "Couldn't answer" });
  }
}

/** A spoken reply to "Which one?" turned into a request for the chosen candidate, or null when it names none. */
export function answerOffered(offered: Offered | null, reply: string, now: number): IntentRequest | null {
  // A reply is short ("the button", "the second one"); a longer line is a new command.
  if (!offered || now - offered.t > OFFER_TTL_MS || reply.trim().split(/\s+/).length > 5) return null;
  const at = matchOffered(reply, offered.candidates.map((c) => prettyLabel(c.label)));
  if (at === null) return null;
  const c = offered.candidates[at];
  return { transcript: offered.text, candidates: [c], pointer: { targetId: c.id, label: c.label } };
}

/**
 * One spoken line against the pointer. Chat answers; Code routes the line and edits, unless the router calls
 * it a question, which is answered instead.
 */
export function runPointerCommand(
  ctx: CommandCtx,
  text: string,
  req: IntentRequest,
  areas: Record<string, number>,
  /** "Move this here" bound two nodes: `sourceId` is the one the first word meant, and it is the one that gets edited. */
  opts: { sourceId?: string } = {},
): void {
  const labelOf = (id: string | null) => (id ? req.candidates.find((c) => c.id === id)?.label ?? null : null);
  const fail = (message: string, id: string | null) => ctx.setPhase({ kind: "failed", targetId: id, label: labelOf(id), message });
  const pre = preResolve(req, areas);
  const bound = req.pointer?.targetId ?? (pre.kind === "target" ? pre.id : null);
  const add = ctx.add;
  if (bound) add?.({ kind: "note", text: `Pointing at ${labelOf(bound) ?? bound}; says: ${text}`.slice(0, 4000) });
  ctx.offer(null);
  if (ctx.mode() === "chat") {
    void runAsk(ctx, text, { id: bound, label: labelOf(bound) });
    return;
  }
  const tFinal = performance.now();
  ctx.setPhase({ kind: "understanding", targetId: bound, label: labelOf(bound) });
  void (async () => {
    let intent: IntentResult;
    try {
      const res = await fetch("/api/route-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal: ctx.signal,
      });
      if (!res.ok) throw new Error(String(res.status));
      intent = (await res.json()) as IntentResult;
    } catch {
      if (!ctx.isDone()) fail("Couldn't check that line", bound);
      return;
    }
    if (ctx.isDone()) return;
    const tIntent = performance.now();
    if (intent.action === "ask") {
      await runAsk(ctx, text, { id: bound, label: labelOf(bound) });
      return;
    }
    if (!intent.isCommand) { ctx.setPhase({ kind: "idle" }); return; }
    if (intent.confidence < MIN_INTENT_CONFIDENCE) { fail("Not sure what to change", bound); return; }
    // The router's pick wins when it is one of the candidates; "this/that" falls back to the pointer.
    let id = intent.targetId && req.candidates.some((c) => c.id === intent.targetId) ? intent.targetId : null;
    if (opts.sourceId && req.candidates.some((c) => c.id === opts.sourceId)) id = opts.sourceId;
    if (!id && isDeictic(text) && pre.kind === "target") id = pre.id;
    if (!id) {
      if (pre.kind === "ask" || req.candidates.length > 1) {
        const shown = req.candidates.slice(0, 4);
        ctx.offer({ t: Date.now(), text, candidates: shown });
        ctx.setPhase({ kind: "ask", message: askText(pre.kind === "ask" ? pre.labels : shown.map((c) => c.label)) });
      } else fail("Point at something first", null);
      return;
    }
    add?.({ kind: "note", text: `Live command (${intent.action ?? "edit"}) on ${id}: ${text}`.slice(0, 4000) });
    emitCompanion({ type: "note", label: labelOf(id) ?? undefined, text: text.slice(0, 60) });
    ctx.setPhase({ kind: "editing", targetId: id, label: labelOf(id) });
    let result: { error?: string; summary?: string };
    try {
      result = await useScreenStore.getState().editNodeWithAI(id, text);
    } catch (e) {
      result = { error: e instanceof Error ? e.message : "Edit failed" };
    }
    const tApplied = performance.now();
    console.info(
      `[pointer] final→intent ${Math.round(tIntent - tFinal)}ms, intent→applied ${Math.round(tApplied - tIntent)}ms, total ${Math.round(tApplied - tFinal)}ms (${intent.action})`,
    );
    if (ctx.isDone()) return;
    if (result.error) fail(result.error, id);
    else ctx.setPhase({ kind: "done", targetId: id, label: labelOf(id), message: result.summary, undoable: Boolean(result.summary) });
  })();
}
