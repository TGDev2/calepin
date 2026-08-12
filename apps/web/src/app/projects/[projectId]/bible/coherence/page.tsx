/**
 * The coherence check of a project's bible (CAL-099).
 *
 * One screen for one decision: *puis-je valider cette bible ?* Everything on it
 * serves that question — what stands in the way, why, and the three things the
 * author can do about each one.
 *
 * **What is shown is what is stored, and it is not recomputed on render.** A
 * page that ran four checks over the whole bible on every paint would make
 * opening it expensive and would show a report nobody asked for; the run is an
 * action the author takes, and the screen shows its result. That is also what
 * makes the screen honest about the model half: a contradiction
 * `detect-bible-contradictions` found sits in the same list, under its own
 * check, and blocks the validation exactly as a calculable one does.
 *
 * **No `<Suspense>` boundary.** The ownership decision must run above any
 * boundary or Next locks the status to 200 before it can know the page 404s —
 * the trap `tasks/lessons.md` records.
 */

import { readBibleCoherenceIssues } from "@calepin/bible/repository";
import { isBlockingIssue } from "@calepin/shared/coherence";
import {
  getBibleOverview,
  getProjectForOwner,
  openProjectScope,
  type QualityIssueRow,
} from "@calepin/shared/repository";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  BIBLE_CHECK_LABELS,
  bibleCoherenceErrorMessage,
  bibleCoherencePath,
  COHERENCE_DECISION_LABELS,
  COHERENCE_SEVERITY_LABELS,
  COHERENCE_STATUS_LABELS,
} from "@/lib/bible-coherence";
import { getCurrentUser } from "@/lib/current-user";
import { signInDestination } from "@/lib/sign-in-redirect";

import {
  arbitrateCoherenceIssueAction,
  runBibleCoherenceCheckAction,
  validateBibleAction,
} from "./actions";
import styles from "./page.module.css";

const DECISIONS = ["ACCEPTED", "TO_FIX", "IGNORED"] as const;

export default async function BibleCoherencePage({
  params,
  searchParams,
}: PageProps<"/projects/[projectId]/bible/coherence">) {
  const { projectId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(bibleCoherencePath(projectId)));

  const [found, scope] = await Promise.all([
    getProjectForOwner({ ownerId: user.id, projectId }),
    openProjectScope({ ownerId: user.id, projectId }),
  ]);
  if (!found.ok || !scope.ok) notFound();

  const [overview, issues] = await Promise.all([
    getBibleOverview(scope.value),
    readBibleCoherenceIssues(scope.value),
  ]);

  const banner = bibleCoherenceErrorMessage((await searchParams).error);
  const open = issues.ok ? issues.value.filter((issue) => issue.status !== "FIXED") : [];
  const settled = issues.ok ? issues.value.filter((issue) => issue.status === "FIXED") : [];
  const blocking = open.filter(isBlockingIssue);

  return (
    <main className={styles.main}>
      <p className={styles.back}>
        <Link href={`/projects/${projectId}/bible`}>← {found.value.title}, bible</Link>
      </p>

      <h1 className={styles.title}>Cohérence de la bible</h1>

      <p className={styles.intro}>
        Le contrôle relit la bible contre elle-même&nbsp;: les âges et les dates, les liens
        déclarés d&rsquo;un seul côté, les noms qui n&rsquo;ont ni fiche ni lieu, et les faits
        canoniques qui s&rsquo;opposent. Un signalement bloquant empêche la validation tant que
        vous ne vous êtes pas prononcé dessus.
      </p>

      {banner === null ? null : (
        <p className={styles.banner} role="alert">
          {banner}
        </p>
      )}

      {overview === null ? (
        <p className={styles.empty}>
          Ce projet n&rsquo;a pas encore de bible&nbsp;: le contrôle s&rsquo;exécutera une fois la
          bible ouverte.
        </p>
      ) : (
        <>
          <section className={styles.actions} aria-label="Contrôle et validation">
            <form action={runBibleCoherenceCheckAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <button type="submit" className={styles.primary}>
                Lancer le contrôle
              </button>
            </form>

            {overview.validatedAt === null ? (
              <form action={validateBibleAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <button type="submit" className={styles.validate} disabled={blocking.length > 0}>
                  Valider la bible
                </button>
              </form>
            ) : (
              <p className={styles.validated}>Bible validée.</p>
            )}
          </section>

          {/*
            Two states, never three. *Aucun contrôle n'a encore été lancé* would
            need a run timestamp nothing stores, and inferring it from an empty
            list would claim silence where there may simply be nothing to
            report — the distinction §9's obsolescence rules already refuse to
            fake elsewhere.
          */}
          <p className={styles.summary}>
            {blocking.length === 0
              ? "Rien ne bloque la validation."
              : blocking.length === 1
                ? "Une contradiction bloque la validation."
                : `${String(blocking.length)} contradictions bloquent la validation.`}
          </p>

          <IssueList
            heading="Signalements ouverts"
            projectId={projectId}
            issues={open}
            emptyLabel="Aucun signalement ouvert."
            arbitrable
          />

          {settled.length === 0 ? null : (
            <IssueList
              heading="Signalements résolus"
              projectId={projectId}
              issues={settled}
              emptyLabel="Aucun signalement résolu."
              arbitrable={false}
            />
          )}
        </>
      )}
    </main>
  );
}

interface IssueListProps {
  readonly heading: string;
  readonly projectId: string;
  readonly issues: readonly QualityIssueRow[];
  readonly emptyLabel: string;
  readonly arbitrable: boolean;
}

function IssueList({ heading, projectId, issues, emptyLabel, arbitrable }: IssueListProps) {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{heading}</h2>

      {issues.length === 0 ? (
        <p className={styles.empty}>{emptyLabel}</p>
      ) : (
        <ul className={styles.list} aria-label={heading}>
          {issues.map((issue) => (
            <li key={issue.id} className={styles.card}>
              <p className={styles.badges}>
                <span
                  className={
                    issue.severity === "CRITICAL" ? styles.blockingBadge : styles.severityBadge
                  }
                >
                  {COHERENCE_SEVERITY_LABELS[issue.severity]}
                </span>
                <span className={styles.checkBadge}>{BIBLE_CHECK_LABELS[issue.checkId]}</span>
                <span className={styles.statusBadge}>
                  {COHERENCE_STATUS_LABELS[issue.status]}
                </span>
              </p>

              <p className={styles.explanation}>{issue.explanation}</p>

              {issue.proposedFix === null ? null : (
                <p className={styles.fix}>{issue.proposedFix}</p>
              )}

              {!arbitrable ? null : (
                <div className={styles.decisions}>
                  {DECISIONS.filter((decision) => decision !== issue.status).map((decision) => (
                    <form key={decision} action={arbitrateCoherenceIssueAction}>
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="issueId" value={issue.id} />
                      <input type="hidden" name="decision" value={decision} />
                      <button
                        type="submit"
                        className={styles.decision}
                        title={COHERENCE_DECISION_LABELS[decision].effect}
                      >
                        {COHERENCE_DECISION_LABELS[decision].action}
                      </button>
                    </form>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
