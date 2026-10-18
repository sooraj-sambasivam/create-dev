import { useEffect } from "react";
import { BUCKET_LABEL, type BucketId } from "./model";
import { useAuth } from "./authStore";
import { text } from "../ui/styles";

/** Remaining demo usage per bucket, with a thin bar each. */
export function UsageMeter({ compact = false }: { compact?: boolean }) {
  const usage = useAuth((s) => s.usage);
  const refresh = useAuth((s) => s.refreshUsage);
  useEffect(() => { void refresh(); }, [refresh]);
  if (!usage) return null;
  if (usage.admin) return <p className={text.meta}>Admin: no usage limits.</p>;
  if (!usage.enforced) return <p className={text.meta}>No usage limits on this server.</p>;
  return (
    <div className="flex flex-col gap-2">
      {(Object.keys(BUCKET_LABEL) as BucketId[]).map((id) => {
        const b = usage.buckets[id];
        const pct = b.limit ? Math.min(100, (b.used / b.limit) * 100) : 0;
        return (
          <div key={id} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className={compact ? text.meta : text.ui}>{BUCKET_LABEL[id].name}</span>
              <span className={`${text.meta} tabular-nums`}>{b.remaining} of {b.limit} left</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-tray" role="progressbar" aria-label={`${BUCKET_LABEL[id].name} used`} aria-valuemin={0} aria-valuemax={b.limit} aria-valuenow={b.used}>
              <div className={`h-full rounded-full ${b.remaining === 0 ? "bg-bad" : "bg-ink-2"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
      <p className={text.meta}>Resets daily at {new Date(usage.resetAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.</p>
    </div>
  );
}
