import { TypeSafeClient, choice, noul } from "@typesafe-ai/sdk";
import type { IntentRequest, IntentResult } from "@create/shared";

/**
 * Jev (TypeSafe System One) wrapper. Jev returns typed judgments with probabilities; it does not
 * generate text or browse. Lazy client, one attempt, hard 1.5s timeout. Never logs or returns the key.
 */

export const JEV_TIMEOUT_MS = 1500;

type Action = IntentResult["action"];
const ACTIONS: Action[] = ["restyle", "move", "delete", "add", "replace_text", "regenerate", "none"];

const ACTION_CRITERIA: Record<Action, string> = {
  restyle: "Change how an element looks: color, size, font, spacing, border, shadow.",
  move: "Change where an element sits: move, align, reorder, resize position.",
  delete: "Remove an element.",
  add: "Create a new element or section.",
  replace_text: "Change the words inside an element.",
  regenerate: "Rebuild or redo the whole page or an element from scratch.",
  none: "No edit action is requested.",
};

export function hasTypesafeKey(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}

// The cached client keeps the first TYPESAFE_API_KEY for the life of the process; a changed
// env key is ignored until restart (or resetJevClient in tests).
let cached: TypeSafeClient | null = null;
function getClient(): TypeSafeClient {
  cached ??= new TypeSafeClient({ apiKey: process.env.TYPESAFE_API_KEY!.trim(), retry: { maxRetries: 0 }, timeout: JEV_TIMEOUT_MS });
  return cached;
}

/** Test hook: drop the cached client. */
export function resetJevClient(): void {
  cached = null;
}

type JevClientLike = Pick<TypeSafeClient, "systemOne">;

/**
 * Ask Jev whether the line is an edit command, which candidate it targets, and the action.
 * Returns null when there is no key, on any error or timeout, or when the answer is unusable,
 * so the caller falls through to the next engine.
 */
export async function judgeIntent(req: IntentRequest, opts: { client?: JevClientLike } = {}): Promise<IntentResult | null> {
  if (!opts.client && !hasTypesafeKey()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JEV_TIMEOUT_MS);
  try {
    const client = opts.client ?? getClient();
    const aliasToId = new Map<string, string>();
    const targetCriteria: Record<string, string> = { none: "No listed element is clearly the one meant." };
    req.candidates.forEach((c, i) => {
      const alias = `c${i + 1}`;
      aliasToId.set(alias, c.id);
      targetCriteria[alias] = `${c.kind} "${c.label}"`;
    });
    const hasCandidates = aliasToId.size > 0;

    // Candidate `label` text is user-controlled and enters the prompt. This is bounded: targetId
    // is only ever one of the real candidate ids, re-checked below.
    const questions = {
      isInstruction: noul(
        "Is the speaker giving an instruction to change the page or drawing (as opposed to thinking aloud, narrating or chatting)? Judge `transcript`.",
      ),
      action: choice("Which kind of edit does the speaker ask for in `transcript`?", ACTION_CRITERIA),
      // A single-label choice is not a valid question, so `target` is left out with no candidates.
      ...(hasCandidates
        ? {
            target: choice(
              "Which candidate element does the speaker mean in `transcript`? Answer with a candidate id, or none.",
              targetCriteria,
            ),
          }
        : {}),
    };

    const { answers } = (await client.systemOne(
      {
        state: {
          transcript: req.transcript,
          candidates: req.candidates.map((c, i) => ({ id: `c${i + 1}`, label: c.label, kind: c.kind })),
        },
        questions,
      },
      { signal: controller.signal, timeout: JEV_TIMEOUT_MS, retry: { maxRetries: 0 } },
    )) as unknown as { answers: Record<string, any> };

    const pCommand = answers.isInstruction.noul;
    if (!(pCommand >= 0 && pCommand <= 1)) return null;
    if (pCommand < 0.5) {
      return { isCommand: false, targetId: null, action: "none", confidence: 1 - pCommand };
    }

    const action = answers.action.choice as Action;
    if (!ACTIONS.includes(action) || action === "none") return null;
    const pAction = answers.action.probabilities?.[action];

    let targetId: string | null = null;
    let pTarget = 1;
    if (hasCandidates) {
      const picked = answers.target?.choice as string;
      pTarget = (answers.target?.probabilities as Record<string, number> | undefined)?.[picked] as number;
      if (picked !== "none") {
        const id = aliasToId.get(picked);
        if (!id || !req.candidates.some((c) => c.id === id)) return null;
        targetId = id;
      }
    }

    const confidence = Math.min(pCommand, pAction as number, pTarget);
    if (!Number.isFinite(confidence)) return null;
    return { isCommand: true, targetId, action, confidence: Math.min(1, Math.max(0, confidence)) };
  } catch (err) {
    console.warn("[jev] falling through:", err instanceof Error ? err.constructor.name : "unknown error");
    return null;
  } finally {
    clearTimeout(timer);
  }
}
