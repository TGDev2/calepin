"use client";

/**
 * The six-step project creation form (CAL-040).
 *
 * **Receives the server action as a prop, never imports it.** A client
 * component importing a `"use server"` module as a value pulls in whatever
 * that module imports too — `@/lib/auth`, which validates the environment at
 * import time — which is exactly the trap CAL-039's `GenerationIndicator` hit
 * (see `tasks/lessons.md`). `app/projects/new/page.tsx` passes
 * `createProjectFromDraftAction` in; this file only imports its *type*.
 *
 * **One `<form>` for the whole wizard.** Every field the six steps collect is
 * a real, named input at all times — the current step's fields render as the
 * interactive control, every other step's fields render as a hidden mirror of
 * the same state — so the final submit's `FormData` always carries the whole
 * draft in one POST, regardless of which step is on screen. "Suivant" and
 * "Précédent" are `type="button"`, so they never submit; only the last step
 * renders a `type="submit"` button.
 *
 * **Why this one action doesn't redirect.** Every other project action in
 * this app answers by calling `redirect()` (CLAUDE.md's own convention,
 * `projects/[projectId]/actions.ts`) — but this wizard keeps a draft in
 * `localStorage`, and only client code can decide when it's safe to clear it.
 * `useActionState` gives the result back to the client instead: on success an
 * effect clears the draft and navigates; on failure the draft — and
 * everything already typed — is untouched.
 */

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useSyncExternalStore } from "react";

import {
  EMPTY_PROJECT_CREATION_DRAFT,
  FIELD_VALIDATORS,
  FREEDOM_LEVEL_OPTIONS,
  INITIAL_PROJECT_CREATION_ACTION_STATE,
  LANGUAGE_OPTIONS,
  OTHER_OPTION_VALUE,
  PROJECT_CREATION_STEPS,
  type ProjectCreationActionState,
  type ProjectCreationDraft,
  type ProjectCreationStep,
  proposeDetectedLanguage,
  TARGET_AUDIENCE_OPTIONS,
  TARGET_LENGTH_OPTIONS,
} from "@/lib/project-creation";
import {
  clearProjectCreationDraft,
  getDraftStorageSnapshot,
  getServerDraftStorageSnapshot,
  parseStoredDraft,
  saveProjectCreationDraft,
  subscribeToDraftStorage,
} from "@/lib/project-creation-draft-storage";
import type { SourceTextImportResult } from "@/lib/source-text-import";

import { ChapterCalibrationPreview } from "./chapter-calibration-preview";
import styles from "./project-creation-wizard.module.css";
import { SourceTextCounter } from "./source-text-counter";
import { SourceTextFileImport } from "./source-text-file-import";
import { SubmitButton } from "./submit-button";

/** Ties the counter to the textarea it measures, for a screen reader. */
const SOURCE_TEXT_COUNTER_ID = "project-creation-source-text-counter";

const STEP_LABELS: Record<ProjectCreationStep, string> = {
  title: "Titre",
  sourceText: "Texte source",
  language: "Langue",
  targetLength: "Longueur",
  targetAudience: "Public visé",
  freedomLevel: "Liberté",
};

/** Every field that belongs to a given step — the rest render as hidden mirrors. */
const STEP_FIELDS: Record<ProjectCreationStep, readonly (keyof ProjectCreationDraft)[]> = {
  title: ["title"],
  sourceText: ["sourceText"],
  language: ["language", "languageOther"],
  targetLength: ["targetLength", "targetWordCount"],
  targetAudience: ["targetAudience", "targetAudienceOther"],
  freedomLevel: ["freedomLevel"],
};

const ALL_FIELDS = Object.keys(EMPTY_PROJECT_CREATION_DRAFT) as (keyof ProjectCreationDraft)[];

