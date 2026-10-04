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

## Surveyor tooling tables (migrations 0002 and 0003)

```
surveyor(id, email null, display_name, role, invited_by, active, created_at)
invite(token_hash, role, surveyor_id null, created_by null, created_at, expires_at, used_at)   -- only the hash is stored
auth_session(id, surveyor_id, created_at, expires_at)        -- id = sha256(bearer token); 30 days, renewed past halfway
audit_log(id, surveyor_id, entity, entity_id, action, before_json, after_json, at)
write_receipt(client_write_id, surveyor_id, received_at, response_json)   -- replayed on retry
spot += status, review_state, reviewed_by, version, last_edited_by
photo_blob(sha256, bytes, content_type, byte_size, created_at)
spot_photo(id, spot_id, url null, blob_sha256, taken_at, is_cover, uploaded_by, approved_by, approved_at)
bundle_state(campus_id, dirty, write_seq, last_published_at, last_hash, last_deploy_hook_at,
             last_attempt_at, last_warnings, last_error)
```

`spot_photo.url` is the absolute data-site URL, written by the publisher. `bundle_state.write_seq` increases on every dirty write; a publish clears `dirty` only if it did not change while the publish ran.

Floor penalty added to walk_matrix lookups at query time. Walk matrix precomputed once from OpenStreetMap footpaths; campus is small enough that no live routing engine is needed.

Implementation: this model is written as a Drizzle schema in `packages/db`. Enums in [spot-schema.md](spot-schema.md) become Postgres enums via Drizzle `pgEnum`. Multi-valued attributes use child tables as above, not arrays or JSON, except `preset.filters_json`, which is validated by a Zod schema before write.
