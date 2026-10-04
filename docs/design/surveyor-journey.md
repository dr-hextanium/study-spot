# Surveyor journey

Source: `docs/superpowers/specs/2026-10-04-surveyor-tooling-design.md` (phase 2a), `PRODUCT.md`. Produced with Intent `journey`. Copy here is direction only; final strings live in `docs/design/surveyor-copy.md`.

## Users and situation

**Who.** 3 to 5 student surveyors in the club that maintains Perch, plus the founder as admin. Worst case: the founder surveys alone. All are comfortable with phones; none are trained designers or data people. They know campus well.

**Where and how.**
- Walking between buildings with a phone in one hand, often a coffee or bag in the other. Thumb reach matters more than screen size.
- Inside: library basements, stairwells, and reading rooms with weak or no signal. Outside: direct sunlight.
- Quiet spaces. Surveyors should not need to talk, tap loudly, or stand in the middle of a silent room for long.
- Sessions are short and interrupted: a spot or two between classes, then the phone goes back in a pocket.

**Jobs, in order of frequency.**
1. Walk up to a spot and record it (new spot) or re-check it (existing spot).
2. Fix one wrong detail fast (hours changed, outlets broken).
3. Take a good cover photo.
4. Publish, and glance at whether a teammate's spot looks right (review).
5. Admin only: invite someone, publish now, approve photos, see publish problems.

**What they carry in their head.** "I'm standing here, I can see it, let me write it down before I forget." The mental model is a checklist about a place, not a database record. They expect the app to remember everything even if the phone dies or the signal drops.

**Success for them.** A spot done in under 5 minutes without thinking about connectivity, and confidence that nothing they entered is lost.

**Success for the product.** 25 to 30 spots published and verified before finals, with every v0-required field filled and a last-verified date that is true.

**Not in this journey.** Headcount routes and the noise sample (phase 2b), student screens, email.

## Happy path

### A. First time: accept an invite (about 1 minute)

1. **Admin shares a link** (text, Discord). Surveyor taps it on their phone.
2. **`/invite/$token`**: shows who Perch is for in one line, a display name field, and "Join". On iOS, a note: install Perch to the home screen first, then open this link inside the installed app, because Safari and the installed app keep separate logins.
3. Surveyor enters a display name, taps Join. The phone stores the session token.
4. Lands on **`/survey`** with an empty or populated home and a single prominent "New spot" action.

Why this screen exists: the link is the only credential, so the screen must confirm it worked and set the expectation that this phone is now signed in for 30 days.

### B. Walk up to a new spot (target under 5 minutes)

1. **`/survey` home**: tap "New spot".
2. **`/survey/spots/new`** (identity only): building picker (searchable, remembers last building), floor, official name, optional common name, "Use my location" (fills lat and lng, shows accuracy), directions from the nearest entrance. Save.
   - Why identity first and alone: it is the minimum to create a draft, and it is what the surveyor knows the instant they arrive. Everything else can come in any order.
3. Draft is created on the phone immediately (`local:` id) and the screen moves to **`/survey/spots/$id`**.
4. **Spot overview** shows the 11 sections as a list, each with a state: missing, partly done, done, verified today. v0-required sections are marked and sorted first: Access (eligibility), Hours, Seating (seat count), Power (outlet coverage), Environment (noise policy), Use fit (food policy, group work). Photos and Estimates follow. Sections with no required fields (amenities, accessibility, late night) are grouped under "Optional now". Section names match the API sections in the spec so the UI and server never disagree on what a section is.
5. Surveyor taps each required section in turn. Each **`/survey/spots/$id/$section`** is one screen with segmented controls and steppers, a Save button pinned at the bottom within thumb reach. Save returns to the overview with that section marked done.
6. **Photos**: tap "Take photo", the camera opens, the shot is resized on the phone, and the postcard-shot checklist shows once per session (landscape, wide, good light, no faces, no university logo as the subject). Mark one as cover.
7. **Estimates**: 2 by 4 grid (weekday and weekend by morning, afternoon, evening, night); each tap cycles empty, some, filling, nearly full, full.
8. Back on the overview, **Publish** becomes active once nothing required is missing. Tap Publish. The spot is marked published on the phone and queued.
9. Sync indicator in the header moves from "N waiting" to "All synced" when the signal allows. The surveyor can walk to the next spot without waiting.

