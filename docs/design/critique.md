# Stage J critique (three lenses, run in sequence)

Judged against the anti-slop rules: no gradients, glass or glow, no emoji, no generic hero copy, no
rounded cards everywhere, no centered-everything, no grey-on-grey, no untuned Inter, no decoration.
Look stays minimal: neutral grays, one blue accent, one sans family. Evidence: scratchpad/J/before/.

## 1. Product designer (hierarchy, density, clarity)

1. Onboarding titles jump between steps (y=211, 265, 268) because the column is vertically centered per
   step. Anchor the title to one baseline. `onboarding/Onboarding.tsx:445` (`justify-center`).
2. Welcome headline wraps with an orphan ("Get / software you own."). `Onboarding.tsx:454`.
3. Permissions step stacks two bordered boxes plus a disclosure: three containers for two facts. Use hairline
   rows. `Onboarding.tsx:41,156,165`.
4. Intent and comfort choices are fill-on-fill (tray vs hover, about 1.1:1): the selected state barely
   reads. Use a crisp 1px border state. `onboarding/controls.tsx:40`.
5. Settings opens as a floating card with no scrim and no click-away: it sits on top of the composer and
   fights it. `settings/SettingsPanel.tsx:79`.
6. Sign-in card carries both a border and a shadow, and the copy is generic ("Sign in to continue.").
   `auth/SignIn.tsx:33,35`.
7. Empty-state hint is 12px ink-3 under a pale tray: the only instruction on the screen is the faintest
   thing on it. `shell/EmptyState.tsx:12`.
8. Pip notes card truncates mid-word ("Made it b"). `companion/NotesCard.tsx:88`.

## 2. Typographer (scale, tracking, leading, numerals, alignment)

1. Font stack names "SF Pro Text" first, which pins the text cut at every size, including the 28px
   headline (loose, no optical sizing). Lead with `-apple-system` so macOS picks Display or Text per size.
   `index.css:52`.
2. Tracking is one value (-0.01em) on the headline and none elsewhere. Needs a scale: display -0.022em,
   UI 14px -0.006em, meta +0.01em. `index.css` base, `ui/styles.ts:96`.
3. No `text-wrap: balance` on headings or `pretty` on paragraphs (orphans in onboarding, settings hints).
4. ink-3 (#767676) on the shell (#f3f2f2) is 4.1:1, under AA for 12px meta. Darken to #6b6b6b. Dark ink-3 up
   a step. `index.css:23,101`.
5. Numerals: usage counts and timers are proportional. Apply tabular-nums to every number that changes
   (usage meter, run timers, dimensions). `auth/UsageMeter.tsx`.
6. Optical alignment: ghost buttons in the onboarding footer start 10px inside the column edge (466 vs 456).
   `Onboarding.tsx:470`.
7. Title-cased generated page titles ("A Landing Page For A Coffee Shop Called") break the sentence-case
   rule. Generator output, outside this lane; noted for the owner.

## 3. Interaction designer (states, motion, feedback, affordances)

1. Settings has no outside-click close and no focus return affordance beyond Esc. `SettingsPanel.tsx:74-90`.
2. Sign-in button gives no busy feedback (disabled only) and inputs have no invalid state. `SignIn.tsx:60`.
3. Option-key test: the key cap press state is fine; the permissions card has three different status
   idioms (pill, inline check, text). Unify on one status row. `Onboarding.tsx:159,173`.
4. Choice chips have hover but no pressed state; add `active:` feedback consistent with buttons.
5. Pip notes card has no wrap, so long confirmations are unreadable; they also type in at 700ms with no way
   to read the end. Wrap to two lines. `NotesCard.tsx:88`.
6. Empty states: sidebar "Your chats appear here" is 12px ink-3 with no affordance. Keep, raise contrast.
7. Motion tokens are consistent (120/200/320 ms, one ease family); keep. Reduced motion is honoured.

## Fix order (impact over effort)

Tokens and type (T1-T6), onboarding structure (P1-P4), settings scrim and sign-in (P5, P6, I1, I2),
empty-state and Pip notes (P7, P8). Anything that scores lower in the after pass is reverted.
