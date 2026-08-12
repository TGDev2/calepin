"use server";

/**
 * Running the bible's coherence check, ruling on what it found, and validating
 * (CAL-099).
 *
 * It composes and nothing more (§3.3): the session says who is asking,
 * `openProjectScope` turns the project id in the form into a proof of
 * ownership, and `@calepin/bible` decides. Nothing here knows what makes two
 * facts contradictory, and nothing here can let a validation through — the gate
 * is inside `validateBible`, so an action that forgot to look would still be
 * refused.
 *
 * **A refusal comes back as a closed code in the URL**, the convention
 * `project-action-error.ts` established: the page owns the sentence, and the
 * banner cannot carry anything a log would have to redact.
 *
 * **Nothing literary is logged** (§9). Every line carries the user, the project
 * and the error's own fields — never an explanation, never a statement, never
 * the name of an element.
 */

import { runBibleCoherenceCheck, validateBible } from "@calepin/bible/repository";
import { runWithActor } from "@calepin/shared/audit";
import { isCoherenceDecision } from "@calepin/shared/coherence";
import { type AppError, errorLogFields } from "@calepin/shared/errors";
import { logger } from "@calepin/shared/logging";
import { openProjectScope, setQualityIssueStatus } from "@calepin/shared/repository";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  type BibleCoherenceError,
  bibleCoherencePath,
  bibleCoherencePathWithError,
  readText,
} from "@/lib/bible-coherence";
import { getCurrentUser } from "@/lib/current-user";
import { withRequestLogContext } from "@/lib/request-context";
import { signInDestination } from "@/lib/sign-in-redirect";

const DASHBOARD_PATH = "/";

/**
 * Every refusal  can produce, named rather than bucketed.
 *
 *  is the one worth spelling out: 
 * refuses a bible validated before the analysis and the direction it is built
 * on, and reading that as *déjà validée* would send the author looking for a
 * validation that never happened.
 */
/**
 * Every refusal `validateBible` can produce, named rather than bucketed.
 *
 * `ILLEGAL_STATUS_TRANSITION` is the one worth spelling out. `withProjectStatus`
 * refuses a bible validated before the analysis and the direction it is built
 * on — the project's own status could not legally reach what the rows would
 * imply — and reading that as *déjà validée* would send the author looking for
 * a validation that never happened.
 */
function refusalOf(error: AppError): BibleCoherenceError {
  if (error.code === "BIBLE_NOT_COHERENT") return "not-coherent";
  if (error.code === "NOT_FOUND") return "missing";
  if (error.code === "ILLEGAL_STATUS_TRANSITION") return "out-of-order";
  if (error.category === "conflict") return "already-validated";

  return "validation";
}

export async function runBibleCoherenceCheckAction(formData: FormData): Promise<void> {
  const projectId = readText(formData.get("projectId"));
  if (projectId === "") redirect(DASHBOARD_PATH);

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(bibleCoherencePath(projectId)));

  const destination = await withRequestLogContext(async () => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) return bibleCoherencePathWithError(projectId, "check");

      const run = await runWithActor(user.id, () => runBibleCoherenceCheck(scope.value));
      if (!run.ok) {
        logger.warn("bible.coherence-check-refused", {
          userId: user.id,
          projectId,
          ...errorLogFields(run.error),
        });

        return bibleCoherencePathWithError(projectId, run.error.code === "NOT_FOUND" ? "missing" : "check");
      }

      logger.info("bible.coherence-checked", {
        userId: user.id,
        projectId,
        itemCount: run.value.run.findings,
      });

      return bibleCoherencePath(projectId);
    } catch (error: unknown) {
      logger.error("bible.coherence-check-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return bibleCoherencePathWithError(projectId, "check");
    }
  });

  revalidatePath(bibleCoherencePath(projectId));
  redirect(destination);
}

export async function arbitrateCoherenceIssueAction(formData: FormData): Promise<void> {
  const projectId = readText(formData.get("projectId"));
  const issueId = readText(formData.get("issueId"));
  const decision = readText(formData.get("decision"));
  if (projectId === "") redirect(DASHBOARD_PATH);

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(bibleCoherencePath(projectId)));

  // A closed vocabulary plus a guard, never `as` on what a form sent: the three
  // an author may write are the domain's, and `DETECTED`/`FIXED` are the
  // engine's own.
  if (issueId === "" || !isCoherenceDecision(decision)) {
    redirect(bibleCoherencePathWithError(projectId, "arbitration"));
  }

  const destination = await withRequestLogContext(async () => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) return bibleCoherencePathWithError(projectId, "arbitration");

      const written = await runWithActor(user.id, () =>
        setQualityIssueStatus(scope.value, { issueId, status: decision }),
      );
      if (!written.ok) {
        logger.warn("bible.coherence-arbitration-refused", {
          userId: user.id,
          projectId,
          ...errorLogFields(written.error),
        });

        return bibleCoherencePathWithError(projectId, "arbitration");
      }

      logger.info("bible.coherence-arbitrated", { userId: user.id, projectId });

      return bibleCoherencePath(projectId);
    } catch (error: unknown) {
      logger.error("bible.coherence-arbitration-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return bibleCoherencePathWithError(projectId, "arbitration");
    }
  });

  revalidatePath(bibleCoherencePath(projectId));
  redirect(destination);
}

export async function validateBibleAction(formData: FormData): Promise<void> {
  const projectId = readText(formData.get("projectId"));
  if (projectId === "") redirect(DASHBOARD_PATH);

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(bibleCoherencePath(projectId)));

  const destination = await withRequestLogContext(async () => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) return bibleCoherencePathWithError(projectId, "validation");

      const validated = await runWithActor(user.id, () => validateBible(scope.value));
      if (!validated.ok) {
        logger.warn("bible.validation-refused", {
          userId: user.id,
          projectId,
          ...errorLogFields(validated.error),
        });

        return bibleCoherencePathWithError(projectId, refusalOf(validated.error));
      }

      logger.info("bible.validated", { userId: user.id, projectId });

      return bibleCoherencePath(projectId);
    } catch (error: unknown) {
      logger.error("bible.validation-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return bibleCoherencePathWithError(projectId, "validation");
    }
  });

  revalidatePath(bibleCoherencePath(projectId));
  revalidatePath(`/projects/${projectId}/bible`);
  redirect(destination);
}
