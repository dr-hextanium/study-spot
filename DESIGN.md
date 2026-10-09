---
name: Perch survey mode (Seawolf)
description: A quiet survey tool for student surveyors. Big serif titles, compact rows with the fact on the right, one red thing that needs you.
colors:
  paper: "#FBFAF9"
  ink: "#1A1717"
  red: "#990000"
  mist: "#ECE8E6"
  onRed: "#FFFFFF"
  muted: "color-mix(in oklab, #1A1717 62%, #FBFAF9)"
  line: "color-mix(in oklab, #1A1717 10%, #FBFAF9)"
  edge: "color-mix(in oklab, #1A1717 45%, #FBFAF9)"
  hover: "color-mix(in oklab, #ECE8E6 55%, #FBFAF9)"
  redTint: "color-mix(in oklab, #990000 12%, #FBFAF9)"
  redHover: "color-mix(in oklab, #990000 88%, #1A1717)"
  redPress: "color-mix(in oklab, #990000 76%, #1A1717)"
  inkHover: "color-mix(in oklab, #1A1717 85%, #FBFAF9)"
  mistHover: "color-mix(in oklab, #ECE8E6 82%, #1A1717)"
  paper-dark: "#151313"
  ink-dark: "#EEEAE8"
  red-dark: "#EF6B63"
  mist-dark: "#262222"
  onRed-dark: "#151313"
  muted-dark: "color-mix(in oklab, #EEEAE8 62%, #151313)"
  line-dark: "color-mix(in oklab, #EEEAE8 10%, #151313)"
  edge-dark: "color-mix(in oklab, #EEEAE8 45%, #151313)"
  hover-dark: "color-mix(in oklab, #262222 55%, #151313)"
  redTint-dark: "color-mix(in oklab, #EF6B63 12%, #151313)"
  redHover-dark: "color-mix(in oklab, #EF6B63 88%, #EEEAE8)"
  redPress-dark: "color-mix(in oklab, #EF6B63 76%, #EEEAE8)"
  inkHover-dark: "color-mix(in oklab, #EEEAE8 85%, #151313)"
  mistHover-dark: "color-mix(in oklab, #262222 82%, #EEEAE8)"
typography:
  large:
    fontFamily: '"Newsreader Variable", ui-serif, Georgia, serif'
    fontSize: "34px"
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: "-0.015em"
  figure:
    fontFamily: '"Newsreader Variable", ui-serif, Georgia, serif'
    fontSize: "22px"
    fontWeight: 400
  group:
    fontFamily: '"Newsreader Variable", ui-serif, Georgia, serif'
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  barTitle:
    fontFamily: '"Newsreader Variable", ui-serif, Georgia, serif'
    fontSize: "18px"
    fontWeight: 500
  input:
    fontFamily: '"Instrument Sans Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: '"Instrument Sans Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: '"tnum"'
  body-strong:
    fontFamily: '"Instrument Sans Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.5
  label:
    fontFamily: '"Instrument Sans Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "14px"
    fontWeight: 600
  small:
    fontFamily: '"Instrument Sans Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: '"Instrument Sans Variable", ui-sans-serif, system-ui, sans-serif'
    fontSize: "12px"
    fontWeight: 600
  mono:
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
    fontSize: "13px"
    fontWeight: 500
