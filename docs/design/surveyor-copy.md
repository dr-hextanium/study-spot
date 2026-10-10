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
| app.name | Perch | 10 | name |
| common.save | Save | 12 | |
| common.cancel | Cancel | 12 | |
| common.back | Back | 12 | |
| common.retry | Retry | 12 | |
| common.discard | Discard | 12 | |
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
| auth.expired.body | Your sign-in on this phone ended. Ask an admin for a new link. | 110 | |
| nav.back_to_spots | Back to spots | 20 | not-found and missing-spot screens |
| nav.not_found.body | Page not found. | 40 | unknown address |

## Home (`/survey`)

| id | text | max chars | notes |
|---|---|---|---|
| home.title | Spots | 12 | |
| home.new_spot | New spot | 14 | primary |
| home.admin | Admin | 10 | admins only |
| home.unreadable | {count} changes can't be read | 34 | attention row; stored writes that no longer parse |
| home.stale.never | Never checked | 20 | |
| home.empty.title | No spots yet | 20 | first run |
| home.empty.body | A spot is one place you'd tell a friend to study, like a reading room or a lounge. Start with the one you're standing in. | 140 | |

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
| spot.group.extras | Extras | 10 | |
| spot.group.optional | Optional now | 16 | |
| spot.section.missing | Missing | 10 | section state |
| spot.section.partial | Partly done | 12 | |
| spot.section.done | Done | 8 | |
| spot.section.none | None yet | 10 | empty extras or optional section, muted |
| spot.section.not_set | Not set | 10 | empty busyness section, muted |
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
| section.access.name | Access | 12 | |
| section.hours.name | Hours | 12 | |
| section.seating.name | Seating | 12 | |
| section.power.name | Power and signal | 18 | |
| section.environment.name | Noise and feel | 16 | API section: environment |
| section.use_fit.name | House rules | 14 | API section: use_fit |
| section.amenities.name | Nearby | 12 | API section: amenities |
| section.accessibility.name | Accessibility | 14 | |
| section.late_night.name | Late night | 12 | |
| section.estimates.name | Busyness | 12 | API section: estimates |
| section.photos.name | Photos | 12 | not an API section; photos endpoint |

## Section editor (shared)

| id | text | max chars | notes |
|---|---|---|---|
| editor.save | Save | 10 | primary, pinned bottom |
| editor.verify | Nothing changed | 18 | secondary; records a check of this section without changes |
| editor.save_next | Save and next | 16 | primary when a next section exists |
| editor.progress.after | {done} of {total} · After this: {section} | 46 | under the step bar |
| editor.progress | {done} of {total} | 10 | when nothing is left after this one |
| editor.walk.done | Checked 1 section | 20 | toast at the end of a guided walk, once the server has it; count variant: editor.walk.done_many |
| editor.walk.done_many | Checked {count} sections | 26 | |
| editor.walk.queued | Checked 1 section, saved on this phone | 42 | walk toast while the last write is still queued; count variant: editor.walk.queued_many |
| editor.walk.queued_many | Checked {count} sections, saved on this phone | 48 | |
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
| hours.closed | Closed | 8 | day summary when closed |
| hours.next_day | next day | 10 | suffix when closes before opens, e.g. "2:00 next day" |
| hours.copy_weekdays | Copy Monday to weekdays | 26 | |
| hours.exam.toggle | Different hours during finals | 30 | |
| hours.exam.title | Finals hours | 14 | |
| hours.helper | Use the posted hours. If none are posted, check the building's website. | 80 | |
| hours.invalid.same_time | Opens and closes can't be the same time. Mark the day closed or 24 hours. | 80 | |
| hours.all_day | Open 24 hours | 16 | day summary when open all day |
| hours.mode.hours | Hours | 8 | per-day segmented option |
| hours.mode.closed | Closed | 8 | per-day segmented option |
| hours.mode.all_day | 24 hours | 10 | per-day segmented option |
| hours.summary | {opens} to {closes} | 24 | day summary, e.g. "8:00 AM to 10:00 PM" |
| hours.summary_next | {opens} to {closes} next day | 34 | day summary when closing after midnight |
| hours.summary_unset | Set the times | 16 | day summary with a missing time |

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
| photos.unavailable | Image unavailable | 20 | in place of a photo whose bytes did not load |

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
| admin.invite.copy_failed | Couldn't copy. Select the link and copy it by hand. | 60 | toast |
| admin.invite.relogin | New sign-in link | 18 | per surveyor; for lost phones |
| admin.surveyors.title | Surveyors | 12 | |
| admin.surveyors.empty | Just you so far. | 20 | |
| admin.surveyors.admin_badge | Admin | 8 | |
| admin.surveyor.actions | Actions for {name} | 34 | icon button on a surveyor row |
| admin.revoke | Remove access | 16 | |
| admin.revoke.confirm.title | Remove {name}? | 30 | |
| admin.revoke.confirm.body | They're signed out on every phone. Their published edits stay. | 70 | |
| admin.revoke.confirm.action | Remove access | 16 | |
| admin.revoke.done | {name} removed | 30 | toast |
| admin.publish.title | Student data | 14 | |
| admin.publish.last | Last published {time} | 30 | |
| admin.publish.never | Not published yet | 20 | |
| admin.publish.dirty | Changes waiting to publish | 28 | |
| admin.publish.clean | Up to date | 12 | only after a publish has run |
| admin.publish.first | 1 spot waiting for the first publish | 40 | never published, nothing dirty; count variant: admin.publish.first_many |
| admin.publish.first_many | {count} spots waiting for the first publish | 44 | |
| admin.publish.now | Publish now | 14 | |
| admin.publish.running | Publishing | 12 | |
| admin.publish.waiting | Another publish has the lock until {time} | 52 | another server holds the publish lease, or a crashed run left it; it expires on its own |
| admin.publish.waiting_self | Last publish got no answer. Retry after {time} | 60 | this server holds the lease after a deployment that did not answer, in case it still lands |
| admin.publish.error | Last publish failed: {reason} | 70 | |
| admin.publish.warnings.title | Skipped spots | 16 | |
| admin.publish.warning.item | {name}: {reason} | 80 | reason from buildBundle, reworded by plan D |
| admin.photos.title | Photos to approve | 18 | |
| admin.photos.empty | No photos waiting. | 20 | |
| admin.photos.from | {spot}, from {name} | 40 | |
| admin.photos.approve | Approve | 10 | |
| admin.photos.reject | Reject | 8 | |
| admin.photos.reject.confirm | Delete this photo? It won't be published. | 50 | |

