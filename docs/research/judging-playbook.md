# Create: judging playbook (DubHacks '26)

Sources: prework `01_rules_and_judging.md` (rubric, tracks, logistics; URLs below), `docs/devpost.md`, `docs/demo-script.md`, `docs/research/../jev-research.md`, `docs/pointer-roadmap.md`.
Labels: **[V]** verified in a cited source. **[R]** from our repo docs. **[S]** speculation or our own judgment; confirm before relying on it.

## 0. Read this first (facts that change what we do)

- **The prework was written for the earlier idea (Shippy).** Its rubric and rules apply to Create; its track picks (Chef's Choice + VEYZL + SideShift + NEXT + Commit) do NOT. Track choices below are new. Re-check the Devpost track selector labels at the draft (prework notes Devpost shows "Chef's Kitchen" for Chef's Choice).
- **Rubric [V]** (https://dubhacks.notion.site/154ff32c1d7e8304a76b011636f6732f): Functionality 30, Track applicability 30, Design 20, Creativity 20; each scored 1-8. Excellent (7-8) Functionality = "actually works", robust code. Track applicability 7-8 = "above and beyond, exemplary demo of the track's focus". Fit is called "the most important factor" when picking tracks (https://dubhacks.notion.site/3faff32c1d7e8089ac4ad35c334c1457).
- **Logistics [V]** (https://dubhacks.notion.site/14eff32c1d7e837793e2018a30a234cb): video is required, no video = not judged; keep the live pitch under 3 minutes so there is Q&A time; stay at your table the whole 50-minute round (side-track judges arrive any time); entire team on site; Devpost locks Sun 10:00 AM; in-person side tracks are only NEXT, T-Mobile, Cloudforce, SideShift, Perceptron, Photon, VEYZL; all other side tracks (incl. MLH ones) are judged from Devpost.
- **Limits [V]** (hacker guide, https://dubhacks.notion.site/The-DubHacks-26-Hacker-Guide-15dff32c1d7e83748aac8154036aa658): exactly 1 title track, up to 3 sponsored side tracks, unlimited non-sponsored. 70/30 rule: at most 30% outside code; disclose AI tools used (MLH best practice, https://github.com/MLH/mlh-policies/blob/main/standard-hackathon-rules.md).
- **No TypeSafe/Jev track found [V-negative]**: the prework lists none and `jev-research.md` found none. Use Jev as sponsor tech in the story; ask the TypeSafe table on Saturday and only claim a track if they confirm.
- **Perceptron track [V, thin]**: prework says "Mk/Isaac vision models or SO-101 robot arm", judged in person, prize "COMING SOON" (Sponsored Side Tracks page, https://dubhacks.notion.site/5e3ff32c1d7e834d9844812256c9fa06). Our use (sketch/region reading) is vision-model use, but we have not seen their exact requirement text for a non-robot project. **Ask the Perceptron table early.**
- **Track-slot math:** sponsored (max 3): Perceptron, SideShift. Non-sponsored: DubHacks NEXT, MongoDB Atlas (MLH), Best Domain (GoDaddy Registry) (MLH). Prework classes NEXT, MLH Atlas and Best Domain as non-sponsored [V]. That leaves one sponsored slot free. TypeSafe/Jev is not a track, so it is not a candidate.
- **Title track [S]:** Chef's Choice (UI/UX, AI & creative technology, developer tools are named topics, https://dubhacks.notion.site/bbaff32c1d7e8308be7d8185bd983487). Cook Smarter is the alternate (productivity, AI agents, automation, dev tools). Chef's Choice wins on "expressive, creative" fit. Community Kitchen only if we lean hard on accessibility; we should not.

## 1. Per criterion: what judges must see, and the demo moment that proves it

| Criterion (weight) | What a judge must see | Proving moment (demo-script.md time) | Backup if it fails |
|---|---|---|---|
| **Functionality (30)** | The core loop works live on a real page, not a mock: type -> real page; hover + speak -> that element changes; undo works; the output is a real editable page (published HTML / share link). | **0:25-0:45** hover the title, hold Option, "make this bigger", the title grows in place. Then **0:45-1:05** "swap this photo for a cupcake". At the table: hand the judge the mouse and let them point at anything and talk. | Replay mode (Ctrl+Shift+R, shows "Replay on" dot), then recorded clip. Say replay out loud; never hide it. Mock mode only as stated last resort. |
| **Track applicability (30)** | Per track, the specific sponsor tech or focus is visibly used and load-bearing (section 2). For the title track: AI + creative technology + UI/UX + dev tools named in the first 15 seconds. | **0:00-0:10** hook line names it. Then one proving beat per track: Jev routing (0:25-1:05), Perceptron (1:15-1:35), ElevenLabs (1:35-1:45). | A health/engine readout showing which engine answered (`engine` field from intent routing [R]) so the claim is checkable. |
| **Design (20)** | Looks professional and is understood in seconds: pointer bubble shows what was understood before editing, "Which one?" instead of guessing, light/dark themes, clean shell. | **1:05-1:15** undo + the "Which one?" clarification (visible trust design). Also the bubble states: label -> words heard -> Editing -> Done (0:25-0:45). | Pick a short title so the known wrap glitch does not show (demo-script known glitch); close right panel at 1440x900. |
| **Creativity (20)** | A new interaction, not a prompt box: the pointer supplies "this/that", voice supplies the change (the DeepMind AI-pointer idea). Four inputs converge on one JSON tree. Chrome extension "point at any website" is the extra wow. | **0:25-1:05** pointer; **1:15-1:35** sketch; **1:45-1:55** extension (only if it works in a real Chrome; docs say it has never been run in a browser, so verify or cut). | If extension is unverified, do the phone share instead and do not mention it. |

Judge-level rule: every claim in the pitch needs a visible proof in the same breath. Do not say "real-time" for the sketch unless the preview truly fills live (demo-script: "Check on the day").

## 2. Per track: evidence checklist and two-sentence pitch

Order of effort: Title -> Perceptron / SideShift -> NEXT -> MongoDB -> GoDaddy.

### Title track: Chef's Choice [S]
- [ ] First 15 seconds say: AI + creative tech + UI/UX + a tool for building websites.
- [ ] Pointer demo live in front of a judge; judge drives.
- [ ] Devpost "How we built it" lists AI tools used and reused libraries (70/30).
Pitch: "Create lets you build a website by pointing at the part you mean and saying what you want, so the pointer finally supplies the word 'this'. It turns typing, speech, sketches and pointing into one real, editable page."

### Perceptron (sponsored, in person) [V thin; fit unconfirmed]
- [ ] Ask the Perceptron table what they need from a non-robot project; get the answer in writing/screenshot.
- [ ] Demo: sketch on the canvas -> Perceptron reading -> typed edit operations -> page. Show the engine label `perceptron+claude` vs `claude` (integration.md line 180) so judges see Perceptron is used, not decorative.
- [ ] Show the reading itself (what each shape was identified as and where). Show the fallback honestly: without a key, Claude reads alone.
- [ ] Be ready to say what Perceptron adds over Claude vision alone (measured, if we have a comparison; otherwise say we did not benchmark).
Pitch: "Perceptron reads a rough sketch or a region of the screen and tells us what each shape is and where it sits, so a napkin drawing becomes a real layout. That reading is the input to our edit pipeline, not a side feature."

### SideShift: Best Startup Idea (sponsored, in person) [V track; pitch is ours]
Requirement [V]: strongest startup concept, any stack; they value distribution paths (creators/social).
- [ ] Named user: small business owner (cafe, bakery, salon) who needs a page and edits it often.
- [ ] Price hypothesis stated (section 4 business model) and labeled as hypothesis.
- [ ] Distribution: the Chrome extension ("point at any site -> editable copy") as the viral loop; share links as the product billboard; creator demos.
- [ ] One competitor contrast line (section 3, v0/Lovable).
Pitch: "Small businesses pay for pages they cannot change, and every edit is a ticket or a prompt paragraph. Create makes the edit one gesture, and the Chrome extension plus share links are how it spreads."

### DubHacks NEXT (non-sponsored, in person) [V]
Requirement [V] (https://dubhacks.notion.site/cc7ff32c1d7e83f7a1c9818214afba7f): meaningful problem with clear target user; builder energy; evidence of learning and iteration over the weekend; revenue potential (who pays, what for, why); team wants to keep building.
- [ ] Dated iteration log (pivots: e.g. prompt box -> pointer; what we cut and why). Keep a bullet list with times from git history.
- [ ] At least one real-user test (a person who is not on the team pointing at the page). Record what happened. [Do not claim a user study we did not run.]
- [ ] Revenue line (section 4) and "we will keep building" statement, true or not said.
- [ ] Printed/tabbed one-pager so any teammate can answer while another drives.
Pitch: "Non-coders running small shops cannot change their own websites without paying someone or fighting a prompt box. We built the pointer-first editor over one weekend, tested it on people who were not us, and we want to keep building it."

### MongoDB Atlas (MLH, judged from Devpost) [V track exists; our use is thin]
Requirement [V]: use of the sponsor's tech. Current state [R]: MongoDB is only the optional share-link store (`MONGODB_URI`); without it shares are local files.
- [ ] Decision needed: either make Atlas the real default for shares and per-app form submissions (Backend feature), or skip this track. Do not claim it if the submitted demo runs on local files.
- [ ] If entering: show a share link and a real form submission persisting in Atlas (screenshot of the collection, no credentials visible), and name the collections.
- [ ] Devpost "Built with" lists MongoDB Atlas; one sentence on why (documents match our JSON component tree).
Pitch: "Every page Create makes is a JSON tree, which maps directly onto MongoDB documents, so Atlas stores shared pages and the form submissions each generated site collects. Publish a page and its backend is already there."
(The second sentence is only honest if the per-app Backend uses Atlas at submit time. [S]: confirm.)

### Best Domain / GoDaddy Registry (MLH, Devpost) [V track exists, prize is a gift card per prework]
Requirement [V]: register a domain with GoDaddy Registry.
- [ ] Register one domain for the project (cost/eligibility unverified; prework says free only if offered). Screenshot the registration, point it at the deployed demo, put the URL on Devpost.
- [ ] Skip if the domain does not resolve to a working demo by the 5:30 AM submission.
Pitch: "Create's demo lives at its own domain registered through GoDaddy Registry, so you can open it on your phone right now. A real URL is the point of a tool that publishes real websites."

## 3. Likely judge questions and crisp answers

1. **Privacy of the pointer and mic?**
   Pointer position is read only while you hold the hotkey and speak; the target is resolved at utterance start and only the element's label/id and your words go to the router [R, devpost.md]. The mic is opt-in per browser permission; audio goes to ElevenLabs Scribe through a single-use token minted on our server, and the keys never reach the browser [R, integration.md]. The extension (when shown) captures only on an explicit gesture and sends a sanitized snapshot of the clicked element, never auto-captures, and our server never fetches the source site [R, pointer-roadmap.md]. Be honest on what we do NOT yet have: a retention policy and a data-processing agreement with each vendor [S: say "hackathon prototype, not production privacy review"].
2. **Why not v0 / Lovable / Bolt?**
   They are prompt-box generators; to change one thing you describe it in text and they regenerate or guess which element. Create edits the exact element under your pointer in place, shows what it understood first, and asks "Which one?" when unsure; and the output is a typed tree you can still click and drag. They are strong at first drafts; our claim is the editing loop and non-coder access, not first-draft quality [S: do not claim we out-generate them]. (Prework competitor file 03_competitors.md covers Lovable/Replit for the earlier idea; do not reuse its claims.)
3. **How is it not just a wrapper around an LLM?**
   Four things around the model: (a) pointer-to-target resolution and typed target binding, (b) an intent router (Jev, 60-200 ms [R]; documented as confidence-gated with a Haiku then keyword fallback) that decides action and target before any generation, (c) a Zod-validated JSON component tree so model output is checked and cannot inject raw HTML, (d) undo through the same store actions as manual edits. Some edits (bigger/smaller) need no model call at all [R, demo-script]. Honest limit: page generation itself is Claude.
4. **Business model?** [S, all hypotheses]
   Free to build and preview; paid tier for publishing on a custom domain, the per-app Backend (form submissions, data), and the extension's "copy any site" at volume. Target: small businesses and freelancers who pay agencies per edit. Say it is a hypothesis; we have no revenue.
5. **Accessibility?**
   Honest answer: voice and pointing help people who cannot type quickly, and typed input is the full fallback for every step (demo-script: "typed here, same result"). We have not run a screen-reader/keyboard audit; point-and-speak is not itself accessible to everyone, so click-select and the ✦ box (press `/`) are the keyboard path [R]. Generated pages' accessibility (alt text, contrast) is not yet verified [S: check before claiming].
6. **What happens when it is wrong?** Bubble shows understanding before the edit, ambiguity is asked not guessed, server re-checks the chosen target is one of the candidates, Cmd+Z undoes [R].
7. **Latency?** Jev routes in about 60-200 ms (vendor-style claim, [R] devpost; self-reported, jev-research.md marks vendor speed claims as self-reported [S]); page generation takes about 14-20 s and we cut to a recording rather than hide it [R].
8. **What did you build vs reuse?** Disclose: React/Vite/Tailwind/tldraw/Zod/Express (libraries), sponsor APIs, and AI coding tools used. Give the LOC/commit evidence if asked. Do not mention prework as code.
9. **Is the demo real?** Yes, live; replay and mock exist as labeled fallbacks. Say so before they ask.
10. **Why these sponsors?** Each is load-bearing and replaceable by fallback: Jev for routing, Perceptron for sketches, ElevenLabs for voice. The system still works when one is down, by design [R].

## 4. Business model (one paragraph to memorize) [S]
Free creation and preview. Paid: custom domain publishing, the per-app Backend (real form submissions stored for you), higher edit volume, and the point-at-any-site extension for agencies. Buyers: owners of small shops and freelancers who pay for each edit today. All numbers are hypotheses; none are validated.

## 5. 30-second elevator version
"Right now, to change a website you write a paragraph and hope the tool guesses which button you meant. Create lets you point at the thing and say what you want: 'make this bigger', 'swap this photo'. It edits that exact element in place, shows what it understood, and undo is one key. You can also type, speak, or sketch, and a Chrome extension lets you point at any site and get an editable copy. Point at it. Say it. It changes."

## 6. Two-minute version (matches demo-script.md)
- **0:00-0:10** Hook: "Most builders make you describe a change in a paragraph. We point and talk."
- **0:10-0:25** Type a bakery-site prompt; Claude builds a real page (cut to the recorded clip if over 10 s).
- **0:25-0:45** Hover the title, hold Option: "Make this bigger." Say: the bubble shows what it understood, and TypeSafe Jev routes the line in about 60-200 ms.
- **0:45-1:05** Hover the hero photo: "Swap this photo for a cupcake."
- **1:05-1:15** Undo, then an ambiguous spot: it asks "Which one?" rather than guessing.
- **1:15-1:35** Sketch three boxes on the canvas; Perceptron reads it, Claude builds the page.
- **1:35-1:45** Mic: "Add a contact section with a phone number" (ElevenLabs Scribe realtime).
- **1:45-1:55** Extension on another site, OR phone share link. Only the one that is verified working.
- **1:55-2:00** Close: type, say, draw, point. "Point at it. Say it. It changes."
Add one spoken line for judges: "Built for shop owners who can't code; the same engine powers a Chrome extension and a per-app backend that takes real form submissions." (Only if both are demonstrably working.)

## 7. Table-day checklist
- [ ] Devpost: track list matches section 2 (1 title, at most 3 sponsored); AI tools and libraries disclosed; public repo; video link tested on the View page.
- [ ] Printed one-pagers for NEXT, SideShift, Perceptron; teammate answers while another drives.
- [ ] Entire team at the Ballroom by 10:20 AM Sunday; stay until every in-person side track (NEXT, SideShift, Perceptron) has judged.
- [ ] Ask TypeSafe, Perceptron, MongoDB and GoDaddy tables on Saturday what they require; replace every [S] above with their answer.
- [ ] Internal submission target is 5:30 AM; the official lock is Sun 10:00 AM [V]. The video must be at most 3:00 [V, conservative reading].

## Open decisions for the team
1. Title track: Chef's Choice vs Cook Smarter.
2. Is MongoDB really the share/backend store at submit time? If not, drop that track.
3. Is the extension verified in real Chrome? If not, cut it from every pitch and Devpost.
4. Do we enter a third sponsored track? None currently fits; do not add one just to fill the slot (prework agrees).
5. Is GoDaddy domain registration worth the time before 5:30 AM?
