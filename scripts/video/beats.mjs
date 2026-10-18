// Single source of truth for the demo video: narration, captions, sponsor chip and the shot list.
// Content comes from the canonical demo set (scripts/eval/demo/demo-set.json): L02 lift, C01 chat, E01 edit, B02 build.
// capture.mjs implements one driver per beat id; voice.mjs and assemble.mjs read these beats; docs.mjs renders docs/pitch/video-script.md.
export const BEATS = [
  {
    id: "b1-point", scenario: "L02-gsheet-sales", sponsor: "DubHacks NEXT",
    narration: "This is a spreadsheet of sales. I can read it, but I can't use it. So I point at it, and say: turn this into something I can track and add to.",
    caption: "Point at anything. Say what you want.",
    steps: ["Open the sales spreadsheet page (scripts/video/pages/sales-sheet.html) with the extension loaded", "Cursor glides to the row for category C", "Hold Option: outline and chip appear on the table", "Release, type \"turn this into something I can track and add to\", Enter"],
  },
  {
    id: "b2-app", scenario: "L02-gsheet-sales", sponsor: "Perceptron",
    narration: "Perceptron finds the table on screen, Create reads it, and opens a live app in my workspace. A table, a chart, and a form to add rows. It's mine now.",
    caption: "A live app in your workspace: table, chart, add-row form.",
    steps: ["Chip: Reading table, Building your app", "The lifted app opens; Remix loads it into a workspace chat (unrecorded reload)", "Hover a row, scroll the right panel to the chart"],
  },
  {
    id: "b3-gap", scenario: "L02-gsheet-sales", sponsor: "",
    narration: "Google's pointer answers questions about what you point at. Create hands you software you own, with a backend.",
    caption: "Answers vs. software you own.",
    steps: ["Slow pan to the add-row form in the right panel"],
  },
  {
    id: "b4-qr-atlas", scenario: "L02-gsheet-sales", sponsor: "MongoDB Atlas, SideShift",
    narration: "Scan this code and add a row. It goes into a MongoDB Atlas collection, and shows up here, live, a few seconds later. Real storage, no setup.",
    caption: "Scan, add a row. Stored in MongoDB Atlas.",
    steps: ["Output tab: Copy link, Show QR", "A second tab (the phone) adds a row through the shared form", "The row arrives live in the workspace table"],
  },
  {
    id: "b5-chat", scenario: "C01-sales-biggest", sponsor: "Thinking Machines",
    narration: "Chat answers questions about it, too. I ask which category is biggest, and Inkling, from Thinking Machines, replies right in the thread.",
    caption: "Chat answers by Inkling (Thinking Machines).",
    steps: ["Header toggle: Chat", "Hover the chart, ask \"Which category is biggest, and what share of the total is it?\"", "Answer card with provider label"],
  },
  {
    id: "b6-this", scenario: "E01-bigger-title", sponsor: "Jev (TypeSafe)",
    narration: "Inside the app, the same pointer works. I point at the title and say: make this bigger. Jev works out what this means, shows me the target, and undo is one key.",
    caption: "Jev understands \"this\". Undo is one key.",
    steps: ["Go fan, Narrate", "Hover the title, say \"make this bigger\"", "Title grows; Cmd+Z undoes it"],
  },
  {
    id: "b7-build", scenario: "B02-study-signup", sponsor: "",
    narration: "Or I just describe what I need: a sign-up sheet for study nights. A form, a table and a chart, in seconds.",
    caption: "Describe it. It builds the app.",
    steps: ["New project, Work mode", "Type \"a sign-up sheet for study nights\", Enter", "The page streams in: form, table, chart"],
  },
  {
    id: "b8-surfaces", sponsor: "",
    narration: "It also works from the notch tray in any Mac app, and from Lift from screen.",
    caption: "Notch tray and Lift from screen, in any Mac app.",
    steps: ["Hover the Lift from screen button in the composer"],
  },
  {
    id: "b9-end", sponsor: "SideShift",
    narration: "Everything read-only becomes yours. The pointer is free. A hosted backend is nine to nineteen dollars a month. No users yet.",
    caption: "Free pointer. Hosted backend $9-19/mo. No users yet.",
    steps: ["card: Create / Everything read-only becomes yours."],
    card: ["Everything read-only becomes yours.", "Free pointer. Hosted backend $9-19/mo."],
  },
];
