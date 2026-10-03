# Product design

## Product design

### Core reframe
- Answer first, map second. Home screen returns a best-fit spot plus 2 alternates, not a heatmap to interpret.
- Rank by probability that the right kind of seat is free at arrival, not raw busyness. A group of 4 needs 4 contiguous seats.
- Time budget is an input. Long walks for short windows are penalized.

### Flows
1. Quick pick (home): inputs are location, time available, active preset. Output is 1 recommendation plus 2 alternates, each with walking time, a confidence label (`live` or `forecast`), and the deciding attributes.
2. Browse: map plus list, attribute and eligibility filters, forecast heatmap layer, time scrubber for future arrival.
3. Spot page: directions, photos, attributes, today's forecast curve, last live report, tips, last-verified date.
4. Session: check in, minimal focus timer, check out.
5. Ask: "Is it full?" sends web push to users recently checked in at that spot.

### Presets
Defaults: silent solo, group project, calls/meetings, late night, quick 30 min. Users can create custom presets from any filter set.

### Eligibility profile
User self-declares residence building/quad and graduate status. Ineligible spots are hidden or shown locked. Declaration is unverified; acceptable because the app grants no physical access.

### Session mode
- Check-in gives presence; check-out gives departure events (otherwise unobservable); the timer keeps the app open.
- On check-in: one-tap fullness and noise prompt; foreground noise sample.
- On check-out: optional "seats free near you: yes/no."
- Keep the timer minimal. It is a data hook, not a product to expand.

### Arrival feedback
Ask "found a seat that worked: yes/no" after a quick pick. This is the only direct measurement of recommendation quality and feeds the seat-probability model.

Web limitation: background geofencing is impossible in a browser, so arrival cannot be detected unless the app is open. Web implementation:
- Server schedules a web push at pick time + walk time + about 5 minutes.
- Re-prompt on the next app open if unanswered.
- If the app is open and foreground location lands inside the picked building's geofence, prompt immediately.
Native (Expo, v1+) can use true background geofencing via expo-location and task manager.

Push caveat: iOS delivers web push only to PWAs installed to the home screen. Low install rates starve both arrival feedback and the ask flow. This is the main trigger for adding the Expo app.

### Tips (not reviews)
Short factual tips attached to a spot. Expire unless re-confirmed. Flaggable. No star ratings.

### Exam mode
Auto-enabled during midterm and finals windows: load exam hours, prioritize late and 24-hour spaces, switch to exam forecast profile, down-weight group presets in crowded zones.

### Social (v2, opt-in only)
- Friend presence: share current spot with selected mutual friends; ephemeral (ends at check-out or timeout); never default, never history, never visible outside mutual pairs.
- Group finder: pick a spot minimizing total walking time for all members and seating the whole group.

### UX honesty rules
- Every busyness reading shows one of two states: "reported N min ago" or "typical for <day> <time>". Never render a forecast as live.
- Live readings visibly fade back to forecast as they age.
- Every spot shows a last-verified date.
