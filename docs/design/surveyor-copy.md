# Surveyor copy deck

Source: `docs/design/surveyor-journey.md`. Produced with Intent `articulate`. Plan B moves these strings into a typed copy module in `packages/ui-logic` (`bun run copy:gen`); ids here are the keys, and a test keeps the two identical. Parameters use `{name}`. Never build a sentence by concatenating strings; each id is a whole message.

## Voice

| Principle | Is | Is not |
|---|---|---|
| Literal | Says what happened and what to do, in the words a surveyor would use out loud | Clever, punny, or vague ("Oops", "Something went wrong") |
| Dry | Calm, a little understated, peer to peer | Cheerful, salesy, exclamation marks, emoji |
| Short | Fits one line on a 360 px phone where it can | Explaining things the screen already shows |
| Honest | Says when data is only on the phone, or not checked yet | Pretending something synced or was verified when it wasn't |

Tone by context: routine saves are nearly silent; offline is matter-of-fact, never alarming; conflicts and destructive actions are plain and exact about consequences; empty states give one next step.

Rules: no em-dashes (use commas or colons), no exclamation marks, sentence case everywhere, numerals for numbers, "spot" never "location" or "entry", "sync" for phone to server, "publish" for making a spot visible to students.

## Global

| id | text | max chars | notes |
|---|---|---|---|
| app.name | Perch | 10 | working name |
| app.mode.survey | Survey | 12 | label for surveyor mode |
| common.save | Save | 12 | |
| common.cancel | Cancel | 12 | |
| common.back | Back | 12 | |
| common.retry | Retry | 12 | |
| common.discard | Discard | 12 | |
| common.done | Done | 12 | |
| common.optional | Optional | 12 | field suffix |
| common.required | Required | 12 | field suffix, only where screen mixes both |
| common.unknown | Not sure | 16 | explicit "don't know" option for optional enums |
| common.yes | Yes | 6 | |
| common.no | No | 6 | |
| error.generic | That didn't work. Try again in a minute. | 60 | last resort; prefer a specific message |
| error.network_admin | Admin actions need a connection. | 50 | admin screen when offline |

## Sync (header and sync sheet)

| id | text | max chars | notes |
|---|---|---|---|
| sync.all_synced | All synced | 20 | header |
| sync.pending | {count} waiting to sync | 24 | header; count >= 1 |
| sync.syncing | Syncing {count} | 20 | header |
| sync.offline | Offline, saving on this phone | 32 | header |
| sync.failed | {count} didn't save | 22 | header; opens sheet |
| sync.unreadable | {count} changes can't be read | 30 | header; opens sheet; stored writes that no longer parse |
| sync.sheet.title | Changes on this phone | 30 | |
| sync.sheet.empty | Nothing waiting. Everything is on the server. | 60 | |
| sync.sheet.item_pending | Waiting: {what} | 60 | {what} from sync.what.* |
| sync.sheet.item_failed | Didn't save: {what} | 60 | |
| sync.sheet.item_conflict | Changed by someone else: {what} | 60 | |
| sync.sheet.local_only | Not on the server yet. It will be created when you're back online. | 90 | spot created offline |
| sync.sheet.other_phone_warning | Changes stay on this phone. Signing in on another phone won't bring them along. | 100 | |
| sync.what.create | New spot {name} | 50 | |
| sync.what.section | {section} for {name} | 50 | |
| sync.what.verify | Verified {name} | 50 | |
| sync.what.publish | Publish {name} | 50 | |
| sync.what.photo | Photo for {name} | 50 | |
| sync.what.review | Review {name} | 50 | |
| sync.what.cover | Cover photo for {name} | 50 | |
| sync.saved_on_phone | Saved on this phone | 24 | section status |
| sync.synced | Synced | 12 | section status |
| sync.leave_warning | {count} changes haven't synced yet. Leaving now keeps them on this phone. | 90 | shown on next open if still pending |

## Invite (`/invite/$token`)

