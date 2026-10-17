import { useEffect, useLayoutEffect, useReducer, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ArrowUp, AudioWaveform, Laptop, Loader2, Mic, PanelsTopLeft, Square } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useScreenStore } from "../../store/screenStore";
import { useRecorder } from "../../lib/useRecorder";
import { transcribe } from "../../lib/api";
import { GoFan } from "./GoFan";
import { VoiceBar } from "./VoiceBar";
import { chooseEngine, getSpeechCtor, probeTranscribe, speechErrorEvent, startSpeech, type SpeechSession, type VoiceEngine } from "./speech";
import { DONE_MS, initialVoiceState, isDenied, isUnsupported, unsupportedReason, voiceActive, voiceReducer } from "./voice";
import { FilesMenu, ConnectorsMenu, ModelMenu, PermissionsMenu, PluginsMenu, ProjectMenu } from "./menus";
import { menuItemClass } from "./Popover";
import { MAX_FIELD_PX, applyMention, filterMentions, mentionQuery, isStoreBusy, placeholderFor } from "./logic";

/** Composer-local aliases of the shell theme tokens (index.css), so both themes apply. */
const TOKENS = {
  "--c-surface": "var(--color-surface)",
  "--c-tray": "var(--color-tray)",
  "--c-hover": "var(--color-hover)",
  "--c-line": "var(--color-line)",
  "--c-ink": "var(--color-ink)",
  "--c-ink-2": "var(--color-ink-2)",
  "--c-ink-3": "var(--color-ink-3)",
  "--c-accent": "var(--color-accent)",
  "--c-bad": "var(--color-bad)",
  "--c-shadow": "0 4px 24px color-mix(in srgb, var(--color-ink) 8%, transparent)",
} as CSSProperties;

