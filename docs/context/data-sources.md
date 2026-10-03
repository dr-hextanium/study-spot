# Data sources

## Data sources, ranked

| Source | What it gives | Availability |
|---|---|---|
| Manual survey | All static attributes, seat counts | Self-serve |
| Headcount sprint | Historical occupancy per spot per time slot | Self-serve, recurring each semester |
| User live reports | Fullness and noise buckets, sparse | Self-serve, needs adoption |
| Session check-in/out | Presence and departure events | Self-serve, needs adoption |
| Arrival feedback | "Found a seat that worked: yes/no" ground truth | Self-serve |
| Library study room bookings | Near-exact occupancy for 22 rooms | Requires library cooperation |
| Library gate counts | Building-level traffic, may not be live | Requires library cooperation |
| Class schedule end times | Predicts surges near lecture buildings | Unverified whether publicly accessible |
| DoIT Wi-Fi AP counts | Campus-wide live occupancy | Requires DoIT, last-stage ask |

Known facts from research:
- The University Libraries have 22 study rooms across the Central Reading Room, North Reading Room, and Southampton library, booked through a system called "Stony Booked" (login required). It may be the open-source Booked Scheduler, which has an API. Unverified.
- Four "Core" rooms in the North Reading Room are single-occupancy. Graduate study rooms exist in the Central Reading Room and are graduate-only.
- Residential Computing Centers exist as additional computer labs.
