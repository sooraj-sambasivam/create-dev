import { useState } from "react";
import { motion } from "motion/react";
import { useScreenStore } from "../../store/screenStore";
import { PromptComposer } from "../../components/PromptComposer";
import { useRecorder } from "../../lib/useRecorder";
import { transcribe } from "../../lib/api";

export function VoiceMode() {
  const [value, setValue] = useState("");
  const [heard, setHeard] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const status = useScreenStore((s) => s.status);
  const setStatus = useScreenStore((s) => s.setStatus);
  const generate = useScreenStore((s) => s.generate);
  const screen = useScreenStore((s) => s.screen);
  const recorder = useRecorder();

  const busy = status === "loading" || status === "transcribing";

  const send = (text: string) => {
    setValue("");
    void generate(text);
  };

  const toggleRecording = async () => {
    setLocalError(null);
    if (recorder.recording) {
      const blob = await recorder.stop();
      if (!blob) {
        setLocalError("Nothing was recorded. Try holding the mic a little longer.");
        return;
      }
      setStatus("transcribing");
      try {
        const text = await transcribe(blob);
        setStatus("idle");
        if (!text) {
          setLocalError("I couldn't hear any words. Try again, or type below.");
          return;
        }
        setHeard(text);
        setValue(text);
        send(text);
      } catch (err) {
        setStatus("idle");
        setLocalError(err instanceof Error ? err.message : "Transcription failed.");
      }
      return;
    }
    setHeard(null);
    await recorder.start();
  };

  const error = localError ?? recorder.error;
  const pulse = 1 + recorder.level * 0.6;

  const mic = (
    <button
      type="button"
      onClick={toggleRecording}
      disabled={status === "loading" || status === "transcribing"}
      aria-pressed={recorder.recording}
      aria-label={recorder.recording ? "Stop recording" : "Start recording"}
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition disabled:opacity-50 ${
        recorder.recording ? "bg-bad text-white" : "bg-tray text-ink-2 hover:bg-hover"
      }`}
    >
      {recorder.recording && (
        <motion.span
          className="absolute inset-0 rounded-xl bg-bad/40"
          animate={{ scale: pulse, opacity: 0.9 - recorder.level * 0.5 }}
          transition={{ duration: 0.08 }}
        />
      )}
      <span className="relative">
        {recorder.recording ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        )}
      </span>
    </button>
  );

  let hint: string;
  if (error) hint = error;
  else if (recorder.recording) hint = "Listening… tap the square to stop.";
  else if (status === "transcribing") hint = "Transcribing…";
  else if (status === "loading" && heard) hint = `Heard: “${heard}” — building it…`;
  else if (heard) hint = `Heard: “${heard}”`;
  else hint = screen ? "Tap the mic and say what to change, or type." : "Tap the mic and describe the screen, or type.";

  return (
    <div className="flex w-full flex-col gap-3">
      {!screen && status !== "loading" && (
        <motion.button
          type="button"
          onClick={toggleRecording}
          disabled={busy}
          aria-label={recorder.recording ? "Stop recording" : "Start recording"}
          className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full border transition ${
            recorder.recording
              ? "border-bad/60 bg-bad/15 text-bad"
              : "border-line bg-surface text-ink-2 hover:border-accent/50"
          }`}
          animate={recorder.recording ? { scale: pulse } : { scale: 1 }}
          transition={{ duration: 0.08 }}
        >
          {recorder.recording ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          )}
        </motion.button>
      )}
      <PromptComposer
        value={value}
        onChange={setValue}
        onSubmit={send}
        disabled={busy}
        leading={mic}
        placeholder={recorder.recording ? "Listening…" : "…or type here"}
        hint={<span className={error ? "text-bad" : undefined}>{hint}</span>}
      />
    </div>
  );
}
