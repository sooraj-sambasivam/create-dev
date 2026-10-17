import { useEffect, useState } from "react";
import { useScreenStore } from "../../store/screenStore";
import { PromptComposer } from "../../components/PromptComposer";

const SUGGESTIONS = [
  "A landing page for a cozy coffee shop",
  "A login page with email, password and a forgot-password link",
  "A dashboard with three stat cards and a recent activity list",
  "A newsletter signup with a dark theme",
];

export function TextMode() {
  const [value, setValue] = useState("");
  const screen = useScreenStore((s) => s.screen);
  const status = useScreenStore((s) => s.status);
  const generate = useScreenStore((s) => s.generate);
  const busy = status === "loading";

  // On the start screen, catch typing that happens before the box has focus (e.g. during the
  // opening animation) so no letters are lost.
  useEffect(() => {
    if (screen) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
      e.preventDefault();
      setValue((v) => v + e.key);
      document.querySelector<HTMLTextAreaElement>("[data-composer] textarea")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen]);

  const send = (text: string) => {
    setValue("");
    void generate(text);
  };

  return (
    <div className="flex w-full flex-col gap-3">
      {!screen && status !== "loading" && (
        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-full border border-white/10 bg-neutral-900/60 px-3 py-1.5 text-xs text-neutral-300 transition hover:border-indigo-400/40 hover:text-white"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <PromptComposer
        value={value}
        onChange={setValue}
        onSubmit={send}
        disabled={busy}
        autoFocus
        placeholder={screen ? "Change the whole page: “add a pricing section”, “make it feel more premium”…" : "Describe the screen you want…"}
        hint={busy ? "Building your screen…" : "Enter to send · Shift+Enter for a new line"}
      />
    </div>
  );
}
