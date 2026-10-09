---
version: 2
slug: "apps-web"
primary_target: "apps/web"
related_targets: []
---

# Surface brief: survey mode (apps/web /survey/*)

Scope: surveyor screens of the Perch PWA (`/invite/$token`, `/survey`, `/survey/spots/new`, `/survey/spots/$id`, `/survey/spots/$id/$section`, `/survey/admin`). Visitor mode: Operate. Spec: `docs/superpowers/specs/2026-10-07-surveyor-redesign.md`.

Audience and task: 3 to 5 student surveyors, one-handed on phones, outdoors in sun and in dim basements, creating and checking study spots in under 5 minutes, offline first; admins also on laptops. Flow and copy: `docs/design/surveyor-journey.md`, `docs/design/surveyor-copy.md`.

Constraints: 44 px minimum hit areas; WCAG 2.2 AA in light and dark (ink on paper 7:1 for sunlight); one red-filled button per screen; no status hues; no university marks; no em-dashes.

Physical scene: a phone held at arm's length in direct afternoon sun, then in a fluorescent-lit basement at 11pm; a laptop at a club meeting. Light by default, with a manual light, dark or system switch.

## Direction contract

THESIS: Seawolf. A quiet tool that says more with less: a big serif title, compact rows with the fact on the right, one red thing that needs you. It refuses decoration: no stamps, no postmarks, no ruled lines, no ink band, no colored status chips.

OWN-WORLD: Four colors (paper, ink, Stony Brook red, mist) and oklab mixes of them. Newsreader for large titles, group headers, bar titles and figures; Instrument Sans for everything else. Lucide icons at 1.75 stroke. Radius 8 (--radius-s) on small tags and chips, 12 on controls and rows, 20 on cards, 22 on sheets. Hairlines at ink 10 percent. Check dates: Home shows them for published spots (attention rows); the spot overview shows them for every spot, including "Never checked". Shadows only on sheets, the floating action bar and the segmented thumb.

STORY: The surveyor sees what is left (the step bar), what needs them (red), and what is done (the facts on the right). They trust their entries are kept because the sync status in the action bar or top bar says so. They act with one thumb on the action bar.

FIRST VIEWPORT: Spot overview on a 390 by 844 phone. A 52 px top bar (back, sync), the spot name as a 34 px Newsreader title, a Draft pill with "Building · Floor N · Checked Oct 1", the step bar and "4 of 6 · Next: Seating". Below that, groups of 52 px rows: section icon, name, and on the right the fact or a red Missing pill. The action bar is pinned: Next: Seating (ink), Publish (red, aria-disabled with a reason while blocked), Actions.

FORM: Raycast list density with Notion page calm. Progress is a 4 px step bar, one segment per required section: done is ink, current is red, todo is mist.

FINISH: unreviewed and undocumented is unfinished. This build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Signature interaction

Instant choice: segmented controls show the new choice on pointerdown and the paper thumb glides there (180 ms); rows press to 0.985; sheets slide up (320 ms); the large title hands off to the bar title as it scrolls away (220 ms). Reduced motion: no transforms, 80 ms fades.

## Unresolved

Student mode keeps the postcard idea (decision 12); its surfaces are designed separately.

Decided: "Check every section" is a guided walk. It opens each section in turn, and Nothing changed moves to the next one.

## Components to derive in the web UI plan

Built inside this contract, documented into DESIGN.md at finish: top bar with large-title handoff, action bar, row (with optional cover thumbnail), pill (mist, red), step bar, button (primary red, ink, quiet, ghost, danger), icon button, search field, filter chips with counts, segmented control, stepper with keypad entry, tag toggles, field (icon plus label, help, error), sheet (bottom on phones, centered dialog from 768 px), toast, theme switch.
