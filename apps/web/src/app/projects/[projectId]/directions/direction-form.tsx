"use client";

/**
 * One direction's content, as a form — rewriting a proposed direction freely,
 * or writing one entirely from scratch (CAL-085).
 *
 * **One component, two modes.** The twelve attributes and the five narrative-
 * engine axes are the same fields whether the author is editing what stands
 * or starting from nothing; only the action posted to, the direction id and
 * the starting values differ. Two components would drift the moment one
 * field's label or hint changed and the other did not.
 *
 * **List fields are one item per line.** `newStakes`, `charactersToIntroduce`,
 * `mainRisks`, `elementsKeptFromSource` and `elementsTransformed` are each a
 * `<textarea>` rather than the analysis editor's per-row fields — a direction's
 * lists hold single sentences with no lineage of their own to track, so a line
 * is all a submission needs to say. `readDirectionListField` (`lib/direction-edit.ts`)
 * is the reader on the other side.
 *
 * **The narrative engine is five `<select>`s**, options and labels straight
 * from `NARRATIVE_ENGINE_COPY` — never a second wording of the vocabulary
 * `page.tsx` already renders for the read-only comparison.
 */

import {
  DIRECTION_CHAR_CEILINGS,
  DIRECTION_LABEL_CHAR_CEILING,
  DIRECTION_LIST_COUNTS,
  NARRATIVE_ENGINE_AXES,
  NARRATIVE_ENGINE_COPY,
  type NarrativeEngine,
} from "@calepin/direction";
import { useActionState } from "react";

import { type DirectionEditState, INITIAL_DIRECTION_EDIT_STATE } from "@/lib/direction-edit";

import styles from "./direction-form.module.css";

export interface DirectionFormValues {
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
  /** `null` in create mode: the author must choose every axis themselves. */
  readonly narrativeEngine: NarrativeEngine | null;
}

/** What a fresh "écrire ma propre direction" form starts from. */
export const EMPTY_DIRECTION_FORM_VALUES: DirectionFormValues = {
  workingTitle: "",
  developedPremise: "",
  dominantGenre: "",
  mainConflict: "",
  protagonistArc: "",
  newStakes: [],
  charactersToIntroduce: [],
  endingNature: "",
  mainRisks: [],
  elementsKeptFromSource: [],
  elementsTransformed: [],
  novelPotentialAssessment: "",
  narrativeEngine: null,
};

export interface DirectionFormProps {
  readonly action: (state: DirectionEditState, formData: FormData) => Promise<DirectionEditState>;
  readonly projectId: string;
  /** Present only for an edit — a fresh direction has no id yet. */
  readonly directionId?: string;
  readonly initialValues: DirectionFormValues;
  readonly submitLabel: string;
  readonly idPrefix: string;
}

