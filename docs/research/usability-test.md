# Create pointer: think-aloud usability test (5 tasks, 3-5 hackers)

Session length 25 min. One facilitator, one note-taker (or screen recording). Results go in `usability-results.csv` (one row per task, plus one `SUS` row per participant).

## Consent line (read aloud, get a yes)

"We are testing the software, not you. You can stop at any time. With your OK we record the screen and your voice, and we keep only the notes and timings, with no name. Please say out loud what you are looking at, trying and thinking. I will not answer questions about how it works until the task is done. Is that OK?"

## Setup (before each participant, 5 min)

- Mac with the notch app running, Screen Recording and Accessibility granted, Chrome extension loaded, API :3001 and web :5175 up, mic working.
- Same Wi-Fi as a phone with the camera ready (task 5). Fresh Create canvas, empty.
- Open tabs and files, same for everyone: transit site tab (live bus schedule), a page with a chart, a canvas with one heading, a sample PDF with a table in Preview, the canvas table with its QR code.
- Start screen recording and the stage log (traces on). Reset state between participants.
- Participant ID is P1..P5. Do not coach. Never say the words "point", "lift" or "hold Option" before the task needs them; the task card says what to get done, not how.

## Tasks

Hand the participant one card at a time. Start the timer when they finish reading it aloud. Cap each task at 3 min.

| # | Task card (read as written) | Neutral prompts if silent for 10 s | Success |
|---|---|---|---|
| T1 | "You want the next buses from your stop on this transit site onto your canvas as a schedule you can use." | "What are you thinking?" "What do you expect to happen?" | Correct schedule rows (right stop, right times) are on the canvas, unaided. |
| T2 | "You do not understand this chart. Find out what it means." | "What would you try next?" | A correct explanation of the chart appears, and the participant can restate it. |
| T3 | "Make this heading bigger." | "Is that what you wanted?" | The named heading (and only it) is larger, within 2.5 s of the spoken command ending. |
| T4 | "Get the table from this PDF into your canvas." | "Where would you look for that?" | Table cells match the PDF (at most 1 cell wrong), landed in the canvas. |
| T5 | "Add a new row to the canvas table using your phone." | "What is on your screen now?" | The new row shows on the canvas, entered from the phone. |

Order: T1 to T5 fixed (T2 and T3 reuse what T1 teaches). Alternate T4/T5 order for P2 and P4 if time permits.

## What to observe

- First action and where the hands go (Option-hold, mouse, keyboard, voice).
- Time to the first hover label, and whether the participant reads it.
- Reaction to "Which one?" prompts and error messages: do they understand and recover?
- Silent failures: any miss with no label, prompt or error. These are the worst defects; log each one.
- Hesitation over 5 s, backtracking, help requests, quotes (verbatim).
- Permission or setup prompts that stop the flow.

## Timing method

- Task time `time_s` = card read finished to success state visible (or to give-up/cap). Use the screen recording timestamp; round to 1 s.
- Also note from the stage log for T1 to T4: label latency (target under 300 ms) and spoken command to action done (target under 2.5 s p50). Put them in `notes`.
- A give-up or 3 min cap is recorded as the elapsed time with `success=0`.

## Success coding

`success` = 1 done unaided, 0.5 done after one facilitator hint or one retry from a system miss, 0 failed or given up. Report task success rate as the mean of `success`.

## Error taxonomy (count per task in `errors`; tag type in `notes`)

- E1 Wrong target: system selected the wrong element.
- E2 No response / silent failure: nothing happened and nothing was shown.
- E3 Wrong action: right target, wrong result (for example, shrank the heading).
- E4 Misread content: wrong text, numbers or cells extracted.
- E5 Discovery: participant did not find the gesture, hotkey or feature.
- E6 Recovery: participant could not recover after "Which one?" or an error.
- E7 Setup/permission: grants, mic, camera or QR scan problems.
- E8 Slip: participant error unrelated to the system (mis-click).

Severity: S1 blocks the task, S2 costs over 30 s or a hint, S3 annoys. Fixes are ordered by S1 count across participants, then S2.

## SUS questionnaire (after all 5 tasks)

Score each 1 (strongly disagree) to 5 (strongly agree). Enter as `sus_1`..`sus_10` on the participant's `SUS` row.

1. I think that I would like to use this system frequently.
2. I found the system unnecessarily complex.
3. I thought the system was easy to use.
4. I think that I would need the support of a technical person to be able to use this system.
5. I found the various functions in this system were well integrated.
6. I thought there was too much inconsistency in this system.
7. I would imagine that most people would learn to use this system very quickly.
8. I found the system very cumbersome to use.
9. I felt very confident using the system.
10. I needed to learn a lot of things before I could get going with this system.

Scoring: odd items contribute (score - 1); even items contribute (5 - score). Sum the ten contributions and multiply by 2.5 to get 0-100. Above 68 is average; 80 or more is good. With 3-5 people treat SUS as directional, and report the range, not only the mean.

## After the session

Ask: "What was the most confusing moment?" and "What would you use this for?" Save the recording and log under `docs/research/usability/<participant>/` (no names). Then rank the issues by severity and count, and turn each S1/S2 item into a fix with an owner.

## Appendix: facilitator rules and CSV format

- Neutral language only: "What are you looking for?", "What did you expect?". Never "try holding Option". If stuck 90 s, give hint level 1 (point at the area), then level 2 (name the feature), and score `success=0.5`.
- Never explain a failure during the task. Thank and move on after the cap.
- Hackers may know the product; ask each "Have you used it before?" and put the answer in the T1 `notes`.
- `usability-results.csv` columns: `participant, task, success, time_s, errors, notes, sus_1..sus_10`. Task rows T1..T5 leave the `sus_*` cells blank. The `SUS` row leaves `success`, `time_s` and `errors` blank. Avoid commas in `notes` (use semicolons) or quote the field.
- Summary (fill after the run): task success rate, median `time_s` per task, total errors by E-code, silent failure count (target 0), SUS mean and range.