## Web UI states (plan D)

Strings the built screens needed beyond the sections above: short header forms for a 360 px phone, singular counts, per-code failure reasons (server messages are never shown raw), field names for "Missing: {field}", and the re-login invite.

| id | text | max chars | notes |
|---|---|---|---|
| sync.checking | Checking this phone | 24 | header long form and sheet, until the queue has been read; never shown as synced |
| sync.short.checking | Checking | 10 | sync status in the header |
| sync.short.pending | {count} waiting | 14 | header postmark; full form in the sync sheet |
| sync.short.offline | Offline | 10 | header postmark; sync.offline in the sheet |
| sync.short.failed | {count} not saved | 16 | sync status in the header |
| sync.short.unreadable | {count} unreadable | 16 | sync status in the header |
| sync.short.signed_out | Signed out | 12 | sync status in the header |
| sync.unreadable_one | 1 change can't be read | 30 | singular of sync.unreadable |
| auth.misconfigured | This build has no server address. Ask whoever sent you the link. | 70 | shown in place of the app when the deploy env is missing; the technical detail follows on its own line |
| sync.leave_warning_one | 1 change hasn't synced yet. Leaving now keeps it on this phone. | 90 | singular of sync.leave_warning |
| sync.sheet.unreadable_item | A saved change this app can't read | 40 | one row per unreadable record |
| sync.sheet.unreadable_help | These came from a newer or damaged copy of the app. Discard them if they stay. | 90 | |
| sync.sheet.open_spot | Open spot | 12 | row action |
| sync.sheet.open_spot_named | Open spot {name} | 60 | accessible name of the row action |
| home.unreadable_one | 1 change can't be read | 34 | singular of home.unreadable |
| home.drafts.empty | No drafts. | 14 | |
| home.offline_first | The spot list loads once you're online. New spots still save on this phone. | 90 | first run offline, nothing cached |
| spot.section.on_phone | On this phone | 14 | section row sync state |
| spot.section.syncing | Syncing | 10 | section row sync state |
| spot.section.failed | Didn't save | 12 | section row sync state |
| spot.section.conflict | Two versions | 14 | section row sync state |
| spot.publish.queued_chip | Publish queued | 16 | chip while the publish waits to sync |
| spot.review.queued | Review queued | 16 | chip; "Marked reviewed" only after it lands |
| spot.not_found | This spot isn't on this phone. Go online to load it. | 60 | spot never cached and offline |
| field.directions | How to get there | 20 | names for Missing: {field} and Still missing: {fields} |
| field.eligibility | Who can use it | 18 | |
| field.seat_count | Seats | 10 | |
| field.outlet_coverage_pct | Seats near an outlet | 22 | |
| field.noise_policy | Noise rule | 12 | |
| field.group_work_ok | Group work | 12 | |
| field.food_policy | Food and drink | 16 | |
| field.last_verified | A checked section | 20 | any saved or checked section |
| failed.reason.photo_missing | The photo is no longer on this phone. Take it again. | 60 | local: bytes evicted |
| failed.reason.photo_unreadable | This phone could not read the photo. Try again, or take it again. | 70 | local: storage read failed repeatedly |
| failed.reason.bad_response | The server's answer couldn't be read, so this can't be sent again. Discard it and redo it. | 100 | retry hidden |
| failed.reason.no_base_version | This phone lost track of the spot's version. Discard it and save the section again. | 90 | retry hidden |
| failed.reason.forbidden | Your account can't make this change. | 40 | 403 |
| failed.reason.not_found | This spot is no longer on the server. | 40 | 404 |
| failed.reason.invalid_request | Some values weren't accepted. Open the section, check it, and save again. | 80 | 400 and 422 without a known code |
| failed.reason.slug_taken | Another spot already has this name. Change the name in Basics. | 70 | |
| failed.reason.unknown_building | That building isn't on the server's list. Pick it again in Basics. | 70 | |
| failed.reason.unknown_term | The term changed. Open Hours and save again. | 50 | |
| failed.reason.photo_too_large | The photo was too large for the server. Take it again. | 60 | |
| failed.reason.photo_type | The server only takes JPEG photos. Take it again. | 60 | |
| failed.reason.write_id_reused | This change clashed with an older one. Discard it and make it again. | 80 | retry hidden |
| editor.unpublish.title | This takes the spot off the student app | 44 | saving would clear a required field on a published spot |
| editor.unpublish.body | With {fields} empty, students stop seeing this spot after the next publish. | 100 | |
| editor.unpublish.action | Save anyway | 14 | |
| identity.outdoor.label | Outdoors | 10 | |
| identity.seasonal.label | Only open some seasons | 24 | |
| invite.relogin.title | Sign in on this phone | 24 | link for an existing surveyor; no name asked |
| invite.relogin.body | This link signs you back in. Your name and role stay the same. | 70 | |
| invite.relogin.action | Sign in | 10 | primary |
| invite.switch.title | Unsynced changes from {name} | 40 | confirm when a different surveyor joins a phone with a non-empty queue |
| invite.switch.body | This phone holds changes {name} has not synced. Cancel keeps them, but this link is used up, so you will need a new one to join as {new}. | 150 | the server already accepted the link, so Cancel cannot reuse it |
| invite.switch.discard | Discard their changes and join | 34 | destructive confirm action |
| photos.approve | Approve | 10 | any surveyor but the uploader |
| photos.approve.done | Photo approved | 16 | toast |
| photos.online_only | Approving needs a connection. | 32 | |
| photos.not_synced | Not synced yet | 16 | badge on a photo still on the phone |
| photos.cover.wait | Sync first to use this as cover | 32 | |
| estimates.cell | {day}, {block}: {bucket} | 40 | accessible name of a grid cell |
| update.ready | A new version of Perch is ready. | 40 | update prompt |
| update.reload | Reload | 10 | |
| admin.invite.relogin.created | Sign-in link for {name}. Works once, for 48 hours. | 60 | |
| admin.surveyors.inactive | No access | 10 | badge |
| admin.publish.warning.missing | missing {fields} | 60 | reworded buildBundle reason |
| admin.publish.warning.invalid | has a value the student app can't use | 44 | |
| admin.publish.warning.hours | has hours the student app can't read | 44 | |
| common.close | Close | 10 | |
| common.open | Open | 8 | banner action that opens the conflict or failed view |
| common.loading | Loading | 10 | |
| common.less | Less | 6 | stepper button inside a labeled group |
| common.more | More | 6 | |
| unit.minutes | min | 4 | stepper suffix |
| unit.percent | % | 2 | stepper suffix |
| new.building.none | No building matches. | 24 | |
| common.save_failed | This phone couldn't save that. Check what you have, then try again. | 70 | storage timed out and nothing was queued |
| spot.conflict.open | Open the conflict | 20 | accessible name of the conflict banner's Open button |
| spot.failed.open | Open the unsaved changes | 26 | accessible name of the failed banner's Open button |
| photos.alt | Photo of this spot | 20 | alt text of a spot photo |
| new.building.offline | The building list loads once you're online. | 50 | first run offline |

