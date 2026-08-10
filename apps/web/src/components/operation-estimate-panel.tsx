/**
 * The estimate an author sees before a costly operation starts, and the
 * confirmation that starts it (CAL-057).
 *
 * **A server component with a plain form**, like every other confirmation in
 * this application (`/account/delete`, `/projects/[projectId]/delete`): there
 * is no modal anywhere in this codebase and there is not one here. The action
 * is injected as a prop, the way `ArchiveProjectSection` takes its own, so the
 * screen that owns the operation owns what confirming it does.
 *
 * **It shows what the price is made of, not only the total.** One line per
 * phase, each named by its mission and marked production, analysis or control
 * — because the whole point of CAL-057 is that the cost of writing a chapter is
 * not the cost of its prose, and a single total would hide exactly that. The
 * basis of the number is stated too: an author is entitled to know whether it
 * comes from their own runs or from a reference table.
 *
 * **Counts, identifiers and money — never a line of the novel** (§9). Nothing
 * on this panel names a chapter's title or quotes a word of it, so it is safe
 * on a screenshot and in a support session.
 *
 * The hidden fields carry the acknowledgement back: confirming is accepting a
 * price, so the price is part of what is posted, and the server checks it
 * against an estimate it recomputes rather than trusting the form.
 */

import type { OperationEstimate } from "@calepin/ai";
import Link from "next/link";

import {
  ACKNOWLEDGEMENT_FIELDS,
  costlyOperationLabel,
  formatEstimatedCost,
  formatEstimatedDuration,
  GENERATION_MISSION_BY_MISSION_ID,
  operationEstimateBasisLabel,
  operationPhaseKindLabel,
  operationScaleLabel,
} from "@/lib/costly-operation";
import { generationMissionLabel } from "@/lib/generation-mission-label";

import styles from "./operation-estimate-panel.module.css";
import { SubmitButton } from "./submit-button";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

export interface OperationEstimatePanelProps {
  readonly estimate: OperationEstimate;
  readonly confirmAction: (formData: FormData) => Promise<void>;
  /** Where "Annuler" goes back to — the screen the operation was asked from. */
  readonly cancelHref: string;
  readonly confirmLabel: string;
  readonly pendingLabel: string;
}

export function OperationEstimatePanel({
  estimate,
  confirmAction,
  cancelHref,
  confirmLabel,
  pendingLabel,
}: OperationEstimatePanelProps) {
  return (
    <section className={styles.panel} aria-labelledby="operation-estimate-heading">
      <h2 className={styles.title} id="operation-estimate-heading">
        {costlyOperationLabel(estimate.operation)}
      </h2>

      <p className={styles.scale}>
        Cette opération porte sur {operationScaleLabel(estimate.unit, estimate.unitCount)} et
        représente {NUMBER_FORMAT.format(estimate.callCount)}
        {estimate.callCount > 1 ? " appels de modèle" : " appel de modèle"}.
      </p>

      <dl className={styles.totals}>
        <div className={styles.total}>
          <dt>Durée estimée</dt>
          <dd className={styles.amount}>{formatEstimatedDuration(estimate.durationMs)}</dd>
        </div>
        <div className={styles.total}>
          <dt>Coût estimé</dt>
          <dd className={styles.amount}>{formatEstimatedCost(estimate.costUsd)}</dd>
        </div>
      </dl>

      <p className={styles.basis} role="note">
        {operationEstimateBasisLabel(estimate.basis)}
      </p>

      <table className={styles.phases}>
        <caption className={styles.caption}>
          Le détail par phase&nbsp;: l&apos;analyse et le contrôle sont comptés, pas seulement le
          texte produit.
        </caption>
        <thead>
          <tr>
            <th scope="col">Phase</th>
            <th scope="col">Nature</th>
            <th scope="col">Appels</th>
            <th scope="col">Durée</th>
            <th scope="col">Coût</th>
          </tr>
        </thead>
        <tbody>
          {estimate.phases.map((phase) => (
            <tr key={phase.mission}>
              <th scope="row">
                {generationMissionLabel(GENERATION_MISSION_BY_MISSION_ID[phase.mission])}
              </th>
              <td>{operationPhaseKindLabel(phase.kind)}</td>
              <td className={styles.numeric}>{NUMBER_FORMAT.format(phase.callCount)}</td>
              <td className={styles.numeric}>{formatEstimatedDuration(phase.durationMs)}</td>
              <td className={styles.numeric}>{formatEstimatedCost(phase.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <form className={styles.form} action={confirmAction}>
        <input type="hidden" name={ACKNOWLEDGEMENT_FIELDS.operation} value={estimate.operation} />
        <input type="hidden" name={ACKNOWLEDGEMENT_FIELDS.unitCount} value={estimate.unitCount} />
        <input type="hidden" name={ACKNOWLEDGEMENT_FIELDS.costUsd} value={estimate.costUsd} />
        <input type="hidden" name={ACKNOWLEDGEMENT_FIELDS.durationMs} value={estimate.durationMs} />

        <SubmitButton pendingLabel={pendingLabel}>{confirmLabel}</SubmitButton>
      </form>

      <p className={styles.cancel}>
        <Link href={cancelHref}>Annuler</Link>
      </p>
    </section>
  );
}
