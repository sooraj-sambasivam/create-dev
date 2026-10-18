// Word-time binding for the content script: the page's capture timeline (hover changes and lassos, stamped on performance.now),
// the speech words (exact from Scribe, or estimated from partials) and the rule that binds each "this/that/here" to the capture
// that was current when the word was SAID. Plain JS, no build step; also loaded by node for the unit test.
(() => {
  const DEICTIC = new Set(["this", "that", "these", "those", "here", "there", "it", "one"]);
  const norm = (s) => String(s).toLowerCase().replace(/[’]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
  const isDeictic = (w) => DEICTIC.has(norm(typeof w === "string" ? w : w.text));

  /** Time-ordered ring: push, at(t) = last item at or before t, all(). */
  function ring(windowMs = 15000) {
    const a = [];
    return {
      push(x) {
        a.push(x);
        const cut = x.t - windowMs;
        while (a.length > 1 && a[0].t < cut) a.shift();
        return x;
      },
      at(t) {
        let lo = 0, hi = a.length - 1, ans = -1;
        while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m].t <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
        return ans < 0 ? null : a[ans];
      },
      all: () => a,
      clear: () => { a.length = 0; },
    };
  }

  /** Rough spoken duration of one word (ms). */
  const wordMs = (text) => Math.max(180, Math.min(700, 140 + 45 * (norm(text).length || 1)));

  /** Words of a transcript laid out contiguously so the last one ends at arrival - lagMs (partials carry no word times). */
  function estimateWords(transcript, arrival, lagMs) {
    const toks = String(transcript).split(/\s+/).filter(Boolean);
    const durs = toks.map(wordMs);
    let t = arrival - lagMs - durs.reduce((x, y) => x + y, 0);
    return toks.map((text, i) => { const w = { text, start: t, end: t + durs[i], exact: false }; t += durs[i]; return w; });
  }

  /** Exact words from a committed_transcript_with_timestamps message; offsets are seconds from the first audio sample sent. */
  function scribeWords(msg, audioStartMs) {
    if (audioStartMs == null || !msg || !Array.isArray(msg.words)) return null;
    const ws = msg.words.filter((w) => w.type !== "spacing" && w.text && w.text.trim() && Number.isFinite(w.start) && Number.isFinite(w.end));
    return ws.length ? ws.map((w) => ({ text: w.text.trim(), start: audioStartMs + w.start * 1000, end: audioStartMs + w.end * 1000, exact: true })) : null;
  }

  const LASSO_BEFORE_MS = 4000, LASSO_AFTER_MS = 8000, RECENT_MS = 1500;

  /**
   * The capture a word meant. caps are {t, kind:"hover", d} (pushed when the hovered thing changes; d null = nothing) and
   * {t: stroke start, tEnd, kind:"lasso", d}. A lasso the speech overlaps (4 s before to 8 s after) wins; otherwise whatever was
   * hovered at the word's time, or what the pointer just left (1.5 s).
   */
  function bind(word, caps) {
    const T = word.exact ? word.start : (word.start + word.end) / 2;
    const all = caps.all();
    let lasso = null;
    for (const c of all) if (c.kind === "lasso" && c.d && T >= c.t - LASSO_BEFORE_MS && T <= c.tEnd + LASSO_AFTER_MS) lasso = c;
    if (lasso) return { cap: lasso, mode: "lasso", t: T };
    let hover = null;
    for (const c of all) if (c.kind === "hover" && c.t <= T) hover = c;
    if (hover && hover.d) return { cap: hover, mode: "hover", t: T };
    // Nothing hovered at T: the last thing hovered counts if the pointer left it within RECENT_MS before T.
    const hovers = all.filter((c) => c.kind === "hover" && c.t <= T);
    for (let i = hovers.length - 1; i >= 0; i--) {
      if (!hovers[i].d) continue;
      const leftAt = hovers[i + 1] ? hovers[i + 1].t : T;
      return T - leftAt <= RECENT_MS ? { cap: hovers[i], mode: "recent", t: T } : null;
    }
    return null;
  }

  /** One entry per deictic word, in spoken order: {word, bound: {cap, mode, t} | null}. */
  function bindDeictics(words, caps) {
    return words.filter(isDeictic).map((word) => ({ word, bound: bind(word, caps) }));
  }

  const api = { isDeictic, ring, estimateWords, scribeWords, bind, bindDeictics, norm };
  globalThis.__createTimeline = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