| id | text | max chars | notes |
|---|---|---|---|
| invite.title | Join the Perch survey crew | 32 | |
| invite.body | Perch is a campus study spot guide. Surveyors add and check the spots students see. | 100 | |
| invite.name.label | Your name | 20 | |
| invite.name.helper | Shown to other surveyors next to your edits. | 60 | |
| invite.join | Join | 12 | primary |
| invite.joining | Joining | 12 | |
| invite.ios.title | On an iPhone? | 20 | shown on iOS only |
| invite.ios.body | Add Perch to your home screen first, then open this link inside that app. Safari and the app keep separate sign-ins. | 140 | |
| invite.offline | Connect to the internet to join. | 40 | Join disabled |
| invite.expired | This link expired. Ask an admin for a new one. | 60 | |
| invite.used | This link was already used. Ask an admin for a new one. | 64 | |
| invite.invalid | This link doesn't work. Check it was copied in full, or ask for a new one. | 90 | |
| invite.name.required | Add a name so others know who edited what. | 60 | |

## Signed out

| id | text | max chars | notes |
|---|---|---|---|
| auth.expired.title | Sign in again | 20 | |
| auth.expired.body | Your sign-in on this phone ended. Ask an admin for a new link. Your unsynced changes are kept. | 110 | |
| auth.revoked.body | An admin removed this phone's access. Unsynced changes stay on this phone. | 90 | |

## Home (`/survey`)

| id | text | max chars | notes |
|---|---|---|---|
| home.title | Spots | 12 | |
| home.new_spot | New spot | 14 | primary |
| home.admin | Admin | 10 | admins only |
| home.attention.title | Needs attention | 20 | |
| home.attention.failed | {count} changes didn't save | 34 | |
| home.unreadable | {count} changes can't be read | 34 | attention row; stored writes that no longer parse |
| home.attention.conflict | Changed by someone else | 30 | row subtitle |
| home.attention.unreviewed | Unreviewed, edited by {name} | 40 | row subtitle |
| home.attention.hours_unconfirmed | Hours not confirmed for {term} | 40 | row subtitle |
| home.stale.title | Oldest checks | 20 | stale list |
| home.stale.row | Last checked {date} | 30 | row subtitle; date like "Oct 5" |
| home.stale.never | Never checked | 20 | |
| home.drafts.title | Drafts | 12 | |
| home.drafts.row | {count} of 7 required parts done | 36 | row subtitle; 7 = required groups |
| home.empty.title | No spots yet | 20 | first run |
| home.empty.body | A spot is one place you'd tell a friend to study, like a reading room or a lounge. Start with the one you're standing in. | 140 | |
| home.attention.empty | Nothing needs attention. | 30 | |

## New spot (`/survey/spots/new`)

| id | text | max chars | notes |
|---|---|---|---|
| new.title | New spot | 14 | |
| new.building.label | Building | 16 | |
| new.building.placeholder | Search buildings | 20 | |
| new.floor.label | Floor | 10 | |
| new.floor.helper | As signed in the building, like 1, 2, B, or Mezzanine. | 70 | |
| new.official_name.label | Name | 10 | |
| new.official_name.helper | Use the sign on the door if there is one. | 50 | |
| new.common_name.label | What students call it | 26 | optional |
| new.location.button | Use my location | 20 | |
| new.location.pending | Finding you | 16 | |
| new.location.done | Located within {meters} m | 30 | |
| new.location.poor | Location is rough ({meters} m). The building is enough. | 60 | accuracy > 50 m |
| new.location.denied | Location is off. The building is enough. | 50 | |
| new.directions.label | How to get there | 20 | |
| new.directions.helper | From the nearest entrance, in one or two sentences. | 60 | |
| new.directions.placeholder | Main entrance, stairs to 3, left past the printers. | 60 | example |
| new.save | Create spot | 16 | primary |
| new.blocked | Add a building, floor, and name to continue. | 50 | |

## Spot overview (`/survey/spots/$id`)

