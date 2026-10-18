# Morning report — Create (DubHacks '26)

_Updated overnight. Submit to Devpost by 10:00._

## Done so far (as of 01:20)
- **Product**: two looks (Paper / Luminous-magenta) chosen in onboarding and Settings; composer with real controls (Chat|Work, model + effort incl. Inkling, Approve for me, attach, Files, Plugins, Lift from screen); radial Go fan; thread with run line, result cards, action row, context card; one composed frame with a floating context panel.
- **Pointing**: in-app pointer (hover, pin, hold Option), Chrome extension (point, circle, crawl), notch tray app, Lift from screen — one `/api/locate` pipeline with "Which one?" instead of guessing; per-stage traces.
- **Lift**: point at a table/chart/list → live app (table + chart + add-row form), live rows, QR, Backend tab.
- **Sponsor models live**: Claude (Anthropic), Inkling (Thinking Machines via Tinker, ~0.7 s), Perceptron Mk1.5 (detect IoU ~0.88–0.98, 3–4 s; chat ~0.7 s), TypeSafe Jev (~0.1 s).
- **Proof**: real-mode eval 12/12; pointer corpus (30 real targets) — web 20/22 top-1 after the accuracy pass; PDFs pending Perceptron in the commit stage (running now).

## In progress
- Stage B+C: Perceptron in the commit stage + fair eval, Inkling default for Chat, visual polish, extension + notch in both looks, real-mode demo-path timings.
- Next: demo video draft (screen capture + voiceover), submission kit, clean main.

## Needs you (morning)
1. ElevenLabs key: the clipboard held a short word, not the key — copy the real key (elevenlabs.io → Profile → API Keys) for the voiceover and realtime voice.
2. Optional keys: Gemini (`GEMINI_API_KEY`), MongoDB (`MONGODB_URI`) for the Atlas prize.
3. Re-enable **Screen Recording** + **Accessibility** for "Create Tray" (System Settings → Privacy & Security) after the overnight rebuild.
4. Decide: make the repo public.
5. Record/polish the demo video with me, then submit on Devpost.
