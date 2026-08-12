"use server";

/**
 * Adding, rewriting, retiring, deleting and locking one canonical fact
 * (CAL-098).
 *
 * It composes and nothing more (§3.3): the session says who is asking,
 * `openProjectScope` turns the project id in the form into a proof of
 * ownership, `parseCanonFactContent` applies the domain's rules about what a
 * fact may say, and the repository performs.
 *
 * **The domain parses, then the repository persists.** `@calepin/shared` may
 * not import a domain (§3.2), so both domain rules are applied here — the
 * ceilings and the temporal shapes through `parseCanonFactContent`, and the
 * duplicate guard through `canonFactKey`. The division `relationships/actions.ts`
 * already draws, with one more rule on this side of it.
 *
 * **A refusal comes back as state, never as a redirect**: the form holds what
 * the author just wrote. A success revalidates and the list reflects it.
 *
 * **Nothing literary is logged** (§9). Every line carries the user, the project
 * and the error's own fields — never a statement, never a name, and never a
 * `canonFactKey`, which is built out of a statement and is therefore the
 * statement in another coat.
 */

import { canonFactKey, parseCanonFactContent } from "@calepin/bible";
import { runWithActor } from "@calepin/shared/audit";
import { type AppError, errorLogFields } from "@calepin/shared/errors";
import { logger } from "@calepin/shared/logging";
import {
  type BibleCanonFactRow,
  type CanonFactContentInput,
  deleteCanonFact,
  editCanonFact,
  getBibleOverview,
  lockBibleElement,
  openProjectScope,
  setCanonFactStatus,
  unlockBibleElement,
  writeCanonFact,
} from "@calepin/shared/repository";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  CANON_FACT_BIBLE_MISSING_MESSAGE,
  CANON_FACT_DELETE_UNAVAILABLE_MESSAGE,
  CANON_FACT_DUPLICATE_MESSAGE,
  CANON_FACT_EDIT_UNAVAILABLE_MESSAGE,
  CANON_FACT_LOCK_UNAVAILABLE_MESSAGE,
  CANON_FACT_MISSING_MESSAGE,
  CANON_FACT_STATUS_UNAVAILABLE_MESSAGE,
  CANON_FACT_UNLOCK_UNAVAILABLE_MESSAGE,
  CANON_FACT_WRITE_UNAVAILABLE_MESSAGE,
  type CanonFactFormState,
  canonFactsPath,
  readCanonFactSubmission,
  readText,
} from "@/lib/canon-fact-edit";
import { getCurrentUser } from "@/lib/current-user";
import { withRequestLogContext } from "@/lib/request-context";
import { signInDestination } from "@/lib/sign-in-redirect";

const DASHBOARD_PATH = "/";

/**
 * The three statuses, as values rather than as a widened string.
 *
 * A closed list plus a guard, never `as` on what a form sent: a status is an
 * enum member the database will refuse anyway, and §6's rule about not trusting
 * a caller with an identifier reads the same way one field over.
 */
const STATUSES = ["PROPOSED", "CONFIRMED", "REJECTED"] as const satisfies readonly BibleCanonFactRow["status"][];

function isCanonFactStatus(value: string): value is BibleCanonFactRow["status"] {
  return (STATUSES as readonly string[]).includes(value);
}

/**
 * The sentence a refusal becomes. A conflict is the only category whose own
 * message says something the author can act on — the fact is locked, it already
 * holds that status, or it is one a chapter plan cites.
 */
function messageFor(error: AppError, unavailable: string): string {
  if (error.category === "conflict") return error.userMessage;

  return error.code === "NOT_FOUND" ? CANON_FACT_MISSING_MESSAGE : unavailable;
}

function refuse(
  event: string,
  userId: string,
  projectId: string,
  error: AppError,
  message: string,
): CanonFactFormState {
  logger.warn(event, { userId, projectId, ...errorLogFields(error) });

  return { status: "error", message };
}

/**
 * One fact reduced to what `canonFactKey` compares.
 *
 * Ids stand in for the names the mission's own path uses: within one bible they
 * identify the same rows, and the key never leaves this process.
 */
function keyOf(fact: CanonFactContentInput): string {
  return canonFactKey({
    statement: fact.statement,
    isTrue: fact.isTrue,
    validity: fact.validity,
    validFromDay: fact.validFrom?.day ?? null,
    validUntilDay: fact.validUntil?.day ?? null,
    endingEventKey: fact.invalidatedByEventId,
    subjectKeys: fact.subjects.map((subject) => `${subject.kind}:${subject.id}`),
    beliefs: [],
  });
}

