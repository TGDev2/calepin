import {
  checkDirectionDivergence,
  DIRECTION_DISCARD_REASON_CHAR_CEILING,
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
  readCanonicalDirectionObsolescence,
} from "@calepin/shared/repository";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  DirectionChangeWarning,
  DirectionObsolescenceNotice,
} from "@/components/obsolescence-notice";
import { getCurrentUser } from "@/lib/current-user";
import { signInDestination } from "@/lib/sign-in-redirect";

import { writeUserDirectionAction } from "./actions";
import {
  type DirectionCard,
  DirectionComparisonGrid,
  type EngineAxisRow,
  type EvaluationItem,
  type EvaluationList,
} from "./direction-comparison-grid";
import { DirectionForm, EMPTY_DIRECTION_FORM_VALUES } from "./direction-form";
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
 * Side-by-side comparison of the directions proposed for a project (CAL-082),
 * and the ones the author has written off (CAL-083).
 *
 * **One write, and only one.** No mission executor exists yet to produce a
 * direction, a narrative engine or a critique (CLAUDE.md §13), so nothing here
 * generates anything — there is deliberately no *générer un remplacement*
 * button, because a button that cannot produce an answer is not a feature.
 * What CAL-083 does ship end to end is the author's half: écarter a proposal,
 * with their reason, and find it afterwards. `getDirectionsForComparison`
 * reads as a bare array, `analysis/page.tsx`'s convention: no directions yet
 * is a legitimate state, not a failure.
 *
 * **The comparison is between the directions that still stand.** A discarded
 * one is out of the grid, out of `checkDirectionDivergence` and out of the
 * highlight — it is no longer one of the proposals being weighed, and leaving
 * its engine in would colour an axis the author can no longer choose on. It is
 * not out of the page: every direction the project has ever held, standing or
 * discarded, is read back in `getDirectionsForComparison`'s own order and
 * shown whole in « Historique des directions » below, with its origin, its
 * dates and — for a discarded one — what the author said about it (CAL-087).
 * There is no column linking a discarded direction to whatever replaced it,
 * so the history states what happened to each row rather than inventing that
 * link.
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

  const [directions, obsolescence] = await Promise.all([
    getDirectionsForComparison(scope.value),
    readCanonicalDirectionObsolescence(scope.value),
  ]);

  // What a change would leave behind, read once and shown twice: as the
  // standing report for the direction already retained, and inside every
  // *Retenir* form as the warning the repository refuses a change without.
  const impact = obsolescence.ok ? obsolescence.value : null;

  const withEngines = directions.map((direction) => ({
    direction,
    engine: narrativeEngineSchema.parse(direction.narrativeEngine),
  }));

  const standing = withEngines.filter(({ direction }) => direction.discardedAt === null);
  const discarded = withEngines.filter(({ direction }) => direction.discardedAt !== null);

  const divergence = checkDirectionDivergence(standing.map(({ engine }) => engine));
  const divergentAxes = new Set(divergence.comparisons.flatMap((pair) => pair.differingAxes));

  const cards = standing.map(({ direction, engine }) => toCard(direction, engine, divergentAxes));

  return (
    <main className={styles.main}>
      <p className={styles.back}>
        <Link href={`/projects/${projectId}`}>← {found.value.title}</Link>
      </p>

      <h1 className={styles.title}>Comparaison des directions romanesques</h1>

      {impact === null ? null : <DirectionObsolescenceNotice report={impact.current} />}

      {cards.length === 0 ? (
        <p className={styles.empty}>
          {discarded.length === 0
            ? "Aucune direction n'a encore été proposée pour ce projet."
            : "Toutes les directions proposées ont été écartées."}
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

          <DirectionComparisonGrid
            cards={cards}
            projectId={projectId}
            reasonCharCeiling={DIRECTION_DISCARD_REASON_CHAR_CEILING}
            hasDownstreamWork={impact?.onChange.hasObsoleteStages ?? false}
            changeWarning={
              impact === null ? null : <DirectionChangeWarning report={impact.onChange} />
            }
          />
        </>
      )}

      {directions.length === 0 ? null : (
        <section className={styles.history} aria-labelledby="directions-history">
          <h2 className={styles.historyTitle} id="directions-history">
            Historique des directions
          </h2>
          <p className={styles.historyIntro}>
            Aucune direction produite n&apos;est perdue : chacune reste consultable ici,
            qu&apos;elle soit encore en comparaison, retenue, modifiée ou écartée.
          </p>

          <ul className={styles.historyList}>
            {withEngines.map(({ direction, engine }) => (
              <li key={direction.id} className={styles.historyItem}>
                <h3 className={styles.historyItemTitle}>{direction.workingTitle}</h3>
                <p className={styles.historyMeta}>
                  {direction.dominantGenre} · {ORIGIN_LABEL[direction.origin]} · créée le{" "}
                  {formatFrenchDate(direction.createdAt)}
                </p>
                <p className={styles.historyMeta}>{historyStatus(direction)}</p>

                {direction.discardedAt === null ? null : direction.discardReason === null ? (
                  <p className={styles.historyNoReason}>Écartée sans commentaire.</p>
                ) : (
                  <blockquote className={styles.historyReason}>
                    {direction.discardReason}
                  </blockquote>
                )}

                <dl className={styles.historyEngine}>
                  {NARRATIVE_ENGINE_AXES.map((axis) => {
                    const row = engineAxisRow(axis, engine, false);

                    return (
                      <div key={axis} className={styles.historyEngineRow}>
                        <dt>{row.axisLabel}</dt>
                        <dd>{row.valueLabel}</dd>
                      </div>
                    );
                  })}
                </dl>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.history} aria-labelledby="directions-new">
        <details>
          <summary className={styles.historyTitle} id="directions-new">
            Écrire ma propre direction
          </summary>
          <p className={styles.historyIntro}>
            Une direction que vous rédigez entièrement vous-même compte comme les autres : elle peut
            être comparée, écartée, et retenue pour la bible.
          </p>

          <DirectionForm
            action={writeUserDirectionAction}
            projectId={projectId}
            initialValues={EMPTY_DIRECTION_FORM_VALUES}
            submitLabel="Ajouter cette direction"
            idPrefix="new-direction"
          />
        </details>
      </section>
    </main>
  );
}

/** A date the way a reader reads it — never a timestamp. */
function formatFrenchDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * What stands true of a direction today, for the history's own status line.
 *
 * Deliberately not the grid's own "Direction canonique" badge text: two e2e
 * journeys (`directions-canonical.spec.ts`) count that exact string once on
 * the page to prove the badge lands on a single card, and this history entry
 * sits on the same page.
 */
function historyStatus(direction: DirectionSnapshot): string {
  if (direction.isCanonical) return "Direction retenue";
  if (direction.discardedAt !== null) {
    return `Écartée le ${formatFrenchDate(direction.discardedAt)}`;
  }

  return "En comparaison";
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
    narrativeEngine: engine,
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
