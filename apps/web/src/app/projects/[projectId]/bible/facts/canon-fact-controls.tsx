"use client";

/**
 * The one-click decisions a fact carries beside its content: confirm it, set it
 * aside, lock it, lift the lock, delete it (CAL-098).
 *
 * Each is its own `<form>` with its own `useActionState`, so two of them open
 * at once cannot show each other's refusal — `EditRelationshipForm`'s
 * arrangement. Nothing here is a link: they all write.
 *
 * **Retiring and deleting are different acts and read differently.** *Écarter*
 * keeps the row, which is what stops the same statement being proposed again by
 * the next extraction; *Supprimer* is offered only for a fact the author wrote
 * themselves, and the repository refuses it for any other — the button is
 * absent rather than present-and-refused, because an author should not have to
 * press something to learn they may not.
 */

import { useActionState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { INITIAL_CANON_FACT_FORM_STATE } from "@/lib/canon-fact-edit";

import styles from "./canon-fact-controls.module.css";
import type { CanonFactAction } from "./canon-fact-form";

interface DecisionFormProps {
  readonly projectId: string;
  readonly factId: string;
  readonly action: CanonFactAction;
  readonly label: string;
  readonly pendingLabel: string;
  readonly variant?: "danger";
  /** The status a status form asks for. Absent for the lock and delete forms. */
  readonly status?: string;
}

function DecisionForm({
  projectId,
  factId,
  action,
  label,
  pendingLabel,
  variant,
  status,
}: DecisionFormProps) {
  const [state, submit] = useActionState(action, INITIAL_CANON_FACT_FORM_STATE);

  return (
    <form className={styles.decision} action={submit}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="factId" value={factId} />
      {status === undefined ? null : <input type="hidden" name="status" value={status} />}

      <SubmitButton pendingLabel={pendingLabel} variant={variant}>
        {label}
      </SubmitButton>

      {state.status === "error" ? (
        <span className={styles.error} role="alert">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export interface CanonFactControlsProps {
  readonly projectId: string;
  readonly factId: string;
  readonly status: "PROPOSED" | "CONFIRMED" | "REJECTED";
  readonly locked: boolean;
  /** Only a fact the author wrote themselves may be deleted outright. */
  readonly deletable: boolean;
  readonly statusAction: CanonFactAction;
  readonly lockAction: CanonFactAction;
  readonly unlockAction: CanonFactAction;
  readonly deleteAction: CanonFactAction;
}

export function CanonFactControls({
  projectId,
  factId,
  status,
  locked,
  deletable,
  statusAction,
  lockAction,
  unlockAction,
  deleteAction,
}: CanonFactControlsProps) {
  return (
    <div className={styles.controls}>
      {locked ? (
        <DecisionForm
          projectId={projectId}
          factId={factId}
          action={unlockAction}
          label="Déverrouiller"
          pendingLabel="Levée du verrou…"
        />
      ) : (
        <>
          {status === "CONFIRMED" ? null : (
            <DecisionForm
              projectId={projectId}
              factId={factId}
              action={statusAction}
              status="CONFIRMED"
              label="Retenir ce fait"
              pendingLabel="Enregistrement…"
            />
          )}

          {status === "REJECTED" ? null : (
            <DecisionForm
              projectId={projectId}
              factId={factId}
              action={statusAction}
              status="REJECTED"
              label="Écarter ce fait"
              pendingLabel="Mise à l'écart…"
            />
          )}

          <DecisionForm
            projectId={projectId}
            factId={factId}
            action={lockAction}
            label="Verrouiller"
            pendingLabel="Verrouillage…"
          />

          {deletable ? (
            <DecisionForm
              projectId={projectId}
              factId={factId}
              action={deleteAction}
              label="Supprimer"
              pendingLabel="Suppression…"
              variant="danger"
            />
          ) : null}
        </>
      )}
    </div>
  );
}