export function DirectionForm({
  action,
  projectId,
  directionId,
  initialValues,
  submitLabel,
  idPrefix,
}: DirectionFormProps) {
  const [state, formAction] = useActionState<DirectionEditState, FormData>(
    action,
    INITIAL_DIRECTION_EDIT_STATE,
  );

  const fieldId = (name: string) => `${idPrefix}-${name}`;

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="projectId" value={projectId} />
      {directionId === undefined ? null : (
        <input type="hidden" name="directionId" value={directionId} />
      )}

      <div className={styles.field}>
        <label className={styles.label} htmlFor={fieldId("workingTitle")}>
          Titre de travail
        </label>
        <input
          id={fieldId("workingTitle")}
          name="workingTitle"
          type="text"
          required
          maxLength={DIRECTION_LABEL_CHAR_CEILING}
          defaultValue={initialValues.workingTitle}
          className={styles.input}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor={fieldId("dominantGenre")}>
          Genre dominant
        </label>
        <input
          id={fieldId("dominantGenre")}
          name="dominantGenre"
          type="text"
          required
          maxLength={DIRECTION_LABEL_CHAR_CEILING}
          defaultValue={initialValues.dominantGenre}
          className={styles.input}
        />
      </div>

      <ProseField
        id={fieldId("developedPremise")}
        name="developedPremise"
        label="Prémisse développée"
        defaultValue={initialValues.developedPremise}
        maxLength={DIRECTION_CHAR_CEILINGS.developedPremise}
      />

      <ProseField
        id={fieldId("mainConflict")}
        name="mainConflict"
        label="Conflit principal"
        defaultValue={initialValues.mainConflict}
        maxLength={DIRECTION_CHAR_CEILINGS.mainConflict}
      />

      <ProseField
        id={fieldId("protagonistArc")}
        name="protagonistArc"
        label="Trajectoire du protagoniste"
        defaultValue={initialValues.protagonistArc}
        maxLength={DIRECTION_CHAR_CEILINGS.protagonistArc}
      />

      <ProseField
        id={fieldId("endingNature")}
        name="endingNature"
        label="Nature de la fin"
        defaultValue={initialValues.endingNature}
        maxLength={DIRECTION_CHAR_CEILINGS.endingNature}
        rows={2}
      />

      <ListField
        id={fieldId("newStakes")}
        name="newStakes"
        label="Nouveaux enjeux"
        defaultValue={initialValues.newStakes}
        bounds={DIRECTION_LIST_COUNTS.newStakes}
      />

      <ListField
        id={fieldId("charactersToIntroduce")}
        name="charactersToIntroduce"
        label="Personnages à introduire"
        defaultValue={initialValues.charactersToIntroduce}
        bounds={DIRECTION_LIST_COUNTS.charactersToIntroduce}
      />

      <ListField
        id={fieldId("mainRisks")}
        name="mainRisks"
        label="Risques principaux"
        defaultValue={initialValues.mainRisks}
        bounds={DIRECTION_LIST_COUNTS.mainRisks}
      />

      <ListField
        id={fieldId("elementsKeptFromSource")}
        name="elementsKeptFromSource"
        label="Éléments conservés du texte source"
        defaultValue={initialValues.elementsKeptFromSource}
        bounds={DIRECTION_LIST_COUNTS.elementsKeptFromSource}
      />

      <ListField
        id={fieldId("elementsTransformed")}
        name="elementsTransformed"
        label="Éléments transformés"
        defaultValue={initialValues.elementsTransformed}
        bounds={DIRECTION_LIST_COUNTS.elementsTransformed}
      />

      <ProseField
        id={fieldId("novelPotentialAssessment")}
        name="novelPotentialAssessment"
        label="Évaluation du potentiel romanesque"
        defaultValue={initialValues.novelPotentialAssessment}
        maxLength={DIRECTION_CHAR_CEILINGS.novelPotentialAssessment}
      />

      <fieldset className={styles.engine}>
        <legend className={styles.engineLegend}>Moteur narratif</legend>
        {NARRATIVE_ENGINE_AXES.map((axis) => (
          <div key={axis} className={styles.field}>
            <label className={styles.label} htmlFor={fieldId(`engine-${axis}`)}>
              {NARRATIVE_ENGINE_COPY[axis].label}
            </label>
            <select
              id={fieldId(`engine-${axis}`)}
              name={`engine.${axis}`}
              required
              defaultValue={initialValues.narrativeEngine?.[axis] ?? ""}
              className={styles.select}
            >
              {initialValues.narrativeEngine === null ? (
                <option value="" disabled>
                  Choisir…
                </option>
              ) : null}
              {Object.entries(NARRATIVE_ENGINE_COPY[axis].members).map(([member, description]) => (
                <option key={member} value={member}>
                  {description}
                </option>
              ))}
            </select>
          </div>
        ))}
      </fieldset>

      {state.status === "error" ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}

      <button type="submit" className={styles.submit}>
        {submitLabel}
      </button>
    </form>
  );
}

interface ProseFieldProps {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly defaultValue: string;
  readonly maxLength: number;
  readonly rows?: number;
}

function ProseField({ id, name, label, defaultValue, maxLength, rows = 4 }: ProseFieldProps) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        required
        rows={rows}
        maxLength={maxLength}
        defaultValue={defaultValue}
        className={styles.textarea}
      />
    </div>
  );
}

interface ListFieldProps {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly defaultValue: readonly string[];
  readonly bounds: { readonly min: number; readonly max: number };
}

function ListField({ id, name, label, defaultValue, bounds }: ListFieldProps) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={3}
        defaultValue={defaultValue.join("\n")}
        className={styles.textarea}
        aria-describedby={`${id}-hint`}
      />
      <p className={styles.hint} id={`${id}-hint`}>
        Un élément par ligne
        {bounds.min > 0 ? `, au moins ${bounds.min}` : ""}, au plus {bounds.max}.
      </p>
    </div>
  );
}