export interface ProjectCreationWizardProps {
  readonly action: (
    state: ProjectCreationActionState,
    formData: FormData,
  ) => Promise<ProjectCreationActionState>;
  readonly importSourceTextFileAction: (formData: FormData) => Promise<SourceTextImportResult>;
}

export function ProjectCreationWizard({
  action,
  importSourceTextFileAction,
}: ProjectCreationWizardProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<ProjectCreationDraft>(EMPTY_PROJECT_CREATION_DRAFT);
  const [stepIndex, setStepIndex] = useState(0);
  // CAL-042: whether the visitor has picked the language by hand — once true,
  // the detected proposal never overrides it again, reload included.
  const [languageTouched, setLanguageTouched] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [showStepError, setShowStepError] = useState(false);
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_PROJECT_CREATION_ACTION_STATE,
  );

  // The SSR-safe read of `localStorage`: on the server, and on the client's
  // hydration-matching first render, this is the fixed server snapshot; only
  // once React has confirmed the DOM matches does it re-check and hand back
  // the real stored value, which is what the block below reacts to. Calling
  // `setState` directly from a mount `useEffect` instead — the more obvious
  // way to write this — is exactly what this codebase's lint config flags as
  // `set-state-in-effect`.
  const storedSnapshot = useSyncExternalStore(
    subscribeToDraftStorage,
    getDraftStorageSnapshot,
    getServerDraftStorageSnapshot,
  );
  const [priorSnapshot, setPriorSnapshot] = useState(storedSnapshot);

  // "Adjusting state when a prop changes" (React's own name for this
  // pattern), the same one `process-stepper.tsx` already uses in this
  // codebase: comparing during render rather than in an effect is what lets
  // this fire exactly once, synchronously, the instant the real
  // `localStorage` value becomes available after hydration.
  if (priorSnapshot !== storedSnapshot) {
    setPriorSnapshot(storedSnapshot);
    setHydrated(true);
    const stored = parseStoredDraft(storedSnapshot);
    if (stored) {
      setDraft(stored.draft);
      setStepIndex(PROJECT_CREATION_STEPS.indexOf(stored.step));
      setLanguageTouched(stored.languageTouched ?? false);
    }
  }

  useEffect(() => {
    if (!hydrated) return;
    saveProjectCreationDraft(draft, PROJECT_CREATION_STEPS[stepIndex] ?? "title", languageTouched);
  }, [draft, stepIndex, languageTouched, hydrated]);

  useEffect(() => {
    if (!state.ok) return;
    clearProjectCreationDraft();
    router.replace(`/projects/${state.projectId}`);
  }, [state, router]);

  const [priorState, setPriorState] = useState(state);
  if (priorState !== state) {
    setPriorState(state);
    if (!state.ok && state.errors) {
      const firstErrorStep = PROJECT_CREATION_STEPS.find(
        (step) => state.errors?.[step] !== undefined,
      );
      if (firstErrorStep) {
        setStepIndex(PROJECT_CREATION_STEPS.indexOf(firstErrorStep));
        setShowStepError(true);
      }
    }
  }

  const currentStep = PROJECT_CREATION_STEPS[stepIndex] ?? "title";
  const isLastStep = stepIndex === PROJECT_CREATION_STEPS.length - 1;
  // CAL-044: the chosen level's explanation and the three lists it resolves
  // to, so the step says what the setting will actually do rather than only
  // naming it. `undefined` only for a draft restored with a level the union
  // no longer has — the step's own validator refuses that on "Suivant".
  const selectedFreedomLevel = FREEDOM_LEVEL_OPTIONS.find(
    (option) => option.value === draft.freedomLevel,
  );
  const clientError = FIELD_VALIDATORS[currentStep](draft);
  const serverError = !state.ok ? state.errors?.[currentStep] : undefined;
  const visibleError = serverError ?? (showStepError ? clientError : null);

  function updateField<K extends keyof ProjectCreationDraft>(
    field: K,
    value: ProjectCreationDraft[K],
  ) {
    setDraft((previous) => ({ ...previous, [field]: value }));
  }

  function goToStep(index: number) {
    setShowStepError(false);
    setStepIndex(Math.max(0, Math.min(index, PROJECT_CREATION_STEPS.length - 1)));
  }

  function goNext() {
    if (clientError !== null) {
      setShowStepError(true);
      return;
    }
    // CAL-042: propose a detected language the moment the source text is
    // complete. `proposeDetectedLanguage` itself refuses to run once
    // `languageTouched` is true, so this can never override a manual choice.
    if (currentStep === "sourceText") {
      const proposed = proposeDetectedLanguage(draft.sourceText, languageTouched);
      if (proposed !== null) updateField("language", proposed);
    }
    goToStep(stepIndex + 1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    // A single-line input inside a form submits it on Enter — fine on the
    // last step, premature everywhere else, since "Suivant" is deliberately
    // not a submit button.
    if (event.key === "Enter" && !isLastStep && event.target instanceof HTMLInputElement) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} onKeyDown={handleKeyDown} className={styles.form}>
      <ol className={styles.steps} aria-label="Étapes de la création">
        {PROJECT_CREATION_STEPS.map((step, index) => (
          <li
            key={step}
            className={styles.step}
            data-state={index < stepIndex ? "done" : index === stepIndex ? "current" : "upcoming"}
          >
            {STEP_LABELS[step]}
          </li>
        ))}
      </ol>

      {!state.ok && state.formError ? (
        <p role="alert" className={styles.error}>
          {state.formError}
        </p>
      ) : null}

      <div className={styles.stepContent}>
        {currentStep === "title" ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="project-creation-title">
              Titre provisoire
            </label>
            <input
              id="project-creation-title"
              className={styles.input}
              type="text"
              name="title"
              value={draft.title}
              onChange={(event) => updateField("title", event.target.value)}
              maxLength={200}
              required
            />
          </div>
        ) : null}

        {currentStep === "sourceText" ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="project-creation-source-text">
              Texte source
            </label>
            <SourceTextFileImport
              action={importSourceTextFileAction}
              onImported={(content) => updateField("sourceText", content)}
            />
            <textarea
              id="project-creation-source-text"
              className={styles.textarea}
              name="sourceText"
              value={draft.sourceText}
              onChange={(event) => updateField("sourceText", event.target.value)}
              rows={14}
              aria-describedby={SOURCE_TEXT_COUNTER_ID}
              required
            />
            <SourceTextCounter id={SOURCE_TEXT_COUNTER_ID} text={draft.sourceText} />
          </div>
        ) : null}

        {currentStep === "language" ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="project-creation-language">
              Langue du texte
            </label>
            <select
              id="project-creation-language"
              className={styles.select}
              name="language"
              value={draft.language}
              onChange={(event) => {
                setLanguageTouched(true);
                updateField("language", event.target.value);
              }}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {!languageTouched ? (
              <p className={styles.hint}>
                Langue proposée à partir du texte source. Modifiez-la si besoin.
              </p>
            ) : null}
            {draft.language === OTHER_OPTION_VALUE ? (
              <input
                className={styles.input}
                type="text"
                name="languageOther"
                aria-label="Précisez la langue"
                placeholder="Précisez la langue"
                value={draft.languageOther}
                onChange={(event) => updateField("languageOther", event.target.value)}
              />
            ) : (
              <input type="hidden" name="languageOther" value={draft.languageOther} />
            )}
          </div>
        ) : null}

        {currentStep === "targetLength" ? (
          <fieldset className={styles.field}>
            <legend className={styles.label}>Longueur souhaitée</legend>
            {TARGET_LENGTH_OPTIONS.map((option) => (
              <label key={option.value} className={styles.radioOption}>
                <input
                  type="radio"
                  name="targetLength"
                  value={option.value}
                  checked={draft.targetLength === option.value}
                  onChange={() => updateField("targetLength", option.value)}
                />
                <span>
                  <span className={styles.radioLabel}>{option.label}</span>
                  <span className={styles.radioCaption}>{option.caption}</span>
                </span>
              </label>
            ))}
            {draft.targetLength === "CUSTOM" ? (
              <input
                className={styles.input}
                type="number"
                min={1}
                name="targetWordCount"
                aria-label="Nombre de mots visé"
                placeholder="Nombre de mots visé"
                value={draft.targetWordCount}
                onChange={(event) => updateField("targetWordCount", event.target.value)}
              />
            ) : (
              <input type="hidden" name="targetWordCount" value={draft.targetWordCount} />
            )}
            <ChapterCalibrationPreview
              draftTargetLength={draft.targetLength}
              draftTargetWordCount={draft.targetWordCount}
            />
          </fieldset>
        ) : null}

        {currentStep === "targetAudience" ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="project-creation-target-audience">
              Public visé
            </label>
            <select
              id="project-creation-target-audience"
              className={styles.select}
              name="targetAudience"
              value={draft.targetAudience}
              onChange={(event) => updateField("targetAudience", event.target.value)}
            >
              {TARGET_AUDIENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {draft.targetAudience === OTHER_OPTION_VALUE ? (
              <input
                className={styles.input}
                type="text"
                name="targetAudienceOther"
                aria-label="Précisez le public visé"
                placeholder="Précisez le public visé"
                value={draft.targetAudienceOther}
                onChange={(event) => updateField("targetAudienceOther", event.target.value)}
              />
            ) : (
              <input type="hidden" name="targetAudienceOther" value={draft.targetAudienceOther} />
            )}
          </div>
        ) : null}

        {currentStep === "freedomLevel" ? (
          <fieldset className={styles.field}>
            <legend className={styles.label}>
              Degré de liberté laissé à l&apos;intelligence artificielle
            </legend>
            {FREEDOM_LEVEL_OPTIONS.map((option) => (
              <label key={option.value} className={styles.radioOption}>
                <input
                  type="radio"
                  name="freedomLevel"
                  value={option.value}
                  checked={draft.freedomLevel === option.value}
                  onChange={() => updateField("freedomLevel", option.value)}
                />
                <span>
                  <span className={styles.radioLabel}>{option.label}</span>
                  <span className={styles.radioCaption}>{option.caption}</span>
                </span>
              </label>
            ))}
            {selectedFreedomLevel ? (
              // A named region rather than a bare block: it gives the live
              // update something to announce, and it is what the end-to-end
              // spec asks for by name instead of by hashed class.
              <section
                className={styles.levelDetail}
                aria-label="Ce que ce degré engage"
                aria-live="polite"
              >
                <p className={styles.levelExplanation}>{selectedFreedomLevel.explanation}</p>
                <dl className={styles.levelTreatments}>
                  {selectedFreedomLevel.summary.map((group) => (
                    <div key={group.treatment} className={styles.levelTreatment}>
                      <dt className={styles.levelTreatmentHeading}>{group.heading}</dt>
                      <dd className={styles.levelTreatmentList}>{group.dimensions.join(", ")}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}
          </fieldset>
        ) : null}

        {visibleError ? (
          <p role="alert" className={styles.error}>
            {visibleError}
          </p>
        ) : null}
      </div>

      {ALL_FIELDS.filter((field) => !STEP_FIELDS[currentStep].includes(field)).map((field) => (
        <input key={field} type="hidden" name={field} value={draft[field]} />
      ))}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => goToStep(stepIndex - 1)}
          disabled={stepIndex === 0 || pending}
        >
          Précédent
        </button>
        {isLastStep ? (
          <SubmitButton pendingLabel="Création en cours…">Créer le projet</SubmitButton>
        ) : (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={goNext}
            disabled={pending}
          >
            Suivant
          </button>
        )}
      </div>
    </form>
  );
}
