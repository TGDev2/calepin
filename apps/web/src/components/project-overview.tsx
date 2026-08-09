"use client";

/**
 * The top of a project page (CAL-039): header, stats, the process bar, the
 * error banner and the rename form — together, because the rename form is
 * the only optimistic update that has to reach content elsewhere on the
 * page (the `<h1>`), and two sibling components cannot share React state
 * without a common ancestor holding it. Everything else on the page
 * (duplicate, archive/restore, delete) is self-contained in its own section
 * and does not need to live here.
 *
 * **The rename form's `action` is never touched.** It stays the real,
 * unwrapped server action passed straight to `<form action={renameAction}>`,
 * which is what gives Next's no-JS progressive enhancement fallback
 * (CLAUDE.md §3.5's "the whole screen works with JavaScript off", restated
 * on this page since CAL-035). The optimistic title update is a same-form
 * `onSubmit` handler instead — purely additive, never fires without
 * JavaScript, and the native submission is unaffected either way.
 *
 * **The status badge is not touched by this component.** It shows exactly
 * what the server computed (`statusLabel`), because `Project.status` is
 * derived from rows this screen doesn't have (CAL-034) — renaming doesn't
 * change it, so there is nothing to guess.
 */

import type { ProjectProgress } from "@calepin/shared/project-status";
import { useOptimistic, useTransition } from "react";

import { readProjectTitle } from "@/lib/project-title";

import { ProcessStepper } from "./process-stepper";
import styles from "./project-overview.module.css";
import { SubmitButton } from "./submit-button";

export interface ProjectOverviewProps {
  readonly projectId: string;
  readonly title: string;
  readonly titleMaxLength: number;
  readonly statusLabel: string;
  readonly updatedAtIso: string;
  readonly updatedAtLabel: string;
  readonly writtenChapterCountLabel: string;
  readonly totalWordCountLabel: string;
  readonly progress: ProjectProgress;
  readonly error: string | null;
  readonly renameAction: (formData: FormData) => Promise<void>;
}

export function ProjectOverview({
  projectId,
  title,
  titleMaxLength,
  statusLabel,
  updatedAtIso,
  updatedAtLabel,
  writtenChapterCountLabel,
  totalWordCountLabel,
  progress,
  error,
  renameAction,
}: ProjectOverviewProps) {
  const [optimisticTitle, setOptimisticTitle] = useOptimistic(title);
  const [, startTransition] = useTransition();

  function handleRenameSubmit(event: React.FormEvent<HTMLFormElement>): void {
    const nextTitle = readProjectTitle(new FormData(event.currentTarget).get("title"));
    if (nextTitle === null) return;

    startTransition(() => setOptimisticTitle(nextTitle));
  }

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>{optimisticTitle}</h1>
        <span className={styles.status}>{statusLabel}</span>
      </div>

      <p className={styles.updatedAt}>
        Modifié le <time dateTime={updatedAtIso}>{updatedAtLabel}</time>
      </p>

      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>Chapitres rédigés</dt>
          <dd>{writtenChapterCountLabel}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Mots</dt>
          <dd>{totalWordCountLabel}</dd>
        </div>
      </dl>

      <ProcessStepper progress={progress} />

      {error ? (
        <p className={styles.error} role="alert">
          <span className={styles.errorIcon} aria-hidden="true">
            ⚠
          </span>
          <span>
            <strong>Erreur&nbsp;: </strong>
            {error}
          </span>
        </p>
      ) : null}

      <h2 className={styles.sectionsTitle}>Actions</h2>

      <section className={styles.action} aria-labelledby="rename-heading">
        <h3 className={styles.actionTitle} id="rename-heading">
          Renommer
        </h3>
        <form className={styles.renameForm} action={renameAction} onSubmit={handleRenameSubmit}>
          <input type="hidden" name="projectId" value={projectId} />
          <label className={styles.label} htmlFor="title">
            Titre du projet
          </label>
          <input
            className={styles.input}
            id="title"
            name="title"
            type="text"
            defaultValue={title}
            maxLength={titleMaxLength}
            required
            aria-required="true"
          />
          <SubmitButton pendingLabel="Renommage…">Renommer</SubmitButton>
        </form>
      </section>
    </>
  );
}
