import { useEffect, useState } from "react";
import { iconUrl } from "./canvasDrop";
import { ICON_RETRY_MS } from "./search";

const COLORFUL = /^(fluent-emoji|flat-color-icons|noto|twemoji|logos|emojione|openmoji|fxemoji|streamline-emojis|vscode-icons|skill-icons|devicon)/;

/**
 * Library thumbnail. Iconify throttles bursts, so a failed load is retried once after 800ms.
 * Reports its final outcome once so the grid can offer "Retry" when most thumbnails fail.
 */
export function IconThumb({ name, px = 24, onSettled }: { name: string; px?: number; onSettled?: (ok: boolean) => void }) {
  const base = iconUrl(name);
  const colorful = COLORFUL.test(name.split(":")[0] ?? "");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");
  const url = attempt ? `${base}?retry=${attempt}` : base;

  useEffect(() => {
    let dead = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const probe = new Image();
    probe.onload = () => {
      if (dead) return;
      setState("ok");
      onSettled?.(true);
    };
    probe.onerror = () => {
      if (dead) return;
      if (attempt === 0) {
        timer = setTimeout(() => !dead && setAttempt(1), ICON_RETRY_MS);
      } else {
        setState("failed");
        onSettled?.(false);
      }
    };
    probe.src = url;
    return () => {
      dead = true;
      if (timer) clearTimeout(timer);
      probe.onload = null;
      probe.onerror = null;
    };
    // onSettled is intentionally excluded: it must not restart the load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, attempt]);

  if (state === "failed") {
    return <span aria-hidden data-icon-missing className="inline-block rounded-md border border-dashed border-ink-3 opacity-50" style={{ width: px, height: px }} />;
  }
  if (colorful) {
    return <img src={url} alt="" width={px} height={px} style={{ opacity: state === "ok" ? 1 : 0.3 }} />;
  }
  return (
    <span
      aria-hidden
      className="inline-block bg-current"
      style={{
        width: px,
        height: px,
        opacity: state === "ok" ? 1 : 0.3,
        WebkitMask: `url("${url}") center / contain no-repeat`,
        mask: `url("${url}") center / contain no-repeat`,
      }}
    />
  );
}
