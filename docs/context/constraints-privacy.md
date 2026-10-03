# Constraints and privacy rules

## Constraints

- No hardware. All data comes from manual surveys, users' own phones (foreground only), and institutional data if granted.
- No privileged network data. Campus Wi-Fi client counts live on DoIT's wireless controllers and require DoIT cooperation. Do not attempt SNMP, AP querying, probe-request sniffing, or BLE scanning. All are either impossible without credentials, unreliable due to MAC randomization, or violate campus acceptable use policy.
- No scraping behind login. Do not scrape authenticated university systems (e.g. the library's room booking system) with personal credentials.
- No university SSO integration (requires DoIT). Use Stony Brook email magic links instead.
- Phones cannot sample audio in the background on iOS. Noise is sampled in the foreground only.
- Web apps cannot read Wi-Fi BSSID. Indoor positioning is building-level geofence plus user confirmation.

## Privacy rules (non-negotiable)

- Store aggregates for display. Never display individual check-ins or reports.
- Suppress or bucket any displayed count below 5 people.
- No location history or trajectories. Session and report rows store spot ID and time only; purge raw rows after a fixed retention window once aggregated.
- No audio is ever recorded, stored, or transmitted.
- Friend presence is opt-in, mutual, ephemeral, and never default.
- Publish a plain-language data policy before launch.
