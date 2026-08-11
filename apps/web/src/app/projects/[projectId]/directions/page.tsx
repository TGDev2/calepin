import {
  checkDirectionDivergence,
  DIRECTION_ELEMENT_LABELS,
  DIRECTION_EVALUATION_LISTS,
  type DirectionElement,
  type DirectionEvaluationList,
  directionEvaluationSchema,
  NARRATIVE_ENGINE_AXES,
  NARRATIVE_ENGINE_COPY,
  type NarrativeEngine,
  type NarrativeEngineAxis,
  narrativeEngineSchema,
} from "@calepin/direction";
import {
  type DirectionSnapshot,
  getDirectionsForComparison,
  getProjectForOwner,
  openProjectScope,
} from "@calepin/shared/repository";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import { signInDestination } from "@/lib/sign-in-redirect";

import {
  type DirectionCard,
  DirectionComparisonGrid,
  type EngineAxisRow,
  type EvaluationItem,
  type EvaluationList,
} from "./direction-comparison-grid";
import styles from "./page.module.css";

const ORIGIN_LABEL: Record<DirectionSnapshot["origin"], string> = {
  PROPOSED: "Proposée",
  EDITED: "Modifiée",
  USER_WRITTEN: "Rédigée par l'autrice ou l'auteur",
};

const EVALUATION_LIST_TITLE: Record<DirectionEvaluationList, string> = {
  promises: "Ce qu'elle promet",
  shortfalls: "Ce qu'elle risque de ne pas tenir",
  conventions: "Ce qui y est convenu",
  comparativeWeaknesses: "Pourquoi elle peut être moins intéressante",
};

/**
 * Side-by-side comparison of the directions proposed for a project (CAL-082).
 *
 * **Read-only, and deliberately so.** No mission executor exists yet to
 * produce a direction, a narrative engine or a critique (CLAUDE.md §13), so
 * this screen shows whatever has been written to the three tables — nothing
 * here writes back. `getDirectionsForComparison` reads as a bare array,
 * `analysis/page.tsx`'s convention: no directions yet is a legitimate state,
 * not a failure.
 *
 * **The divergence is computed here, not stored.** `checkDirectionDivergence`
 * is the same function CAL-080's gate uses — this screen is exactly the
 * consumer its own doc comment names. An axis is flagged the moment any pair
 * of directions differs on it, which is what "mise en évidence des axes où
 * leurs moteurs narratifs diffèrent" asks for read at a glance rather than
 * pair by pair.
 */
export default async function DirectionsPage({
  params,
}: PageProps<"/projects/[projectId]/directions">) {
  const { projectId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(`/projects/${projectId}/directions`));

  const [found, scope] = await Promise.all([
    getProjectForOwner({ ownerId: user.id, projectId }),
    openProjectScope({ ownerId: user.id, projectId }),
  ]);
  if (!found.ok || !scope.ok) notFound();

  const directions = await getDirectionsForComparison(scope.value);

  const withEngines = directions.map((direction) => ({
    direction,
    engine: narrativeEngineSchema.parse(direction.narrativeEngine),
  }));
  const divergence = checkDirectionDivergence(withEngines.map(({ engine }) => engine));
  const divergentAxes = new Set(divergence.comparisons.flatMap((pair) => pair.differingAxes));

  const cards = withEngines.map(({ direction, engine }) =>
    toCard(direction, engine, divergentAxes),
  );

  return (
    <main className={styles.main}>
      <p className={styles.back}>
        <Link href={`/projects/${projectId}`}>← {found.value.title}</Link>
      </p>

      <h1 className={styles.title}>Comparaison des directions romanesques</h1>

      {cards.length === 0 ? (
        <p className={styles.empty}>
          Aucune direction n&apos;a encore été proposée pour ce projet.
        </p>
      ) : (
        <>
          <p className={styles.intro}>
            {cards.length < 2
              ? "Une seule direction a été proposée pour ce projet."
              : divergence.divergent
                ? "Les moteurs narratifs des directions diffèrent suffisamment : elles ne varient pas seulement par le décor."
                : "Attention : au moins deux directions partagent le même moteur narratif — elles varient surtout par le décor."}
          </p>

          <DirectionComparisonGrid cards={cards} />
        </>
      )}
    </main>
  );
}

/**
 * One axis's label and this engine's value on it — a switch rather than
 * `NARRATIVE_ENGINE_COPY[axis].members[engine[axis]]`, which TypeScript
 * cannot narrow across a union this wide without a cast (§6 forbids one).
 */