## Redesign (2026-10-07)

| id | text | max chars | notes |
|---|---|---|---|
| theme.label | Theme | 8 | Actions sheet |
| theme.light | Light | 8 | |
| theme.dark | Dark | 8 | |
| theme.system | System | 8 | follows the phone |
| common.actions | Actions | 10 | opens the Actions sheet |
| home.filter.label | Show | 8 | accessible name of the filter chips |
| home.filter.all | All | 6 | |
| home.filter.attention | Needs you | 12 | |
| home.filter.drafts | Drafts | 8 | |
| home.filter.due | Due | 6 | never checked or over 90 days |
| home.search.label | Search spots | 16 | |
| home.group.all | All spots | 14 | list heading, Newsreader 20 |
| home.group.attention | Needs you | 12 | list heading |
| home.group.drafts | Drafts | 8 | list heading |
| home.group.due | Due | 6 | list heading |
| home.empty.attention | Nothing needs you. | 24 | |
| home.empty.due | Nothing is due. | 20 | |
| home.empty.search | No spots match. | 20 | |
| home.keep_going | Keep going | 14 | card status line when the draft's details are not on the phone |
| home.keep_going.next | Keep going · Next: {section} · {count} left | 56 | card status line |
| home.keep_going.ready | Keep going · Ready to publish | 36 | card status line |
| home.fact.conflict | Conflict | 10 | red pill |
| home.fact.failed | Didn't save | 12 | red pill |
| home.fact.unreviewed | Unreviewed | 12 | mist pill with an Eye icon |
| home.fact.unreviewed_by | Edited by {name} | 30 | read by screen readers after the pill; not drawn |
| home.fact.hours | No {term} hours | 24 | |
| home.fact.progress | {done}/{total} | 6 | |
| home.checked | Checked {date} | 20 | row subtitle under an attention fact |
| home.fact.draft | Draft | 8 | progress unknown |
| progress.label | {done} of {total} done | 20 | step bar accessible name |
| spot.progress.next | {done} of {total} · Next: {section} | 40 | under the step bar |
| spot.progress.complete | {done} of {total} done | 20 | |
| spot.next | Next: {section} | 30 | action bar, ink |
| spot.meta.floor | Floor {floor} | 16 | |
| spot.meta.place | {building} · Floor {floor} | 40 | overview meta, when the spot has a floor |
| spot.publish.blocked.reason | Can't publish yet: {count} missing | 36 | described-by of the disabled Publish |
| spot.actions.next_missing | Open next missing: {section} | 44 | Actions sheet |
| spot.actions.add_photo | Add a photo | 14 | Actions sheet |
| spot.actions.walk | Check each section | 20 | Actions sheet; opens each needed section in turn |
| spot.actions.walk.hint | Open every needed section, one after another | 44 | under Check each section |
| spot.fact.seats | {count} seats | 12 | |
| spot.fact.outlets | {percent}% near outlets | 22 | |
| spot.fact.hours | {term} hours | 22 | |
| spot.fact.blocks | {count} of {total} blocks | 20 | busyness |
| spot.fact.photos_one | 1 photo | 10 | |
| spot.fact.photos | {count} photos | 12 | |

