"use client";

/**
 * The three (or however many) direction cards, side by side on desktop and
 * stacked on tablet (CAL-082) — grid layout in `page.module.css`, this file
 * only adds the keyboard behaviour.
 *
 * **Roving tabindex over the card headers**, adapted from
 * `components/process-stepper.tsx`: exactly one header is a tab stop at a
 * time, `ArrowLeft`/`ArrowRight` (and `Up`/`Down`, since a stacked tablet
 * layout reads top to bottom) move it, `Home`/`End` jump to the ends. Read-only
 * navigable comparison, not an editor — the same shape the stepper's own doc
 * comment describes, applied to letting a keyboard user cycle between
 * directions without tabbing through every paragraph of the one in between.
 *
 * CAL-083 puts one form inside each card — écarter cette direction, with an
 * optional reason — and that is what the `event.target !== event.currentTarget`
 * guard below exists for: `onKeyDown` on the `<li>` also fires for a key
 * pressed in a field inside it, so without the guard an arrow key typed in the
 * textarea would move the focus to the next direction and take the text with
 * it off screen. The roving tabindex owns the card, not what is in it.
 */

import type { NarrativeEngine } from "@calepin/direction";
import { useActionState, useRef, useState } from "react";

import {
  type DirectionDiscardState,
  INITIAL_DIRECTION_DISCARD_STATE,
} from "@/lib/direction-discard";

import { discardDirectionAction, editDirectionAction } from "./actions";
import styles from "./direction-comparison-grid.module.css";
import { DirectionForm, type DirectionFormValues } from "./direction-form";

export interface EngineAxisRow {
  readonly axis: string;
  readonly axisLabel: string;
  readonly valueLabel: string;
  readonly divergent: boolean;
}

export interface EvaluationItem {
  readonly label: string;
  readonly elementLabel: string;
  readonly evidence: string | null;
  readonly argument: string;
}

export interface EvaluationList {
  readonly key: string;
  readonly title: string;
  readonly items: readonly EvaluationItem[];
}

export interface DirectionCard {
  readonly id: string;
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
  readonly isCanonical: boolean;
  readonly originLabel: string;
  readonly engineRows: readonly EngineAxisRow[];
  /** The raw declaration, for prefilling the edit form's five `<select>`s. */
  readonly narrativeEngine: NarrativeEngine;
  readonly evaluationLists: readonly EvaluationList[] | null;
}

export interface DirectionComparisonGridProps {
  readonly cards: readonly DirectionCard[];
  readonly projectId: string;
  /** The character ceiling the domain puts on a reason — never restated here. */
  readonly reasonCharCeiling: number;
}

const ARROW_NEXT = new Set(["ArrowRight", "ArrowDown"]);
const ARROW_PREVIOUS = new Set(["ArrowLeft", "ArrowUp"]);

