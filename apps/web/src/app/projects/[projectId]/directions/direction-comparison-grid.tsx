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
 */

import { useRef, useState } from "react";

import styles from "./direction-comparison-grid.module.css";

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
  readonly evaluationLists: readonly EvaluationList[] | null;
}

export interface DirectionComparisonGridProps {
  readonly cards: readonly DirectionCard[];
}

const ARROW_NEXT = new Set(["ArrowRight", "ArrowDown"]);
const ARROW_PREVIOUS = new Set(["ArrowLeft", "ArrowUp"]);

export function DirectionComparisonGrid({ cards }: DirectionComparisonGridProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const cardRefs = useRef<Array<HTMLLIElement | null>>([]);

  function focusHeader(index: number): void {
    setFocusedIndex(index);
    cardRefs.current[index]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLLIElement>, index: number): void {
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
        </li>
      ))}
    </ul>
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
