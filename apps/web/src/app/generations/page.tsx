import { listRecentGenerations, type RecentGeneration } from "@calepin/shared/repository";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SkeletonBlock } from "@/components/skeleton";
import { SubmitButton } from "@/components/submit-button";
import { formatEstimatedCost, formatEstimatedDuration } from "@/lib/costly-operation";
import { getCurrentUser } from "@/lib/current-user";
import {
  generationAttemptCountLabel,
  generationFailureMessage,
} from "@/lib/generation-error-message";
import { generationMissionLabel } from "@/lib/generation-mission-label";
import { generationStatusLabel } from "@/lib/generation-status-label";
import { projectActionErrorMessage } from "@/lib/project-action-error";
import { signInDestination } from "@/lib/sign-in-redirect";

import { cancelRecentGenerationAction, replayRecentGenerationAction } from "./actions";
import styles from "./page.module.css";

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

const STATUS_STYLE: Record<RecentGeneration["status"], string | undefined> = {
  QUEUED: styles.statusQueued,
  RUNNING: styles.statusRunning,
  SUCCEEDED: styles.statusSucceeded,
  FAILED: styles.statusFailed,
  CANCELLED: styles.statusCancelled,
};

/**
 * The generations operations screen (CAL-068) — every generation the author
 * has ever asked for, across every project, with what it cost and why it
 * failed if it did. Diagnosis without opening the database (§9 forbids
 * showing what was actually written; only the classification travels here).
 *
 * **The auth redirect runs unwrapped, above any `<Suspense>` boundary** — the
 * same reasoning `projects/[projectId]/page.tsx` documents: a `loading.tsx`
 * or an ancestor `<Suspense>` above a `redirect()` locks the response to a
 * 200 before Next knows a redirect is coming, since any async Server
 * Component under one suspends for at least a tick first (`tasks/lessons.md`).
 * This route deliberately has no `loading.tsx` and sits outside the
 * `(dashboard)` group's, and only the actual list — which decides nothing
 * about the response status — is wrapped below.
 */
export default async function GenerationsPage({ searchParams }: PageProps<"/generations">) {
  const user = await getCurrentUser();
  if (!user) redirect(signInDestination("/generations"));

  const error = projectActionErrorMessage((await searchParams).error);

  return (
    <main className={styles.main}>
      <p className={styles.back}>
        <Link href="/">← Mes projets</Link>
      </p>

      <h1 className={styles.title}>Générations</h1>
      <p className={styles.note}>
        Les cent dernières générations demandées, tous projets confondus — de quoi diagnostiquer un
        échec sans ouvrir la base.
      </p>

      {error === null ? null : (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <Suspense fallback={<GenerationsSkeleton />}>
        <GenerationsList ownerId={user.id} />
      </Suspense>
    </main>
  );
}

async function GenerationsList({ ownerId }: { ownerId: string }) {
  const generations = await listRecentGenerations(ownerId);

  if (generations.length === 0) {
    return <p className={styles.empty}>Aucune génération pour l&apos;instant.</p>;
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Mission</th>
            <th scope="col">Projet</th>
            <th scope="col">Statut</th>
            <th scope="col">Modèle</th>
            <th scope="col">Jetons (entrée / sortie)</th>
            <th scope="col">Durée</th>
            <th scope="col">Coût estimé</th>
            <th scope="col">Tentatives</th>
            <th scope="col">Demandée le</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {generations.map((generation) => (
            <GenerationRow key={generation.id} generation={generation} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GenerationRow({ generation }: { generation: RecentGeneration }) {
  const attempts = generationAttemptCountLabel(generation.attemptCount);

  return (
    <tr>
      <td>
        <p className={styles.mission}>{generationMissionLabel(generation.mission)}</p>
        {generation.status === "FAILED" ? (
          <p className={styles.reason}>{generationFailureMessage(generation)}</p>
        ) : null}
      </td>
      <td>
        <Link className={styles.projectLink} href={`/projects/${generation.projectId}`}>
          {generation.projectTitle}
        </Link>
      </td>
      <td>
        <span
          className={[styles.status, STATUS_STYLE[generation.status]].filter(Boolean).join(" ")}
        >
          {generationStatusLabel(generation.status)}
        </span>
      </td>
      <td>{generation.model ?? "—"}</td>
      <td>
        {NUMBER_FORMAT.format(generation.inputTokens)} /{" "}
        {NUMBER_FORMAT.format(generation.outputTokens)}
      </td>
      <td>{formatEstimatedDuration(generation.durationMs)}</td>
      <td>{formatEstimatedCost(generation.estimatedCostUsd)}</td>
      <td>{attempts ?? "—"}</td>
      <td>
        <time dateTime={generation.createdAt.toISOString()}>
          {DATE_FORMAT.format(generation.createdAt)}
        </time>
      </td>
      <td className={styles.actions}>
        {generation.status === "FAILED" ? (
          <form action={replayRecentGenerationAction} className={styles.form}>
            <input type="hidden" name="projectId" value={generation.projectId} />
            <input type="hidden" name="generationId" value={generation.id} />
            <SubmitButton pendingLabel="Relance…">Relancer</SubmitButton>
          </form>
        ) : null}
        {generation.status === "QUEUED" || generation.status === "RUNNING" ? (
          <form action={cancelRecentGenerationAction} className={styles.form}>
            <input type="hidden" name="projectId" value={generation.projectId} />
            <input type="hidden" name="generationId" value={generation.id} />
            <SubmitButton pendingLabel="Annulation…">Annuler</SubmitButton>
          </form>
        ) : null}
      </td>
    </tr>
  );
}

function GenerationsSkeleton() {
  return (
    <div className={styles.skeleton} role="status" aria-live="polite">
      <span className="visually-hidden">Chargement des générations…</span>
      {[0, 1, 2, 3, 4].map((index) => (
        <SkeletonBlock key={index} height="2.5rem" />
      ))}
    </div>
  );
}
