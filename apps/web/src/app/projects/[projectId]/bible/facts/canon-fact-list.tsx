/**
 * One card per fact, read the same way round the form asks for it (CAL-098).
 *
 * The three dimensions are three lines: the statement with what the world holds
 * about it, when it holds, and who holds what. The stance line shows the stance
 * *and* what it amounts to — *croit l'énoncé vrai — le sait* — because the
 * second half is the one that makes the row readable at a glance and it flips
 * with the fact's own truth.
 *
 * A `REJECTED` fact is dimmed rather than hidden, as it already is on the bible
 * screen: the row is kept so a later extraction can recognise the statement
 * instead of proposing it again, and hiding it would look like the fact had
 * never existed rather than like the author had ruled on it.
 *
 * A locked fact shows no edit form at all. Its lock is lifted from the controls
 * beside it, which is CAL-095's rule read on screen: the way past a lock is a
 * decision a person makes, never a box they tick on the way to writing.
 */

import type { CanonFactBeliefState, CanonFactValidity } from "@calepin/bible";
import type { BibleCanonFactRow } from "@calepin/shared/repository";

import { LockBadge } from "@/components/lock-badge";
import { describeStance } from "@/lib/canon-fact-edit";

import { CanonFactControls } from "./canon-fact-controls";
import {
  type CanonFactAction,
  type CanonFactDefaults,
  CanonFactForm,
  type NamedRow,
  type PrecisionOption,
  type StanceOption,
} from "./canon-fact-form";
import styles from "./canon-fact-list.module.css";

export interface CanonFactStanceView {
  readonly characterId: string;
  readonly characterName: string;
  readonly state: CanonFactBeliefState;
}

export interface CanonFactCardView {
  readonly id: string;
  readonly statement: string;
  readonly isTrue: boolean;
  readonly validity: CanonFactValidity;
  readonly status: BibleCanonFactRow["status"];
  readonly statusLabel: string;
  readonly sourceLabel: string;
  readonly whenLabel: string;
  readonly validityLabel: string;
  readonly lockedAt: Date | null;
  readonly deletable: boolean;
  readonly stances: readonly CanonFactStanceView[];
  readonly subjectNames: readonly string[];
  readonly atomicityAdvice: readonly string[];
  readonly defaults: CanonFactDefaults;
  /** Every character the fact concerns or records a stance for — the filter's. */
  readonly characterIds: readonly string[];
}

export interface CanonFactListProps {
  readonly projectId: string;
  readonly facts: readonly CanonFactCardView[];
  readonly filtered: boolean;
  readonly cast: readonly NamedRow[];
  readonly places: readonly NamedRow[];
  readonly events: readonly NamedRow[];
  readonly precisions: readonly PrecisionOption[];
  readonly stances: readonly StanceOption[];
  readonly statementCeiling: number;
  readonly boundLabelCeiling: number;
  readonly editAction: CanonFactAction;
  readonly statusAction: CanonFactAction;
  readonly lockAction: CanonFactAction;
  readonly unlockAction: CanonFactAction;
  readonly deleteAction: CanonFactAction;
}

export function CanonFactList({
  projectId,
  facts,
  filtered,
  cast,
  places,
  events,
  precisions,
  stances,
  statementCeiling,
  boundLabelCeiling,
  editAction,
  statusAction,
  lockAction,
  unlockAction,
  deleteAction,
}: CanonFactListProps) {
  if (facts.length === 0) {
    return (
      <p className={styles.empty}>
        {filtered
          ? "Aucun fait ne répond à ce filtre. Élargissez-le, ou écrivez ce fait-là."
          : "Aucun fait n'a encore été établi. Le premier s'écrit juste en dessous."}
      </p>
    );
  }

  return (
    <ul className={styles.list} aria-label="Faits canoniques">
      {facts.map((fact) => (
        <li
          key={fact.id}
          className={fact.status === "REJECTED" ? styles.cardRejected : styles.card}
        >
          <p className={styles.statement}>
            {fact.statement}
            {fact.isTrue ? null : <span className={styles.meta}> — faux dans le roman</span>}
          </p>

          <p className={styles.meta}>{fact.whenLabel}</p>

          <p className={styles.meta}>
            {fact.statusLabel} · {fact.sourceLabel}
            {fact.lockedAt === null ? null : (
              <>
                {" "}
                <LockBadge variant="locked" />
              </>
            )}
          </p>

          {fact.subjectNames.length === 0 ? null : (
            <p className={styles.meta}>Concerne&nbsp;: {fact.subjectNames.join(", ")}</p>
          )}

          {fact.stances.length === 0 ? null : (
            <ul className={styles.stances}>
              {fact.stances.map((stance) => (
                <li key={stance.characterId}>
                  <strong>{stance.characterName}</strong> {describeStance(fact.isTrue, stance.state)}
                </li>
              ))}
            </ul>
          )}

          {fact.atomicityAdvice.length === 0 ? null : (
            <p className={styles.advice}>
              Cet énoncé en dit peut-être plusieurs à la fois&nbsp;: {fact.atomicityAdvice.join(" ; ")}.
              Le couper en faits séparés rendra les contrôles de cohérence plus sûrs — mais rien ne
              vous y oblige.
            </p>
          )}

          {fact.lockedAt === null ? (
            <details className={styles.editor}>
              <summary>Modifier ce fait</summary>

              <CanonFactForm
                projectId={projectId}
                factId={fact.id}
                cast={cast}
                places={places}
                events={events}
                precisions={precisions}
                stances={stances}
                statementCeiling={statementCeiling}
                boundLabelCeiling={boundLabelCeiling}
                defaults={fact.defaults}
                submitLabel="Enregistrer"
                action={editAction}
              />
            </details>
          ) : (
            <p className={styles.meta}>
              Ce fait est verrouillé&nbsp;: aucune génération ne le modifiera, et vous non plus tant
              que le verrou n&rsquo;est pas levé.
            </p>
          )}

          <CanonFactControls
            projectId={projectId}
            factId={fact.id}
            status={fact.status}
            locked={fact.lockedAt !== null}
            deletable={fact.deletable}
            statusAction={statusAction}
            lockAction={lockAction}
            unlockAction={unlockAction}
            deleteAction={deleteAction}
          />
        </li>
      ))}
    </ul>
  );
}