### C. Re-verify an existing spot (target under 2 minutes)

1. **`/survey` home**, Stale list (oldest verification first). Tap the spot.
2. **Spot overview** shows last-verified dates per section.
3. For each section that still looks right: open it, tap "Verified, nothing changed". For a section that changed: edit and Save (which also verifies it).
4. Done. No publish step needed for an already published spot; edits flow out with the next bundle.

### D. Review a teammate's spot (under 1 minute)

1. **`/survey` home**, Needs attention list shows "Unreviewed, edited by {name}".
2. Open, scan the overview and photos, tap "Looks right". For non-admins the button is replaced by a note on spots they edited last; admins can always review, so a solo founder can still clear the queue.

### E. Admin: invite and publish (under 1 minute each)

1. **`/survey/admin`**: "Invite surveyor" creates a link, "Copy link" copies it. Surveyor list with "Revoke".
2. Publish status: last published time, warnings (skipped spots and why), dirty or clean, last error. "Publish now".
3. Photos awaiting approval: thumbnail, spot, uploader, Approve or Reject.

## Screen inventory

| Route | Purpose | Primary action | Secondary actions | Key states |
|---|---|---|---|---|
| `/invite/$token` | Turn a link into a signed-in phone | Join | none | valid, expired, used, offline, joining, iOS hint |
| `/survey` | Know what to do next and whether data is safe | New spot | open spot from Needs attention, Stale, Drafts; open admin (admins) | empty (first run), populated, offline, syncing, failed writes present |
| `/survey/spots/new` | Create a draft with identity | Save | Use my location, cancel | location pending, location denied, offline save |
| `/survey/spots/$id` | See a spot's completeness and act on it | Publish (draft) or Looks right (unreviewed by someone else) | open a section, unpublish (admin) | draft incomplete, draft ready, published unreviewed, published reviewed, conflict present, local-only (not yet created on server) |
| `/survey/spots/$id/$section` | Edit or verify one section | Save | Verified, nothing changed; back | clean, edited, invalid input, saved on phone, synced |
| `/survey/admin` | Run the crew and the publish pipeline | Invite surveyor | Copy link, Revoke, Publish now, Approve or Reject photo | publish ok, publish warnings, publish failing, offline (admin actions need the server) |

Global header on every `/survey/*` screen: sync status (All synced, N waiting, Offline, Syncing, N failed). Tapping it opens a sheet listing pending and failed writes.

## State matrix

| State | Home | New spot | Spot overview | Section editor | Admin | Invite |
|---|---|---|---|---|---|---|
| Empty | First run: one line explaining what a spot is and the New spot action | n/a | n/a | Fields empty, required ones marked | No other surveyors yet | n/a |
| Loading | Cached lists show instantly; quiet refresh indicator | n/a | Cached spot shows instantly | Instant (local) | Spinner for server data | Joining spinner |
| Offline | Works from cache; header says Offline | Save works; "Saved on this phone" | Works; Publish allowed (queued) | Save works | Read-only cached status; actions disabled with reason | Join disabled: "Connect to join" |
| Syncing | Header shows progress | n/a | Sections show "Syncing" | n/a | n/a | n/a |
| Failed | Needs attention lists failed writes first | n/a | Banner: "1 change didn't save" with Retry and Discard | Inline error on the field if it was a validation failure | Error text from server | Expired or used link message |
| Conflict | Needs attention lists the spot | n/a | Banner: "Someone else changed this" opens conflict view | Conflict view per field: Yours vs On the server; Keep mine or Keep theirs | n/a | n/a |
| Blocked | n/a | Save disabled until building, floor, name filled | Publish disabled, lists what's missing | n/a | n/a | n/a |
| Signed out | All `/survey/*` routes show "Sign in again": ask an admin for a new link. Pending writes are kept and resume after re-joining | same | same | same | same | n/a |
| Success | n/a | Moves to overview | "Published" chip; "Reviewed by {name}" | Returns to overview with section marked done | "Link copied", "Published {time}" | Lands on home |