function keyOfRow(row: BibleCanonFactRow): string {
  return canonFactKey({
    statement: row.statement,
    isTrue: row.isTrue,
    validity: row.validity,
    validFromDay: row.validFromDay,
    validUntilDay: row.validUntilDay,
    endingEventKey: row.invalidatedByEventId,
    subjectKeys: row.subjects.map((subject) =>
      subject.characterId === null ? `place:${String(subject.placeId)}` : `character:${subject.characterId}`,
    ),
    beliefs: [],
  });
}

export async function writeCanonFactAction(
  _previous: CanonFactFormState,
  formData: FormData,
): Promise<CanonFactFormState> {
  const projectId = readText(formData.get("projectId"));

  if (projectId === null) redirect(DASHBOARD_PATH);

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(canonFactsPath(projectId)));

  const content = parseCanonFactContent(readCanonFactSubmission(formData));
  if (!content.ok) return { status: "error", message: content.error.userMessage };

  return withRequestLogContext(async (): Promise<CanonFactFormState> => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) {
        return refuse(
          "canon-fact.write-refused",
          user.id,
          projectId,
          scope.error,
          CANON_FACT_MISSING_MESSAGE,
        );
      }

      // The bible id is the project's own, read rather than taken from the
      // form: it is not a choice the author makes, and the same read gives the
      // duplicate guard the canon it compares against.
      const overview = await getBibleOverview(scope.value);
      if (overview === null) {
        return { status: "error", message: CANON_FACT_BIBLE_MISSING_MESSAGE };
      }

      const key = keyOf(content.value);
      if (overview.canonFacts.some((row) => keyOfRow(row) === key)) {
        logger.warn("canon-fact.duplicate-refused", { userId: user.id, projectId });

        return { status: "error", message: CANON_FACT_DUPLICATE_MESSAGE };
      }

      const written = await runWithActor(user.id, async () =>
        writeCanonFact(scope.value, { bibleId: overview.bibleId, ...content.value }),
      );

      if (!written.ok) {
        return refuse(
          "canon-fact.write-refused",
          user.id,
          projectId,
          written.error,
          messageFor(written.error, CANON_FACT_WRITE_UNAVAILABLE_MESSAGE),
        );
      }

      revalidatePath(canonFactsPath(projectId));
      logger.info("canon-fact.written", { userId: user.id, projectId });

      return { status: "idle" };
    } catch (error: unknown) {
      logger.error("canon-fact.write-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return { status: "error", message: CANON_FACT_WRITE_UNAVAILABLE_MESSAGE };
    }
  });
}

export async function editCanonFactAction(
  _previous: CanonFactFormState,
  formData: FormData,
): Promise<CanonFactFormState> {
  const projectId = readText(formData.get("projectId"));
  const factId = readText(formData.get("factId"));

  if (projectId === null || factId === null) redirect(DASHBOARD_PATH);

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(canonFactsPath(projectId)));

  const content = parseCanonFactContent(readCanonFactSubmission(formData));
  if (!content.ok) return { status: "error", message: content.error.userMessage };

  return withRequestLogContext(async (): Promise<CanonFactFormState> => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) {
        return refuse(
          "canon-fact.edit-refused",
          user.id,
          projectId,
          scope.error,
          CANON_FACT_MISSING_MESSAGE,
        );
      }

      const edited = await runWithActor(user.id, async () =>
        editCanonFact(scope.value, { factId, ...content.value }),
      );

      if (!edited.ok) {
        return refuse(
          "canon-fact.edit-refused",
          user.id,
          projectId,
          edited.error,
          messageFor(edited.error, CANON_FACT_EDIT_UNAVAILABLE_MESSAGE),
        );
      }

      revalidatePath(canonFactsPath(projectId));
      if (edited.value.updated) logger.info("canon-fact.edited", { userId: user.id, projectId });

      return { status: "idle" };
    } catch (error: unknown) {
      logger.error("canon-fact.edit-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return { status: "error", message: CANON_FACT_EDIT_UNAVAILABLE_MESSAGE };
    }
  });
}