| id | text | max chars | notes |
|---|---|---|---|
| spot.status.draft | Draft | 10 | chip |
| spot.status.published | Published | 12 | chip |
| spot.status.unreviewed | Unreviewed | 12 | chip |
| spot.status.reviewed | Reviewed by {name} | 30 | chip |
| spot.group.required | Needed to publish | 20 | section group heading |
| spot.group.extras | Photos and busyness | 22 | |
| spot.group.optional | Optional now | 16 | |
| spot.section.missing | Missing | 10 | section state |
| spot.section.partial | Partly done | 12 | |
| spot.section.done | Done | 8 | |
| spot.section.verified | Checked {date} | 16 | |
| spot.section.verified_today | Checked today | 16 | |
| spot.publish | Publish | 12 | primary for drafts |
| spot.publish.blocked.title | Can't publish yet | 20 | |
| spot.publish.blocked.item | Missing: {field} | 40 | one per missing field, links to section |
| spot.publish.queued | Publish queued. It goes live after this phone syncs. | 60 | toast when offline; never claim it is live |
| spot.publish.done | Published | 12 | toast when online |
| spot.review | Looks right | 14 | primary for unreviewed by someone else |
| spot.review.done | Marked reviewed | 18 | toast |
| spot.review.own | You edited this last, so someone else reviews it. | 60 | non-admins only, shown instead of the button; admins always see spot.review |
| spot.unpublish | Unpublish | 12 | admin |
| spot.unpublish.confirm.title | Unpublish {name}? | 36 | |
| spot.unpublish.confirm.body | Students won't see it after the next publish. The data stays. | 70 | |
| spot.unpublish.confirm.action | Unpublish spot | 16 | |
| spot.failed.banner | 1 change didn't save | 26 | count variant: spot.failed.banner_many |
| spot.failed.banner_many | {count} changes didn't save | 30 | |
| spot.conflict.banner | Someone else changed this spot. Pick which version to keep. | 64 | opens conflict view |

## Sections (names and one-line descriptions)

| id | text | max chars | notes |
|---|---|---|---|
| section.identity.name | Basics | 12 | API section: identity |
| section.identity.desc | Name, building, floor, how to get there | 44 | |
| section.access.name | Access | 12 | |
| section.access.desc | Who can get in and how | 30 | |
| section.hours.name | Hours | 12 | |
| section.hours.desc | When it's open this term | 30 | |
| section.seating.name | Seating | 12 | |
| section.seating.desc | Seats, tables, biggest group | 30 | |
| section.power.name | Power and signal | 18 | |
| section.power.desc | Outlets, wifi, cell signal | 30 | |
| section.environment.name | Noise and feel | 16 | API section: environment |
| section.environment.desc | Noise rules, light, temperature | 34 | |
| section.use_fit.name | House rules | 14 | API section: use_fit |
| section.use_fit.desc | Food, group work, calls | 30 | |
| section.amenities.name | Nearby | 12 | API section: amenities |
| section.amenities.desc | Bathrooms, water, coffee, printers | 36 | |
| section.accessibility.name | Accessibility | 14 | |
| section.accessibility.desc | Step-free route, elevator, seating | 36 | |
| section.late_night.name | Late night | 12 | |
| section.late_night.desc | Past midnight, staffed, lit walk home | 40 | |
| section.estimates.name | Busyness | 12 | API section: estimates |
| section.estimates.desc | Your best guess, until we count | 34 | |
| section.photos.name | Photos | 12 | not an API section; photos endpoint |
| section.photos.desc | One good cover shot | 24 | |

## Section editor (shared)

| id | text | max chars | notes |
|---|---|---|---|
| editor.save | Save | 10 | primary, pinned bottom |
| editor.verify | Checked, nothing changed | 26 | secondary; stamps verification |
| editor.verify.done | Marked as checked | 20 | toast |
| editor.verify.hours_missing | Add hours for {term} before marking this checked. | 60 | server 422: spot has hours but none for the current term |
| editor.saved | Saved | 10 | toast when online |
| editor.saved_offline | Saved on this phone | 22 | toast when offline |
| editor.discard_changes.title | Discard changes? | 20 | leaving with edits |
| editor.discard_changes.body | Your edits to {section} won't be saved. | 50 | |
| editor.discard_changes.action | Discard changes | 18 | |
| editor.discard_changes.keep | Keep editing | 16 | |
| editor.invalid | Fix the highlighted field to save. | 40 | |

## Access