rounded:
  s: "8px"
  m: "12px"
  l: "20px"
  sheet: "22px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  gutter: "20px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.red}"
    textColor: "{colors.onRed}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.m}"
    padding: "0 18px"
    height: "46px"
  button-primary-hover:
    backgroundColor: "{colors.redHover}"
    textColor: "{colors.onRed}"
  button-primary-active:
    backgroundColor: "{colors.redPress}"
    textColor: "{colors.onRed}"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.m}"
    padding: "0 18px"
    height: "46px"
  button-ink-hover:
    backgroundColor: "{colors.inkHover}"
    textColor: "{colors.paper}"
  button-quiet:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.m}"
    padding: "0 18px"
    height: "46px"
  button-quiet-hover:
    backgroundColor: "{colors.mistHover}"
    textColor: "{colors.ink}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.m}"
    padding: "0 18px"
    height: "46px"
  button-ghost-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "{colors.red}"
    textColor: "{colors.onRed}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.m}"
    padding: "0 18px"
    height: "46px"
  button-danger-hover:
    backgroundColor: "{colors.redHover}"
    textColor: "{colors.onRed}"
  button-danger-active:
    backgroundColor: "{colors.redPress}"
    textColor: "{colors.onRed}"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    size: "40px"
  icon-button-hover:
    backgroundColor: "{colors.mist}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.input}"
    rounded: "{rounded.m}"
    padding: "8px 12px"
    height: "46px"
  segmented-track:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.m}"
    padding: "4px"
  segmented-thumb:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.s}"
    height: "44px"
  segmented-list-option:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: "48px"
  stepper:
    backgroundColor: "{colors.mist}"
    rounded: "{rounded.m}"
    padding: "4px"
  stepper-button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.s}"
    size: "40px"
  stepper-value:
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
    width: "64px"
    height: "44px"
  tag:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "36px"
  tag-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  check-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    height: "48px"
  check-switch:
    backgroundColor: "{colors.mist}"
    rounded: "{rounded.pill}"
    width: "44px"
    height: "26px"
  check-switch-on:
    backgroundColor: "{colors.ink}"
  row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.m}"
    padding: "8px 10px"
    height: "52px"
  row-hover:
    backgroundColor: "{colors.hover}"
  row-active:
    backgroundColor: "{colors.mist}"
  row-compact:
    height: "46px"
  row-thumb:
    backgroundColor: "{colors.mist}"
    rounded: "{rounded.s}"
    size: "40px"
  pill:
    backgroundColor: "{colors.mist}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "0 9px"
    height: "24px"
  pill-red:
    backgroundColor: "{colors.redTint}"
    textColor: "{colors.red}"
  count:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    height: "22px"
  step-todo:
    backgroundColor: "{colors.mist}"
    rounded: "{rounded.pill}"
    height: "4px"
  step-done:
    backgroundColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "4px"
  step-current:
    backgroundColor: "{colors.red}"
    rounded: "{rounded.pill}"
    height: "6px"
  top-bar:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.barTitle}"
    height: "52px"
  action-bar:
    backgroundColor: "{colors.paper}"
    padding: "10px 12px 14px"
  filter-chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "32px"
  filter-chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  filter-chip-count:
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    height: "24px"
  keep-going:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.l}"
    padding: "16px"
  search:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    typography: "{typography.input}"
    rounded: "{rounded.m}"
    padding: "0 12px"
    height: "44px"
  sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
  sheet-dialog:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.l}"
    width: "520px"
  banner:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.m}"
    padding: "8px 8px 8px 12px"
    height: "44px"
  reason:
    backgroundColor: "{colors.redTint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.m}"
    padding: "12px 16px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.m}"
    padding: "8px 14px"
    height: "44px"
  hours-day-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.m}"
    height: "52px"
  estimates-cell:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.m}"
    padding: "8px 12px"
    height: "56px"
---

# Design System: Perch survey mode (Seawolf)

## Overview

**Creative North Star: "Seawolf"**

Seawolf is a quiet tool that says more with less. A surveyor holds a phone at arm's length in afternoon sun or in a fluorescent basement at night, and the screen answers three questions without decoration: what is left (the step bar), what needs me (red), and what is done (the fact on the right of each row). A big Newsreader title opens every screen; everything under it is compact Instrument Sans rows in the density of a command palette, with the calm spacing of a notes page.

The system is four colors and oklab mixes of them. Paper, ink, Stony Brook red and mist do all the work; there is no status hue, no gradient, no texture, no illustration. Depth is reserved for things that float over the page (the sheet, the floating action bar on wide screens, the segmented thumb). Motion is short and physical: a press scales the thing you touched, the segmented thumb glides to your choice the moment your finger lands, sheets slide up, and the large title hands off to a small bar title as it scrolls away.

Scope and lineage. This file records survey mode (`/invite`, `/survey`, new spot, spot overview, section editors, admin) as built at the end of the surveyor redesign. Student mode is not built; it keeps the postcard idea (decision 12) and its surfaces are designed separately, so nothing here binds them. Retired: the earlier surveyor world "The Divided Back" (decision 14: printed labels on ruled lines, ballpoint-blue entries, rubber-stamp status, postmark rings, an ink band). Decision 20 replaced it with Seawolf; none of those devices exist in this build.

