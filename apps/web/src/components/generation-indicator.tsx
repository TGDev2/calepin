"use client";

/**
 * The persistent generation indicator (CAL-039).
 *
 * **Nothing produces a `Generation` row yet** — the mission registry
 * (`@calepin/ai`, CAL-048) and the worker that runs it (CAL-060) are both
 * still to come (CLAUDE.md §13). This component is the display half of a
 * read path that already works end-to-end against the real schema
 * (`listRunningGenerations`, CAL-021); it renders nothing today and starts
 * showing real rows the moment something enqueues one.
 *
 * **"Persistent" means it stays live without a page reload.** The initial
 * list is the server's own read, passed in as `initial`; after that this
 * component polls `getRunningGenerations` on an interval so a generation
 * that finishes — or a new one that starts — updates the banner without the
 * visitor doing anything.
 *
 * **`getRunningGenerations` arrives as a prop, the server action itself
 * rather than an import of the module that defines it** — the same shape
 * `ProjectOverview`'s `renameAction` and `ArchiveProjectSection`'s
 * `archiveAction`/`restoreAction` already take. Importing the action module
 * directly would pull in `@/lib/current-user` → `@/lib/auth`, which validates
 * the process's environment at import time — fine in the running app, fatal
 * in a unit test that renders this component with no `.env` loaded.
 */

import { useEffect, useState } from "react";

import type { RunningGenerationView } from "@/app/projects/[projectId]/generation-status-action";
import { generationMissionLabel } from "@/lib/generation-mission-label";

import styles from "./generation-indicator.module.css";

const POLL_INTERVAL_MS = 5000;

export interface GenerationIndicatorProps {
  readonly projectId: string;
  readonly initial: RunningGenerationView[];
  readonly getRunningGenerations: (projectId: string) => Promise<RunningGenerationView[]>;
}

export function GenerationIndicator({
  projectId,
  initial,
  getRunningGenerations,
}: GenerationIndicatorProps) {
  const [running, setRunning] = useState(initial);

  useEffect(() => {
    let cancelled = false;

    const interval = setInterval(() => {
      void getRunningGenerations(projectId).then((next) => {
        if (!cancelled) setRunning(next);
      });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [projectId, getRunningGenerations]);

  if (running.length === 0) return null;

  return (
    <div className={styles.banner} role="status">
      {running.map((generation) => (
        <p key={generation.id} className={styles.line}>
          <span className={styles.spinner} aria-hidden="true" />
          Génération en cours&nbsp;: {generationMissionLabel(generation.mission)}
        </p>
      ))}
    </div>
  );
}