## Student: shell

| id | text | max chars | notes |
|---|---|---|---|
| student.nav.label | Sections | 12 | tab bar landmark name |
| student.nav.home | Home | 8 | tab |
| student.nav.browse | Browse | 8 | tab |
| student.nav.me | Me | 8 | tab |
| student.notfound.back | Back to Home | 16 | student not-found link |
| student.home.title | Find a spot | 20 | Home large title |
| student.browse.title | Browse | 10 | large title |
| student.me.title | Me | 6 | large title |
| student.data.loading | Loading spots | 20 | skeleton status |

## Student: Home

Every Home string, including the presenters Home shares with the spot page and Browse. Honesty: every busyness line says typical, estimate, or no data, and none says live.

### Busyness

| id | text | max chars | notes |
|---|---|---|---|
| student.busy.typical.empty | Usually empty, typical {when} | 40 | measured slot |
| student.busy.typical.some | Usually some seats, typical {when} | 44 | |
| student.busy.typical.filling | Usually filling up, typical {when} | 44 | |
| student.busy.typical.nearly_full | Usually nearly full, typical {when} | 44 | |
| student.busy.typical.full | Usually full, typical {when} | 40 | |
| student.busy.estimate.empty | Empty, estimate | 24 | surveyor estimate |
| student.busy.estimate.some | Some seats, estimate | 24 | |
| student.busy.estimate.filling | Filling up, estimate | 24 | |
| student.busy.estimate.nearly_full | Nearly full, estimate | 24 | |
| student.busy.estimate.full | Full, estimate | 24 | |
| student.busy.none | No busyness data yet | 24 | |
| student.busy.row.empty | Usually empty | 20 | Browse row end; list caption carries "typical" |
| student.busy.row.some | Usually some seats | 20 | |
| student.busy.row.filling | Usually filling up | 20 | |
| student.busy.row.nearly_full | Usually nearly full | 20 | |
| student.busy.row.full | Usually full | 20 | |
| student.busy.row_estimate.empty | Empty, est. | 16 | |
| student.busy.row_estimate.some | Some seats, est. | 16 | |
| student.busy.row_estimate.filling | Filling up, est. | 16 | |
| student.busy.row_estimate.nearly_full | Nearly full, est. | 18 | |
| student.busy.row_estimate.full | Full, est. | 16 | |
| student.busy.row_none | No data yet | 12 | |
| student.seat.likely | Likely seats | 16 | P(seat) >= 0.7 |
| student.seat.tight | Might be tight | 16 | >= 0.4 |
| student.seat.unlikely | Probably full | 16 | below 0.4 |