The app icon is a red Newsreader P on paper (`apps/web/public/icons/icon.svg`, provenance in `PROVENANCE.txt`): the same two typefaces' world, the same one red.

**Key Characteristics:**
- Four colors plus oklab mixes; red is the only accent and it always means something.
- Newsreader for large titles, group headings, bar titles and figures; Instrument Sans for everything else.
- Lists of 52 px rows: lead icon or thumbnail, name, and the fact or a pill on the right.
- One centered 680 px column on every width; phone first, no second pane.
- Lucide icons at a 1.75 stroke, 20 px by default, 16 px beside labels.
- Light by default, with a per-device light, dark or system switch applied before first paint.

## Colors

A warm off-white paper, a warm near-black ink, one deep university red, and a pale mist for fills; every other value is a mix of those four.

### Primary
- **Seawolf Red** (`red`; `red-dark` in dark mode): the one filled primary button per screen (New spot, Publish, Keep mine, Take photo), the danger button (Discard, Remove access, Reject, Unpublish), the current segment of the step bar, the Missing and Conflict pills, the "Didn't save" pill, the banner and reason icons, field error text and borders, the trouble state of the sync status, and every keyboard focus ring. It is also the text caret, the native accent color, and (as `redTint`) the text selection. In dark mode it lifts to a coral so it holds contrast on near-black, and the text on it flips to paper-dark (`onRed-dark`).
- **On Red** (`onRed`): the label color on a red fill, white in light mode and paper-dark in dark mode.
- **Red Tint** (`redTint`, 12 percent red into paper): the background of red pills, of the "Can't publish yet" reason box, and of selected text.
- **Red Hover / Red Press** (`redHover`, `redPress`): red mixed toward ink for the hover and pressed states of the primary button. Never used at rest.

### Neutral
- **Paper** (`paper`): the page, the sheet, the action bar, the input field, the segmented thumb and stepper buttons. Warm, not pure white, so a sunlit screen does not glare.
- **Ink** (`ink`): all body text, the ink button, selected tags and filter chips, the done segments of the step bar, the toast and the update card. Ink on paper clears 7:1 for sunlight.
- **Mist** (`mist`): every quiet fill: the quiet button, the segmented track, the stepper tray, the search field, banners, note cards, mist pills, counts, the todo step, empty photo frames and thumbnail placeholders.
- **Muted** (`muted`, 62 percent ink): secondary text, row subtitles and facts, helpers, placeholder text, unselected segmented labels, label icons.
- **Line** (`line`, 10 percent ink): every hairline: under fields, between days and list options, the scrolled top bar edge, the action bar edge, the sheet actions divider, the outline of the Keep going card and filter chips, the sheet grab handle.
- **Edge** (`edge`, 45 percent ink): the stronger stroke on inputs, unselected tags, radio rings and estimates cells; also the scrollbar thumb.
- **Hover** (`hover`, 55 percent mist into paper): the hover wash on rows, inputs, tags, chips and the ghost button.
- **Ink Hover / Mist Hover** (`inkHover`, `mistHover`): hover and pressed states for ink-filled and mist-filled controls.

Each light token has a `-dark` twin. The dark set is the same recipe on the dark palette; mixes are written once in CSS against the palette variables, so both schemes come from the same five roles. Component tokens above reference the light names; the dark scheme swaps the palette underneath them.

### Named Rules

**The Four Colors Rule.** Paper, ink, red and mist, and oklab mixes of them. Nothing else enters the palette: no green for done, no amber for waiting, no blue for links. Scrims and shadows are ink mixed into transparent and are not tokens.

**The Red Means You Rule.** Red appears where the surveyor has to act or look: the one primary action, the current step, a missing required section, a conflict, a failed save, an error, the focus ring. It is never decoration and never a heading color. The large red fills are the one primary button and the danger button; a danger button never sits beside a red primary, so a red fill next to you always means one thing. Every other red surface is a pill, a reason box or a 6 px step.

