---
description: Run the visual verification loop on the surveyor PWA and report a verdict
argument-hint: "[route ...] (default: home, new spot, admin, a spot, its seating editor)"
---

Run the Visual Verification loop from CLAUDE.md, in order, for these routes: $ARGUMENTS

1. Start the API on 8890 and the web dev server on 5299 in the background, exactly as CLAUDE.md says. Save both PIDs. Wait for `http://127.0.0.1:8890/health` and `http://localhost:5299`. Never touch 5173, 5199, or 8790.
2. Run `scripts/verify-ui.ts` from `apps/web` with `VERIFY_WEB=http://localhost:5299` and an unused invite index. Report each PASS or FAIL line as text.
3. Resize the screenshots with `magick mogrify -resize '1024x>'`.
4. Dispatch the `visual-reviewer` agent with the screenshot folder, the routes, and what changed. Do not open the screenshots yourself unless the reviewer flags something you must see.
5. Only if the user asked for performance, or this is a release check, run Lighthouse on a production build in its own dir on port 4299.
6. Stop the servers you started by PID. Confirm nothing is listening on 5299, 8890, or 4299.

Reply with: the check table (console, overflow, axe per route and width), the reviewer's verdict, and the list of deviations from the tokens or contract. Then empty `.claude/tmp/screenshots/`.
