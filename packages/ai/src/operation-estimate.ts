/**
 * The estimate shown before a costly operation, and the confirmation that
 * unlocks it (CAL-057).
 *
 * Two things live here, because they are two halves of one guarantee: nothing
 * costly starts without a price on screen, and nothing starts on a price the
 * author never saw.
 *
 * **The estimate prefers what actually happened.** For each phase of the
 * operation, a measurement of the same mission on the same project is used if
 * there is one — a real median over real generations, retries included. Only a
 * mission this project has never run falls back on the registry's declared
 * expectation. The two are never blended silently: each phase carries its own
 * `basis` and its sample count, and the operation carries the summary of them,
 * so the screen can say what the number is made of.
 *
 * **Money comes from the tariff table, never from history.** A measurement
 * carries tokens and a duration and no price. Replaying a price recorded
 * months ago would quote a tariff that has since changed, and would put a
 * second multiplication beside `estimateCostUsd` — the one function §CAL-056
 * exists to keep alone. Tokens are what was measured; the money is derived
 * from them at today's rate, every time.
 *
 * **Durations add, they do not overlap.** The phases of one operation run one
 * after another — nothing can be summarised before it is written, nothing
 * checked before it exists — so the wait an author is quoted is the sum. The
 * estimate is of the normal path: a retry, a fallback and a repair pass each
 * add to the real duration and are not forecast here, because forecasting a
 * failure as the expected case is how an estimate stops being read.
 */

import { ConflictError, fail, type Result, succeed, ValidationError } from "@calepin/shared/errors";

import { MISSION_REGISTRY } from "./mission-registry";
import type { MissionId } from "./missions";
import {
  COSTLY_OPERATION_REGISTRY,
  type CostlyOperationId,
  type OperationPhaseKind,
  type OperationUnit,
} from "./operations";
import type { TokenUsage } from "./port";
import { estimateCostUsd, sumCostUsd } from "./pricing";

/**
 * What one mission cost the last times this project ran it — the *mesure
 * comparable*, gathered by `readMissionMeasurements` in
 * `@calepin/shared/repository` and handed in, because this layer never reads a
 * database (§5.6).
 *
 * One call's worth: the median over the project's succeeded generations of
 * that mission, each generation counted with everything its attempts consumed.
 */
export interface MissionMeasurement {
  readonly mission: MissionId;
  /** Generations the median was taken over. Zero means there is no measurement. */
  readonly sampleCount: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly durationMs: number;
}

/** Where a phase's numbers came from. */
export const ESTIMATE_BASES = ["measured", "theoretical"] as const;

export type EstimateBasis = (typeof ESTIMATE_BASES)[number];

/** The same answer for a whole operation, which can be made of both. */
export type OperationEstimateBasis = EstimateBasis | "mixed";

export interface PhaseEstimate {
  readonly mission: MissionId;
  readonly kind: OperationPhaseKind;
  /** Calls of this mission the operation will make, over every unit. */
  readonly callCount: number;
  readonly basis: EstimateBasis;
  /** Generations behind a measured phase; zero for a theoretical one. */
  readonly sampleCount: number;
  /** Total over `callCount`, not one call's worth. */
  readonly usage: TokenUsage;
  readonly costUsd: string;
  readonly durationMs: number;
}

export interface OperationEstimate {
  readonly operation: CostlyOperationId;
  readonly unit: OperationUnit;
  readonly unitCount: number;
  readonly phases: readonly PhaseEstimate[];
  readonly basis: OperationEstimateBasis;
  readonly callCount: number;
  readonly usage: TokenUsage;
  readonly costUsd: string;
  readonly durationMs: number;
}

export interface OperationEstimateInput {
  readonly operation: CostlyOperationId;
  /** How many of the operation's own unit — chapters to write, chapters to audit. */
  readonly unitCount: number;
  /** What this project has already measured. Absent for a project with no history. */
  readonly measurements?: readonly MissionMeasurement[];
}

/** Expected, so a value: the caller — a form — is what got it wrong (§7). */
function invalidUnitCount(fieldPath: string): ValidationError {
  return new ValidationError({
    code: "VALIDATION_FAILED",
    message:
      "the number of units asked of a costly operation is not a whole number of at least one",
    userMessage:
      "Le nombre d'éléments à traiter est invalide. Reprenez la sélection, puis relancez.",
    retryable: false,
    fieldPath,
  });
}

/** A measurement is usable when it is a whole, non-negative count of something. */
function isUsable(measurement: MissionMeasurement): boolean {
  return [
    measurement.sampleCount,
    measurement.inputTokens,
    measurement.outputTokens,
    measurement.durationMs,
  ].every((value) => Number.isInteger(value) && value >= 0);
}

function measurementsByMission(
  measurements: readonly MissionMeasurement[],
): ReadonlyMap<MissionId, MissionMeasurement> {
  const usable = measurements.filter(
    (measurement) => measurement.sampleCount >= 1 && isUsable(measurement),
  );

  return new Map(usable.map((measurement) => [measurement.mission, measurement]));
}

function summarise(phases: readonly PhaseEstimate[]): OperationEstimateBasis {
  const measured = phases.filter((phase) => phase.basis === "measured").length;

  if (measured === 0) return "theoretical";

  return measured === phases.length ? "measured" : "mixed";
}

/**
 * What the operation is expected to cost and how long it is expected to take.
 *
 * The model priced is the mission's primary. Its backup is the same model on
 * the other provider and is priced identically (`MODEL_PRICING`), so a call
 * that fell back does not make this number wrong.
 */
