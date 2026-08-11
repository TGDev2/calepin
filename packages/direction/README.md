# @calepin/direction

Exploration of three **divergent** novel directions derived from the validated
analysis, twelve attributes each. Divergence is measured on narrative-engine
axes, not on surface detail. One direction eventually becomes canonical.

Also covers critique of a direction, replacement, merging, author-written
directions and history.

What exists today:

- `proposals.ts` (CAL-079) — the `propose-directions` contract:
  `directionProposalsSchema` (exactly three directions, the twelve
  `CreativeDirection` attributes plus the per-dimension treatment
  declaration and the narrative-engine declaration), its word-target
  constants, and `checkDirectionProposalCompliance` over
  `@calepin/shared/freedom-level`.
- `narrative-engine.ts` (CAL-080) — the operational definition of a
  narrative engine: five closed axes (nature of the conflict, source of the
  tension, what the protagonist risks, what triggers the turn, nature of the
  resolution), their French copy, and the description helpers prompts and
  screens quote.
- `divergence.ts` (CAL-080) — the divergence gate: two engines differing on
  fewer than `NARRATIVE_ENGINE_DIVERGENCE_MINIMUM` axes are one engine;
  `checkDirectionDivergence` reports collisions, the retained directions and
  the slots a targeted relaunch re-asks.

Backlog: E08 — CAL-079 to CAL-087. Schema: CAL-015.
