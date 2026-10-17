import { useCallback, useEffect, useRef, useState } from "react";

export interface Recorder {
  recording: boolean;
  /** 0..1 microphone level for the pulse animation. */
  level: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<Blob | null>;
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export function useRecorder(): Recorder {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {
      // Already closed or never started; nothing to clean up.
    });
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record audio. Try Chrome.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access was denied. Allow it in the address bar, or type instead.");
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderRef.current = recorder;
    recorder.start(250);
    setRecording(true);

    // Level meter for the pulse animation.
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) {
          const d = (v - 128) / 128;
          sum += d * d;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * 4));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Level meter is cosmetic; recording still works without it.
    }
  }, []);

  const stop = useCallback(async (): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanup();
      setRecording(false);
      return null;
    }
    const blob = await new Promise<Blob>((resolve) => {
      const finish = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      // Fallback: if the browser never fires onstop, use whatever audio was captured.
      const timer = setTimeout(finish, 5000);
      recorder.onstop = () => {
        clearTimeout(timer);
        finish();
      };
      try {
        recorder.stop();
      } catch {
        clearTimeout(timer);
        finish();
      }
    });
    recorderRef.current = null;
    cleanup();
    setRecording(false);
    return blob.size > 0 ? blob : null;
  }, [cleanup]);

  return { recording, level, error, start, stop };
}