export function DirectionComparisonGrid({
  cards,
  projectId,
  reasonCharCeiling,
}: DirectionComparisonGridProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const cardRefs = useRef<Array<HTMLLIElement | null>>([]);

  function focusHeader(index: number): void {
    setFocusedIndex(index);
    cardRefs.current[index]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLLIElement>, index: number): void {
    // The card owns these keys; a field inside it owns its own. Without this,
    // an arrow typed in the discard textarea would jump to the next direction.
    if (event.target !== event.currentTarget) return;

    if (ARROW_NEXT.has(event.key)) {
      event.preventDefault();
      focusHeader((index + 1) % cards.length);
    } else if (ARROW_PREVIOUS.has(event.key)) {
      event.preventDefault();
      focusHeader((index - 1 + cards.length) % cards.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusHeader(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusHeader(cards.length - 1);
    }
  }

  return (
    <ul className={styles.grid} aria-label="Directions proposées">
      {cards.map((card, index) => (
        <li
          key={card.id}
          ref={(element) => {
            cardRefs.current[index] = element;
          }}
          className={styles.card}
          tabIndex={index === focusedIndex ? 0 : -1}
          aria-label={`Direction ${index + 1} sur ${cards.length} : ${card.workingTitle}`}
          onKeyDown={(event) => handleKeyDown(event, index)}
          onFocus={() => setFocusedIndex(index)}
        >
          <div className={styles.header}>
            <h2 className={styles.workingTitle}>{card.workingTitle}</h2>
            <p className={styles.headerMeta}>
              {card.dominantGenre} · {card.originLabel}
              {card.isCanonical ? (
                <span className={styles.canonical}>
                  <CanonicalIcon /> Direction canonique
                </span>
              ) : null}
            </p>
          </div>

          <p className={styles.premise}>{card.developedPremise}</p>

          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>Conflit principal</dt>
              <dd>{card.mainConflict}</dd>
            </div>
            <div className={styles.fact}>
              <dt>Trajectoire du protagoniste</dt>
              <dd>{card.protagonistArc}</dd>
            </div>
            <div className={styles.fact}>
              <dt>Nature de la fin</dt>
              <dd>{card.endingNature}</dd>
            </div>
          </dl>

          <StringList title="Nouveaux enjeux" items={card.newStakes} />
          <StringList title="Personnages à introduire" items={card.charactersToIntroduce} />
          <StringList title="Risques principaux" items={card.mainRisks} />

          <section className={styles.section} aria-labelledby={`${card.id}-engine`}>
            <h3 className={styles.sectionTitle} id={`${card.id}-engine`}>
              Moteur narratif
            </h3>
            <dl className={styles.engine}>
              {card.engineRows.map((row) => (
                <div key={row.axis} className={styles.engineRow}>
                  <dt className={row.divergent ? styles.engineAxisDivergent : styles.engineAxis}>
                    {row.divergent ? <DivergesIcon /> : null}
                    {row.axisLabel}
                    {row.divergent ? " (diffère des autres)" : null}
                  </dt>
                  <dd>{row.valueLabel}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className={styles.section} aria-labelledby={`${card.id}-source`}>
            <h3 className={styles.sectionTitle} id={`${card.id}-source`}>
              Éléments du texte source
            </h3>
            <ul className={styles.sourceElements}>
              {card.elementsKeptFromSource.map((item, itemIndex) => (
                <li key={`kept-${itemIndex}`} className={styles.kept}>
                  <KeptIcon /> {item}
                </li>
              ))}
              {card.elementsTransformed.map((item, itemIndex) => (
                <li key={`transformed-${itemIndex}`} className={styles.transformed}>
                  <TransformedIcon /> {item}
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.section} aria-labelledby={`${card.id}-potential`}>
            <h3 className={styles.sectionTitle} id={`${card.id}-potential`}>
              Potentiel romanesque
            </h3>
            <p className={styles.potential}>{card.novelPotentialAssessment}</p>
          </section>

          <section className={styles.section} aria-labelledby={`${card.id}-evaluation`}>
            <h3 className={styles.sectionTitle} id={`${card.id}-evaluation`}>
              Critique
            </h3>
            {card.evaluationLists === null ? (
              <p className={styles.evaluationEmpty}>Critique non encore disponible.</p>
            ) : (
              card.evaluationLists.map((list) => (
                <div key={list.key} className={styles.evaluationList}>
                  <h4 className={styles.evaluationListTitle}>{list.title}</h4>
                  <ul className={styles.evaluationItems}>
                    {list.items.map((item, itemIndex) => (
                      <li key={itemIndex} className={styles.evaluationItem}>
                        <p className={styles.evaluationItemHead}>
                          <span className={styles.evaluationLabel}>{item.label}</span>
                          <span className={styles.evaluationElement}>{item.elementLabel}</span>
                        </p>
                        <p className={styles.evaluationArgument}>{item.argument}</p>
                        {item.evidence === null ? null : (
                          <blockquote className={styles.evidence}>« {item.evidence} »</blockquote>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>

          <EditForm card={card} projectId={projectId} />

          <DiscardForm card={card} projectId={projectId} reasonCharCeiling={reasonCharCeiling} />
        </li>
      ))}
    </ul>
  );
}

interface EditFormProps {
  readonly card: DirectionCard;
  readonly projectId: string;
}

/**
 * Rewriting one direction freely (CAL-085), behind the same closed-by-default
 * `<details>` `DiscardForm` uses — a full rewrite is as much a decision as
 * écarter, and prefilling twelve fields on screen by default would bury the
 * comparison it sits inside.
 */
function EditForm({ card, projectId }: EditFormProps) {
  const values: DirectionFormValues = {
    workingTitle: card.workingTitle,
    developedPremise: card.developedPremise,
    dominantGenre: card.dominantGenre,
    mainConflict: card.mainConflict,
    protagonistArc: card.protagonistArc,
    newStakes: card.newStakes,
    charactersToIntroduce: card.charactersToIntroduce,
    endingNature: card.endingNature,
    mainRisks: card.mainRisks,
    elementsKeptFromSource: card.elementsKeptFromSource,
    elementsTransformed: card.elementsTransformed,
    novelPotentialAssessment: card.novelPotentialAssessment,
    narrativeEngine: card.narrativeEngine,
  };

  return (
    <details className={styles.discard}>
      <summary className={styles.discardSummary}>Modifier cette direction</summary>

      <DirectionForm
        action={editDirectionAction}
        projectId={projectId}
        directionId={card.id}
        initialValues={values}
        submitLabel={`Enregistrer « ${card.workingTitle} »`}
        idPrefix={`${card.id}-edit`}
      />
    </details>
  );
}

interface DiscardFormProps {
  readonly card: DirectionCard;
  readonly projectId: string;
  readonly reasonCharCeiling: number;
}

/**
 * Écarter une direction, with the reason the author may or may not want to
 * give.
 *
 * Behind a `<details>`, closed: discarding is a decision, and a bare button on
 * every card invites the click that is not one. The reason is optional in the
 * markup as it is in the domain — no `required`, and the label says so — and
 * `maxLength` is the domain's own ceiling handed down rather than a number
 * typed here, so the field and the parse cannot disagree about it.
 *
 * The canonical direction has no form at all: the repository refuses it, and
 * offering the control anyway would be an invitation to be told no.
 */
function DiscardForm({ card, projectId, reasonCharCeiling }: DiscardFormProps) {
  const [state, formAction] = useActionState<DirectionDiscardState, FormData>(
    discardDirectionAction,
    INITIAL_DIRECTION_DISCARD_STATE,
  );

  if (card.isCanonical) return null;

  return (
    <details className={styles.discard}>
      <summary className={styles.discardSummary}>Écarter cette direction</summary>

      <form action={formAction} className={styles.discardForm}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="directionId" value={card.id} />

        <label className={styles.discardLabel} htmlFor={`${card.id}-reason`}>
          Pourquoi l&apos;écartez-vous ? (facultatif)
        </label>
        <textarea
          id={`${card.id}-reason`}
          name="reason"
          rows={3}
          maxLength={reasonCharCeiling}
          className={styles.discardReason}
          placeholder="Ce que cette direction ne vous donne pas."
        />

        <p className={styles.discardHint}>
          Elle restera consultable parmi les directions écartées.
        </p>

        {state.status === "error" ? (
          <p className={styles.discardError} role="alert">
            {state.message}
          </p>
        ) : null}

        <button type="submit" className={styles.discardSubmit}>
          Écarter « {card.workingTitle} »
        </button>
      </form>
    </details>
  );
}

interface StringListProps {
  readonly title: string;
  readonly items: readonly string[];
}

function StringList({ title, items }: StringListProps) {
  if (items.length === 0) return null;

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <ul className={styles.plainList}>
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function CanonicalIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="m12 2 2.9 6.26 6.9.6-5.2 4.6 1.57 6.77L12 16.9l-6.17 3.33L7.4 13.46l-5.2-4.6 6.9-.6z"
      />
    </svg>
  );
}

function DivergesIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M7 7 3 12l4 5 1.4-1.4L5.8 12l2.6-3.6zm10 0-1.4 1.4 2.6 3.6-2.6 3.6L17 17l4-5z"
      />
    </svg>
  );
}

function KeptIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
    </svg>
  );
}

function TransformedIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M7.5 21 3 16.5 7.5 12l1.4 1.4L6.8 15.5H16v2H6.8l2.1 2.1zm9-9L15.1 10.6l2.1-2.1H8v-2h9.2l-2.1-2.1L16.5 3 21 7.5z"
      />
    </svg>
  );
}
