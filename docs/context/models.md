# Models: forecast, live blend, scoring

## Models

### Forecast
Occupancy ratio `r = occupancy / effective_capacity`.
Model per spot as a building effect times an hour-of-day by day-of-week profile, pooled across spots to handle thin samples (a two-week sprint yields about 2 observations per slot per spot). Maintain separate regular-term and exam-period profiles. Refit after each sprint and continuously from audits.

### Live blend
Fullness buckets map to ratios: `empty=0.1, some=0.35, filling=0.6, nearly_full=0.85, full=1.0`.
Each report weight `w = 0.5 ^ (age_minutes / 30)`.
Blended ratio `r* = (k * r_forecast + sum(w_i * r_i)) / (k + sum(w_i))`, with prior strength `k` around 1 (tune).
A spot is labeled `live` when `sum(w_i)` exceeds a threshold, otherwise `forecast`.

### Seat probability
`P(seat)` as a decreasing function of `r*` at arrival time, adjusted for group size relative to `max_group_size` and effective capacity. Start with a logistic on `r*`; calibrate with arrival feedback.

### Recommendation score
1. Hard filters: eligibility, open at arrival and for at least the minimum useful duration, preset-required attributes.
2. `fit` = weighted match on soft preset attributes, in [0, 1].
3. `time_value = max(0, T_available - walk - overhead) / T_available`.
4. `score = fit * P(seat) * time_value`.
5. Random pick mode: sample from the top candidates weighted by score, avoid repeating recent picks, allow reroll.

### Anti-abuse
Geofence gating for reports, per-device rate limits, median aggregation, reputation weighted by agreement with consensus, periodic manual audits during sprints.
