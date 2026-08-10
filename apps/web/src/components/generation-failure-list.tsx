/**
 * The failed generations of a project, each with a reason and a way to try again
 * (CAL-063).
 *
 * **A server component with a plain form**, like every other action on this page:
 * the decision that matters — may this generation be reopened at all — is taken
 * on the server by `replayGeneration` under a `ProjectScope`, so there is no
 * client state to keep honest and the whole thing works with JavaScript off. The
 * codebase's stance since CAL-031, and this is exactly the screen where it pays:
 * a button that reopens paid work must not be gated by something a browser
 * decided.
 *
 * **It renders nothing when nothing has failed.** A permanent empty panel saying
 * "no failures" is furniture; the presence of this block is itself the signal.
 *
 * §9: the mission, the class and the attempt count. Nothing about what was being
 * written, and no error code — the reader gets a French sentence
 * (`generation-error-message.ts`) and the log keeps the code.
 */

import type { FailedGeneration } from "@calepin/shared/repository";

import {
  generationAttemptCountLabel,
  generationFailureMessage,
} from "@/lib/generation-error-message";
import { generationMissionLabel } from "@/lib/generation-mission-label";

import styles from "./generation-failure-list.module.css";
import { SubmitButton } from "./submit-button";

export interface GenerationFailureListProps {
  readonly projectId: string;
  readonly failures: readonly FailedGeneration[];
  readonly replayAction: (formData: FormData) => Promise<void>;
}

export function GenerationFailureList({
  projectId,
  failures,
  replayAction,
}: GenerationFailureListProps) {
  if (failures.length === 0) return null;

  return (
    <section className={styles.panel} aria-labelledby="generation-failures-heading">
      <h3 className={styles.title} id="generation-failures-heading">
        {failures.length === 1 ? "Génération en échec" : "Générations en échec"}
      </h3>

      <p className={styles.note}>
        Une génération qui échoue n&apos;abîme jamais votre projet&nbsp;: la dernière version valide
        de chaque élément est conservée telle quelle. Relancer reprend la demande à zéro.
      </p>

      <ul className={styles.list}>
        {failures.map((failure) => {
          const attempts = generationAttemptCountLabel(failure.attemptCount);

          return (
            <li key={failure.id} className={styles.item}>
              <div className={styles.text}>
                <p className={styles.mission}>
                  {generationMissionLabel(failure.mission)}
                  {attempts === null ? null : <span className={styles.meta}> · {attempts}</span>}
                </p>
                <p className={styles.reason}>{generationFailureMessage(failure)}</p>
              </div>

              {/*
               * Always offered, even for a permanent failure. The message says
               * whether another try is likely to help; hiding the control on a
               * classification the code got wrong would leave the author with a
               * dead generation and nothing to do about it.
               */}
              <form action={replayAction} className={styles.form}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="generationId" value={failure.id} />
                <SubmitButton pendingLabel="Relance…">Relancer</SubmitButton>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