### Pick card and data age

| id | text | max chars | notes |
|---|---|---|---|
| student.pick.place | {building} · Floor {floor} | 44 | |
| student.pick.walk | {minutes} min walk | 14 | |
| student.pick.walk_here | In this building | 18 | walk 0 |
| student.pick.closes_in | Closes in {minutes} min | 22 | under an hour |
| student.pick.open_till | Open till {closes} | 20 | |
| student.pick.open_all_day | Open all day | 14 | 20 h or more left |
| student.pick.checked | Checked {date} | 16 | newest verified date |
| student.reason.silent | Silent | 14 | |
| student.reason.quiet | Quiet | 14 | |
| student.reason.talking | Talking is fine | 18 | |
| student.reason.outlets | Outlets at most seats | 22 | |
| student.reason.carrels | Carrels | 14 | |
| student.reason.small_tables | Small tables | 14 | |
| student.reason.whiteboard | Whiteboard | 14 | |
| student.reason.calls | Calls OK | 12 | |
| student.reason.signal | Good signal | 14 | |
| student.reason.open_late | Open past midnight | 20 | |
| student.reason.staffed_late | Staffed late | 14 | |
| student.reason.lit_route | Lit walk home | 14 | |
| student.reason.late_food | Late food nearby | 18 | |
| student.reason.group_ok | Group work OK | 16 | |
| student.reason.natural_light | Natural light | 14 | |
| student.reason.step_free | Step-free | 12 | |
| student.reason.elevator | Elevator | 10 | |
| student.reason.food_ok | Food OK | 10 | |
| student.reason.drinks_ok | Drinks OK | 10 | |
| student.reason.big_room | 50+ seats | 10 | |
| student.reason.printer | Printer nearby | 16 | |
| student.reason.coffee | Coffee nearby | 16 | |
| student.lock.building | Residents of {scope} only | 40 | |
| student.lock.quad | Residents of {scope} only | 40 | |
| student.lock.grad | Grad students only | 20 | |
| student.lock.department | {scope} only | 36 | |
| student.lock.department_unknown | One department only | 20 | |
| student.lock.residents_unknown | Residents only | 16 | scope missing |
| student.lock.unverified | Access not confirmed yet | 26 | |
| student.data.today | Spots updated today | 24 | meta line |
| student.data.yesterday | Spots updated yesterday | 28 | |
| student.data.days | Spots updated {days} days ago | 32 | |
| student.data.old | These spots are {days} days old. Hours and busyness may have changed. | 80 | note banner over 3 days |
| student.data.offline | Offline. Using spots saved on this phone. | 48 | |
| student.data.unavailable | Can't load spots offline yet. Open once with signal. | 60 | spec wording |
| student.data.update_required | Update Perch to load spots. | 32 | spec wording |
| student.data.update_available | A newer Perch reads newer spots. Reload to update. | 60 | |

### Filters

