/**
 * The estimate shown before a costly operation, in French (CAL-057).
 *
 * Composition, which is what this layer is for (§3.3). Three things meet here
 * and nowhere else:
 *
 * - **The two spellings of a mission.** `@calepin/ai` names missions in
 *   kebab-case (`write-scene`), the schema names them in the enum's own
 *   spelling (`WRITE_SCENE`), and neither package can see the other's — the AI
 *   layer must not import Prisma, and `@calepin/shared` must not import the AI
 *   layer (§3.2). `apps/web` imports both, so the join belongs here, and its
 *   test pins it total in both directions.
 * - **The money and the wait, as a reader reads them.** Packages hold no
 *   display strings; the tariff is in USD and there is no exchange rate in the
 *   product, so the currency is named rather than converted.
 * - **The acknowledgement, read back off the form.** What the author confirmed
 *   has to survive the round trip to be checked against what the operation now
 *   costs; parsing it is the interface layer's half of that check.
 */

import {
  COSTLY_OPERATION_IDS,
  type CostlyOperationId,
  type MissionId,
  type MissionMeasurement,
  type OperationAcknowledgement,
  type OperationEstimateBasis,
  type OperationPhaseKind,
  type OperationUnit,
} from "@calepin/ai";
import type {
  GenerationMission,
  MissionMeasurement as RecordedMissionMeasurement,
} from "@calepin/shared/repository";

/**
 * The one translation between the schema's spelling of a mission and the AI
 * layer's. Both lists are closed and the same length; `costly-operation.test.ts`
 * proves this table is total over each of them, so a mission added to one
 * without the other fails there rather than at a call site.
 */
export const MISSION_ID_BY_GENERATION_MISSION = {
  ANALYZE_SOURCE_TEXT: "analyze-source-text",
  DETECT_CLICHE_RISKS: "detect-cliche-risks",
  ASSESS_NOVEL_POTENTIAL: "assess-novel-potential",
  REGENERATE_ANALYSIS_SECTION: "regenerate-analysis-section",
  PROPOSE_DIRECTIONS: "propose-directions",
  EVALUATE_DIRECTION: "evaluate-direction",
  CREATE_CHARACTER_SHEET: "create-character-sheet",
  BUILD_CHAPTER_OUTLINE: "build-chapter-outline",
  WRITE_SCENE: "write-scene",
  EXTRACT_FACTS: "extract-facts",
  CHECK_COHERENCE: "check-coherence",
  FIX_ISSUE: "fix-issue",
  SUMMARIZE_CHAPTER: "summarize-chapter",
  SUMMARIZE_PART: "summarize-part",
} as const satisfies Record<GenerationMission, MissionId>;

/**
 * The same table read the other way. Derived rather than written twice — two
 * hand-kept halves are two chances to disagree — and pinned total by the test,
 * which is what stands behind the assertion below it.
 */
export const GENERATION_MISSION_BY_MISSION_ID = Object.fromEntries(
  Object.entries(MISSION_ID_BY_GENERATION_MISSION).map(([mission, id]) => [id, mission]),
) as Record<MissionId, GenerationMission>;

/** What the project has measured, in the spelling the estimator takes. */
export function toMissionMeasurements(
  recorded: readonly RecordedMissionMeasurement[],
): readonly MissionMeasurement[] {
  return recorded.map((row) => ({
    mission: MISSION_ID_BY_GENERATION_MISSION[row.mission],
    sampleCount: row.sampleCount,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    durationMs: row.durationMs,
  }));
}

/**
 * Unit-neutral on purpose: the same operation covers one chapter and eleven,
 * and the count is said beside the name rather than baked into it.
 */
const OPERATION_LABELS: Record<CostlyOperationId, string> = {
  "generate-outline": "Génération du plan",
  "write-chapter": "Rédaction de chapitre",
  "regenerate-chapter": "Régénération de chapitre",
  "audit-manuscript": "Audit de cohérence",
};

export function costlyOperationLabel(operation: CostlyOperationId): string {
  return OPERATION_LABELS[operation];
}

const PHASE_KIND_LABELS: Record<OperationPhaseKind, string> = {
  production: "Production",
  analysis: "Analyse",
  control: "Contrôle",
};