| id | text | max chars | notes |
|---|---|---|---|
| access.eligibility.label | Who can use it | 18 | required |
| access.eligibility.all_students | Any student | 16 | |
| access.eligibility.residents_building | Residents of one building | 28 | |
| access.eligibility.residents_quad | Residents of one quad | 24 | |
| access.eligibility.grad_only | Grad students only | 20 | |
| access.eligibility.department | One department | 18 | |
| access.eligibility.public | Anyone, not just students | 28 | |
| access.scope.label.building | Which building | 18 | shown for residents_building |
| access.scope.label.quad | Which quad | 14 | |
| access.scope.label.department | Which department | 18 | |
| access.eligibility.helper | Check a sign or ask staff. If you're guessing, leave it unchecked below. | 80 | |
| access.verified.label | I confirmed this | 20 | sets eligibility_verified |
| access.verified.helper | Unconfirmed access is never suggested to students. | 60 | |
| access.entry.label | How you get in | 16 | |
| access.entry.open | Walk in | 10 | |
| access.entry.card_swipe | Card swipe | 12 | |
| access.entry.staffed_desk | Staffed desk | 14 | |
| access.reservable.label | Can be reserved | 18 | |
| access.reservation_url.label | Booking link | 14 | |
| access.reservation_url.invalid | Use a full link starting with https:// | 44 | |

## Hours

| id | text | max chars | notes |
|---|---|---|---|
| hours.term | For {term} | 24 | e.g. "For Fall 2026" |
| hours.day.mon | Mon | 4 | |
| hours.day.tue | Tue | 4 | |
| hours.day.wed | Wed | 4 | |
| hours.day.thu | Thu | 4 | |
| hours.day.fri | Fri | 4 | |
| hours.day.sat | Sat | 4 | |
| hours.day.sun | Sun | 4 | |
| hours.opens | Opens | 8 | |
| hours.closes | Closes | 8 | |
| hours.closed | Closed | 8 | per-day toggle |
| hours.last_entry | Last entry | 12 | optional |
| hours.next_day | next day | 10 | suffix when closes before opens, e.g. "2:00 next day" |
| hours.copy_weekdays | Copy Monday to weekdays | 26 | |
| hours.exam.toggle | Different hours during finals | 30 | |
| hours.exam.title | Finals hours | 14 | |
| hours.helper | Use the posted hours. If none are posted, check the building's website. | 80 | |
| hours.invalid.opens_midnight | Opening at midnight is 0:00, not 24:00. | 44 | |
| hours.invalid.same_time | Opens and closes can't be the same time. Mark the day closed or 24 hours. | 80 | |
| hours.all_day | Open 24 hours | 16 | per-day toggle |

## Seating

| id | text | max chars | notes |
|---|---|---|---|
| seating.seat_count.label | Seats | 8 | required |
| seating.seat_count.helper | Count chairs you could sit in for an hour. Rough is fine for big rooms. | 80 | |
| seating.seat_count.invalid | Enter a number of seats above 0. | 40 | |
| seating.types.label | Kinds of seats | 16 | |
| seating.type.table_chair | Table and chair | 16 | |
| seating.type.carrel | Desk carrel | 12 | |
| seating.type.soft | Couch or armchair | 18 | |
| seating.type.booth | Booth | 8 | |
| seating.type.standing | Standing desk | 14 | |
| seating.tables.label | Tables | 8 | |
| seating.table.large_shared | Big shared tables | 18 | |
| seating.table.small_2_4 | Small tables for 2 to 4 | 24 | |
| seating.table.individual | Single desks | 14 | |
| seating.max_group.label | Biggest group that can sit together | 36 | |
| seating.spread_out.label | Room to spread out | 20 | |

## Power and signal

| id | text | max chars | notes |
|---|---|---|---|
| power.outlets.label | Seats near an outlet | 22 | required |
| power.outlets.helper | About how many seats can reach a working outlet with a normal cable. | 80 | |
| power.outlets.value | {percent}% | 6 | segmented in 10% steps |
| power.usb.label | USB ports | 10 | |
| power.wifi.label | Wifi speed (Mbps) | 18 | |
| power.wifi.helper | Run a speed test and enter the download number. | 54 | |
| power.cell.label | Cell signal | 12 | |
| power.cell.poor | Poor | 6 | |
| power.cell.ok | OK | 4 | |
| power.cell.good | Good | 6 | |

## Noise and feel (environment)

