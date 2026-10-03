# Spot definition and attribute schema

## Spot definition

Hierarchy: campus > building > floor > spot.

A spot is the smallest area where a student makes one decision ("I'll go there"). It must pass four tests:
1. One-glance: most seats are visible from one vantage point. Makes fullness reports meaningful and headcounts under 2 minutes.
2. One-policy: noise rules, food rules, and hours are uniform. Mixed policy means two spots.
3. One-access: everyone who can enter any part can enter all of it.
4. Nameable: describable to a friend in a few words. Use signage names where they exist.

Sizing and edge cases:
- Target roughly 8 to 80 seats. Split larger areas or areas with internal differences.
- Identical small rooms are grouped into one spot with a room count. Exception: bookable rooms with reservation data become child records (`spot_room`) because availability exists per room.
- Exclude corridors, pass-through areas, class-enrollment-only spaces, spaces requiring an unavailable reservation, and anywhere you cannot sit 30+ minutes undisturbed.
- Outdoor spots are included with a seasonal flag.

## Attribute schema

Grouped by change frequency, which sets the re-survey cadence. Every group carries metadata: `last_verified_at`, `source` (survey | official | user), `confidence` (measured | estimated | reported).

### Identity (stable)
- `id`, `official_name`, `common_name`
- `building_id`, `floor`
- `lat`, `lng` (geofence and walking matrix anchor)
- `directions` (turn-by-turn text from nearest entrance)
- `photos[]` (each with `taken_at`)

### Access (per term)
- `eligibility`: enum `all_students | residents_building | residents_quad | grad_only | department | public`, plus `eligibility_scope` (which building, quad, or department)
- `entry_method`: enum `open | card_swipe | staffed_desk`
- `hours`: per day of week, per term, with separate exam-period hours and optional `last_entry` time
- `reservable`: bool, plus `reservation_system`, `reservation_url`

### Seating (stable, audit each term)
- `seat_count`, plus counts by type: `table_chair | carrel | soft | booth | standing`
- `effective_capacity` (observed occupancy at which the spot feels full; from headcount sprint, typically well below seat count)
- `table_config`: enum set `large_shared | small_2_4 | individual`
- `max_group_size` (largest contiguous seating)
- `spread_out_room`: bool

### Power and connectivity (stable)
- `outlet_coverage_pct` (fraction of seats within cord reach of a working outlet)
- `usb_outlets`: bool
- `wifi_mbps` (measured speed test)
- `cell_signal`: enum `poor | ok | good`

### Environment (time-varying, sampled across slots)
- `noise_policy`: enum `silent | quiet | conversational | group_friendly`
- `measured_noise` per time slot: enum bucket `silent | quiet | conversational | loud`, from the single designated survey phone so microphone bias is constant
- `natural_light`: bool, `lighting`: enum `dim | moderate | bright`
- `temperature`: enum `cold | neutral | warm`, plus `temperature_consistent`: bool
- `windows_view`: bool

### Use fit (stable)
- `calls_ok`: enum `not_allowed | allowed_impractical | allowed`
- `group_work_ok`: bool, `whiteboard`: bool
- `food_policy`: enum `none | covered_drinks | food_ok`

### Nearby amenities (stable, walking minutes)
- `bathroom_min`, `water_min`, `coffee_food_min`, `printer_min`, `microwave_min`, `late_food_min`

### Accessibility (stable)
- `step_free`: bool, `elevator`: bool, `accessible_seating`: bool

### Late-night suitability (stable)
- `open_past_midnight`: bool, `staffed_late`: bool, `lit_route_to_residences`: bool

### Busyness
- Forecast occupancy ratio by hour and day of week, with a separate exam-period profile
- `linked_class_buildings[]` (whose class end times predict surges here)
- Last live report: fullness bucket, noise bucket, timestamp

### Field priority
- Required for v0: identity, directions, eligibility, hours, seat_count, outlet_coverage_pct, noise_policy, food_policy, group_work_ok, last_verified_at.
- First headcount sprint: effective_capacity, measured_noise, forecasts, wifi_mbps, lighting, temperature.
- Later: amenity walking times, accessibility, late-night suitability, linked class buildings.
