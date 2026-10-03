# Design tooling

## Design tooling (Claude Code plugins)

Two design plugins are installed. Use them for UI and UX work instead of improvising.

### Impeccable (visual design and frontend craft)
- Product context lives in `PRODUCT.md` (written by `/impeccable init`). Read it before any UI work. `DESIGN.md` does not exist yet; it is created when the first surface establishes a visual world.
- Common commands: `/impeccable shape <surface>` to plan a screen, then build it; `critique`, `audit`, `polish`, `harden`, `adapt`, `clarify` for refinement. Run `/impeccable` with no argument for the menu.
- Design detector hook is enabled (`.impeccable/config.json`). It runs after edits to UI files and on session stop. Fix real findings; only add ignores through `impeccable hooks ignore-value`, never by hand.
- Owns: visual world, typography, color, layout, motion, component craft.

### Intent (UX strategy and experience design)
- Entry point: `/intent` or the `noor` agent to set context and route.
- Skills: `strategize` (framing, scoping), `journey` (flows), `organize` (IA, navigation), `wireframe` (screen structure), `articulate` (UI copy, voice), `fortify` (edge, empty, error, offline states), `include` (accessibility), `evaluate` (heuristic review, dark patterns), `measure` (metrics, experiments), `specify` (handoff specs), `investigate` (user research).
- Agents: `ember` (strategy), `wren` (flows, IA, copy), `vigil` (quality and a11y audit), `rune` (specs), `sage` (brainstorming).
- Owns: problem framing, flows, IA, copy, states, accessibility, and measurement.

### How they fit together
- Order for a new surface: Intent to frame the flow, structure, and copy (`journey`, `wireframe`, `articulate`), then Impeccable to design and build it (`shape`, then build), then `fortify` or `/impeccable harden` for states, and `vigil` or `/impeccable audit` before shipping.
- Both must respect [product-design.md](product-design.md) (UX honesty rules), [constraints-privacy.md](constraints-privacy.md) (privacy rules), and `CLAUDE.md` (writing conventions) (no em-dashes, short literal copy). Voice is dry and student-made per `PRODUCT.md`.
- Flag any dark pattern (fake urgency, nagging push prompts, manipulative install prompts) with Intent's anti-pattern catalog. This is a campus utility and should not use growth tricks.