| id | text | max chars | notes |
|---|---|---|---|
| env.noise.label | Noise rule | 12 | required |
| env.noise.helper | What the space expects, not how loud it is right now. | 60 | |
| env.noise.silent | Silent | 8 | |
| env.noise.quiet | Quiet | 8 | |
| env.noise.conversational | Talking is fine | 16 | |
| env.noise.group_friendly | Groups welcome | 16 | |
| env.light.natural | Daylight | 10 | |
| env.lighting.label | Lighting | 10 | |
| env.lighting.dim | Dim | 6 | |
| env.lighting.moderate | Medium | 8 | |
| env.lighting.bright | Bright | 8 | |
| env.temperature.label | Temperature | 12 | |
| env.temperature.cold | Cold | 6 | |
| env.temperature.neutral | Fine | 6 | |
| env.temperature.warm | Warm | 6 | |
| env.temperature_consistent.label | Same temperature all day | 26 | |
| env.windows.label | Windows with a view | 20 | |

## House rules (use fit)

| id | text | max chars | notes |
|---|---|---|---|
| use.food.label | Food and drink | 16 | required |
| use.food.none | Nothing | 10 | |
| use.food.covered_drinks | Covered drinks | 16 | |
| use.food.food_ok | Food is fine | 14 | |
| use.group.label | Group work | 12 | required |
| use.group.helper | Can a group talk through a project here without getting shushed? | 70 | |
| use.calls.label | Phone calls | 12 | |
| use.calls.not_allowed | Not allowed | 12 | |
| use.calls.allowed_impractical | Allowed, but awkward | 22 | |
| use.calls.allowed | Fine | 6 | |
| use.whiteboard.label | Whiteboard | 12 | |

## Nearby (amenities), accessibility, late night

| id | text | max chars | notes |
|---|---|---|---|
| amenity.helper | Walking minutes from the spot. Leave blank if you don't know. | 64 | |
| amenity.bathroom | Bathroom | 10 | |
| amenity.water | Water | 8 | |
| amenity.coffee_food | Coffee or food | 16 | |
| amenity.printer | Printer | 10 | |
| amenity.microwave | Microwave | 10 | |
| amenity.late_food | Food after 10pm | 16 | |
| amenity.minutes | {minutes} min | 8 | |
| a11y.step_free | Step-free route in | 20 | |
| a11y.elevator | Elevator to this floor | 24 | |
| a11y.seating | Accessible seating | 20 | |
| late.past_midnight | Open past midnight | 20 | |
| late.staffed | Staff around late | 18 | |
| late.lit_route | Lit walk to the dorms | 22 | |

## Busyness (estimates)

| id | text | max chars | notes |
|---|---|---|---|
| estimates.helper | Your best guess for a normal week. Real counts replace these later. | 70 | |
| estimates.weekday | Weekdays | 10 | row |
| estimates.weekend | Weekends | 10 | row |
| estimates.morning | Morning | 8 | column |
| estimates.afternoon | Afternoon | 10 | column |
| estimates.evening | Evening | 8 | column |
| estimates.night | Night | 6 | column |
| estimates.bucket.unset | Not set | 8 | |
| estimates.bucket.empty | Empty | 8 | |
| estimates.bucket.some | Some seats | 10 | |
| estimates.bucket.filling | Filling | 8 | |
| estimates.bucket.nearly_full | Nearly full | 12 | |
| estimates.bucket.full | Full | 6 | |
| estimates.tap_hint | Tap a box to change it. | 26 | first time only |

## Photos

| id | text | max chars | notes |
|---|---|---|---|
| photos.take | Take photo | 12 | primary |
| photos.choose | Choose from library | 20 | when camera unavailable |
| photos.checklist.title | A good cover photo | 20 | once per session |
| photos.checklist.landscape | Hold the phone sideways | 26 | |
| photos.checklist.wide | Show the whole space, not one table | 36 | |
| photos.checklist.light | Lights on or daylight | 22 | |
| photos.checklist.no_people | No faces you could recognize | 30 | |
| photos.checklist.no_logos | Don't make a university logo the subject | 42 | |
| photos.checklist.ok | Got it | 8 | |
| photos.cover | Use as cover | 14 | |
| photos.is_cover | Cover | 8 | badge |
| photos.awaiting | Waiting for approval | 22 | badge |
| photos.approved | Approved | 10 | badge |
| photos.processing | Shrinking photo | 18 | |
| photos.too_big | That photo is still too large after shrinking. Try another shot. | 70 | |
| photos.unreadable | Couldn't read that image. Try taking it again. | 50 | |
| photos.empty | No photos yet. Students see the cover first. | 50 | |

