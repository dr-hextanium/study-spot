---
version: 1
slug: "apps-web"
primary_target: "apps/web"
related_targets: []
---

# Surface brief: survey mode (apps/web /survey/*)

Scope: surveyor screens of the Perch PWA (`/invite/$token`, `/survey`, `/survey/spots/new`, `/survey/spots/$id`, `/survey/spots/$id/$section`, `/survey/admin`). Visitor mode: Operate. Student screens come later in the same world.

Audience and task: 3 to 5 student surveyors, one-handed on phones, outdoors in sun and in dim basements, creating and checking study spots in under 5 minutes, offline first. Flow and copy: `docs/design/surveyor-journey.md`, `docs/design/surveyor-copy.md`.

Constraints: 44 px minimum targets; WCAG 2.2 AA in light and dark (survey light body text 7:1); system controls; no paper texture, no handwriting fonts, no university marks; no em-dashes.

Physical scene: a phone held at arm's length in direct afternoon sun, then in a fluorescent-lit basement at 11pm. Light scheme by default, dark follows the system.

## Direction contract

THESIS: Every spot is filled in like the written side of a postcard: printed labels on ruled lines, your answers in ink, status as rubber-stamp marks. It refuses the settings-app pattern of grey grouped cards with chevrons.

OWN-WORLD: Flat white card stock, ink black text, hairline rules on a 44 px line grid, a solid ink header band like the printed "POST CARD" heading. Printed labels are small caps in Public Sans; entered values are ballpoint blue in the system face. Stamp red for cancel and danger, postal green for checked. Postmark rings for verification state: solid when checked this term, dashed when stale, struck when never. Square-ish 4 px corners, no shadows except sheets.

STORY: The surveyor sees what is filled in, what is missing, and what is checked, on one ruled sheet per spot. They trust their entries are kept because the sync postmark in the header says so. They act by filling the next empty line.

FIRST VIEWPORT: Spot overview on a 390 by 844 phone. Ink header band (48 px): back, spot name, sync postmark at right. Below, a status stamp row (DRAFT or PUBLISHED, reviewed state). Then the ruled sheet: one 44 px ruled row per section, small-caps label left, value summary in blue or "Missing" in stamp red, postmark ring at right. Required sections first. Publish is a full-width ink button pinned 16 px above the home indicator, disabled state lists what's missing above it.

FORM: Divided back (candidate 6 of 7 grounded postcard traditions), raised by state-by-form, real baseline grid, ballpoint for entered data. Seed key b7d216f8.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction

Stamping: when a section is saved or checked, its postmark ring lands with a 160 ms press (scale 1.06 to 1, slight overshoot) and the date fills in. Reduced motion: no scale, 120 ms fade.

## Unresolved

Student mode surfaces (postcard fronts, stamps for noise policy) are designed in build step 5 within this world.