## Edge points and recovery

1. **No signal while saving.** Every save goes to the phone first and reads "Saved on this phone". The surveyor never sees a network error during normal work. Recovery is automatic on reconnect, app focus, or timer. The header is the single place connectivity is shown.
2. **Server asleep (Render cold start, 30 to 60 s).** Indistinguishable from slow signal to the user; same handling. No spinner blocks any task.
3. **New spot never reached the server yet.** All its writes, including photos, stay queued under the local id and are rewritten after creation succeeds. The overview shows "Not on the server yet" in the sync sheet, not on the spot itself, to avoid alarm.
4. **Two surveyors edited the same section.** The second sync gets a conflict. Overview banner opens the conflict view: each changed field shown as Yours and On the server. Keep mine re-sends with the new base version; Keep theirs drops the local change. No silent overwrite in either direction.
5. **Publish blocked.** Publish button is disabled and lists missing items as links straight to the section. The same rule runs on the server; if the server still refuses (rule drift), the write lands in Failed with the missing list.
6. **Validation error from server (422 other than publish).** Write moves to Failed; the section shows the message by the field. Retry after editing, or Discard.
7. **Sign-in expired or revoked (401).** Sync pauses, pending writes are kept, and every survey screen says "Sign in again" with instructions to ask an admin for a link. After re-joining on the same phone, sync resumes. Joining on a different phone does not carry pending writes; the sync sheet warns about this.
8. **iOS Safari vs installed app.** Invite screen tells the surveyor to open the link inside the installed app. If they joined in Safari by mistake, the installed app shows Sign in again; an admin sends a new link.
9. **Leaving with writes pending.** If the app is closed or backgrounded with writes waiting, a warning appears on the next open only if writes are still pending after a sync attempt. Browser leave-page prompt when pending writes exist and the tab is closing.
10. **Location denied or inaccurate.** "Use my location" is optional; manual building and floor always work. Accuracy worse than 50 m shows a note and keeps the building centroid.
11. **Photo too large or camera unavailable.** Re-encode once at lower quality; if still too large, say so and keep the original out of the queue. If the camera is unavailable, allow choosing from the library.
12. **Wrong building or duplicate spot.** Identity is editable later; duplicates are handled by an admin archiving one (phase 2b tooling; for now, unpublish).

## Time budget check

New spot, all v0-required fields, one cover photo, publish, one-handed, no signal:

| Step | Seconds |
|---|---|
| Home, tap New spot | 5 |
| Identity: building (remembered), floor, name, use my location, directions (one sentence) | 60 |
| Access: eligibility (segmented), entry method (segmented) | 15 |
| Hours: set Monday, copy to weekdays, set weekend | 45 |
| Seating: seat count (stepper or keypad), table config, max group | 30 |
| Power: outlet coverage (segmented in 10% steps) | 10 |
| Environment: noise policy (lighting and the rest optional) | 10 |
| Use fit: food policy, group work, calls | 15 |
| Photo: take, review, set cover (checklist first time only) | 40 |
| Estimates: 8 taps | 20 |
| Publish | 5 |
| Navigation between sections (11 transitions at about 2 s) | 22 |
| **Total** | **277 (about 4.6 minutes)** |

Re-verify an existing spot with no changes: home 5, open spot 3, 8 sections at about 6 s each (open, Verified, back) 48, total about 1 minute. Changing hours on top adds about 45 s.

The budget holds only if: the building picker remembers the last building, hours support copy-to-weekdays, seat count accepts typed numbers as well as a stepper, and section saves never wait on the network.

## Decisions and open items

- Decided here: identity-only creation screen; required sections sorted first; "Optional now" grouping; sync status lives only in the header and the sync sheet; publish is always allowed offline and queued.
- Not decided here (owned elsewhere): exact strings (`/articulate`, `docs/design/surveyor-copy.md`), visual design (`DESIGN.md`), screen layout at wireframe fidelity (plan D).
- Assumption to check in the first real survey: 60 seconds is enough for identity with typed directions. If not, directions can move to its own section and become optional at creation.
