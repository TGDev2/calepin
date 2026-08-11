"use server";

/**
 * Adding, rewriting and removing one directed tie between two characters
 * (CAL-091).
 *
 * It composes and nothing more (§3.3): the session says who is asking,
 * `openProjectScope` turns the project id in the form into a proof of
 * ownership, `parseRelationshipContent` applies the domain's rule about what a
 * tie may say, and the repository performs.
 *
 * **The domain parses, then the repository persists.** `@calepin/shared` may
 * not import a domain (§3.2), so the ceilings are applied here —
 * `directions/actions.ts`'s division, one epic later.
 *
 * **A refusal comes back as state, never as a redirect**: the form holds what
 * the author just wrote. A success revalidates and returns to the graph, which
 * already reflects it.
 *
 * **Nothing literary is logged** (§9). Every log line carries the user and the
 * project and the error's own fields — never a name, a label or a description.
 */

import { parseRelationshipContent } from "@calepin/bible";
import { runWithActor } from "@calepin/shared/audit";
import { type AppError, errorLogFields } from "@calepin/shared/errors";
import { logger } from "@calepin/shared/logging";
import {
  deleteRelationship,
  editRelationship,
  getRelationshipGraph,
  openProjectScope,
  writeRelationship,
} from "@calepin/shared/repository";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import {
  readRelationshipContentSubmission,
  readText,
  RELATIONSHIP_DELETE_UNAVAILABLE_MESSAGE,
  RELATIONSHIP_EDIT_UNAVAILABLE_MESSAGE,
  RELATIONSHIP_MISSING_MESSAGE,
  RELATIONSHIP_WRITE_UNAVAILABLE_MESSAGE,
  type RelationshipFormState,
  relationshipsPath,
} from "@/lib/relationship-edit";
import { withRequestLogContext } from "@/lib/request-context";
import { signInDestination } from "@/lib/sign-in-redirect";

const DASHBOARD_PATH = "/";

/**
 * The sentence a refusal becomes. A conflict is the only category whose own
 * message says something the author can act on — the tie already exists, it is
 * locked, or it would loop back on one character.
 */
function messageFor(error: AppError, unavailable: string): string {
  if (error.category === "conflict") return error.userMessage;

  return error.code === "NOT_FOUND" ? RELATIONSHIP_MISSING_MESSAGE : unavailable;
}

function refuse(
  event: string,
  userId: string,
  projectId: string,
  error: AppError,
  message: string,
): RelationshipFormState {
  logger.warn(event, { userId, projectId, ...errorLogFields(error) });

  return { status: "error", message };
}

export async function writeRelationshipAction(
  _previous: RelationshipFormState,
  formData: FormData,
): Promise<RelationshipFormState> {
  const projectId = readText(formData.get("projectId"));
  const fromCharacterId = readText(formData.get("fromCharacterId"));
  const toCharacterId = readText(formData.get("toCharacterId"));

  if (projectId === null || fromCharacterId === null || toCharacterId === null) {
    redirect(DASHBOARD_PATH);
  }

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(relationshipsPath(projectId)));

  const content = parseRelationshipContent(readRelationshipContentSubmission(formData));
  if (!content.ok) return { status: "error", message: content.error.userMessage };

  const outcome = await withRequestLogContext(async (): Promise<RelationshipFormState> => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) {
        return refuse(
          "relationship.write-refused",
          user.id,
          projectId,
          scope.error,
          RELATIONSHIP_MISSING_MESSAGE,
        );
      }

      // The bible id is the project's own, read rather than taken from the
      // form: it is not a choice the author makes, and a form field for it
      // would be one more id a caller could get wrong.
      const graph = await getRelationshipGraph(scope.value);
      if (graph === null) {
        return { status: "error", message: RELATIONSHIP_MISSING_MESSAGE };
      }

      const written = await runWithActor(user.id, async () =>
        writeRelationship(scope.value, {
          bibleId: graph.bibleId,
          fromCharacterId,
          toCharacterId,
          ...content.value,
        }),
      );

      if (!written.ok) {
        return refuse(
          "relationship.write-refused",
          user.id,
          projectId,
          written.error,
          messageFor(written.error, RELATIONSHIP_WRITE_UNAVAILABLE_MESSAGE),
        );
      }

      revalidatePath(relationshipsPath(projectId));
      logger.info("relationship.written", { userId: user.id, projectId });

      return { status: "idle" };
    } catch (error: unknown) {
      logger.error("relationship.write-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return { status: "error", message: RELATIONSHIP_WRITE_UNAVAILABLE_MESSAGE };
    }
  });

  return outcome;
}

export async function editRelationshipAction(
  _previous: RelationshipFormState,
  formData: FormData,
): Promise<RelationshipFormState> {
  const projectId = readText(formData.get("projectId"));
  const relationshipId = readText(formData.get("relationshipId"));

  if (projectId === null || relationshipId === null) redirect(DASHBOARD_PATH);

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(relationshipsPath(projectId)));

  const content = parseRelationshipContent(readRelationshipContentSubmission(formData));
  if (!content.ok) return { status: "error", message: content.error.userMessage };

  const outcome = await withRequestLogContext(async (): Promise<RelationshipFormState> => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) {
        return refuse(
          "relationship.edit-refused",
          user.id,
          projectId,
          scope.error,
          RELATIONSHIP_MISSING_MESSAGE,
        );
      }

      const edited = await runWithActor(user.id, async () =>
        editRelationship(scope.value, { relationshipId, ...content.value }),
      );

      if (!edited.ok) {
        return refuse(
          "relationship.edit-refused",
          user.id,
          projectId,
          edited.error,
          messageFor(edited.error, RELATIONSHIP_EDIT_UNAVAILABLE_MESSAGE),
        );
      }

      revalidatePath(relationshipsPath(projectId));
      logger.info("relationship.edited", { userId: user.id, projectId });

      return { status: "idle" };
    } catch (error: unknown) {
      logger.error("relationship.edit-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return { status: "error", message: RELATIONSHIP_EDIT_UNAVAILABLE_MESSAGE };
    }
  });

  return outcome;
}

export async function deleteRelationshipAction(
  _previous: RelationshipFormState,
  formData: FormData,
): Promise<RelationshipFormState> {
  const projectId = readText(formData.get("projectId"));
  const relationshipId = readText(formData.get("relationshipId"));

  if (projectId === null || relationshipId === null) redirect(DASHBOARD_PATH);

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(relationshipsPath(projectId)));

  const outcome = await withRequestLogContext(async (): Promise<RelationshipFormState> => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) {
        return refuse(
          "relationship.delete-refused",
          user.id,
          projectId,
          scope.error,
          RELATIONSHIP_MISSING_MESSAGE,
        );
      }

      const removed = await runWithActor(user.id, async () =>
        deleteRelationship(scope.value, relationshipId),
      );

      if (!removed.ok) {
        return refuse(
          "relationship.delete-refused",
          user.id,
          projectId,
          removed.error,
          messageFor(removed.error, RELATIONSHIP_DELETE_UNAVAILABLE_MESSAGE),
        );
      }

      revalidatePath(relationshipsPath(projectId));
      logger.info("relationship.deleted", { userId: user.id, projectId });

      return { status: "idle" };
    } catch (error: unknown) {
      logger.error("relationship.delete-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return { status: "error", message: RELATIONSHIP_DELETE_UNAVAILABLE_MESSAGE };
    }
  });

  return outcome;
}
