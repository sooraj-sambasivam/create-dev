import { Check } from "lucide-react";
import { button, ICON, STROKE } from "../ui/styles";
import { Meter, SelectField } from "./controls";
import { browserFixCopy } from "./steps";
import type { MicSession } from "./useMic";

/** Shared microphone controls for onboarding and Settings: allow, device, level, and the fix for Blocked. */
export function MicBody({ mic, testing, onTest, onTypeInstead }: { mic: MicSession; testing?: boolean; onTest?: () => void; onTypeInstead?: () => void }) {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (mic.status === "blocked") {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-lg bg-tray p-3 text-[14px] leading-5 text-ink">{browserFixCopy(ua)}</div>
        <div className="flex gap-2">
          <button type="button" className={button.secondary} onClick={() => void mic.start()} disabled={mic.pending}>Check again</button>
          {onTypeInstead && <button type="button" className={button.ghost} onClick={onTypeInstead}>Type instead</button>}
        </div>
      </div>
    );
  }
  if (mic.status !== "granted") {
    return (
      <div className="flex flex-col gap-2">
        {mic.last === "no-device" && <p className="text-[14px] text-ink-2">No microphone found. You can still type.</p>}
        {mic.last === "unsupported" && <p className="text-[14px] text-ink-2">This browser can&rsquo;t use a microphone. You can still type.</p>}
        {mic.status === "not-now" && !mic.last && <p className="text-[14px] text-ink-2">You can turn this on later in Settings.</p>}
        <div>
          <button type="button" className={button.primary} onClick={() => void mic.start()} disabled={mic.pending}>
            {mic.pending ? "Waiting for your browser…" : "Allow microphone"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-14 text-[14px] text-ink-2">Device</span>
        <SelectField label="Microphone device" value={mic.deviceId ?? ""} onChange={mic.pick} disabled={mic.devices.length === 0}>
          {mic.deviceId === null && <option value="">Default microphone</option>}
          {mic.devices.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </SelectField>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-14 text-[14px] text-ink-2">Level</span>
        {mic.live ? (
          <>
            <Meter value={mic.level} />
            <span role="status" aria-live="polite" className="inline-flex items-center gap-1 text-[14px] text-ink-2">
              {mic.heard ? (<><Check size={ICON.sm} strokeWidth={STROKE} className="text-ok" aria-hidden="true" />Hearing you</>) : "Say something. The bar should move."}
            </span>
          </>
        ) : onTest ? (
          <button type="button" className={button.secondary} onClick={onTest} disabled={testing || mic.pending}>Test</button>
        ) : (
          <span className="text-[14px] text-ink-2">Starting…</span>
        )}
      </div>
    </div>
  );
}
