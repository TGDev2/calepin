/**
 * @calepin/direction — three divergent novel directions
 *
 * Public surface of the domain. Everything other workspaces are allowed to use
 * is re-exported from here; nothing reaches into `src/` directly.
 *
 * Backlog: E08 — CAL-079 to CAL-087
 */

export {
  checkDirectionDivergence,
  checkDirectionProposalDivergence,
  compareNarrativeEngines,
  type DirectionDivergenceReport,
  type DirectionEngineComparison,
  NARRATIVE_ENGINE_DIVERGENCE_MINIMUM,
  type NarrativeEngineComparison,
} from "./divergence";
export {
  CONFLICT_NATURES,
  type ConflictNature,
  describeNarrativeEngine,
  describeNarrativeEngineAxes,
  NARRATIVE_ENGINE_AXES,
  NARRATIVE_ENGINE_COPY,
  type NarrativeEngine,
  type NarrativeEngineAxis,
  narrativeEngineSchema,
  PROTAGONIST_STAKES,
  type ProtagonistStake,
  RESOLUTION_NATURES,
  type ResolutionNature,
  SHIFT_TRIGGERS,
  type ShiftTrigger,
  TENSION_SOURCES,
  type TensionSource,
} from "./narrative-engine";
export {
  checkDirectionProposalCompliance,
  DIRECTION_CHAR_CEILINGS,
  DIRECTION_LABEL_CHAR_CEILING,
  DIRECTION_LIST_COUNTS,
  DIRECTION_PROPOSAL_COUNT,
  DIRECTION_WORD_TARGETS,
  directionDimensionClaims,
  type DirectionDimensionTreatments,
  type DirectionProposal,
  type DirectionProposals,
  directionProposalsSchema,
} from "./proposals";
