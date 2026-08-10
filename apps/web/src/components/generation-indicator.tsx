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
 */

import { useEffect, useState } from "react";

import { type RunningGenerationView, subscribeToGenerationEvents } from "@/lib/generation-events";
import { generationMissionLabel } from "@/lib/generation-mission-label";

import styles from "./generation-indicator.module.css";

export interface GenerationIndicatorProps {
  readonly projectId: string;
  readonly initial: RunningGenerationView[];
}

export function GenerationIndicator({ projectId, initial }: GenerationIndicatorProps) {
  const [running, setRunning] = useState(initial);

  useEffect(() => {
    return subscribeToGenerationEvents(`/api/projects/${projectId}/generations/events`, setRunning);
  }, [projectId]);

  if (running.length === 0) return null;

  return (
    <div className={styles.banner} role="status">
      {running.map((generation) => (
        <p key={generation.id} className={styles.line}>
          <span className={styles.spinner} aria-hidden="true" />
          <span>
            Génération en cours&nbsp;: {generationMissionLabel(generation.mission)}
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
        </p>
      ))}
    </div>
  );
}