| id | text | max chars | notes |
|---|---|---|---|
| student.filter.group.noise | Noise | 10 | |
| student.filter.group.rules | Power and rules | 18 | |
| student.filter.group.comfort | Room | 10 | |
| student.filter.group.access | Getting in | 12 | |
| student.filter.group.nearby | Late and nearby | 18 | |
| student.filter.silent | Silent only | 14 | |
| student.filter.quiet | Quiet or silent | 16 | |
| student.filter.talking | Talking is fine | 16 | |
| student.filter.outlets | Outlets at most seats | 22 | |
| student.filter.calls | Calls OK | 10 | |
| student.filter.food | Food OK | 10 | |
| student.filter.drinks | Drinks OK | 10 | |
| student.filter.group_ok | Group work OK | 14 | |
| student.filter.whiteboard | Whiteboard | 12 | |
| student.filter.big_room | 50+ seats | 10 | |
| student.filter.natural_light | Natural light | 14 | |
| student.filter.step_free | Step-free | 12 | |
| student.filter.elevator | Elevator | 10 | |
| student.filter.open_late | Open past midnight | 20 | |
| student.filter.printer | Printer nearby | 16 | |
| student.filter.coffee | Coffee nearby | 16 | |
| student.filter.group.power | Power and signal | 18 | |
| student.filter.group.seats | Seating | 10 | |
| student.filter.group.house | Rules | 10 | Browse |
| student.filter.usb | USB outlets | 14 | |
| student.filter.signal | Good cell signal | 18 | |
| student.filter.wifi | Wifi 50+ Mbps | 16 | |
| student.filter.carrels | Carrels | 10 | |
| student.filter.booths | Booths | 10 | |
| student.filter.soft | Soft seating | 14 | |
| student.filter.small_tables | Small tables | 14 | |
| student.filter.large_tables | Large shared tables | 22 | |
| student.filter.solo_tables | Individual tables | 20 | |
| student.filter.spread_out | Spread-out room | 18 | |
| student.filter.bright | Bright lighting | 16 | |
| student.filter.view | Window view | 14 | |
| student.filter.neutral_temp | Comfortable temperature | 26 | |
| student.filter.steady_temp | Steady temperature | 22 | |
| student.filter.reservable | Reservable | 12 | |
| student.filter.outdoor | Outdoors | 10 | |
| student.filter.accessible_seating | Accessible seating | 20 | |
| student.filter.open_entry | No swipe or desk | 18 | |
| student.filter.staffed_late | Staffed late | 14 | |
| student.filter.lit_route | Lit walk home | 16 | |
| student.filter.late_food | Late food nearby | 18 | |
| student.filter.bathroom | Bathroom nearby | 18 | |
| student.filter.water | Water nearby | 16 | |
| student.filter.microwave | Microwave nearby | 18 | |

### Home inputs

| id | text | max chars | notes |
|---|---|---|---|
| student.home.from.label | From | 8 | row title |
| student.home.from.sheet | Where are you? | 20 | sheet title |
| student.home.from.locate | Use my location | 20 | |
| student.home.from.locating | Finding you | 16 | |
| student.home.from.denied | Location is off. Pick a building instead. | 48 | |
| student.home.from.imprecise | Location too rough. Pick a building instead. | 48 | |
| student.home.from.located | Nearest building: {building} | 48 | |
| student.home.from.privacy | Used once to find the nearest building. Never saved or sent. | 64 | |
| student.home.from.search | Search buildings | 20 | |
| student.home.from.none | No building by that name. | 28 | search found nothing |
| student.home.from.fallback | Starting from {building} | 44 | saved building is gone from the spots |
| student.home.time.label | How long | 12 | |
| student.home.time.30 | 30 min | 8 | |
| student.home.time.60 | 1 hr | 6 | |
| student.home.time.120 | 2 hr | 6 | |
| student.home.time.close | Till close | 12 | |
| student.home.preset.label | What for | 12 | |
| student.preset.silent_solo | Silent solo | 14 | |
| student.preset.group | Group | 10 | |
| student.preset.calls | Calls | 10 | |
| student.preset.late_night | Late night | 12 | |
| student.preset.quick_30 | Quick 30 | 10 | |
| student.home.group.label | People | 10 | |
| student.home.filters.button | More filters | 16 | |
| student.home.filters.button_count | More filters, {count} on | 26 | |
| student.home.filters.title | More filters | 16 | |
| student.home.filters.clear | Clear | 8 | |
| student.home.filters.done | Done | 8 | |

### Home results

