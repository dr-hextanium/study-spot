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

Floor penalty added to walk_matrix lookups at query time. Walk matrix precomputed once from OpenStreetMap footpaths; campus is small enough that no live routing engine is needed.

Implementation: this model is written as a Drizzle schema in `packages/db`. Enums in [spot-schema.md](spot-schema.md) become Postgres enums via Drizzle `pgEnum`. Multi-valued attributes use child tables as above, not arrays or JSON, except `preset.filters_json`, which is validated by a Zod schema before write.