export function Composer() {
  const [value, setValue] = useState("");
  const [fanOpen, setFanOpen] = useState(false);
  const [mentionDismissed, setMentionDismissed] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const goRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const skipFocusOpen = useRef(false);
  const reduce = useReducedMotion();

  const status = useScreenStore((s) => s.status);
  const hasScreen = useScreenStore((s) => s.screen !== null);
  const assets = useScreenStore((s) => s.assets);
  const mode = useScreenStore((s) => s.mode);
  const recorder = useRecorder();
  const [voice, dispatch] = useReducer(voiceReducer, undefined, () =>
    initialVoiceState(
      unsupportedReason({
        MediaRecorder: typeof MediaRecorder === "undefined" ? undefined : MediaRecorder,
        mediaDevices: typeof navigator === "undefined" ? null : navigator.mediaDevices,
      }),
    ),
  );
  const lastBlob = useRef<Blob | null>(null);
  const [engine, setEngine] = useState<VoiceEngine>("server");
  const [browserListening, setBrowserListening] = useState(false);
  const speechRef = useRef<SpeechSession | null>(null);
  const stoppedRef = useRef(false);

  const recording = recorder.recording || browserListening;
  const loading = status === "loading";
  const transcribing = status === "transcribing";
  const busy = loading || transcribing;
  const barOn = voiceActive(voice);
  const empty = !value.trim();

  useEffect(() => () => {
    window.clearTimeout(closeTimer.current);
    speechRef.current?.abort();
  }, []);

  // Recorder -> state machine: mic granted, or start() failed.
  useEffect(() => {
    if (recorder.recording) dispatch({ type: "granted" });
  }, [recorder.recording]);
  useEffect(() => {
    const msg = recorder.error;
    if (!msg) return;
    dispatch(isDenied(msg) || isUnsupported(msg) ? { type: "deny", message: msg } : { type: "fail", message: msg });
  }, [recorder.error]);
  useEffect(() => {
    if (voice.phase !== "done") return;
    const id = window.setTimeout(() => dispatch({ type: "dismiss" }), DONE_MS);
    return () => window.clearTimeout(id);
  }, [voice.phase]);

  const openFan = () => {
    window.clearTimeout(closeTimer.current);
    setFanOpen(true);
  };
  const closeFan = (delay = 180) => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setFanOpen(false), delay);
  };

  const query = mentionQuery(value);
  const mentionOptions = filterMentions(assets.map((a) => a.name), query);
  const mentionOpen = query !== null && mentionOptions.length > 0 && mentionDismissed !== value;

  useLayoutEffect(() => {
    const f = fieldRef.current;
    if (!f) return;
    f.style.height = "auto";
    f.style.height = `${Math.min(f.scrollHeight, MAX_FIELD_PX)}px`;
    f.style.overflowY = f.scrollHeight > MAX_FIELD_PX ? "auto" : "hidden";
  }, [value]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || isStoreBusy(useScreenStore.getState())) return;
    setValue("");
    void useScreenStore.getState().generate(t);
  };

  const submit = () => {
    if (recording) {
      void stopRecording();
      return;
    }
    if (busy || empty || barOn) return;
    send(value);
  };

  async function transcribeBlob(blob: Blob) {
    const { setStatus } = useScreenStore.getState();
    lastBlob.current = blob;
    setStatus("transcribing");
    try {
      const text = await transcribe(blob);
      setStatus("idle");
      if (!text) {
        dispatch({ type: "fail", message: "I couldn't hear any words. Try again, or type." });
        return;
      }
      lastBlob.current = null;
      dispatch({ type: "transcribed" });
      send(text);
    } catch (err) {
      setStatus("idle");
      dispatch({ type: "fail", message: err instanceof Error ? err.message : "Transcription failed." });
    }
  }

  function startBrowserSpeech() {
    const Ctor = getSpeechCtor();
    if (!Ctor) return;
    stoppedRef.current = false;
    let failed = false;
    speechRef.current = startSpeech(Ctor, {
      onStart: () => {
        setBrowserListening(true);
        dispatch({ type: "granted" });
      },
      onText: (t) => setValue(t),
      onError: (code) => {
        failed = true;
        dispatch(speechErrorEvent(code));
      },
      onEnd: (t) => {
        setBrowserListening(false);
        speechRef.current = null;
        if (failed) return;
        if (!stoppedRef.current) dispatch({ type: "stop" }); // ended on its own (silence)
        if (!t) {
          dispatch({ type: "fail", message: "I couldn't hear any words. Try again, or type." });
          return;
        }
        setValue(t);
        dispatch({ type: "transcribed" });
        send(t);
      },
    });
  }

  function stopBrowserSpeech() {
    stoppedRef.current = true;
    dispatch({ type: "stop" });
    speechRef.current?.stop();
  }

  async function stopRecording() {
    if (engine === "browser") return stopBrowserSpeech();
    dispatch({ type: "stop" });
    const blob = await recorder.stop();
    if (!blob) {
      dispatch({ type: "fail", message: "Nothing was recorded. Try again." });
      return;
    }
    await transcribeBlob(blob);
  }

  const pickMode = (m: "canvas" | "narrate") => {
    useScreenStore.getState().setMode(m);
    window.clearTimeout(closeTimer.current);
    setFanOpen(false);
  };

  const onMic = async () => {
    if (recording) return stopRecording();
    if (busy || voice.blocked || !(voice.phase === "idle" || voice.phase === "done")) return;
    dispatch({ type: "start" });
    const eng = chooseEngine(await probeTranscribe(), getSpeechCtor() !== null);
    setEngine(eng);
    if (eng === "browser") {
      setValue("");
      startBrowserSpeech();
      return;
    }
    await recorder.start();
  };

  const onRetry = () => {
    // A failed transcription retries the same audio; anything else records again.
    if (lastBlob.current && !recorder.recording) {
      dispatch({ type: "start" });
      dispatch({ type: "granted" });
      dispatch({ type: "stop" });
      void transcribeBlob(lastBlob.current);
      return;
    }
    if (engine === "browser") {
      dispatch({ type: "start" });
      setValue("");
      startBrowserSpeech();
      return;
    }
    dispatch({ type: "start" });
    void recorder.start();
  };

  const onFieldKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape" && mentionOpen) {
      setMentionDismissed(value);
      return;
    }
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    submit();
  };

  const attach = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      await useScreenStore.getState().uploadAsset(file);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const goLabel = recording ? "Stop recording" : loading ? "Working" : transcribing ? "Transcribing" : "Go";
  const goDisabled = !recording && (busy || empty || barOn);

  return (
    <div style={TOKENS} className="relative z-20 mx-auto w-full max-w-[740px]">
      {mentionOpen ? (
        <div
          role="menu"
          aria-label="Mention a file"
          className="absolute bottom-full left-4 z-40 mb-2 max-h-60 w-[300px] overflow-auto rounded-xl border border-[var(--c-line)] bg-[var(--c-surface)] p-1.5 shadow-[var(--c-shadow)]"
        >
          <p className="px-2 pt-1.5 pb-1 text-[12px] text-[var(--c-ink-3)]">Mention a file</p>
          {mentionOptions.map((name) => (
            <button
              key={name}
              type="button"
              role="menuitem"
              className={menuItemClass}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setValue(applyMention(value, name));
                fieldRef.current?.focus();
              }}
            >
              <span className="min-w-0 flex-1 truncate">@{name}</span>
            </button>
          ))}
        </div>
      ) : null}

      <form
        aria-label="Composer"
        data-testid="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="relative z-10 overflow-visible rounded-3xl border border-[var(--c-line)] bg-[var(--c-surface)] px-4 pt-4 pb-3 shadow-[var(--c-shadow)]"
      >
        <textarea
          ref={fieldRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onFieldKeyDown}
          placeholder={placeholderFor(hasScreen)}
          aria-label="Message"
          data-testid="message-input"
          className="block max-h-48 min-h-6 w-full resize-none bg-transparent text-[16px] leading-6 text-[var(--c-ink)] outline-none placeholder:text-[var(--c-ink-3)]"
        />
        <div className="relative mt-11 flex h-8 items-center gap-1">
          <div className={`flex min-w-0 flex-1 items-center gap-1 ${barOn ? "invisible" : ""}`} aria-hidden={barOn || undefined}>
            <ConnectorsMenu />
            <PermissionsMenu />
            <div className="min-w-0 flex-1" />
            <div className="mr-2"><ModelMenu /></div>
          </div>
          {barOn ? (
            <div className="absolute inset-y-0 right-10 left-0 flex min-w-0 items-stretch [&>*]:flex-1">
              <VoiceBar
                state={voice}
                level={engine === "browser" ? 0 : recorder.level}
                engine={engine}
                onStop={() => void stopRecording()}
                onRetry={onRetry}
                onDismiss={() => dispatch({ type: "dismiss" })}
              />
            </div>
          ) : null}
          <div
            className="relative ml-1 h-8 w-8"
            onPointerEnter={openFan}
            onPointerLeave={() => closeFan()}
            onFocus={() => {
              if (skipFocusOpen.current) return;
              openFan();
            }}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) closeFan(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && fanOpen) {
                e.stopPropagation();
                window.clearTimeout(closeTimer.current);
                setFanOpen(false);
                skipFocusOpen.current = true;
                goRef.current?.focus();
                skipFocusOpen.current = false;
              }
            }}
          >
            <motion.button
              ref={goRef}
              type="submit"
              aria-label={goLabel}
              aria-expanded={fanOpen}
              aria-busy={busy}
              aria-disabled={goDisabled}
              title={recording ? "Stop recording" : empty ? "Type a message to start" : "Go"}
              data-testid="go"
              whileHover={reduce || goDisabled ? undefined : { scale: 1.06 }}
              transition={{ duration: 0.15 }}
              className={`relative z-40 grid h-8 w-8 place-items-center rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-accent)] ${
                recording ? "bg-[var(--c-bad)]" : "bg-[var(--c-accent)]"
              } ${goDisabled ? "cursor-default opacity-50" : ""}`}
            >
              {recording ? (
                <>
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-[var(--c-bad)]/40"
                    animate={{ scale: 1 + recorder.level * 0.6 }}
                    transition={{ duration: 0.08 }}
                  />
                  <Square size={12} strokeWidth={0} fill="currentColor" className="relative" />
                </>
              ) : busy ? (
                <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />
              ) : (
                <ArrowUp size={16} strokeWidth={1.75} />
              )}
            </motion.button>
            <GoFan
              open={fanOpen}
              items={[
                {
                  key: "mic",
                  label: "Mic",
                  icon: Mic,
                  active: recording,
                  disabled: Boolean(voice.blocked) || (busy && !recording),
                  title: voice.blocked ?? undefined,
                  onClick: () => void onMic(),
                  testId: "mic-button",
                },
                { key: "canvas", label: "Canvas", icon: PanelsTopLeft, active: mode === "canvas", onClick: () => pickMode("canvas"), testId: "canvas-button" },
                { key: "narrate", label: "Narrate", icon: AudioWaveform, active: mode === "narrate", onClick: () => pickMode("narrate"), testId: "narrate-button" },
              ]}
            />
          </div>
        </div>
      </form>

      <div className="relative mx-4 -mt-3 flex items-center rounded-b-[20px] bg-[var(--c-tray)] pt-5 pr-5 pb-3 pl-6">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          aria-label="Attach a file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void attach(file);
          }}
        />
        <div className="flex items-center gap-1.5">
          <ProjectMenu />
          <FilesMenu assets={assets} inputRef={fileRef} uploading={uploading} error={uploadError} />
          <PluginsMenu />
        </div>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Share screen"
          aria-pressed={sharing}
          title={sharing ? "Stop sharing screen" : "Share screen"}
          onClick={() => setSharing((s) => !s)}
          className="grid h-8 w-8 place-items-center rounded-lg text-[var(--c-ink-3)] hover:bg-[var(--c-hover)] focus-visible:outline-none"
        >
          <Laptop size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