function engineAxisRow(
  axis: NarrativeEngineAxis,
  engine: NarrativeEngine,
  divergent: boolean,
): EngineAxisRow {
  switch (axis) {
    case "conflictNature":
      return {
        axis,
        divergent,
        axisLabel: NARRATIVE_ENGINE_COPY.conflictNature.label,
        valueLabel: NARRATIVE_ENGINE_COPY.conflictNature.members[engine.conflictNature],
      };
    case "tensionSource":
      return {
        axis,
        divergent,
        axisLabel: NARRATIVE_ENGINE_COPY.tensionSource.label,
        valueLabel: NARRATIVE_ENGINE_COPY.tensionSource.members[engine.tensionSource],
      };
    case "protagonistStake":
      return {
        axis,
        divergent,
        axisLabel: NARRATIVE_ENGINE_COPY.protagonistStake.label,
        valueLabel: NARRATIVE_ENGINE_COPY.protagonistStake.members[engine.protagonistStake],
      };
    case "shiftTrigger":
      return {
        axis,
        divergent,
        axisLabel: NARRATIVE_ENGINE_COPY.shiftTrigger.label,
        valueLabel: NARRATIVE_ENGINE_COPY.shiftTrigger.members[engine.shiftTrigger],
      };
    case "resolutionNature":
      return {
        axis,
        divergent,
        axisLabel: NARRATIVE_ENGINE_COPY.resolutionNature.label,
        valueLabel: NARRATIVE_ENGINE_COPY.resolutionNature.members[engine.resolutionNature],
      };
  }
}

function toCard(
  direction: DirectionSnapshot,
  engine: NarrativeEngine,
  divergentAxes: ReadonlySet<(typeof NARRATIVE_ENGINE_AXES)[number]>,
): DirectionCard {
  const engineRows: EngineAxisRow[] = NARRATIVE_ENGINE_AXES.map((axis) =>
    engineAxisRow(axis, engine, divergentAxes.has(axis)),
  );

  return {
    id: direction.id,
    workingTitle: direction.workingTitle,
    developedPremise: direction.developedPremise,
    dominantGenre: direction.dominantGenre,
    mainConflict: direction.mainConflict,
    protagonistArc: direction.protagonistArc,
    newStakes: direction.newStakes,
    charactersToIntroduce: direction.charactersToIntroduce,
    endingNature: direction.endingNature,
    mainRisks: direction.mainRisks,
    elementsKeptFromSource: direction.elementsKeptFromSource,
    elementsTransformed: direction.elementsTransformed,
    novelPotentialAssessment: direction.novelPotentialAssessment,
    isCanonical: direction.isCanonical,
    originLabel: ORIGIN_LABEL[direction.origin],
    engineRows,
    evaluationLists: direction.evaluation === null ? null : toEvaluationLists(direction.evaluation),
  };
}

function toEvaluationLists(evaluation: {
  readonly promises: unknown;
  readonly shortfalls: unknown;
  readonly conventions: unknown;
  readonly comparativeWeaknesses: unknown;
}): readonly EvaluationList[] {
  // The schema is strict, and the snapshot's `createdAt` is not one of its
  // fields — only the four lists cross into the domain's contract.
  const parsed = directionEvaluationSchema.parse({
    promises: evaluation.promises,
    shortfalls: evaluation.shortfalls,
    conventions: evaluation.conventions,
    comparativeWeaknesses: evaluation.comparativeWeaknesses,
  });

  return DIRECTION_EVALUATION_LISTS.map((list) => ({
    key: list,
    title: EVALUATION_LIST_TITLE[list],
    items: listItems(list, parsed),
  }));
}

function listItems(
  list: DirectionEvaluationList,
  parsed: ReturnType<typeof directionEvaluationSchema.parse>,
): readonly EvaluationItem[] {
  switch (list) {
    case "promises":
      return parsed.promises.map((item) => toItem(item, item.whatItCommitsTo));
    case "shortfalls":
      return parsed.shortfalls.map((item) => toItem(item, item.whyAtRisk));
    case "conventions":
      return parsed.conventions.map((item) => toItem(item, item.whyConventional));
    case "comparativeWeaknesses":
      return parsed.comparativeWeaknesses.map((item) => toItem(item, item.whyLessInteresting));
  }
}

function toItem(
  item: {
    readonly label: string;
    readonly element: DirectionElement;
    readonly evidence: string | null;
  },
  argument: string,
): EvaluationItem {
  return {
    label: item.label,
    elementLabel: DIRECTION_ELEMENT_LABELS[item.element],
    evidence: item.evidence,
    argument,
  };
}