**The Icon Plus Red Rule.** Status is carried by an icon and, when it needs the surveyor, by red. A state is never shown by color alone: the current step is also taller, trouble pills carry an icon, a danger banner always carries its icon.

## Typography

**Display Font:** Newsreader Variable (with ui-serif, Georgia, serif), self-hosted
**Body Font:** Instrument Sans Variable (with ui-sans-serif, system-ui, sans-serif), self-hosted
**Mono Font:** the system mono stack, only for one-time invite links

**Character:** a bookish, slightly condensed serif for names and numbers set against a neutral, sturdy grotesque for every control. The serif makes a spot feel like a place; the sans keeps the tool plain.

### Hierarchy
- **Large** (Newsreader 500, 34 px, 1.08, tracking -0.015em): the large title, the one h1 per screen (the spot name, "Spots", the section name). Balanced wrapping; long names wrap anywhere rather than overflow.
- **Figure** (Newsreader 400, 22 px): numbers that are the answer: the stepper value, admin counts. Tabular figures.
- **Group** (Newsreader 500, 20 px, 1.25): group headings over lists ("Needed to publish", "Extras", "Needs you"), sheet titles, the hours term heading (set at 600 there).
- **Bar title** (Newsreader 500, 18 px): the small bar title that fades in when the large title scrolls away.
- **Input** (Instrument Sans 400, 16 px): text inside inputs and search, at 16 so phones do not zoom.
- **Body** (Instrument Sans 400, 15 px, 1.5): running text, sheet text (to 60ch), button labels and row titles at 600 (`body-strong`). Tabular figures are on for the whole page.
- **Label** (Instrument Sans 600, 14 px): segmented labels, tags, filter chips, the meta line under the title, the progress line, toast text (at 500).
- **Small** (Instrument Sans 400, 13 px): row subtitles, facts on the right, helpers, ledes, sync notes.
- **Caption** (Instrument Sans 600, 12 px): pills and counts only.

### Named Rules

**The Serif Is For Names And Numbers Rule.** Newsreader sets titles, group headings, bar titles and figures. It never sets a control, a label, a helper or a button.

**The No Small Caps Rule.** Labels are sentence case at normal tracking. No uppercase labels, no tracked-out small text, and no label lines set above a heading to introduce it.

## Layout