export async function setCanonFactStatusAction(
  _previous: CanonFactFormState,
  formData: FormData,
): Promise<CanonFactFormState> {
  const projectId = readText(formData.get("projectId"));
  const factId = readText(formData.get("factId"));
  const status = readText(formData.get("status"));

  if (projectId === null || factId === null || status === null || !isCanonFactStatus(status)) {
    redirect(DASHBOARD_PATH);
  }

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(canonFactsPath(projectId)));

  return withRequestLogContext(async (): Promise<CanonFactFormState> => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) {
        return refuse(
          "canon-fact.status-refused",
          user.id,
          projectId,
          scope.error,
          CANON_FACT_MISSING_MESSAGE,
        );
      }

      const moved = await runWithActor(user.id, async () =>
        setCanonFactStatus(scope.value, { factId, status }),
      );

      if (!moved.ok) {
        return refuse(
          "canon-fact.status-refused",
          user.id,
          projectId,
          moved.error,
          messageFor(moved.error, CANON_FACT_STATUS_UNAVAILABLE_MESSAGE),
        );
      }

      revalidatePath(canonFactsPath(projectId));
      logger.info("canon-fact.status-changed", { userId: user.id, projectId });

      return { status: "idle" };
    } catch (error: unknown) {
      logger.error("canon-fact.status-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return { status: "error", message: CANON_FACT_STATUS_UNAVAILABLE_MESSAGE };
    }
  });
}

export async function deleteCanonFactAction(
  _previous: CanonFactFormState,
  formData: FormData,
): Promise<CanonFactFormState> {
  const projectId = readText(formData.get("projectId"));
  const factId = readText(formData.get("factId"));

  if (projectId === null || factId === null) redirect(DASHBOARD_PATH);

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(canonFactsPath(projectId)));

  return withRequestLogContext(async (): Promise<CanonFactFormState> => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) {
        return refuse(
          "canon-fact.delete-refused",
          user.id,
          projectId,
          scope.error,
          CANON_FACT_MISSING_MESSAGE,
        );
      }

      const removed = await runWithActor(user.id, async () =>
        deleteCanonFact(scope.value, factId),
      );

      if (!removed.ok) {
        return refuse(
          "canon-fact.delete-refused",
          user.id,
          projectId,
          removed.error,
          messageFor(removed.error, CANON_FACT_DELETE_UNAVAILABLE_MESSAGE),
        );
      }

      revalidatePath(canonFactsPath(projectId));
      logger.info("canon-fact.deleted", { userId: user.id, projectId });

      return { status: "idle" };
    } catch (error: unknown) {
      logger.error("canon-fact.delete-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return { status: "error", message: CANON_FACT_DELETE_UNAVAILABLE_MESSAGE };
    }
  });
}

/**
 * Locking and lifting share one body: the two statements differ only in which
 * repository function they call and which sentence they fall back to, and the
 * generic `lockBibleElement`/`unlockBibleElement` of CAL-095 are reused
 * unchanged — a canonical fact is the ninth model they already cover.
 */
async function moveLock(
  formData: FormData,
  lock: boolean,
): Promise<CanonFactFormState> {
  const projectId = readText(formData.get("projectId"));
  const factId = readText(formData.get("factId"));

  if (projectId === null || factId === null) redirect(DASHBOARD_PATH);

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(canonFactsPath(projectId)));

  const unavailable = lock
    ? CANON_FACT_LOCK_UNAVAILABLE_MESSAGE
    : CANON_FACT_UNLOCK_UNAVAILABLE_MESSAGE;
  const event = lock ? "canon-fact.lock" : "canon-fact.unlock";

  return withRequestLogContext(async (): Promise<CanonFactFormState> => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) {
        return refuse(`${event}-refused`, user.id, projectId, scope.error, CANON_FACT_MISSING_MESSAGE);
      }

      const target = { model: "CanonFact", id: factId, field: null } as const;

      const moved = await runWithActor(user.id, async () =>
        lock ? lockBibleElement(scope.value, target) : unlockBibleElement(scope.value, target),
      );

      if (!moved.ok) {
        return refuse(
          `${event}-refused`,
          user.id,
          projectId,
          moved.error,
          messageFor(moved.error, unavailable),
        );
      }

      revalidatePath(canonFactsPath(projectId));
      logger.info(`${event}ed`, { userId: user.id, projectId });

      return { status: "idle" };
    } catch (error: unknown) {
      logger.error(`${event}-failed`, {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return { status: "error", message: unavailable };
    }
  });
}

export async function lockCanonFactAction(
  _previous: CanonFactFormState,
  formData: FormData,
): Promise<CanonFactFormState> {
  return moveLock(formData, true);
}

export async function unlockCanonFactAction(
  _previous: CanonFactFormState,
  formData: FormData,
): Promise<CanonFactFormState> {
  return moveLock(formData, false);
}
