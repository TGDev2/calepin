# @calepin/direction

Exploration of three **divergent** novel directions derived from the validated
analysis, twelve attributes each. Divergence is measured on narrative-engine
axes, not on surface detail. One direction eventually becomes canonical.

Also covers critique of a direction, replacement, combination, author-written
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
- `evaluation.ts` (CAL-081) — the `evaluate-direction` contract:
  `directionEvaluationSchema` (four argued lists — promises, shortfalls,
  conventions, comparative weaknesses — no synthesis field, no numeric field
  anywhere), the element anchor pinned to the proposal schema's own keys,
  and `verifyDirectionEvaluationEvidence`, which reads every quotation
  against the source text and the direction's own prose and brands what it
  returns.
- `replacement.ts` (CAL-083) — the `replace-direction` contract: the discard
  reason and its ceiling (`parseDirectionDiscardReason`), the ask
  (`directionReplacementInputSchema`, what `Generation.input` stores), the
  answer (`directionReplacementSchema` — one direction, the proposal's own
  shape), and the exclusion gate `checkDirectionReplacement`: a candidate
  reproducing the engine of the discarded direction or of either kept one is
  refused, on `divergence.ts`'s comparison and nothing new.
- `combination.ts` (CAL-084) — the `combine-directions` contract: the
  selectable elements (`DIRECTION_COMBINABLE_ELEMENTS` — the proposal's
  material, never its self-descriptions), the slot vocabulary that names a
  source direction without a number or an id, the ask
  (`directionCombinationInputSchema`, canonical so one ask digests once), the
  answer (`directionCombinationSchema` — one strict object whose `outcome`
  decides which required-but-nullable branch is non-null: a merged direction
  of the proposal's own shape, or the conflicts that make the combination
  irreducible), and two gates: `checkDirectionCombinationSelection` refuses
  two selected engines that are distinct before anything is generated, and
  `checkDirectionCombinationAnswer` demands one dominant source engine —
  never the blend between two — and verifies every named conflict against
  the ask's own selection.

Backlog: E08 — CAL-079 to CAL-087. Schema: CAL-015.
