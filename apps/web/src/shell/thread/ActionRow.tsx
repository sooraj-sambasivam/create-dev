import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, RotateCw, ThumbsDown, ThumbsUp, Volume2, VolumeX } from "lucide-react";
import { useScreenStore } from "../../store/screenStore";
import { toast } from "../../ui/toastStore";
import { ICON, STROKE, button } from "../../ui/styles";
import { shareAndCopy } from "../output/shareApi";
import { plainText } from "./markdown";
import { Tip } from "./Tip";

type Vote = "up" | "down" | null;

const synth = (): SpeechSynthesis | null => (typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null);

/** Copy, Read aloud, Good, Bad, Share link and Retry under a finished assistant turn. */
export function ActionRow({ text, retry, latest }: { text: string; retry: { prompt: string; as: "build" | "ask" } | null; latest: boolean }) {
  const generate = useScreenStore((s) => s.generate);
  const ask = useScreenStore((s) => s.ask);
  const busy = useScreenStore((s) => s.status === "loading" || s.asking);
  const hasPage = useScreenStore((s) => s.screen !== null);
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [vote, setVote] = useState<Vote>(null);
  const [sharing, setSharing] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const canSpeak = synth() !== null;
  const plain = plainText(text);

  useEffect(
    () => () => {
      window.clearTimeout(copyTimer.current);
      // Leaving the thread mid-sentence stops the voice, but only if it is this row's.
      if (utterance.current) synth()?.cancel();
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plain);
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Couldn't copy. Select the text instead.");
    }
  };

  const readAloud = () => {
    const s = synth();
    if (!s) return;
    if (speaking) {
      s.cancel();
      setSpeaking(false);
      return;
    }
    s.cancel();
    const u = new SpeechSynthesisUtterance(plain);
    u.onend = u.onerror = () => {
      setSpeaking(false);
      if (utterance.current === u) utterance.current = null;
    };
    utterance.current = u;
    setSpeaking(true);
    s.speak(u);
  };

  const share = async () => {
    const screen = useScreenStore.getState().screen;
    if (!screen || sharing) return;
    setSharing(true);
    try {
      const { url, copied: ok } = await shareAndCopy(screen);
      toast(ok ? "Link copied" : url);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't create a share link.");
    } finally {
      setSharing(false);
    }
  };

  const icon = { size: ICON.md, strokeWidth: STROKE, "aria-hidden": true } as const;
  // The newest turn keeps its row visible; older rows appear on hover or focus. Touch always shows it.
  const visibility = latest ? "" : "opacity-0 transition-opacity duration-200 group-hover/turn:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100";

  return (
    <div role="toolbar" aria-label="Message actions" className={`-ml-2 flex items-center gap-0.5 ${visibility}`} data-testid="action-row">
      <Tip label={copied ? "Copied" : "Copy"}>
        <button type="button" aria-label="Copy" onClick={() => void copy()} className={button.icon}>
          {copied ? <Check {...icon} className="text-ok" /> : <Copy {...icon} />}
        </button>
      </Tip>
      {canSpeak && (
        <Tip label={speaking ? "Stop" : "Read aloud"}>
          <button type="button" aria-label={speaking ? "Stop reading" : "Read aloud"} aria-pressed={speaking} onClick={readAloud} className={button.icon}>
            {speaking ? <VolumeX {...icon} /> : <Volume2 {...icon} />}
          </button>
        </Tip>
      )}
      <Tip label="Good response">
        <button type="button" aria-label="Good response" aria-pressed={vote === "up"} onClick={() => setVote(vote === "up" ? null : "up")} className={`${button.icon} ${vote === "up" ? "!text-ink" : ""}`}>
          <ThumbsUp {...icon} className={vote === "up" ? "fill-current" : ""} />
        </button>
      </Tip>
      <Tip label="Bad response">
        <button type="button" aria-label="Bad response" aria-pressed={vote === "down"} onClick={() => setVote(vote === "down" ? null : "down")} className={`${button.icon} ${vote === "down" ? "!text-ink" : ""}`}>
          <ThumbsDown {...icon} className={vote === "down" ? "fill-current" : ""} />
        </button>
      </Tip>
      <Tip label="Share link">
        <button type="button" aria-label="Share link" disabled={!hasPage || sharing} onClick={() => void share()} className={button.icon}>
          <Link2 {...icon} />
        </button>
      </Tip>
      {retry && (
        <Tip label="Retry">
          <button
            type="button"
            aria-label="Retry"
            disabled={busy}
            onClick={() => void (retry.as === "ask" ? ask(retry.prompt) : generate(retry.prompt))}
            className={button.icon}
          >
            <RotateCw {...icon} />
          </button>
        </Tip>
      )}
    </div>
  );
}
