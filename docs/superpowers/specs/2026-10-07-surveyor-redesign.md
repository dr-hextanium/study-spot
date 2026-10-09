# Surveyor PWA redesign: Seawolf

Date: 2026-10-07. Status: approved direction (owner, through live mocks), spec for the rebuild.
Scope: every screen of the surveyor PWA (`apps/web`, `/invite/$token` and `/survey/*`).
Supersedes: decision 14 ("The Divided Back" postcard direction) for the surveyor app.
Visual reference: `.superpowers/sdd/2026-10-04-surveyor-2a-web-3-finish/mock-directions.html`, direction `DIRS.d` ("Your mix"), screenshots `dir-d.png` and `d3.png` in the same folder. The mock is the visual reference only. Its data, counts and some control sizes are wrong. Where it disagrees with this spec, this spec wins.

## 1. Why

The postcard world (stamps, postmark rings, ruled small-caps lines, an ink header band) read as a costume. The owner wants the tool to feel like Raycast or Notion: neutral, quiet, quick. It should say more with fewer words, use more icons and more space, and be polished before the survey starts. The 2026-10-18 launch may slip to make room for this.

This is a visual and structural rebuild. Behavior stays the same: the outbox, the honesty toasts, the Zod boundaries, conflict handling and publish rules. Section 8 lists the five behavior changes the approved mix brings in, each with its rule.

## 2. Decisions

