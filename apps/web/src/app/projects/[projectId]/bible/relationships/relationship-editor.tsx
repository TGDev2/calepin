"use client";

/**
 * The forms behind the graph: one to add a tie, one per tie to rewrite or
 * remove it (CAL-091).
 *
 * **Every field is uncontrolled** (`defaultValue`, `defaultChecked`). The
 * value is the author's, not the component's, and the lesson
 * `source-text/page.tsx` records is unambiguous: a controlled field inside a
 * server-rendered page discards everything typed before React hydrates. The
 * only state here is the action's own.
 *
 * **The actions arrive as props**, never imported. Importing a `"use server"`
 * module from a client component pulls its whole transitive graph into the
 * client bundle — which in this repository reaches `@/lib/auth` and validates
 * the environment at import time, fatal in a unit test (CAL-039's lesson).
 *
 * A refusal is rendered beside the form that caused it and nowhere else, so
 * two forms open at once cannot show each other's error.
 */

import type { CharacterRelationshipType } from "@calepin/bible";
import { useActionState, useId } from "react";

import { SubmitButton } from "@/components/submit-button";
import {
  INITIAL_RELATIONSHIP_FORM_STATE,
  type RelationshipFormState,
} from "@/lib/relationship-edit";

import styles from "./relationship-editor.module.css";

export type RelationshipAction = (
  previous: RelationshipFormState,
  formData: FormData,
) => Promise<RelationshipFormState>;

export interface RelationshipTypeOption {
  readonly value: CharacterRelationshipType;
  readonly label: string;
}

export interface CastOption {
  readonly id: string;
  readonly name: string;
}

interface ContentFieldsProps {
  readonly idPrefix: string;
  readonly types: readonly RelationshipTypeOption[];
  readonly defaultType?: CharacterRelationshipType;
  readonly defaultLabel?: string;
  readonly defaultDescription?: string;
  readonly labelCeiling: number;
  readonly descriptionCeiling: number;
}

function ContentFields({
  idPrefix,
  types,
  defaultType,
  defaultLabel,
  defaultDescription,
  labelCeiling,
  descriptionCeiling,
}: ContentFieldsProps) {
  return (
    <>
      <p className={styles.field}>
        <label htmlFor={`${idPrefix}-type`}>Nature du lien</label>
        <select id={`${idPrefix}-type`} name="type" defaultValue={defaultType ?? types[0]?.value}>
          {types.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </p>

      <p className={styles.field}>
        <label htmlFor={`${idPrefix}-label`}>Libellé, depuis ce personnage</label>
        <input
          id={`${idPrefix}-label`}
          name="label"
          type="text"
          required
          maxLength={labelCeiling}
          defaultValue={defaultLabel}
          placeholder="demi-frère de"
        />
      </p>

      <p className={styles.field}>
        <label htmlFor={`${idPrefix}-description`}>
          Ce que ce personnage seul tient de l&rsquo;autre
        </label>
        <textarea
          id={`${idPrefix}-description`}
          name="description"
          rows={3}
          maxLength={descriptionCeiling}
          defaultValue={defaultDescription}
        />
        <span className={styles.hint}>
          Écrit d&rsquo;un seul côté. Ce que l&rsquo;autre en sait se déclare dans le lien inverse —
          et s&rsquo;il n&rsquo;y en a pas, c&rsquo;est qu&rsquo;il n&rsquo;en sait rien.
        </span>
      </p>
    </>
  );
}

export interface AddRelationshipFormProps {
  readonly projectId: string;
  readonly cast: readonly CastOption[];
  readonly types: readonly RelationshipTypeOption[];
  readonly labelCeiling: number;
  readonly descriptionCeiling: number;
  readonly action: RelationshipAction;
}

export function AddRelationshipForm({
  projectId,
  cast,
  types,
  labelCeiling,
  descriptionCeiling,
  action,
}: AddRelationshipFormProps) {
  const [state, submit] = useActionState(action, INITIAL_RELATIONSHIP_FORM_STATE);
  const prefix = useId();

  return (
    <form className={styles.form} action={submit}>
      <input type="hidden" name="projectId" value={projectId} />

      <p className={styles.field}>
        <label htmlFor={`${prefix}-from`}>De</label>
        <select id={`${prefix}-from`} name="fromCharacterId" defaultValue={cast[0]?.id}>
          {cast.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </p>

      <p className={styles.field}>
        <label htmlFor={`${prefix}-to`}>Vers</label>
        <select id={`${prefix}-to`} name="toCharacterId" defaultValue={cast[1]?.id}>
          {cast.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </p>

      <ContentFields
        idPrefix={prefix}
        types={types}
        labelCeiling={labelCeiling}
        descriptionCeiling={descriptionCeiling}
      />

      {state.status === "error" ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}

      <SubmitButton pendingLabel="Enregistrement…">Ajouter ce lien</SubmitButton>
    </form>
  );
}

export interface EditRelationshipFormProps {
  readonly projectId: string;
  readonly relationshipId: string;
  readonly types: readonly RelationshipTypeOption[];
  readonly defaultType: CharacterRelationshipType;
  readonly defaultLabel: string;
  readonly defaultDescription: string;
  readonly labelCeiling: number;
  readonly descriptionCeiling: number;
  readonly editAction: RelationshipAction;
  readonly deleteAction: RelationshipAction;
}

export function EditRelationshipForm({
  projectId,
  relationshipId,
  types,
  defaultType,
  defaultLabel,
  defaultDescription,
  labelCeiling,
  descriptionCeiling,
  editAction,
  deleteAction,
}: EditRelationshipFormProps) {
  const [editState, submitEdit] = useActionState(editAction, INITIAL_RELATIONSHIP_FORM_STATE);
  const [deleteState, submitDelete] = useActionState(deleteAction, INITIAL_RELATIONSHIP_FORM_STATE);
  const prefix = useId();

  return (
    <details className={styles.editor}>
      <summary>Modifier ce lien</summary>

      <form className={styles.form} action={submitEdit}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="relationshipId" value={relationshipId} />

        <ContentFields
          idPrefix={prefix}
          types={types}
          defaultType={defaultType}
          defaultLabel={defaultLabel}
          defaultDescription={defaultDescription}
          labelCeiling={labelCeiling}
          descriptionCeiling={descriptionCeiling}
        />

        {editState.status === "error" ? (
          <p className={styles.error} role="alert">
            {editState.message}
          </p>
        ) : null}

        <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
      </form>

      <form className={styles.deleteForm} action={submitDelete}>
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="relationshipId" value={relationshipId} />

        {deleteState.status === "error" ? (
          <p className={styles.error} role="alert">
            {deleteState.message}
          </p>
        ) : null}

        <SubmitButton pendingLabel="Suppression…" variant="danger">
          Supprimer ce lien
        </SubmitButton>
      </form>
    </details>
  );
}
