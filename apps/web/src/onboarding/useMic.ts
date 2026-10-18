import { useCallback, useEffect, useRef, useState } from "react";
import { usePermissions, resolveDeviceId } from "./permissions";
import { levelFromBytes, micStatus, openMic, type MicResult, type PermState } from "./steps";

export type MicDevice = { id: string; label: string };
const HEARD_LEVEL = 0.08;
const HEARD_MS = 300;
const FRAME_MS = 50;

/**
 * Real microphone session for onboarding and Settings: asks only when start() is called, keeps the
 * stream open for the level meter, and stops every track on stop() or unmount.
 */
export function useMic() {
  const perm = usePermissions();
  const [status, setStatus] = useState<PermState>(perm.mic);
  const [last, setLast] = useState<MicResult | null>(null);
  const [pending, setPending] = useState(false);
  const [live, setLive] = useState(false);
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  const [devices, setDevices] = useState<MicDevice[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const alive = useRef(true);

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void ctx.current?.close().catch(() => undefined);
    ctx.current = null;
    setLive(false);
    setLevel(0);
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all.filter((d) => d.kind === "audioinput" && d.deviceId).map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
      if (alive.current) setDevices(inputs);
      const stored = usePermissions.getState().micDeviceId;
      if (stored && !resolveDeviceId(stored, inputs) && inputs.length) usePermissions.getState().set({ micDeviceId: null });
    } catch {
      /* no device list: the default microphone is used */
    }
  }, []);

  const meter = useCallback((s: MediaStream) => {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const c = new AC();
      ctx.current = c;
      const an = c.createAnalyser();
      an.fftSize = 512;
      c.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.fftSize);
      let lastFrame = 0;
      let loudSince = 0;
      const tick = (now: number) => {
        raf.current = requestAnimationFrame(tick);
        if (now - lastFrame < FRAME_MS) return;
        lastFrame = now;
        an.getByteTimeDomainData(buf);
        const l = levelFromBytes(buf);
        setLevel(l);
        if (l > HEARD_LEVEL) {
          loudSince ||= now;
          if (now - loudSince >= HEARD_MS) setHeard(true);
        } else loudSince = 0;
      };
      raf.current = requestAnimationFrame(tick);
    } catch {
      /* no meter: the permission still works */
    }
  }, []);

  const start = useCallback(
    async (deviceId?: string | null) => {
      stop();
      setPending(true);
      const id = deviceId === undefined ? usePermissions.getState().micDeviceId : deviceId;
      const r = await openMic(undefined, id);
      if (!alive.current) {
        r.stream?.getTracks().forEach((t) => t.stop());
        return r.result;
      }
      setPending(false);
      setLast(r.result);
      const next = micStatus(null, r.result, usePermissions.getState().mic);
      setStatus(next);
      usePermissions.getState().set({ mic: next, asked: usePermissions.getState().asked ?? Date.now() });
      if (r.stream) {
        stream.current = r.stream;
        setLive(true);
        setHeard(false);
        meter(r.stream);
        void refreshDevices();
      }
      return r.result;
    },
    [meter, refreshDevices, stop],
  );

  const notNow = useCallback(() => {
    stop();
    setStatus("not-now");
    usePermissions.getState().set({ mic: "not-now" });
  }, [stop]);

  const pick = useCallback(
    (id: string) => {
      usePermissions.getState().set({ micDeviceId: id });
      void start(id);
    },
    [start],
  );

  // Reconcile with the browser on mount, on permission change and when devices change.
  useEffect(() => {
    alive.current = true;
    let query: PermissionStatus | null = null;
    const reconcile = async () => {
      try {
        query = await navigator.permissions.query({ name: "microphone" as PermissionName });
        const next = micStatus(query.state, null, usePermissions.getState().mic);
        if (!alive.current) return;
        setStatus(next);
        usePermissions.getState().set({ mic: next });
        query.onchange = () => void reconcile();
        if (next === "granted") void refreshDevices();
      } catch {
        /* Permissions API unsupported for the microphone (Safari): keep the stored hint */
      }
    };
    void reconcile();
    const onDevices = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", onDevices);
    const onVisible = () => !document.hidden && void reconcile();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      if (query) query.onchange = null;
      navigator.mediaDevices?.removeEventListener?.("devicechange", onDevices);
      document.removeEventListener("visibilitychange", onVisible);
      stop();
    };
  }, [refreshDevices, stop]);

  return { status, last, pending, live, level, heard, devices, deviceId: resolveDeviceId(perm.micDeviceId, devices), start, stop, notNow, pick };
}

export type MicSession = ReturnType<typeof useMic>;
