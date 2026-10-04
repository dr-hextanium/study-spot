# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
React + Vite PWA (vite-plugin-pwa), TypeScript strict, Zod, Fastify on Bun, Postgres + Drizzle (proposed), MapLibre GL JS with OSM tiles. Bun workspaces monorepo. See CLAUDE.md section 10. An Expo app is gated to v1 metrics and does not exist yet.

## Users
Two primary users, both first-class:

- **Students at Stony Brook University** deciding where to study right now. The typical moment is on a phone, between classes or leaving a dorm, with a time budget and a need (silent solo, group project, calls, late night, quick 30 min). Some are residents with access to residents-only spaces, some are grad students with grad-only rooms.
- **Surveyors** in the student club that maintains the data. They walk campus with a phone, fill in spot attributes, and run headcount sprints each semester. Survey labor is the main thing that can kill the product, so their flow has to be fast (create or edit a spot in under 5 minutes from a phone).

## Product Purpose
Answer "where should I go right now" with a ranked pick plus 2 alternates. Behind that sits a surveyed directory of every study spot on campus, historical busyness forecasts, and sparse live reports. The directory is a core product on its own. It is a campus utility, not a business: cheap to run, open source, and handed over to a student club.

Success looks like: picks users actually walk to, "found a seat that worked: yes" on arrival, and data kept fresh every semester.

## Positioning
It ranks by the probability that the right kind of seat is free when you get there, not by raw busyness. Every reading says honestly whether it is live ("reported N min ago") or a forecast ("typical for <day> <time>"). Spot definitions come from a physical survey (one-glance, one-policy, one-access, nameable), with no sensors and no university systems involved.

## Operating Context
- One-handed phone use outdoors and in hallways, often walking. Also laptop browsing for planning.
- Installed as a PWA on iOS Safari and Android Chrome. iOS web push only works when the PWA is installed.
- Exam periods: demand spikes, late-night and 24-hour spaces matter most, and exam hours apply.
- Surveyor sessions: walking spot to spot, counting heads in under 2 minutes, entering structured attributes.
- Public spot pages are prerendered and indexed by search engines.

## Capabilities and Constraints
- v0: quick pick, browse (map + list, filters, forecast heatmap, time scrubber), spot pages, eligibility profile, presets, surveyor mode.
- v0 also includes shareable postcards: a user makes a postcard of a spot, optionally with a selfie, rendered on device and shared to social media. Photos are never uploaded.
- v1: sessions (check-in, minimal timer, check-out), ask flow, arrival feedback, tips, exam mode.
- No hardware, no Wi-Fi/BLE sniffing, no scraping behind login, no university SSO. Surveyors sign in with admin-generated invite links; students have no accounts in v0.
- Eligibility is self-declared and modeled per spot. Ineligible spots are hidden or shown locked.
- Terminology: spot, building, floor, preset, quick pick, alternates, live vs forecast, last verified, session, tip (not review).
- Undecided: final name (Perch is the working name pending trademark and store checks; fallback OpenSeat).

## Brand Commitments
- Working name: **Perch** (not final). No "Seawolf", "SBU", or "Stony Brook" in the name.
- Voice: dry and student-made. Short and literal, with a light peer tone that makes it clear students built it, not the university. No hype.
- Never use em-dashes in UI copy, docs, or comments. Use commas or colons.
- No star ratings. Tips are short and factual, expire, and can be flagged.

## Evidence on Hand
- No real spot data, photos, forecasts, or user metrics yet. The first survey and headcount sprint are planned for October to November 2026.
- Known facts: 22 library study rooms (Central Reading Room, North Reading Room, Southampton) booked via "Stony Booked"; four single-occupancy Core rooms; grad-only rooms in the Central Reading Room; RCC computer labs, some possibly residents-only.
- Do not invent spot counts, user numbers, testimonials, or university endorsement.

## Product Principles
1. Answer first, map second. One recommendation beats a heatmap you have to interpret.
2. Honest freshness. Never show a forecast as live, and show a last-verified date everywhere.
3. Privacy by default. Only aggregates, nothing displayed below 5 people, no location history, never audio.
4. Surveyor speed is product speed. If upkeep is slow, the data goes stale and the app becomes worse than a shared doc.
5. Built to be handed off. Simple, cheap, and open, so a student club can run it.

## Accessibility & Inclusion
Accessibility attributes (step-free, elevator, accessible seating) are part of the spot schema and the filters. Late-night safety signals (staffed late, lit route to residences) are part of the schema. The app must work one-handed on phones and in bright outdoor light.
