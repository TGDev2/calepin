"use client";

/**
 * The nine-step progress bar of a project (CAL-037), reused on every project
 * page.
 *
 * **Every bit of state is derived, nothing is stored.** The nine labels the
 * backlog names are not a one-to-one match with `PROJECT_STAGE_STATUSES`
 * (CAL-034): "Exploration" and "Choix narratif" are two facets of the single
 * `DIRECTION_TO_CHOOSE` status — a project explores directions and moves
 * toward choosing one throughout that one status, and the condition that ends
 * it, `hasCanonicalDirection`, is exactly "a direction was chosen". `STEPS`
 * below is the presentation-only table that says so; it introduces no status
 * this package doesn't already have. `DRAFT` precedes the first step, which is
 * why it names none.
 *
 * `deriveProjectStatus` and `projectStageRank` are reused rather than
 * reimplemented: the project's rank is read off
 * `deriveProjectStatus({ ...progress, isArchived: false })`, `isArchived`
 * forced false so archiving — orthogonal to how far the novel has come — never
 * collapses every step back to "nothing reached". `progress.isArchived` gets
 * its own note instead.
 *
 * **Never color alone.** Every step carries a glyph, its label and an
 * always-visible caption text — visible to a mouse user as much as to a
 * screen reader, not only on focus or hover.
 *
 * **Keyboard.** A roving tabindex: exactly one step is a tab stop at a time,
 * arrow keys move it, `Home`/`End` jump to the ends — the first component in
 * this repository shaped like a composite widget, so it follows the W3C APG
 * pattern directly rather than adapting a local precedent that doesn't exist.
 * No step is a link: no per-step screen exists yet (CLAUDE.md §13), so this is
 * read-only navigable status, not a navigation menu.
 */

import {
  deriveProjectStatus,
  isProjectStage,
  type ProjectProgress,
  type ProjectStage,
  projectStageRank,
} from "@calepin/shared/project-status";
import { useRef, useState } from "react";

import styles from "./process-stepper.module.css";

interface Step {
  readonly id: string;
  readonly label: string;
  readonly stage: ProjectStage;
}

const STEPS: readonly Step[] = [
  { id: "analysis", label: "Analyse", stage: "ANALYSIS_IN_PROGRESS" },
  { id: "exploration", label: "Exploration", stage: "DIRECTION_TO_CHOOSE" },
  { id: "direction", label: "Choix narratif", stage: "DIRECTION_TO_CHOOSE" },
  { id: "bible", label: "Bible", stage: "BIBLE_TO_VALIDATE" },
  { id: "outline", label: "Planification", stage: "OUTLINE_IN_PROGRESS" },
  { id: "writing", label: "Rédaction", stage: "WRITING_IN_PROGRESS" },
  { id: "coherence", label: "Contrôle", stage: "REVISION" },
  { id: "revision", label: "Révision", stage: "COMPLETED" },
  { id: "export", label: "Export", stage: "PUBLISHED" },
];

type StepState = "done" | "current" | "upcoming";

const GLYPH: Record<StepState, string> = { done: "✓", current: "●", upcoming: "○" };
const CAPTION: Record<StepState, string> = {
  done: "Franchie",
  current: "Étape en cours",
  upcoming: "Pas encore accessible",
};

const ARROW_NEXT = new Set(["ArrowRight", "ArrowDown"]);
const ARROW_PREVIOUS = new Set(["ArrowLeft", "ArrowUp"]);

export interface ProcessStepperProps {
  readonly progress: ProjectProgress;
}

export function ProcessStepper({ progress }: ProcessStepperProps) {
  const derived = deriveProjectStatus({ ...progress, isArchived: false });
  // Unreachable: forcing `isArchived` false leaves `deriveProjectStatus` no
  // path to `ARCHIVED`. Kept so `stage` is typed as `ProjectStage` without a
  // cast, the way `progress.ts`'s own `deriveProjectStatus` stays total
  // without a non-null assertion (CAL-021 bans them).
  const stage: ProjectStage = isProjectStage(derived) ? derived : "DRAFT";
  const currentRank = projectStageRank(stage);

  function stateOf(step: Step): StepState {
    const rank = projectStageRank(step.stage);
    if (rank < currentRank) return "done";
    if (rank === currentRank) return "current";
    return "upcoming";
  }

  const firstCurrentIndex = STEPS.findIndex((step) => stateOf(step) === "current");
  const defaultFocusedIndex = Math.max(firstCurrentIndex, 0);
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);

  // "Adjusting state when a prop changes", the pattern React's own docs give
  // for this exact shape: comparing during render, not inside an effect, is
  // what keeps a keyboard user's manual roving untouched by a re-render that
  // carries the same progress, while still following the current step when
  // `progress` genuinely moves it.
  const [priorDefaultIndex, setPriorDefaultIndex] = useState(defaultFocusedIndex);
  const [focusedIndex, setFocusedIndex] = useState(defaultFocusedIndex);
  if (priorDefaultIndex !== defaultFocusedIndex) {
    setPriorDefaultIndex(defaultFocusedIndex);
    setFocusedIndex(defaultFocusedIndex);
  }

  function focusItem(index: number): void {
    setFocusedIndex(index);
    itemRefs.current[index]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLLIElement>, index: number): void {
    if (ARROW_NEXT.has(event.key)) {
      event.preventDefault();
      focusItem((index + 1) % STEPS.length);
    } else if (ARROW_PREVIOUS.has(event.key)) {
      event.preventDefault();
      focusItem((index - 1 + STEPS.length) % STEPS.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(STEPS.length - 1);
    }
  }

  return (
    <div className={styles.wrapper}>
      {stage === "DRAFT" ? (
        <p className={styles.note}>
          Aucune étape n&apos;a encore commencé&nbsp;: ajoutez un texte source pour lancer
          l&apos;analyse.
        </p>
      ) : null}
      {progress.isArchived ? (
        <p className={styles.note}>
          Projet archivé — l&apos;avancement affiché reflète le contenu du projet avant
          l&apos;archivage.
        </p>
      ) : null}

      <ol className={styles.list} aria-label="Étapes du projet">
        {STEPS.map((step, index) => {
          const state = stateOf(step);

          return (
            <li
              key={step.id}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              className={styles.item}
              data-state={state}
              tabIndex={index === focusedIndex ? 0 : -1}
              aria-current={state === "current" ? "step" : undefined}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onFocus={() => setFocusedIndex(index)}
            >
              <span className={styles.glyph} aria-hidden="true">
                {GLYPH[state]}
              </span>
              <span className={styles.label}>{step.label}</span>
              <span className={styles.caption}>{CAPTION[state]}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
