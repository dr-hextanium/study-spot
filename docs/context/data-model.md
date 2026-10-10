# Data model

## Data model (initial)

```
campus(id, name)
building(id, campus_id, name, lat, lng)
spot(id, building_id, floor, official_name, common_name, lat, lng, directions,
     eligibility, eligibility_scope, entry_method, reservable, reservation_system,
     reservation_url, seat_count, effective_capacity, max_group_size,
     spread_out_room, outlet_coverage_pct, usb_outlets, wifi_mbps, cell_signal,
     noise_policy, natural_light, lighting, temperature, temperature_consistent,
     windows_view, calls_ok, group_work_ok, whiteboard, food_policy,
     step_free, elevator, accessible_seating, open_past_midnight, staffed_late,
     lit_route_to_residences, outdoor, seasonal)
spot_seat_type(spot_id, type, count)
spot_table_config(spot_id, config)
spot_room(id, spot_id, name, capacity, reservable)
spot_hours(spot_id, term_id, day_of_week, opens, closes, last_entry, is_exam)
spot_amenity(spot_id, amenity, walk_minutes)
spot_photo(id, spot_id, url, taken_at)
spot_verification(spot_id, attribute_group, last_verified_at, source, confidence)
spot_linked_building(spot_id, building_id)
term(id, name, starts, ends, exam_starts, exam_ends)
walk_matrix(from_building_id, to_building_id, minutes)
headcount(id, spot_id, observed_at, count, surveyor_id)
noise_sample(id, spot_id, observed_at, bucket, source)   -- source: survey | user
forecast(spot_id, profile, day_of_week, hour, ratio)     -- profile: regular | exam
live_report(id, spot_id, device_id, reported_at, fullness, noise)
session(id, device_id, spot_id, started_at, ended_at, seats_free_on_exit)
arrival_feedback(id, device_id, spot_id, picked_at, arrived_at, success)
tip(id, spot_id, device_id, text, created_at, confirmed_at, flagged)
app_user(id, email, residence_building_id, residence_quad, is_grad)   -- "user" is reserved in Postgres
preset(id, user_id, name, filters_json)
device(id, user_id, reputation)
```

## Pick ping (`pick_daily`)

Pings are counted in memory and upserted straight into `pick_daily` (spot, campus day, count). Only ids of published spots of the campus are counted; that set is held in memory, loaded on first use and reloaded at most every hour, and sooner after a publish, which invalidates it. A flush runs 10 minutes after the last ping, at most 60 minutes after the first unflushed one, at 500 keys, and on shutdown. After a failed flush the counts are kept (at most 2,000 keys; the keys of the oldest hours are dropped first) and retried when the idle timer fires. Neon cost: under steady traffic a flush wakes the database about once an hour (the 60-minute cap). Sparse pings can wake it once per idle gap, because each gap ends in a flush after 10 minutes, and the first ping after a restart, a publish, or an hour also reloads the spot set. No raw ping rows, no device id, no address.

## Surveyor tooling tables (migrations 0002 and 0003)

```
surveyor(id, email null, display_name, role, invited_by, active, created_at)
invite(token_hash, role, surveyor_id null, created_by null, created_at, expires_at, used_at)   -- only the hash is stored
auth_session(id, surveyor_id, created_at, expires_at)        -- id = sha256(bearer token); 30 days, renewed past halfway
audit_log(id, surveyor_id, entity, entity_id, action, before_json, after_json, at)
write_receipt(client_write_id, surveyor_id, received_at, response_json)   -- replayed on retry
spot += status, review_state, reviewed_by, version, last_edited_by
photo_blob(sha256, bytes null, content_type, byte_size, pages_hash null, offloaded_at null, created_at)
spot_photo(id, spot_id, url null, blob_sha256, taken_at, is_cover, uploaded_by, approved_by, approved_at)
bundle_state(campus_id, dirty, write_seq, last_published_at, last_hash, last_deploy_hook_at,
             last_attempt_at, last_warnings, last_error, publishing_owner null, publishing_until null)
```

`spot_photo.url` is the absolute data-site URL, written by the publisher.

Photo bytes (decision 22): `photo_blob` is content-addressed and shared, so one blob can back several `spot_photo` rows. Pending photos keep their bytes in Postgres until reviewed. After each data-site deploy, the publisher fetches each published photo from `<DATA_BASE_URL>/photos/<sha256>.jpg` (cache-busted). If the sha256 of what comes back matches, it sets `bytes` to null, records `offloaded_at`, and keeps `sha256` and `pages_hash`, the Cloudflare Pages asset key of that path. This only happens when an approved photo row of the publishing campus uses the blob and no row of another campus does. Every deploy lists the bundle's photos plus every cleared blob still used by a photo row of the campus, even one whose spot is no longer published, because a Pages deploy drops any file it does not list and a cleared photo has no other copy. Cleared photos go into the manifest by `pages_hash`, so their bytes are not read. If Cloudflare reports one of those hashes missing, the bytes are fetched back from the live site and checked. If there is no good copy, the deploy stops before the deployment call, so the live site keeps the photo. The image route serves a cleared photo by fetching it from the data site and checking its sha256, and answers 404 if that fails. Only pending photos can be rejected: an approved photo is a 409, because its only copy may be on the data site. Rejecting deletes the row, and also the blob when no other row uses it. Uploading bytes whose blob was cleared puts them back (`bytes` set, `offloaded_at` null). Upload bytes are stored inside the upload's write transaction. `spot_photo.spot_id` is `ON DELETE RESTRICT` (migration 0006), so deleting a spot cannot silently remove photo rows. Publishes hold a lease, `bundle_state.publishing_owner` and `publishing_until` (migration 0005). A run claims it with a conditional UPDATE when it is free or expired. It renews it right before the Pages deployment POST, and again before each photo it clears after the deploy. Each clear also locks the lease row (`FOR SHARE`). The run writes `last_hash`, `last_published_at`, `dirty` and `last_error` only while it still holds the lease, and releases it at the end. After a deployment POST that got no answer, the run holds the lease for 2 more minutes. A crashed run's lease expires after 10 minutes, and admin status shows `waiting_until` until then. Each Cloudflare call times out after 60 s, inside a 4 minute deploy budget. A run that finds it taken is "busy": it records no error and retries in 60 s. Advisory locks do not work, because they do not hold through Neon's pooler. `spot_photo.blob_sha256` stays set on cleared rows, because the cover query depends on it. `bundle_state.write_seq` increases on every dirty write; a publish clears `dirty` only if it did not change while the publish ran.

Floor penalty added to walk_matrix lookups at query time. Walk matrix precomputed once from OpenStreetMap footpaths; campus is small enough that no live routing engine is needed.

Implementation: this model is written as a Drizzle schema in `packages/db`. Enums in [spot-schema.md](spot-schema.md) become Postgres enums via Drizzle `pgEnum`. Multi-valued attributes use child tables as above, not arrays or JSON, except `preset.filters_json`, which is validated by a Zod schema before write.

Client queue note: the surveyor's offline outbox (`packages/ui-logic/src/survey/outbox.ts`) sends each spot's writes strictly in order and chains each `base_version` from the previous answer. When the surveyor's own unpublish or photo approval bumps a spot by exactly one, `noteServerVersion` rebases the writes still queued. A write already in flight is not rebased: if such a bump lands while it is on the wire, the server answers 409 and the surveyor resolves one conflict with Keep mine. This is accepted so a real edit by another surveyor can never be hidden.
