import { useState } from "react";
import { useScreenStore } from "../../store/screenStore";
import { useSelectedLabel } from "../../editor/useSelectedLabel";
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
  const selectedLabel = useSelectedLabel();

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
        placeholder={
          selectedLabel
            ? `Change the selected ${selectedLabel}: “make this bigger”, “rewrite it to sound friendlier”…`
            : screen
              ? "Refine it: “make the button green”, “add a pricing section”…"
              : "Describe the screen you want…"
        }
        hint={busy ? "Building your screen…" : "Enter to send · Shift+Enter for a new line"}
      />
    </div>
  );
}
