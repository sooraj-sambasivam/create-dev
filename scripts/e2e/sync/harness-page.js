// Runs inside Chromium. Three sync sessions share one pointer stream and one clock:
//   inj  = exact word times injected at word end        (resolver quality in isolation)
//   ws   = Web Speech simulation: interim transcripts arriving ~450 ms (+jitter) after each word
//   live = real Scribe realtime over the Chromium fake mic (audio anchored via AudioContext time)
(() => {
  const { createSyncSession, createClock, domTargetResolver } = window.SyncCore;
  const clock = createClock();
  const mk = () => createSyncSession({ clock, pointer: { hz: 120, resolver: domTargetResolver() } });
  const S = { inj: mk(), ws: mk(), live: mk() };
  const emissions = []; // every binding emission
  const actualMoves = [];
  for (const [src, s] of Object.entries(S)) {
    s.start();
    s.onBinding((b) =>
      emissions.push({
        src, rcv: performance.now(), id: b.id, text: b.word.text, wStart: b.word.start, wEnd: b.word.end,
        t: b.t, target: b.target ? b.target.targetId : null, conf: b.confidence, mode: b.mode,
        final: b.final, wsrc: b.word.source,
      }),
    );
  }
  addEventListener("pointermove", (e) => actualMoves.push({ t: e.timeStamp, x: e.clientX, y: e.clientY }), true);

  const CLICK_THRESH = 0.4;
  const h = (window.__h = { log: [], S, emissions, actualMoves, scribeMsgs: [], diag: {} });
  let doneResolve;
  h.done = new Promise((r) => (doneResolve = r));

  const workletCode = `
    class Cap extends AudioWorkletProcessor {
      constructor(){ super(); this.buf=[]; this.n=0; this.clickAt=-1; this.frame0=-1; }
      process(inputs){
        const ch = inputs[0] && inputs[0][0];
        if(!ch) return true;
        if(this.frame0<0) this.frame0=currentFrame;
        if(this.clickAt<0){ for(let i=0;i<ch.length;i++) if(Math.abs(ch[i])>${CLICK_THRESH}){ this.clickAt=currentFrame+i; this.port.postMessage({click:this.clickAt, frame0:this.frame0}); break; } }
        this.buf.push(new Float32Array(ch)); this.n++;
        if(this.n>=8){ const out=new Float32Array(this.n*128); this.buf.forEach((b,i)=>out.set(b,i*128));
          this.port.postMessage({frame:currentFrame-(this.n-1)*128, pcm:out},[out.buffer]); this.buf=[]; this.n=0; }
        return true;
      }
    }
    registerProcessor('cap', Cap);`;

  const b64 = (i16) => {
    const u8 = new Uint8Array(i16.buffer); let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };

  // Resolves with the anchor once the calibration click is seen in the captured stream.
  h.startMic = async (token, clickOffsetMs, commit) => {
    // commit: "manual" (default; the harness sends the commit) or { vad: silenceSecs } (server commits on silence)
    h.vad = !!(commit && commit.vad);
    const strat = h.vad ? "commit_strategy=vad&vad_silence_threshold_secs=" + commit.vad : "commit_strategy=manual";
    const url = "wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=pcm_16000&" + strat + "&include_timestamps=true&token=" + token;
    const L = (m) => h.log.push(Math.round(performance.now()) + ' ' + m);
    L('start');
    const ws = new WebSocket(url);
    h.ws = ws;
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("scribe ws error")); });
    L('ws open');
    ws.onmessage = (e) => {
      const arrival = performance.now();
      const m = JSON.parse(e.data);
      h.scribeMsgs.push({ arrival, m });
      S.live.feedScribe(m, arrival);
      if (m.message_type === "committed_transcript_with_timestamps") doneResolve({ ok: true });
    };
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
    L('gum ok');
    const ctx = new AudioContext({ sampleRate: 16000 });
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([workletCode], { type: "text/javascript" })));
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "cap");
    const sink = ctx.createGain(); sink.gain.value = 0;
    src.connect(node); node.connect(sink); sink.connect(ctx.destination);
    L('worklet ok');
    await ctx.resume();
    L('ctx ' + ctx.state);
    h.ctx = ctx;
    let firstSentFrame = null;
    const anchor = new Promise((resolve) => {
      node.port.onmessage = (e) => {
        const d = e.data;
        if (d.pcm) {
          if (!h.gotPcm) { h.gotPcm = true; L('first pcm'); }
          if (ws.readyState !== 1) return;
          if (firstSentFrame === null) firstSentFrame = d.frame;
          const f = d.pcm; let pk = 0; for (let i = 0; i < f.length; i++) pk = Math.max(pk, Math.abs(f[i])); (h.peaks ||= []).push(+pk.toFixed(3));
          const i16 = new Int16Array(f.length);
          for (let i = 0; i < f.length; i++) i16[i] = Math.max(-1, Math.min(1, f[i])) * 32767;
          ws.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: b64(i16), sample_rate: 16000, commit: false }));
        } else if (d.click !== undefined) {
          const rcv = performance.now();
          const ts = ctx.getOutputTimestamp();
          const clickCtx = d.click / ctx.sampleRate;
          const tClick = clock.fromAudioContextTime(ctx, clickCtx);
          const sock0 = clock.fromAudioContextTime(ctx, (firstSentFrame ?? d.frame0) / ctx.sampleRate);
          const tA0 = tClick - clickOffsetMs;
          for (const s of Object.values(S)) s.setAudioStart(sock0);
          h.diag = { rcvMinusClick: rcv - tClick, outputTs: ts, baseLatency: ctx.baseLatency, outputLatency: ctx.outputLatency, sock0, firstSentFrame, frame0: d.frame0 };
          resolve({ tA0, sock0, tClick, rcv, diag: h.diag });
        }
      };
    });
    return anchor;
  };

  // plan: { tA0, words:[{text,start,end}] (ms from file start), commitAtMs, wsLags:[ms per word] }
  h.arm = (plan) => {
    const at = (tAbs, fn) => {
      const d = tAbs - performance.now();
      setTimeout(fn, Math.max(0, d));
    };
    const words = plan.words.map((w) => ({ text: w.text, start: plan.tA0 + w.start, end: plan.tA0 + w.end }));
    // injected: exact times, delivered at word end
    words.forEach((w, k) => {
      at(w.end, () =>
        S.inj.feedWords("inj", words.slice(0, k + 1).map((x) => ({ text: x.text, start: x.start, end: x.end, final: true, source: "injected" }))),
      );
    });
    // Web Speech sim: interim transcript grows when the recognizer reports each word
    words.forEach((w, k) => {
      const lag = plan.wsLags[k];
      at(w.end + lag, () => S.ws.feedWebSpeech("u", words.slice(0, k + 1).map((x) => x.text).join(" "), false));
    });
    const last = words[words.length - 1];
    at(last.end + Math.max(...plan.wsLags) + 250, () => S.ws.feedWebSpeech("u", words.map((x) => x.text).join(" "), true));
    // commit the live Scribe segment (like the user releasing hold-to-talk)
    if (!h.vad) at(plan.tA0 + plan.commitAtMs, () => {
      h.commitSentAt = performance.now();
      h.ws.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: "", sample_rate: 16000, commit: true }));
    });
    setTimeout(() => doneResolve({ ok: false, timeout: true }), plan.commitAtMs + 7000 - (performance.now() - plan.tA0));
  };

  h.collect = () => {
    try { h.ws && h.ws.close(); } catch {}
    return {
      emissions, actualMoves, diag: h.diag, commitSentAt: h.commitSentAt,
      scribeMsgs: h.scribeMsgs.map((x) => ({ arrival: x.arrival, type: x.m.message_type, text: x.m.text,
        words: x.m.words && x.m.words.filter((w) => w.type !== "spacing").map((w) => ({ text: w.text, start: w.start, end: w.end })) })),
    };
  };
})();
