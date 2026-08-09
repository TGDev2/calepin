"use client";

/**
 * The archive/restore section of a project page (CAL-039).
 *
 * Self-contained, unlike the rename form: flipping "Archiver" ↔ "Restaurer"
 * needs no state from anywhere else on the page, so it does not need to
 * share an ancestor the way `ProjectOverview` does for the title.
 *
 * **The top-level status badge is deliberately not touched by this
 * component** (it lives in `ProjectOverview`, unchanged by an archive or a
 * restore). `Project.status` is derived server-side from rows this screen
 * doesn't have (CAL-034) — archiving flips a known boolean, but *restoring*
 * lands on whatever stage the project's content justifies, which only the
 * server can compute. Guessing it here would be exactly what CLAUDE.md's
 * "derived state is never asserted by a caller" rule warns against, applied
 * to this screen. What optimism buys instead is this section's own
 * heading, note and button flipping instantly, before the redirect lands.
 *
 * **Both forms keep their real `action` untouched**, same reasoning as
 * `ProjectOverview`'s rename form: the optimistic flip is an additive
 * `onSubmit` handler, so a visitor with JavaScript off still gets the exact
 * behaviour this screen had before CAL-039.
 */

import { useOptimistic, useTransition } from "react";

import styles from "./archive-project-section.module.css";
import { SubmitButton } from "./submit-button";

export interface ArchiveProjectSectionProps {
  readonly projectId: string;
  readonly isArchived: boolean;
  readonly archiveAction: (formData: FormData) => Promise<void>;
  readonly restoreAction: (formData: FormData) => Promise<void>;
}

export function ArchiveProjectSection({
  projectId,
  isArchived,
  archiveAction,
  restoreAction,
}: ArchiveProjectSectionProps) {
  const [optimisticIsArchived, setOptimisticIsArchived] = useOptimistic(isArchived);
  const [, startTransition] = useTransition();

  function requestFlip(): void {
    startTransition(() => setOptimisticIsArchived(!optimisticIsArchived));
  }

  return (
    <section className={styles.action} aria-labelledby="archive-heading">
      <h3 className={styles.actionTitle} id="archive-heading">
        {optimisticIsArchived ? "Restaurer" : "Archiver"}
      </h3>
      <p className={styles.actionNote}>
        {optimisticIsArchived
          ? "Ce projet est archivé. Le restaurer le remet à l'étape que son contenu justifie."
          : "L'archivage met le projet de côté sans rien supprimer. Il reste consultable, et vous pouvez le restaurer à tout moment."}
      </p>
      <form action={optimisticIsArchived ? restoreAction : archiveAction} onSubmit={requestFlip}>
        <input type="hidden" name="projectId" value={projectId} />
        <SubmitButton pendingLabel={optimisticIsArchived ? "Restauration…" : "Archivage…"}>
          {optimisticIsArchived ? "Restaurer ce projet" : "Archiver ce projet"}
        </SubmitButton>
      </form>
    </section>
  );
}
