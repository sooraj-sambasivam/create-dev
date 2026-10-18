import type { IntentRequest } from "@create/shared";
import type { Bound } from "./syncBridge";
import { annotateTranscript, distinctTargets, requestFromBound } from "./deixis";
import { humanLabel, type HoverHit } from "../modes/narrate/overlay/targets";

export type DeixisPlan = {
  /** The page node the first deictic word was bound to (null when nothing was bound or something is pinned). */
  first: HoverHit | null;
  /** Two or more different nodes were named ("move this here"): one request carries all of them. */
  multi: boolean;
  /** The line to send: with each bound word followed by its node when `multi`, else unchanged. */
  spoken: string;
  /** Only set when `multi`. */
  req: IntentRequest | null;
  areas: Record<string, number>;
  /** Only set when `multi`: the node that gets edited (what the first deictic meant). */
  sourceId?: string;
};

/**
 * Turns the bindings for a finished line into what the command needs. An explicit pin wins over the pointer.
 * A live lasso also wins over several bound nodes, so `lassoLive` turns `multi` off.
 */
export function planDeixis(
  text: string,
  fin: Bound,
  hit: (id: string) => HoverHit | undefined,
  o: { pinned: boolean; lassoLive?: boolean; screen: { children?: readonly unknown[] } | null },
): DeixisPlan {
  const bound = o.pinned ? [] : fin.bound;
  const first = bound[0] ? hit(bound[0].targetId) ?? null : null;
  const targets = distinctTargets(bound);
  const multi = !o.lassoLive && targets.length >= 2;
  if (!multi) return { first, multi: false, spoken: text, req: null, areas: {} };
  const spoken = annotateTranscript(text, fin.bindings, (b) => {
    const id = b.target?.targetId;
    return id ? humanLabel(id, o.screen, hit(id)?.label ?? b.target?.label ?? id) : null;
  });
  return {
    first,
    multi: true,
    spoken,
    req: requestFromBound(spoken, bound),
    areas: Object.fromEntries(targets.map((t) => [t.targetId, hit(t.targetId)?.area ?? 0])),
    sourceId: targets[0].targetId,
  };
}