| # | Decision | Rationale | Rejected |
|---|---|---|---|
| D1 | The palette has four colors plus on-red: paper, ink, red, mist. Everything else is `color-mix(in oklab, ...)` of those. | Cohesion, and Stony Brook red without extra hues. | Status hues (green, amber, blue): they compete with the red. |
| D2 | Status is shown by icon plus red. Red means "needs you" (Missing, Conflict, Didn't save) and the primary action. | One signal color stays legible. | |
| D3 | One red-filled button per screen at most. Destructive actions are red text with an icon on a quiet button. | Two red fills on one screen read as the same action. | Red-filled destructive buttons. |
| D4 | Newsreader (variable, opsz and wght) is used for the large titles, group headers, bar titles and stat figures. Instrument Sans (variable, wght) is used for everything else. Both are self-hosted, latin and latin-ext only. | OFL fonts, and they work offline. Newsreader's optical size keeps the 34 px titles crisp. | Google Fonts CDN (no offline). `@fontsource-variable/*` `index.css` (it would precache the Vietnamese subset). |
| D5 | Theme preference is light, dark or system. Light is the default. It is stored per device in `localStorage["perch.theme"]` and applied by an inline head script before first paint. | The owner picked a light default and a manual switch. The inline script prevents a flash. | Following the system by default. |
| D6 | Token CSS is a generated static file (`apps/web/src/ui/tokens.css`), linked through the CSS bundle in `<head>`. It replaces `installTheme`. | The old runtime injection ran after the module loaded, which could paint unstyled. | |
| D7 | The page scrolls the document (window), never an inner container. | Router scroll restoration and focus handling track the window. | The mock's `.scroll` container. |
| D8 | Laptop layout: one centered column (content max 680 px). The action bar floats inside the column. Sheets become centered dialogs at 768 px and wider. | It reads as intended at 1440 px, like a Notion page, and keeps one `main`, one `h1`, one blocker per route and window scroll restoration. | A two-pane list and detail layout: it conflicts with the focus handler, the per-route leave blocker, scroll restoration and the single-`h1` e2e checks. |
| D9 | The step bar has one segment per required section: identity, access, seating, power, environment, use fit. That is 6 sections, derived from `sectionStatuses` with group `required`. Every progress count ("4 of 6", "4/6", "2 left") uses this unit. | Hours are not required (decision 15). The mock's 7 segments were wrong. | Counting the 7 required fields. |
| D10 | Thumbnails show only a spot's approved cover photo, loaded through the authenticated image route, and only near the viewport. Nothing shows while loading or offline. | Owner rule. Saves phone data. Offline safe. | Placeholder tiles or decorative icons. |
| D11 | Segmented controls show the new choice on `pointerdown`: the radio is checked and the thumb starts gliding. The value is committed on `pointerup` over the same option, or on click for keyboard and assistive tech. A `pointercancel` (a scroll that started on the control) or a release elsewhere drops the pending choice. Native radios stay. | Measured cause of the delay, see section 9. It feels instant, and a scroll never writes a value the surveyor did not pick, even on an empty optional control that has nothing to revert to. | Committing on pointerdown and reverting on cancel: an empty control has no value to go back to. A custom ARIA radiogroup without native inputs. |
| D12 | Keyboard hints (the mock's `kbd` chips) are left out. | No shortcuts exist, and a hint for a missing shortcut is a lie. | |
| D13 | "Check every section" from the mock is left out for now. | No bulk check exists. Stamping groups as checked without opening them breaks the honesty rule. Open question for the owner. | |
| D14 | Student palettes are removed from the tokens. Student mode will use Seawolf when it is designed. | YAGNI. One system. | |

## 3. Tokens

Source of truth: `packages/ui-logic/src/tokens.ts`. The CSS custom properties use the prefixes `--color-*`, `--font-*` and so on, generated by `toCssVariables`.

### Palette

| Role | Light | Dark | Use |
|---|---|---|---|
| paper | `#FBFAF9` | `#151313` | page, bar, sheet |
| ink | `#1A1717` | `#EEEAE8` | text, ink buttons, selected chips, done steps |
| red | `#990000` | `#EF6B63` | primary action, focus ring, Missing, Conflict, current step |
| mist | `#ECE8E6` | `#262222` | fills: search, segmented track, stepper, quiet buttons, pills, todo steps |
| onRed | `#FFFFFF` | `#151313` | text on red |

### Mixes (oklab)

| Token | Mix | Use |
|---|---|---|
| muted | ink 62% into paper | secondary text, placeholders, unselected segments |
| line | ink 10% into paper | hairlines and dividers (decorative) |
| edge | ink 45% into paper | text input outlines (WCAG 1.4.11) |
| hover | mist 55% into paper | row and chip hover |
| redTint | red 12% into paper | red pill background |
| redHover | red 88% into ink | primary hover |
| redPress | red 76% into ink | primary pressed |
| inkHover | ink 85% into paper | ink button hover |
| mistHover | mist 82% into ink | quiet button hover and pressed |

The scrim (ink 30% into transparent) and shadows (ink 6 to 30% into transparent) are written in CSS with `var(--color-ink)`. They are not tokens because they are not opaque.

### Contrast (computed with the same oklab mix the browser uses; enforced by tests)

| Pair | Light | Dark | Requirement |
|---|---|---|---|
| ink on paper | 17.1 | 15.5 | 7 (sunlight) |
| ink on mist | 14.6 | 13.2 | 4.5 |
| muted on paper / mist / hover | 5.71 / 4.89 / 5.25 | 5.84 / 4.96 / 5.39 | 4.5 |
| red on paper / mist / redTint / hover | 8.56 / 7.33 / 6.96 / 7.87 | 6.13 / 5.21 / 5.37 / 5.66 | 4.5, so red is allowed as text |
| onRed on red / redHover / redPress | 8.92 / 9.86 / 10.85 | 6.13 / 6.94 / 7.84 | 4.5 |
| ink on mistHover, paper on inkHover | 9.66, 12.0 | 8.42, 10.81 | 4.5 |
| edge on paper | 3.29 | 3.45 | 3 (1.4.11) |
| red focus ring on paper / mist | 8.56 / 7.33 | 6.13 / 5.21 | 3 |

The 58% muted from the mock fails on mist (4.27 light, 4.41 dark), so muted is 62%. Disabled controls use 45% opacity and are exempt from these checks. A disabled control always says why nearby.

### Type, space, shape, motion

| Group | Tokens |
|---|---|
| font | display `"Newsreader Variable", ui-serif, Georgia, serif`; body `"Instrument Sans Variable", ui-sans-serif, system-ui, sans-serif`; mono `ui-monospace, "SF Mono", Menlo, Consolas, monospace` |
| fontSize | caption 12, small 13, label 14, body 15, input 16, barTitle 18, group 20, figure 22, large 34 |
| lineHeight | tight 1.08, snug 1.25, body 1.5 |
| space | xxs 4, xs 8, sm 12, md 16, gutter 20, lg 24, xl 32 |
| radius | s 8, m 12, l 20, sheet 22, pill 999 |
| size | tapTarget 44, bar 52, row 52, control 46, thumb 40, column 680 |
| duration | fast 120, base 220, slow 320, reduced 80 |
| easing | standard `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| press | row 0.985, control 0.97 |

The postcard tokens are removed: `stamp` easing and duration, `exit` easing, `size.line`, `size.header`, `size.postmark`, `size.rule`, `radius.card` and `radius.control` at 4, and every shell, airmail, success and warning role.

## 4. Components

Each tappable thing has hover (fine pointers only, `@media (hover: hover)`), pressed (`:active`, a scale from the press token), focus-visible (a 2 px red outline at 2 px offset) and, where it applies, disabled states. Every target is at least 44 by 44 px. A control drawn smaller (32 px chips, 36 px tags, 40 px icon buttons and stepper keys) gets its hit area extended by padding or a `::before` inset of -4 to -6 px. A committed e2e check measures the hit areas.

| Component | Look | Notes |
|---|---|---|
| TopBar | sticky, 52 px, paper at 88% with a 12 px blur; back icon button left, bar title (Newsreader 18) centered-left, trailing icon buttons | the bar title fades and slides in (220 ms) when the large title leaves the viewport, and a hairline appears; the bar title is `aria-hidden` |
| LargeTitle | `h1`, Newsreader 34/1.08, weight 500, -0.015em | the only `h1` on a screen |
| Meta line | 14 px muted, pills inline | under the title |
| StepBar | 4 px segments, 6 px gaps, radius pill; done ink, current red, todo mist | `role="img"` with `aria-label` "4 of 6 done" |
| Row | 52 px (46 px list variant), radius 12, a negative 10 px inline margin so the hover fill bleeds; icon or thumb, title (600), optional sub (13 muted), end slot (fact or pill) | hover fill, pressed mist plus scale 0.985 |
| Pill | 24 px, radius pill, 12 px 600; mist by default, red text on redTint for "needs you" | an icon is optional |
| Button | 46 px, radius 12, 600; variants primary (red), ink, quiet (mist), ghost (muted text), danger (quiet with red text and an icon) | pressed: translateY(1px) scale(0.99) |
| IconButton | 40 px drawn, 44 px hit area, round | |
| ActionBar | bottom, paper, hairline top, safe-area padding; on 768 px and wider it floats inside the column with radius 16 and a soft shadow | holds the screen's actions |
| Search | 44 px, mist fill, radius 12, search icon, 16 px input text | `type="search"`, labelled |
| FilterChips | 32 px drawn, pill, hairline border; selected ink fill; count bubble | `aria-pressed`, a horizontal scroller that never wraps the page |
| Segmented | mist track, radius 12, 4 px padding, sliding paper thumb with a soft shadow (180 ms); selected text ink, others muted | native radios, commits on pointerdown |
| Stepper | mist, radius 12; minus and plus 40 px keys (44 px hit); Newsreader 22 tabular figure input | |
| Tags (multi choice) | 36 px pill, hairline; selected ink fill; optional icon | `aria-pressed` or native checkbox |
| Field | icon (16) plus 14 px 600 label, control, 13 px muted help; hairline below; 16 px vertical padding | error: red text and an alert icon |
| Sheet | bottom sheet with radius 22 at the top, grab handle, Newsreader 20 title, close button; slides up in 320 ms, scrim fades in 220 ms; centered dialog (max 520) with fade and scale from 0.98 at 768 px and wider | native `<dialog>` |
| Toast | ink fill, paper text, radius 12, an icon, rises 12 px and fades in | stays above the action bar |
| CoverThumb | 40 px square (row) or 56 px (Keep going), radius 8, object-fit cover | renders nothing until the image has loaded |
| ThemeSwitch | a Segmented with Light, Dark, System and their icons (sun, moon, monitor) | in the Home Actions sheet |

Icons: Lucide at stroke 1.75, 20 px in rows, 16 px in field labels, 13 px in pills, always `aria-hidden` next to a visible or accessible label.

Section icons (Lucide): identity `map-pin`, access `door-open`, seating `armchair`, power `plug`, environment `volume-2`, use_fit `utensils`, hours `clock`, amenities `coffee`, accessibility `accessibility`, late_night `moon`, estimates `chart-column`, photos `camera`. The implementer checks each name exists in the installed `lucide-react` and swaps in the nearest one if it does not.

## 5. Screens

All screens: TopBar, LargeTitle, content, ActionBar where there are actions. 20 px side gutter on phones.

### Home (`/survey`)

1. TopBar: no back. Trailing: an Admin shield icon button for admins.
2. Title "Spots".
3. Keep going card, shown when a pick exists (rule in 8.3). Border hairline, radius 20, 16 px padding, hover fill, press 0.99. Contents: the spot name (Newsreader 21, one line with an ellipsis), the StepBar, then the status line "Keep going · Next: Seating · 2 left" (13 muted; "Keep going · Ready to publish" when nothing is left), and an arrow icon on the right. There is no separate caption. The cover thumbnail (56 px) sits on the left when the spot has an approved cover. There is no icon otherwise. When the draft's details are not on the phone, the bar is left out and the status line is just "Keep going".
4. A Search field.
5. FilterChips: All, Needs you, Drafts, Due, each with a count of distinct spots matching the current search.
6. A list section labelled by the active filter. Rows: thumbnail (only with a cover), name, and on the right one fact (8.2). A banner above the list for unreadable stored changes and for writes still waiting from the last visit (as today).
7. ActionBar: the sync status button (icon plus short status, accessible name is the full status, opens the sync sheet), New spot (primary), and an Actions button that opens a sheet with: Changes on this phone, Admin (admins only), and Theme (ThemeSwitch).
8. Empty states: first run uses the existing title and body. Per filter: Nothing needs you. / No drafts. / Nothing is due. / No spots match.

### Spot overview (`/survey/spots/$id`)

1. TopBar: back to Home, bar title is the spot name, trailing sync icon button.
2. The large title (spot name).
3. Meta line: a status pill (Draft or Published), then the queued and review pills (Publish queued, Review queued, Reviewed by X, Unreviewed), then "Building · Floor N" and "Checked Oct 1", or "Never checked" (the oldest verification). Every spot shows a last-verified date.
4. StepBar, 12 px above. Then "4 of 6 · Next: Seating", or "6 of 6 done".
5. Banners for a conflict or failed changes, as today: an icon, text and Open.
6. Groups "Needed to publish", "Extras" and "Optional now" (group headers in Newsreader 20). The mock showed two groups; the third stays because those sections exist. Rows: section icon (red only when a required section is missing; an empty Extras or Optional section keeps an ink icon, a muted fact "None yet" or "Not set" for Busyness, and no pill), name, and on the right the fact (8.4).
7. ActionBar, by state:
   - draft with something missing: `Next: Seating` with an arrow icon (ink, fills the width), `Publish` (primary, `aria-disabled`, opens the "Can't publish yet" sheet that lists every blocker, including "a checked section" when only the verification is missing), and Actions;
   - draft, ready: `Looks right` (quiet, when the review action applies), `Publish` (primary, fills the width), Actions;
   - published or publish queued: `Looks right` (ink, fills the width, when the review action applies) or nothing, then Actions.
8. Actions sheet: Open next missing (when one exists), Add a photo, Looks right (when it applies and is not already in the bar), Unpublish (admins only, published, online, danger style, then the existing confirm).

### Section editor (`/survey/spots/$id/$section`)

1. TopBar: back to the overview, bar title is the section name, trailing sync icon button.
2. The large title (section name), then the spot name (15 muted).
3. StepBar with 16 px above it, then "4 of 6 · After this: House rules", or "4 of 6" when nothing is left after this one. Then "Checked Oct 1" or "Never checked" for this section's group, with a check icon. Busyness and photos have no check date.
4. Fields in the direction A style: icon plus label, then the control (Stepper, Tags, Segmented, text input with an edge outline), then help text, then a hairline.
5. ActionBar, stacked: `Save and next` with an arrow icon (primary) when a next section exists for this editor (8.1), otherwise `Save`; then `Nothing changed` (quiet; the deck text for `editor.verify` changes to this), or the reason it is blocked.
6. Every editor follows this: identity, access, hours, seating, power, environment, use_fit, amenities, accessibility, late_night, estimates, photos. Hours keeps one block per day with the copy-to-weekdays action. Busyness keeps time blocks as rows (decision 19 text). Photos uses a 2-column grid with 4:3 tiles, a Cover pill, Use as cover, and the upload buttons.

### Other screens

| Screen | Layout |
|---|---|
| Invite (`/invite/$token`) | no TopBar back; large title "Join Perch" or "Sign in"; name field; primary button in the ActionBar; error banner |
| New spot | TopBar back; title "New spot"; the building picker as a Search plus rows, then name, floor and directions fields, the location button (ghost with a `locate` icon); ActionBar `Create spot` |
| Admin | TopBar back; title "Admin"; groups "Invite a surveyor" (Segmented role, primary Create, the created link in a mist box with Copy), "Publish" (stat figures in Newsreader 22: last published, dirty; warnings list; Publish now), "Photos to approve" (4:3 tiles, Approve ink, Reject danger), "Surveyors" (rows: name plus a role pill that never shrinks, and an Actions icon button that opens a sheet with New sign-in link and Remove access) |
| Sync sheet, conflict sheet, failed sheet | Sheet; rows with an icon and text; actions stacked at the bottom of the sheet; conflict shows mine and theirs as two labelled blocks with the field values |
| Signed out, not found | large title, one line of body, one action |
| Update prompt | a toast-like card above the action bar: "Update ready" plus `Reload` (ink) |

Nothing is cut off at 375, 768 or 1440 px: no clipped text except deliberate one-line ellipses on names and facts, and the full name stays available as the accessible name.

## 6. Motion

Ease `cubic-bezier(0.2, 0.8, 0.2, 1)` everywhere.

| What | How |
|---|---|
| hover, color changes | 120 ms |
| press | scale to 0.985 (rows) or 0.97 (chips, icon buttons, tags), 120 ms |
| segmented thumb | translateX, 180 ms |
| bar title handoff | opacity and translateY 6 px to 0, 220 ms; hairline 220 ms |
| sheet | translateY(105%) to 0, 320 ms; scrim opacity 220 ms; exit is the reverse (`@starting-style` plus `allow-discrete` on display and overlay) |
| dialog (768 px and wider) | opacity plus scale 0.98 to 1, 220 ms |
| toast | translateY 12 px plus opacity, 220 ms |
| theme change | background and color, 220 ms |

Reduced motion: nothing slides or scales. Transform transitions are off, press scales are removed, sheets fade instead of sliding, and opacity and color transitions run at 80 ms.

## 7. Theme

- The pref is `"light" | "dark" | "system"`, stored in `localStorage["perch.theme"]`. Missing or invalid values read as `"light"`.
- An inline script in `index.html`, before any stylesheet, sets `data-theme="light"` or `"dark"` on `<html>`, or removes it for system. It also sets `<meta name="color-scheme">` to `light`, `dark` or `light dark` and sets a single `theme-color` meta to the resolved paper color.
- `tokens.css`: `:root` holds the light values and `color-scheme: light`; `:root[data-theme="dark"]` holds dark; `@media (prefers-color-scheme: dark) { :root:not([data-theme]) {dark} }`.
- Switching at runtime goes through the same function. While the pref is system, a `matchMedia` listener keeps the theme-color meta in sync.
- Manifest: `theme_color` and `background_color` are `#FBFAF9`.

## 8. Behavior changes from the approved mix

All the logic lives in `packages/ui-logic` (DOM free) and is tested there.

1. **Save and next.** `nextAfter(view, current)` returns the first required section after `current` in `OVERVIEW_ORDER` whose fill is not `done`. It wraps around and never returns `current`. It returns null when `current` is not a required section or when nothing is left. The editor shows `Save and next` and goes there after saving when this is non-null. Otherwise it shows `Save` and returns to the overview, as today. Nothing changed (verify) always returns to the overview.
2. **Home list.** `homeList(home, { filter, query, now })` returns rows and counts. "All" has one row per spot. Its fact has the highest priority that applies: conflict, failed, unreviewed, hours not confirmed, draft progress, then the published check date. "Needs you" is the attention rows. "Drafts" is the drafts. "Due" is published spots never checked or last checked more than 90 days ago (`isDue`, the existing stale rule moved into ui-logic). Up-to-date published spots appear only under All. Search is a case-insensitive and accent-insensitive substring match on the name. Counts follow the search.
3. **Keep going.** The first rule that matches picks the draft: (a) a draft with writes still on this phone, the one with the highest outbox seq; (b) otherwise a server draft last edited by me, the most recent `updated_at`. Otherwise there is no card. Its progress is null when the draft's details are not cached.
4. **Overview facts.** `sectionFact(view, section)` returns a short value built from the existing option labels: identity "Floor {floor}", access is the eligibility label, seating "{count} seats", power is the outlet coverage label, environment is the noise label, use_fit is the food label, hours "{term}" when set, estimates "{count} of {total} blocks", photos "{count} photos" or nothing. Any other section is "Done" or "Partly done". The row shows the first that applies: a sync problem (red pill Conflict or Didn't save; muted Syncing or On this phone), then Missing (red pill), then Partly done, then the fact.
5. **Publish blocked.** Publish stays focusable with `aria-disabled="true"` and `aria-describedby` pointing to a one-line reason ("Can't publish yet: 2 missing"). Activating it opens the blockers sheet.

## 9. Bugs fixed in this work (measured on 2026-10-07)

| Bug | Measured cause | Fix |
|---|---|---|
| Surveyor/Admin segmented delay | The native radio changes on `click`, which fires at pointerup. Probe: pointerdown at 735.7 ms, change at 890.7 ms, paint at 899.8 ms, so the control waits for the finger to lift. There is also no pressed state and no transition, so nothing moves until release. | Show the choice on pointerdown and commit on release (D11); add a pressed state and the sliding thumb. |
| Scroll after returning from an editor | `useFocusOnNavigate` (`routes/__root.tsx`) calls `main.focus()` without `preventScroll`. The browser scrolls `main` into view after the router restores scroll, so both the editor and the returning overview land at scrollY 48 (the header height). The Back link and Save are push navigations, so they get fresh restoration keys and can never restore the previous position. | `focus({ preventScroll: true })`. `getScrollRestorationKey` uses the pathname for Home and the overview, and the default key for every other route. The overview comes back where it was, and editors open at the top. |
| Admin badge cut off | `.entry__text { flex: 1; min-width: 0 }` has a 0 basis, so the wrapping row never wraps. The two action buttons squeeze the text to about 17 px, and `.stamp { max-width: 100% }` clips "Admin" to "Ad". | Surveyor rows: the name has `flex: 1 1 auto; min-width: 0`, the role pill has `flex: none`, and the two actions move into one icon button that opens a sheet. |

## 10. Thumbnails contract

- `SpotSummary` gains `cover_photo_id: z.uuid().nullable().default(null)`. The default keeps lists persisted by the current app version valid.
- The server, in `listSurveySpots`, returns the id of the spot's photo with `is_cover` true, `approved_at` not null and `blob_sha256` not null, scoped to the campus through spot, building and `campus_id`. An unapproved or rejected cover gives null. No new route: the image loads through `GET /survey/photos/:id/image` (bearer, campus scoped, `cache-control: private, max-age=86400`).
- Client: `summaryOf` computes the same value from `spot.photos`. `sanitizePersisted` keeps the parsed (defaulted) data instead of the raw data. Drafts created on this phone have no cover.
- Privacy: the id refers to an approved photo that every surveyor can already see in `SurveySpot.photos`. Nothing about who took it is added.

## 11. Acceptance criteria

1. No postcard artifacts remain: no Postmark, SyncPostmark, StampChip, RuledRow or HeaderBand components, no `stamp`, `postmark`, `ruled` or `band` classes, no shell or airmail tokens. `grep -rniE "postmark|stamp|ruled|airmail|band__" apps/web/src` returns nothing.
2. Tokens tests pass: exactly 5 palette roles per scheme, every contrast pair in section 3, `tapTarget` 44 or more, no postcard keys, and the oklab mix gives known values (black and white at 50% is `#636363`).
3. With the theme stored as dark and `main.tsx` delayed, the first paint has the dark paper background. With nothing stored and a dark OS, the first paint is light.
4. The theme switch persists across reloads and follows the OS while it is set to System.
5. A segmented option shows as checked after pointerdown and before pointerup, and the value is committed once on pointerup. A pointercancel puts the shown choice back and commits nothing. Keyboard arrows still work.
6. Back from an editor returns the overview to its previous scrollY (within 2 px). An editor opened from a scrolled overview starts at 0.
7. At 375, 768 and 1440 px on every route, the committed layout e2e reports no horizontal overflow, no clipped text, and no hit area under 44 by 44 px.
8. The Admin role pill is fully visible at 375 px.
9. Home rows and the Keep going card show a thumbnail only for spots with an approved cover. Offline they show text only, with no broken image.
10. A list persisted before this change still restores offline.
11. Every UI string goes through `t()`. The copy deck and `copy.gen.ts` match (the copy test).
12. typecheck, lint, `bun test`, web vitest, and Playwright (the existing 13 plus the new tests) pass at every commit. verify-ui reports PASS (console clean, no overflow, axe clean) at 375, 768 and 1440 px for every route.
13. The direction contract `apps/web/.impeccable/surfaces/apps-web.md` describes Seawolf, and decision 20 is recorded.

## 12. Out of scope and after

- Plan D part 3 resumes afterwards: Task 16 step 4 (recapture with sheets settled, animations disabled, desktop widths), Task 17 (decision 19 and stack notes, with its text amended for the redesign), Task 18 (DESIGN.md through `impeccable:impeccable-documenter`).
- Student mode screens.
- Keyboard shortcuts, bulk check (D13).

## 13. Open questions for the owner

1. **Bulk check. Answered: guided walk.** Should "Check every section" exist? If it should, as a guided walk: open each section in turn, where Nothing changed moves to the next one. It would never stamp sections unopened. The owner chose the guided walk: "Check each section" in the Actions sheet.
2. **Decision 12. Answered: decision 12 stands.** Decision 12 (the postcard concept for student mode: postmark for last verified, stamp for noise policy, shareable postcards in v0) is a product decision, not only a look. Does the redesign retire it for students too, or only for the surveyor tool? The owner answered that it stands; only the surveyor look is retired.