export function operationPhaseKindLabel(kind: OperationPhaseKind): string {
  return PHASE_KIND_LABELS[kind];
}

/**
 * What the number is made of, said plainly. An author deciding whether to spend
 * this is entitled to know whether it comes from their own runs or from a
 * table.
 */
const BASIS_LABELS: Record<OperationEstimateBasis, string> = {
  measured: "Estimation fondée sur vos générations précédentes.",
  mixed:
    "Estimation fondée en partie sur vos générations précédentes, en partie sur les valeurs de référence.",
  theoretical:
    "Estimation de référence : ce projet n'a pas encore d'opération comparable à laquelle se fier.",
};

export function operationEstimateBasisLabel(basis: OperationEstimateBasis): string {
  return BASIS_LABELS[basis];
}

/**
 * What the operation is applied to. French keeps the singular for zero and for
 * one, so the rule is `count > 1` — the same one `account/delete` records.
 */
export function operationScaleLabel(unit: OperationUnit, unitCount: number): string {
  if (unit === "project") return "l'ensemble du projet";

  return unitCount > 1 ? `${unitCount} chapitres` : `${unitCount} chapitre`;
}

const COST_FORMAT = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

/**
 * The estimate in money. Rounded to the cent for reading, and never rounded
 * *down to nothing*: an operation that costs something must not be shown as
 * free, or the next one that costs something will not be read either.
 */
export function formatEstimatedCost(costUsd: string): string {
  const amount = Number(costUsd);

  if (!Number.isFinite(amount) || amount <= 0) return COST_FORMAT.format(0);
  if (amount < 0.01) return `moins de ${COST_FORMAT.format(0.01)}`;

  return COST_FORMAT.format(amount);
}

/**
 * The estimate in time, at the resolution it is worth stating. Minutes, not
 * seconds: the number is a forecast of a model's pace, and a second of
 * precision on it would be a false one.
 */
export function formatEstimatedDuration(durationMs: number): string {
  // A full minute, not a rounded one: half a minute rounds up to "1 min", and
  // saying "moins d'une minute" of anything under one is the plainer claim.
  if (!Number.isFinite(durationMs) || durationMs < 60_000) return "moins d'une minute";

  const totalMinutes = Math.round(durationMs / 60_000);

  if (totalMinutes < 60) return `${totalMinutes} min`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes === 0 ? `${hours} h` : `${hours} h ${String(minutes).padStart(2, "0")}`;
}

/** The field names the panel posts its acknowledgement under. */
export const ACKNOWLEDGEMENT_FIELDS = {
  operation: "operation",
  unitCount: "unitCount",
  costUsd: "costUsd",
  durationMs: "durationMs",
} as const;

function isCostlyOperationId(value: string): value is CostlyOperationId {
  return (COSTLY_OPERATION_IDS as readonly string[]).includes(value);
}

function readString(formData: FormData, name: string): string | null {
  const field = formData.get(name);

  return typeof field === "string" ? field : null;
}

/**
 * What the author confirmed, read back off their form — or `null` when the
 * submission carries no usable acknowledgement at all.
 *
 * Nothing here is trusted: the values arrive from the client and are checked
 * for shape only. Whether they are still *true* is `acceptOperationEstimate`'s
 * question, and it is asked against an estimate recomputed on the server.
 */
export function readOperationAcknowledgement(formData: FormData): OperationAcknowledgement | null {
  const operation = readString(formData, ACKNOWLEDGEMENT_FIELDS.operation);
  const unitCount = readString(formData, ACKNOWLEDGEMENT_FIELDS.unitCount);
  const costUsd = readString(formData, ACKNOWLEDGEMENT_FIELDS.costUsd);
  const durationMs = readString(formData, ACKNOWLEDGEMENT_FIELDS.durationMs);

  if (operation === null || unitCount === null || costUsd === null || durationMs === null) {
    return null;
  }

  if (!isCostlyOperationId(operation)) return null;

  const units = Number(unitCount);
  const duration = Number(durationMs);

  if (!Number.isInteger(units) || !Number.isInteger(duration)) return null;

  return { operation, unitCount: units, costUsd, durationMs: duration };
}
