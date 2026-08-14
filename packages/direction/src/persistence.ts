/**
 * A proposed direction in the shape persistence takes it (CAL-210).
 *
 * The domain half of a split §3.2 forces: `@calepin/shared` may not import a
 * domain, so `writeGeneratedDirectionsWithin` can never see this package's
 * types. `resolveSourceTextAnalysis` holds exactly this position one epic over,
 * and `resolveCharacterSheet` and `resolveBibleStyle` hold it in the bible.
 *
 * **`dimensionTreatments` is dropped, and that is the whole point of the
 * function.** The declaration is what `checkDirectionProposalCompliance` reads
 * *before* the row is written; no column stores it, for any direction, generated
 * or hand-written — `directionContentSchema` (CAL-085) already says so of the
 * manual path. Doing the dropping here, once, is what stops a write path
 * discovering it by getting an "unknown argument" from Prisma.
 *
 * Nothing else is transformed: the twelve attributes are already spelled as the
 * `CreativeDirection` columns spell them, which is what CAL-079 chose the field
 * names for.
 */

import type { NarrativeEngine } from "./narrative-engine";
import type { DirectionProposal } from "./proposals";

/**
 * One direction's column values.
 *
 * `narrativeEngine` stays a `NarrativeEngine` rather than becoming a JSON value:
 * this package may not name `Prisma.InputJsonValue` (it does not depend on
 * `@prisma/client`, and pnpm's strict layout refuses a transitive-only import),
 * so the one place the two boundaries meet is the writer's, in `@calepin/shared`.
 */
export interface ResolvedDirection {
  readonly workingTitle: string;
  readonly developedPremise: string;
  readonly dominantGenre: string;
  readonly mainConflict: string;
  readonly protagonistArc: string;
  readonly newStakes: readonly string[];
  readonly charactersToIntroduce: readonly string[];
  readonly endingNature: string;
  readonly mainRisks: readonly string[];
  readonly elementsKeptFromSource: readonly string[];
  readonly elementsTransformed: readonly string[];
  readonly novelPotentialAssessment: string;
  readonly narrativeEngine: NarrativeEngine;
}

/** One accepted proposal, as the row that will hold it. */
export function resolveDirectionProposal(proposal: DirectionProposal): ResolvedDirection {
  return {
    workingTitle: proposal.workingTitle,
    developedPremise: proposal.developedPremise,
    dominantGenre: proposal.dominantGenre,
    mainConflict: proposal.mainConflict,
    protagonistArc: proposal.protagonistArc,
    newStakes: proposal.newStakes,
    charactersToIntroduce: proposal.charactersToIntroduce,
    endingNature: proposal.endingNature,
    mainRisks: proposal.mainRisks,
    elementsKeptFromSource: proposal.elementsKeptFromSource,
    elementsTransformed: proposal.elementsTransformed,
    novelPotentialAssessment: proposal.novelPotentialAssessment,
    narrativeEngine: proposal.narrativeEngine,
  };
}

/**
 * The accepted proposals, in the order they will be written.
 *
 * Order is the caller's, and it is meaningful: `checkDirectionDivergence`
 * retains prefix-greedily, so the first listed direction is the one every later
 * one was made to differ from. `getDirectionsForComparison` reads the rows back
 * oldest first, which is that same order.
 */
export function resolveDirectionProposals(
  proposals: readonly DirectionProposal[],
): readonly ResolvedDirection[] {
  return proposals.map(resolveDirectionProposal);
}