| id | text | max chars | notes |
|---|---|---|---|
| student.pick.heading | Your pick | 12 | |
| student.pick.surprise_heading | Surprise pick | 16 | |
| student.pick.alternates | Or try | 10 | |
| student.pick.directions | Directions | 12 | primary, opens maps |
| student.pick.something_else | Something else | 16 | reroll inside the filters |
| student.pick.surprise | Surprise me | 14 | ignores the preset, keeps the hard rules |
| student.pick.only_one | That's the only good match right now. | 44 | toast |
| student.pick.none_left | Nothing else is open for that long. | 40 | toast |
| student.empty.title | No spot fits those choices. | 28 | |
| student.empty.closest | Closest open spot: {spot}, {minutes} min away. | 60 | |
| student.empty.none_open | Nothing on campus is open for that long. | 48 | |
| student.empty.loosen.preset | Try fewer filters, or let Perch surprise you. | 52 | |
| student.empty.loosen.group | Try a smaller group. | 28 | offered only when it gives a pick |
| student.empty.loosen.time | Try a longer time. The walk eats a short one. | 48 | offered only when it gives a pick |
| student.empty.loosen.from | Try starting somewhere closer. | 36 | offered only when it gives a pick |
| student.empty.loosen.access | Set your access to see more spots. | 40 | |
| student.empty.try_group | Try {count} people | 16 | |
| student.empty.try_time | Try {time} | 20 | a time chip's label |
| student.empty.try_from | Start from {building} | 44 | |
| student.home.access.note | In campus housing or a grad student? Set your access. | 60 | never says "live" |
| student.home.access.action | Set access | 12 | |
| student.home.access.dismiss | Not now | 10 | |
| student.data.reload | Reload | 8 | |

## Student: Spot

| id | text | max chars | notes |
|---|---|---|---|
| student.spot.checked | Checked {date} | 20 | meta line, newest verified date |
| student.spot.last_checked | Last checked | 16 | group heading |
| student.spot.directions | Directions | 12 | primary |
| student.spot.share | Share | 8 | |
| student.spot.shared | Link copied | 14 | toast |
| student.spot.share_failed | Couldn't share. Copy the address bar instead. | 50 | toast |
| student.spot.getting_there | Getting there | 16 | heading |
| student.spot.busy_heading | Busyness | 12 | heading |
| student.spot.busy_caption | Typical {weekday}, not live. | 34 | |
| student.spot.busy_caption_exam | Typical {weekday} in finals, not live. | 44 | |
| student.spot.this_hour | This hour | 10 | over the current bar; never "Now" |
| student.spot.legend.measured | Counted | 10 | |
| student.spot.legend.estimate | Estimate | 10 | hatched |
| student.spot.legend.none | No data | 10 | outlined |
| student.spot.no_data | No data yet | 14 | whole day without data |
| student.spot.hours_heading | This week | 12 | |
| student.spot.hours_exam_heading | Finals hours | 14 | |
| student.spot.hours_unconfirmed | Hours not confirmed | 22 | |
| student.spot.closed_day | Closed | 8 | |
| student.spot.open_all_day | Open 24 hours | 16 | |
| student.spot.hours_span | {opens} to {closes} | 24 | |
| student.spot.hours_span_entry | {opens} to {closes}, last entry {entry} | 48 | |
| student.spot.today | Today | 8 | hours row sub |
| student.spot.details | Details | 10 | heading |
| student.spot.photo_none | No photo yet | 14 | |
| student.spot.photo_unavailable | Image unavailable | 18 | |
| student.spot.license | Spot data {license}, {attribution}. | 48 | |
| student.spot.not_found | That spot isn't in Perch. | 30 | |
| student.spot.back_to_browse | Browse spots | 14 | |
| student.group.identity | Name and place | 16 | |
| student.group.access | Access | 10 | |
| student.group.hours | Hours | 8 | |
| student.group.seating | Seating | 10 | |
| student.group.power | Power and signal | 18 | |
| student.group.environment | Noise and feel | 16 | |
| student.group.use_fit | House rules | 14 | |
| student.group.amenities | Nearby | 10 | |
| student.group.accessibility | Accessibility | 14 | |
| student.group.late_night | Late night | 12 | |

## Student: Browse