One column, phone first. Content sits in a centered column of 680 px maximum with 20 px side gutters on every width; laptops get the same column centered on paper, not a second pane. The document scrolls; the top bar is sticky and the action bar is pinned to the bottom, so a screen with actions reserves 88 px plus the safe area beneath its content (the action bar's reserved space, not its drawn height).

The rhythm is a 4 px base: 4, 8, 12, 16, 20, 24, 32. Group headings sit 24 px above their list and 6 px over it. Rows are 52 px with 12 px between lead, text and end; compact rows are 46 px. Fields are separated by 16 px of padding and a hairline rather than by boxes. Spot overview, Home and every editor follow the same order: top bar, large title, meta line, then (on spot screens) the step bar and its progress line, then groups of rows or fields.

From 768 px three things change and nothing else: sheets become centered dialogs (520 px wide), the action bar lifts off the bottom edge into a floating rounded tray inside the column, and the photo grid goes from two columns to three. Filter chips scroll horizontally edge to edge, bleeding through the gutter.

**The 44 Rule.** Every hit area is at least 44 px. Controls drawn smaller (the 40 px icon button, the 32 px filter chip, the 36 px tag, the 40 px stepper buttons) extend an invisible hit area to 44 px.

## Elevation & Depth

The page is flat. Rows, fields, cards and banners have no shadow; they separate by hairlines, mist fills and space. Shadow belongs only to things that float above the page, and each is soft ink mixed into transparent, never a hard offset.

### Shadow Vocabulary
- **Sheet lift** (`0 -10px 40px -10px` ink at 30 percent): the bottom sheet and the centered dialog, over a scrim of ink at 30 percent.
- **Floating tray** (`0 12px 40px -12px` ink at 22 percent): the action bar from 768 px only. On phones it is flat paper with a top hairline.
- **Thumb** (`0 1px 2px` ink at 12 percent): the paper thumb of the segmented control, so it reads as lifted off the mist track.

The top bar is translucent paper (88 percent) with a 12 px background blur; it gains its bottom hairline only once the page scrolls.

### Named Rules

**The Floating Things Only Rule.** A shadow means the element is over the page: a sheet, the floating action bar, the segmented thumb. Nothing at rest in the flow casts one.

## Shapes

Soft rectangles at three sizes and full pills, chosen by what the shape is. Small inset pieces (the segmented thumb and its options, stepper buttons, row thumbnails, the update card button) use 8 px. Controls and rows (buttons, inputs, the segmented track, the stepper tray, search, banners, toasts, rows, estimates cells, photo frames) use 12 px. Cards that group content (the Keep going card, the floating action bar tray, the centered dialog) use 20 px. The bottom sheet's top corners use 22 px. Anything that is a token of state or a toggle in a group (pills, counts, tags, filter chips, the switch, step segments, the icon button) is a full pill. The direction contract named 8 px for small tags and chips; the build made them full pills, and this file records the build.

Strokes are 1 px: `line` for structure, `edge` for things you can type into or toggle. Radio rings are 1.5 px `edge`, filled ink with a paper center when chosen. Photos are 4:3 and cover-cropped.

## Components

### Buttons
Plain, firm, 46 px tall, 12 px corners, Instrument Sans 600 at 15 px on the snug 1.25 line height (the height comes from min-height, so descenders are never clipped), an optional 20 px leading icon. Every one-line control (buttons, chips, tags, pills, segmented options) uses the snug line height, and a truncating label keeps 2 px of room for descenders inside its clip.
- **Primary (red):** the one action the screen exists for. One per screen, in the action bar or a sheet's actions. Hover mixes toward ink; press darker still.
- **Ink:** the strong secondary ("Next: Seating", "Keep theirs").
- **Quiet (mist):** ordinary secondary actions ("Looks right", Cancel).
- **Ghost:** muted text on nothing, a hover wash; used for the sync status in the action bar.
- **Danger:** a red fill with on-red text, hover and press like the primary, for removals (Discard, Remove access, Reject, Unpublish and every destructive confirm). It never shares a sheet or a group with a red primary: beside it the safe choice is ink (Try again) or quiet (Cancel). The admin screen therefore has no red primary; Create invite link and Approve are ink.
- **Pressed:** moves down 1 px and scales to 0.99. **Disabled:** 45 percent opacity. A blocked Publish stays visible and is `aria-disabled` with its reason linked, and pressing it opens the "Can't publish yet" sheet.
- **Icon button:** a 40 px transparent circle (44 px hit area), mist on hover and press, scale 0.97 on press. Back, close, sync, actions.

### Field (icon plus label)
A label line in Instrument Sans 600 with an optional 16 px muted icon before it and a muted "Optional" at the end, the entry below, helper or error text below that, and a hairline closing the field. Inputs are paper with a 1 px edge stroke, 12 px corners, 46 px tall, mist-paper wash on hover. Focus turns the stroke red and doubles it (a 1 px red ring). Errors keep the red stroke and show a red line of text with an alert icon.

### Segmented control
A mist track (4 px inset, 12 px corners) with a paper thumb (8 px corners, the thumb shadow) under the chosen option; labels are muted 14 px 600, the chosen one ink. **Instant:** the new choice shows on pointerdown and the thumb glides there (transform, 180 ms, standard easing); the value commits on release over the same option, and a scroll or a release elsewhere drops it. Native radios sit underneath, so arrows and screen readers work. Unpressed options scale to 0.97 while held. With no value the thumb is hidden. Long options switch to the **list** layout: stacked 48 px radio rows with hairlines between, a 20 px ring on the left, no thumb. Yes/No, Yes/No/Not sure and optional choices are all this control.

### Stepper
A mist tray holding a 40 px paper minus button, the number in Newsreader 22 px (a transparent 64 px keypad field that takes paper and a red stroke on focus), an optional muted unit, and a 40 px paper plus button. Buttons scale to 0.97 and darken to mistHover on press; at a limit they go muted at reduced opacity.

### Tag toggle with icon
A 36 px pill in a wrapping group under one field label: paper with an edge stroke, ink 14 px 600 text, and a 16 px icon before the text. Selected fills ink with paper text. A tag without its own icon shows a check only when selected. Press scales to 0.97.

### Check row
A 48 px full-width line: label (with optional icon) and helper on the left, a 44 by 26 switch on the right, hairline below. The switch is a mist track with an ink knob; on, the track turns ink and the knob paper and slides 18 px.

### Row
The unit of every list. 52 px minimum, 12 px corners, bleeding 10 px past the column so the hover wash lines up with the text. Lead (a 20 px section icon or a 40 px cover thumbnail), a 600 title with an optional muted 13 px subtitle, and an end slot holding one fact in muted 13 px or a pill. Hover washes `hover`; press washes mist and scales to 0.985. **Compact** rows are 46 px. **With cover thumb:** a 40 px, 8 px-corner image that fades in when loaded; until then the slot takes no width.

On the spot overview, a required section with nothing in it ends in a red **Missing** pill; an empty extra section ends in muted "None" or "Not set" instead, never red. Sync trouble beats missing, and missing beats the fact. On Home, each row carries exactly one fact: a red Conflict or Didn't save pill, a mist Unreviewed pill with an eye icon, a mist Draft pill, a progress count, or the check date.

### Pill
24 px, 9 px side padding, caption type, optional 13 px icon. **Mist:** neutral state (Draft, Published with a check, Unreviewed, Reviewed by name, queued states). Its text color is inherited: muted in a row's end slot and in the meta line, ink on a photo's cover badge. **Red:** redTint fill with red text, for the one thing that needs a look (Missing, Conflict, Didn't save). The **count** badge is its 22 px circular cousin beside group headings and inside chips.

### Step bar
One segment per required section, 6 px apart, full pills. Done is ink, todo is mist, current is red and 6 px tall against the others' 4 px, so the current step is not shown by color alone. It is an image with a text label, followed by a muted progress line ("4 of 6 · Next: Seating").

### Top bar with large title handoff
A sticky 52 px bar (plus safe area) of translucent blurred paper: back icon button, a small Newsreader 18 px title, trailing icon buttons (sync, actions). The page's real h1 is the 34 px large title below it. When the large title scrolls out, the bar gains its hairline and the small title fades and rises 6 px into place (220 ms); the small title is hidden from assistive tech.

### Action bar
Pinned to the bottom, at most one red button, everything within thumb reach. On phones: full-width paper with a top hairline, 10 px by 12 px padding plus safe area, buttons in a row with the main one growing. From 768 px: a floating 20 px-corner tray with a hairline and the floating tray shadow, 16 px above the bottom. **Stacked** variant puts a wide primary over a quiet one. Spot overview: "Next: Seating" (ink), Publish (red), Actions. Home: sync status, New spot (red), more.

### Filter chips
A horizontally scrolling row of 32 px pills (44 px hit area) with a line stroke, a label and a count. The count is a 24 px circle concentric with the chip's right end cap: it is inset 4 px from the top, bottom and right edge (the chip's right padding is 3 px plus its 1 px stroke), so the circle's center is the end cap's center; a two-digit count stretches it into a pill with the same caps. One is pressed: ink fill, paper text, the count tinted from the text color. Home filters: All, Needs you, Drafts, Due. A Newsreader group heading below the chips names the current filter.

### Keep going card
The top of Home when a draft is in progress: a 20 px-corner card outlined with a hairline, holding an optional 56 px cover, the spot name in Newsreader, the draft's step bar, and one status line that folds the caption in ("Keep going · Next: Seating · 2 left", or "Keep going · Ready to publish"). Hover darkens the outline; press washes `hover` and scales to 0.99.

### Search
A 44 px mist field with a muted 18 px search icon and a 16 px input; the label doubles as placeholder and accessible name.

### Sheet and confirm sheet
A native modal dialog: focus moves in and is trapped, Escape and the close button dismiss, the page behind is inert. On phones it is a bottom sheet (22 px top corners, up to 85 percent of the viewport, a 36 by 4 px grab handle) that slides up in 320 ms; from 768 px it is a centered 520 px dialog with 20 px corners that scales in from 0.98 and fades. A Newsreader 20 px title and a close icon head it; the body scrolls; actions are pinned below a hairline. The **confirm sheet** asks once before something that cannot be undone: a wide primary (or a wide red danger when destructive, the one red thing in the sheet) over a wide quiet Cancel.

### Banner
A 44 px minimum mist box with 12 px corners and 600 text, with an optional action on the right. **Danger** always carries a red alert icon and interrupts (alert role). **Note** has no icon by default and waits to be read (status role), for offline notices and waiting changes. The related **reason** box (red tint, red icon) explains why Publish is blocked.

### Toast and honest saves
One short confirmation at a time: an ink box, 44 px minimum with 12 px corners, with a check icon and 14 px text, rising 12 px into place above the action bar, tap to dismiss, announced politely. A toast tied to a write is honest: it says **"Saved"** or **"Marked as checked"** only once the server has applied that write, and **"Saved on this phone"** while it is still queued. The guided walk ends with "Checked 3 sections" or "Checked 3 sections, saved on this phone" by the same rule. The update prompt is a separate ink card above the action bar, and the toast steps up while it shows.

### Sync status
An icon in the top bar or an icon with short text as a ghost button in the action bar; either opens the "Changes on this phone" sheet, and the accessible name is always the long sentence. Cloud with a check for all synced, a slashed cloud for offline, a turning arrow while changes wait or send, a red alert for failed, unreadable or signed out. Short texts: "All synced", "Offline", "3 waiting", "2 not saved", "Signed out".

### Hours day row
Each day is a 52 px row (day name, a muted right-aligned summary, a chevron that turns over when open) closed by a hairline. Opening it reveals a three-way segmented control (Hours, Closed, All day); in Hours mode, Opens and Closes times sit side by side, with a muted note when closing runs into the next day.

### Estimates cell
The busyness grid has time blocks as rows and weekdays and weekends as columns. Each cell is a 56 px, 12 px-corner paper button with an edge stroke and its bucket label at the bottom left; a fill rises from the bottom with the guess (10, 35, 60, 85 or 100 percent). An unset cell has a dashed stroke and muted text. Each tap moves the cell one bucket up; press scales to 0.97.

### Theme switch
A three-option segmented control (Light, Dark, System), stored on this device only and applied before first paint. System follows the phone.

## Do's and Don'ts

### Do:
- **Do** build every color from paper, ink, red and mist, and the oklab mixes named in the frontmatter.
- **Do** give each screen at most one red-filled primary, the action the screen exists for; use ink, quiet or ghost for everything else. Removals are red-filled danger buttons, never beside a red primary.
- **Do** keep red for things that need the surveyor (missing required sections, conflicts, failed saves, errors, the current step) and for focus rings.
- **Do** pair every status with an icon, and change shape or size as well as color where state matters (the current step is taller).
- **Do** give every control a hit area of at least 44 px, extending an invisible area when the drawing is smaller.
- **Do** show "Saved", "Marked as checked" or "All synced" only after the server has accepted the write; say "Saved on this phone" until then.
- **Do** show the last-checked date for every spot on its overview, including "Never checked", and on every published spot's Home row.
- **Do** honor reduced motion: nothing slides, scales or spins; opacity and color changes run at 80 ms, and sheets fade instead of sliding.
- **Do** put names and numbers in Newsreader and everything else in Instrument Sans, with Lucide icons at a 1.75 stroke.
- **Do** write copy short and literal, with commas or colons where a dash might go.

### Don't:
- **Don't** add a status hue: no green for done, no amber for waiting, no blue for info. Done is ink, todo is mist, attention is red.
- **Don't** use red as decoration, for headings, or as a large background.
- **Don't** put a second red primary on a screen, or a danger button next to a red primary; demote the neighbor to ink.
- **Don't** shadow anything that sits in the page flow; shadows are for sheets, the floating action bar and the segmented thumb.
- **Don't** decorate: hairlines separate items, but nothing imitates a printed form (no lines to write on, no faux-printed seals or date rings), and there are no colored status chips or tracked uppercase labels.
- **Don't** show a write as saved or synced before the server accepts it, and never show a forecast as live.
- **Don't** shrink a hit area below 44 px.
- **Don't** use em-dashes in UI copy, docs or comments.