## Conflict view

| id | text | max chars | notes |
|---|---|---|---|
| conflict.title | Two versions of {section} | 32 | |
| conflict.body | {name} changed this while your edit was waiting. Pick which version to keep. | 90 | name = last editor from the 409 body |
| conflict.body_unknown | Someone else changed this while your edit was waiting. Pick which version to keep. | 84 | when the last editor's name is unavailable |
| conflict.yours | Yours | 8 | |
| conflict.theirs | On the server | 14 | |
| conflict.keep_mine | Keep mine | 12 | |
| conflict.keep_theirs | Keep theirs | 12 | |
| conflict.resolved | Kept your version. It will sync again. | 44 | toast |
| conflict.dropped | Kept their version. Your edit was discarded. | 50 | toast |

## Failed writes

| id | text | max chars | notes |
|---|---|---|---|
| failed.title | This change didn't save | 26 | |
| failed.body.validation | The server didn't accept it: {reason} | 70 | reason from server, already user-readable |
| failed.body.publish | Still missing: {fields} | 60 | |
| failed.retry | Try again | 12 | |
| failed.discard | Discard change | 16 | |
| failed.discard.confirm | This removes your change from this phone. It can't be undone. | 70 | |

## Admin (`/survey/admin`)

| id | text | max chars | notes |
|---|---|---|---|
| admin.title | Admin | 10 | |
| admin.invite.title | Invite a surveyor | 20 | |
| admin.invite.role.surveyor | Surveyor | 10 | |
| admin.invite.role.admin | Admin | 8 | |
| admin.invite.create | Create invite link | 20 | primary |
| admin.invite.created | Link works once and expires in 48 hours. | 50 | |
| admin.invite.copy | Copy link | 12 | |
| admin.invite.copied | Link copied | 14 | toast |
| admin.invite.relogin | New sign-in link | 18 | per surveyor; for lost phones |
| admin.surveyors.title | Surveyors | 12 | |
| admin.surveyors.empty | Just you so far. | 20 | |
| admin.surveyors.admin_badge | Admin | 8 | |
| admin.revoke | Remove access | 16 | |
| admin.revoke.confirm.title | Remove {name}? | 30 | |
| admin.revoke.confirm.body | They're signed out on every phone. Their published edits stay. | 70 | |
| admin.revoke.confirm.action | Remove access | 16 | |
| admin.revoke.done | {name} removed | 30 | toast |
| admin.publish.title | Student data | 14 | |
| admin.publish.last | Last published {time} | 30 | |
| admin.publish.never | Not published yet | 20 | |
| admin.publish.dirty | Changes waiting to publish | 28 | |
| admin.publish.clean | Up to date | 12 | |
| admin.publish.now | Publish now | 14 | |
| admin.publish.running | Publishing | 12 | |
| admin.publish.error | Last publish failed: {reason} | 70 | |
| admin.publish.warnings.title | Skipped spots | 16 | |
| admin.publish.warning.item | {name}: {reason} | 80 | reason from buildBundle, reworded by plan D |
| admin.photos.title | Photos to approve | 18 | |
| admin.photos.empty | No photos waiting. | 20 | |
| admin.photos.from | {spot}, from {name} | 40 | |
| admin.photos.approve | Approve | 10 | |
| admin.photos.reject | Reject | 8 | |
| admin.photos.reject.confirm | Delete this photo? It won't be published. | 50 | |

## Pending questions

- Floor naming at Stony Brook (e.g. "Lower level" vs "B") should come from the first survey walk; the floor field is free text for now.
- Whether "Checked" or "Verified" reads better to the crew. The deck uses "Checked" in the UI and keeps "verified" in code and data.
- `admin.publish.warning.item` reasons are generated by the server (`skipped <slug>: missing ...`). Plan D maps those to readable text, for example "missing directions, seat count".