| id | text | max chars | notes |
|---|---|---|---|
| student.browse.view.label | View | 8 | segmented, label hidden |
| student.browse.view.list | List | 6 | |
| student.browse.view.map | Map | 6 | |
| student.browse.search.label | Search spots | 20 | search field |
| student.browse.arrive.label | Arriving | 10 | chips legend |
| student.browse.arrive.now | Now | 6 | arrival time, not busyness |
| student.browse.arrive.1 | In 1 hr | 8 | |
| student.browse.arrive.2 | In 2 hr | 8 | |
| student.browse.arrive.4 | In 4 hr | 8 | |
| student.browse.arrive.tonight | Tonight 9 PM | 14 | |
| student.browse.filters | Filters | 10 | |
| student.browse.filters_count | Filters, {count} on | 20 | |
| student.browse.filters.title | Filters | 10 | sheet title |
| student.browse.open_only | Open when I get there | 24 | sheet switch |
| student.browse.show_locked | Show spots I can't use | 28 | sheet switch |
| student.browse.caption | Busyness is typical for {when}, not live. | 52 | above the list |
| student.browse.count | {count} spots | 14 | meta |
| student.browse.count_one | 1 spot | 8 | meta |
| student.browse.hidden_locked | {count} spots hidden for access | 34 | |
| student.browse.hidden_locked_one | 1 spot hidden for access | 30 | |
| student.browse.empty | No spots match. Clear a filter. | 40 | |
| student.browse.clear | Clear filters | 16 | |
| student.browse.row.sub | {building} · {minutes} min · {status} | 70 | |
| student.browse.status.closed | Closed then | 12 | at the chosen arrival time |
| student.browse.status.hours_unknown | Hours not confirmed | 22 | |
| student.bucket.empty | Empty | 8 | map legend |
| student.bucket.some | Some seats | 12 | |
| student.bucket.filling | Filling up | 12 | |
| student.bucket.nearly_full | Nearly full | 12 | |
| student.bucket.full | Full | 6 | |
| student.bucket.none | No data | 8 | |
| student.map.loading | Loading map | 14 | |
| student.map.offline | The map needs a connection. The list works offline. | 56 | |
| student.map.failed | The map didn't load. The list has every spot. | 52 | |
| student.map.legend | Typical busyness, not live | 28 | legend title |
| student.map.pin_label | {spot}, {busy} | 80 | pin aria-label |
| student.map.open | Open spot | 12 | selected card link |
| student.map.label | Map of study spots | 24 | map region name |

## Student: Me

| id | text | max chars | notes |
|---|---|---|---|
| student.me.access_heading | Access | 10 | |
| student.me.residence.label | Where you live | 16 | |
| student.me.residence.none | Off campus | 12 | |
| student.me.quad.label | Quad | 6 | |
| student.me.quad.none | None | 6 | |
| student.me.grad.label | Grad student | 14 | |
| student.me.access_helper | Unlocks spots for residents and grad students. Nobody checks this. | 72 | |
| student.me.presets_heading | Presets | 10 | |
| student.me.preset.builtin | Built in | 10 | |
| student.me.preset.new | New preset | 14 | |
| student.me.preset.name | Name | 8 | |
| student.me.preset.save | Save preset | 14 | |
| student.me.preset.delete | Delete preset | 14 | |
| student.me.preset.delete_title | Delete {name}? | 34 | |
| student.me.preset.delete_body | It goes away on this phone only. | 40 | |
| student.me.preset.name_required | Give it a name. | 20 | |
| student.me.preset.filters_required | Pick at least one filter. | 28 | |
| student.me.preset.full | You can keep up to 10 presets. | 34 | |
| student.me.look_heading | Look | 6 | |
| student.me.privacy_heading | Privacy | 10 | |
| student.me.privacy | Nothing about you is stored on our servers. Settings live on this phone. | 80 | spec wording |
| student.me.data_policy | Data policy | 14 | |
| student.me.source | Source code | 14 | |
| student.me.licenses | Licenses | 12 | link to the license file |
| student.me.licenses_body | Code is MIT. Spot data and photos are CC BY-SA 4.0. Map data is OpenStreetMap. | 90 | |
| student.me.surveyor | Surveyor tools | 16 | only with a surveyor session |
| student.me.reset_note | Your settings couldn't be read, so they were reset. | 56 | |
| student.install.note | Add Perch to your home screen to open it faster. | 52 | |
| student.install.add | Add | 6 | |
| student.install.dismiss | No thanks | 10 | |
| student.install.ios | In Safari, tap Share, then Add to Home Screen. | 52 | |

## Pending questions

- Floor naming at Stony Brook (e.g. "Lower level" vs "B") should come from the first survey walk; the floor field is free text for now.
- Whether "Checked" or "Verified" reads better to the crew. The deck uses "Checked" in the UI and keeps "verified" in code and data.
- `admin.publish.warning.item` reasons are generated by the server (`skipped <slug>: ...`). The web UI maps them to `admin.publish.warning.*` with the `field.*` names.
