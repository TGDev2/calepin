/**
 * The freedom level, from a stored preference to an enforceable rule (CAL-044).
 *
 * `./policy` is the table everything else is derived from; `./constraints`
 * turns it into the clauses a mission is held to; `./compliance` checks a
 * generated artefact against it; `./copy` is the French both the author and —
 * once CAL-053 exists — the prompt see.
 */

export {
  checkFreedomCompliance,
  type DimensionClaim,
  type FreedomComplianceReport,
  type FreedomViolation,
  sourceDeparture,
} from "./compliance";
export {
  allFreedomConstraints,
  FREEDOM_CONSTRAINED_STAGES,
  type FreedomConstrainedStage,
  type FreedomConstraint,
  freedomConstraints,
  isFreedomConstrainedStage,
  preservedDimensionLabels,
} from "./constraints";
export {
  DIMENSION_TREATMENT_LABELS,
  FREEDOM_LEVEL_COPY,
  type FreedomLevelCopy,
  freedomLevelCopy,
  type FreedomLevelSummaryGroup,
  SOURCE_DIMENSION_LABELS,
  summarizeFreedomLevel,
} from "./copy";
export {
  DIMENSION_TREATMENTS,
  type DimensionTreatment,
  isDimensionTreatment,
  isSourceDimension,
  permitsTreatment,
  SOURCE_DIMENSIONS,
  type SourceDimension,
  treatmentRank,
} from "./dimensions";
export { FREEDOM_LEVELS, type FreedomLevel, freedomLevelRank, isFreedomLevel } from "./levels";
export {
  dimensionsTreatedAs,
  FREEDOM_LEVEL_POLICIES,
  type FreedomLevelPolicy,
  freedomLevelPolicy,
  sourceDepartureBudget,
  treatmentFor,
} from "./policy";
