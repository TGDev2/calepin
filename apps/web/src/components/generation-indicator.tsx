"use client";

/**
 * The persistent generation indicator (CAL-039), now live via server-sent
 * events (CAL-062) instead of a poll.
 *
 * **The initial list is the server's own read**, passed in as `initial` —
 * unchanged from CAL-039, and what makes the banner correct on first paint
 * and with JavaScript off. After that this component opens one SSE
 * connection to `/api/projects/{projectId}/generations/events` via
 * `subscribeToGenerationEvents` (`@/lib/generation-events`) and replaces
 * `running` with whatever full snapshot the stream last sent.
 *
 * **Leaving the page and coming back loses nothing.** Unmounting closes the
 * connection (nothing about a closed tab touches the generation, which only
 * ever talks to Postgres and Redis); remounting — a reload, or navigating
 * back — opens a fresh one, whose first frame already carries the current
 * state. There is no separate "restore" code path, and the browser's own
 * `EventSource` retries a dropped connection on its own.
 *
 * **Cancelling lives here** (CAL-064) because this is the only place a running
 * generation is on screen. The button is a plain `<form>` posting to a server
 * action, exactly as `generation-failure-list.tsx`'s *Relancer* is: the client
 * half of this component decides what is displayed and never what is allowed,
 * and the row leaves the banner on the next frame of the stream rather than
 * because a handler removed it.
 */

import { useEffect, useState } from "react";

import { type RunningGenerationView, subscribeToGenerationEvents } from "@/lib/generation-events";
import { generationMissionLabel } from "@/lib/generation-mission-label";

import styles from "./generation-indicator.module.css";
import { SubmitButton } from "./submit-button";

export interface GenerationIndicatorProps {
  readonly projectId: string;
  readonly initial: RunningGenerationView[];
  readonly cancelAction: (formData: FormData) => Promise<void>;
}

export function GenerationIndicator({
  projectId,
  initial,
  cancelAction,
}: GenerationIndicatorProps) {
  const [running, setRunning] = useState(initial);

  useEffect(() => {
    return subscribeToGenerationEvents(`/api/projects/${projectId}/generations/events`, setRunning);
  }, [projectId]);

  if (running.length === 0) return null;

  return (
    <div className={styles.banner} role="status">
      {running.map((generation) => (
        // A `div` rather than the `p` this was before CAL-064: a form is not
        // phrasing content, and a browser closes the paragraph in front of it.
        <div key={generation.id} className={styles.line}>
          <span className={styles.spinner} aria-hidden="true" />
          <span>
            Génération en cours&nbsp;: {generationMissionLabel(generation.mission)}
            {/*
             * A generation waiting out CAL-063's backoff is still in flight, and
             * an author watching a spinner deserves to know why nothing is
             * moving — otherwise an automatic retry is indistinguishable from a
             * stuck job, which is precisely the anxiety the retry exists to
             * remove.
             */}
            {generation.failureClass === null ? null : (
              <> — nouvelle tentative programmée après un incident</>
            )}
            {/*
             * Why this one is waiting, for a `QUEUED` row — a step and a
             * percentage are only ever reported once a generation is actually
             * running, so neither of these appears beside them.
             *
             * The write lock (CAL-067) outranks the queue position (CAL-065)
             * when both apply: "position 2" tells an author nothing they can
             * act on, while "another generation is already working on this
             * part of the novel" is the whole reason their second request is
             * queued rather than refused. It names no chapter — a banner is a
             * technical surface and §9 keeps titles off it.
             */}
            {generation.blockedByWriteTarget ? (
              <> — en attente&nbsp;: une autre génération modifie déjà cette partie du roman</>
            ) : generation.queuePosition === null ? null : (
              <> — en file d’attente, position {generation.queuePosition}</>
            )}
            {generation.progressStep === null ? null : <> — {generation.progressStep}</>}
            {generation.progressPercent === null ? null : (
              <>
                &nbsp;({generation.progressPercent}&nbsp;%)
                <span className={styles.progressTrack} aria-hidden="true">
                  <span
                    className={styles.progressFill}
                    style={{ width: `${generation.progressPercent}%` }}
                  />
                </span>
              </>
            )}
          </span>

          {/*
           * Offered for a generation waiting out CAL-063's backoff as much as
           * for one calling a provider right now: both are in flight, both cost
           * the author something to leave running, and the arbiter is the row's
           * own lock rather than what this banner last saw.
           */}
          <form action={cancelAction} className={styles.form}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="generationId" value={generation.id} />
            <SubmitButton pendingLabel="Annulation…">Annuler</SubmitButton>
          </form>
        </div>
      ))}
    </div>
  );
}
