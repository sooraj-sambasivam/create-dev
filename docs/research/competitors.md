# Competitor landscape (2026) - Create, DubHacks '26

Method: 4 WebSearch queries on 2026-10-17. Search snippets only; no pages fetched. "Verified" = stated in a cited source. "Unverified/speculation" = my inference or no source found. Vendor comparison pages are biased.

## Verified facts
- Google DeepMind published the AI pointer post on 2026-05-12; says the pointer "barely evolved in more than half a century". Magic Pointer is rolling out to Gemini in Chrome, not only Googlebook laptops. Examples: select products and ask to compare; point where to visualize a couch. Demos in Google AI Studio; related concepts to be tested in Google Labs' Disco. https://www.androidauthority.com/magic-pointer-gemini-in-google-chrome-3666405/ , https://opendatascience.com/google-deepmind-reimagines-the-mouse-pointer-for-the-ai-era/ , https://letsdatascience.com/news/deepmind-powers-googlebook-magic-pointer-for-gemini-f48a1fce
- Lovable: "Visual Edits" - click an element in the preview and refine it. https://www.questera.ai/blogs/top-7-replit-alternatives-vibe-coding
- Replit: Design Mode (Nov 2025) and a Visual Editor for non-technical users to adjust UI while code updates. https://metavert.io/compare/replit-vs-stackblitz , https://metavert.io/compare/figma-vs-replit
- Bolt: Figma import, image upload + natural-language edit; backend limited to Node.js/Express (per Lovable's rival guide). https://lovable.dev/guides/bolt-vs-replit-vs-lovable
- Figma Make: generates front-end code from Figma designs or prompts, reads layers/styles/components. https://metavert.io/compare/figma-vs-replit
- Framer AI: Wireframer (prompt to responsive site), Workshop (components); Framer-hosted; (rival source). https://superdesign.dev/blog/framer-ai-review
- Playcode: voice description via mic with live preview. https://playcode.io/blog/how-to-build-website-with-ai
- Readdy.ai: input = text, screenshot, or URL to redesign. https://readdy.ai/blog/what-is-an-ai-website-builder
- Claude artifacts: shareable HTML apps, limited runtime/library loading. https://fast.io/resources/claude-artifacts-guide/
- Searches found NO single tool combining sketch + voice + pointing + edit-any-existing-site (search absence, not proof).

## Table
Cells marked (?) are unverified; check before saying on stage.

| Product | Input modes | Edits in place? | Pointing? | Non-coders? | Gap Create fills |
|---|---|---|---|---|---|
| v0 (Vercel) | Text prompt, (?) image/Figma | Chat-driven regen; in-place (?) | (?) element select not verified | Skews frontend devs | No voice/sketch; no pointing+narration |
| Lovable | Text, image | Yes, Visual Edits | Click-select, no voice/AI-reads-region | Yes | Click is mechanical; no "what does this mean?"; no extension for other sites |
| Bolt | Text, image/Figma | Via chat | (?) | Partly | Node-only backend; no pointing |
| Figma Make | Prompt, Figma frames | Yes, design-side | Select layers | Designers | Starts from Figma, not any live site |
| Replit Agent | Text, Design Mode | Yes, Visual Editor | Click-select | Yes | Heavy IDE; no voice or sketch |
| Framer AI | Prompt | Yes, in Framer canvas | Canvas select | Yes | Locked to Framer hosting; marketing sites; no real backend forms |
| Gemini in Chrome Magic Pointer | Pointer + speech/text | No - answers/acts on page, does not produce editable copy | Yes (the inspiration) | Yes | Reads/answers only; Create outputs an editable site |
| Claude artifacts | Text, files | Via chat regen | No | Yes | No pointing, voice, backend, persistent app |
| Playcode | Voice, text | (?) | No | Yes | Voice only for the initial prompt |
| Readdy.ai | Text, screenshot, URL | (?) | No | Yes | Redesign from URL, not point-and-edit |

## Positioning (3 sentences)
Create turns whatever you can do naturally - type, talk, sketch, or point and talk - into a real, editable website with a real backend. Its AI pointer lets you hover any element and say "make this bigger" or "what does this mean?", and the Chrome extension lets you point at any website and get an editable copy. Other builders make you describe changes in a chat box; Create lets you show them.

## 3 sharpest differentiators for the stage
1. Pointer + voice as the edit primitive: hover and speak, with intent routed in ~60-200ms (TypeSafe Jev). Lovable/Replit click-select but do not understand narration; Magic Pointer understands but does not edit.
2. Point at ANY website, get an editable copy (Chrome extension). No found competitor edits arbitrary existing sites (search absence; say "we didn't find one").
3. Sketch/voice in, working app out: Perceptron reads sketches and regions, ElevenLabs Scribe v2 realtime transcribes, and each app ships with a real Backend (working form submissions) - not a mock.

## Caveats
- v0, Bolt, Playcode, Readdy edit capabilities not verified; confirm before claiming gaps.
- Google Magic Pointer dates vary across sources; confirm on Google's blog.