export function estimateOperation(input: OperationEstimateInput): Result<OperationEstimate> {
  const definition = COSTLY_OPERATION_REGISTRY[input.operation];
  const { unitCount } = input;

  if (!Number.isInteger(unitCount) || unitCount < 1) return fail(invalidUnitCount("unitCount"));

  // A whole-project operation happens once. Two plans of one project are two
  // operations, each with its own estimate and its own confirmation.
  if (definition.unit === "project" && unitCount !== 1) return fail(invalidUnitCount("unitCount"));

  const measured = measurementsByMission(input.measurements ?? []);

  const phases = definition.phases.map((phase): PhaseEstimate => {
    const mission = MISSION_REGISTRY[phase.mission];
    const callCount = phase.callsPerUnit * unitCount;
    const measurement = measured.get(phase.mission);

    const perCall: TokenUsage = measurement ?? mission.expectedUsage;
    const perCallDurationMs = measurement?.durationMs ?? mission.expectedDurationMs;

    const usage: TokenUsage = {
      inputTokens: perCall.inputTokens * callCount,
      outputTokens: perCall.outputTokens * callCount,
    };

    return {
      mission: phase.mission,
      kind: phase.kind,
      callCount,
      basis: measurement ? "measured" : "theoretical",
      sampleCount: measurement?.sampleCount ?? 0,
      usage,
      costUsd: estimateCostUsd(mission.model, usage),
      durationMs: perCallDurationMs * callCount,
    };
  });

  return succeed({
    operation: input.operation,
    unit: definition.unit,
    unitCount,
    phases,
    basis: summarise(phases),
    callCount: phases.reduce((total, phase) => total + phase.callCount, 0),
    usage: {
      inputTokens: phases.reduce((total, phase) => total + phase.usage.inputTokens, 0),
      outputTokens: phases.reduce((total, phase) => total + phase.usage.outputTokens, 0),
    },
    costUsd: sumCostUsd(phases.map((phase) => phase.costUsd)),
    durationMs: phases.reduce((total, phase) => total + phase.durationMs, 0),
  });
}

/**
 * What the author confirmed — the four facts the screen put in front of them,
 * posted back with their confirmation.
 *
 * The cost and the duration are in it deliberately. Confirming an operation is
 * not confirming its name, it is accepting its price; an acknowledgement that
 * carried only the operation would be satisfied by an estimate the author
 * never saw.
 */
export interface OperationAcknowledgement {
  readonly operation: CostlyOperationId;
  readonly unitCount: number;
  readonly costUsd: string;
  readonly durationMs: number;
}

const ACCEPTED_ESTIMATE_BRAND: unique symbol = Symbol.for("calepin.AcceptedOperationEstimate");

/**
 * An estimate an author has explicitly accepted — the *confirmation explicite*
 * of CAL-057, as a type.
 *
 * Branded and mintable only by `acceptOperationEstimate`, for the reason
 * `ProjectScope` and `RenderedPrompt` are: the acceptance criterion is that no
 * costly operation starts without an estimate shown and confirmed, and a rule
 * of that shape is kept by making the launch impossible to call without the
 * proof, not by remembering to check. The task that starts a generation takes
 * one of these; there is no other way to build one.
 *
 * `Symbol.for`, not `Symbol` — a module-level symbol in `packages/*` exists
 * once per bundler chunk, and a brand minted in one chunk fails its own guard
 * in another (CLAUDE.md §12).
 */
export interface AcceptedOperationEstimate {
  readonly [ACCEPTED_ESTIMATE_BRAND]: true;
  readonly estimate: OperationEstimate;
}

/** What the acknowledgement is checked against, and what mismatching costs. */
function notConfirmed(fieldPath: string): ConflictError {
  return new ConflictError({
    code: "OPERATION_NOT_CONFIRMED",
    message: "the acknowledgement does not match the estimate it claims to confirm",
    userMessage:
      "L'estimation a changé depuis son affichage. Vérifiez la nouvelle estimation, " +
      "puis confirmez à nouveau.",
    retryable: false,
    fieldPath,
  });
}

/**
 * The estimate as it stands now, against what the author was shown — and the
 * only place an `AcceptedOperationEstimate` is made.
 *
 * A mismatch is refused rather than reconciled. Between the render and the
 * submit, new measurements can land and move the number; carrying on would
 * start an operation at a price nobody agreed to, and the remedy is cheap —
 * the screen re-renders with the estimate that is now true and asks again.
 */
export function acceptOperationEstimate(
  estimate: OperationEstimate,
  acknowledgement: OperationAcknowledgement,
): Result<AcceptedOperationEstimate> {
  if (acknowledgement.operation !== estimate.operation) return fail(notConfirmed("operation"));
  if (acknowledgement.unitCount !== estimate.unitCount) return fail(notConfirmed("unitCount"));
  if (acknowledgement.costUsd !== estimate.costUsd) return fail(notConfirmed("costUsd"));
  if (acknowledgement.durationMs !== estimate.durationMs) return fail(notConfirmed("durationMs"));

  return succeed({ [ACCEPTED_ESTIMATE_BRAND]: true, estimate });
}

/**
 * Whether a value really carries the brand — the guard that makes a plain
 * object shaped like one refusable, including one that crossed JSON.
 */
export function isAcceptedOperationEstimate(value: unknown): value is AcceptedOperationEstimate {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Partial<AcceptedOperationEstimate>)[ACCEPTED_ESTIMATE_BRAND] === true
  );
}
