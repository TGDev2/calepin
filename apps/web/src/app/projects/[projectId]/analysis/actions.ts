"use server";

/**
 * Saving an edited section, and the notes hanging off its elements (CAL-073).
 *
 * These compose and nothing more, which is what the interface layer is for
 * (§3.3): the session says who is asking, `openProjectScope` turns the project
 * id in the form into a proof of ownership, `parseAnalysisSectionEdit` applies
 * the section's own rules, and the repository performs — appending a revision,
 * carrying every element's origin across it, and leaving the sixteen other
 * sections and their notes untouched.
 *
 * **The domain parses, then the repository persists.** `@calepin/shared` may
 * not import a domain (§3.2), so the schema that decides what a section may say
 * is applied here rather than inside the write. The other write path — a future
 * executor for `analyze-source-text` — parses the same schema at the mission
 * boundary before anything is stored (§6). One schema, applied at each caller's
 * own layer.
 *
 * **A refusal comes back as state, never as a redirect.** These forms hold what
 * the author just wrote; a redirect would answer "that was too long" by
 * throwing the text away. A *success* redirects, because the edited section is
 * now on the page behind the form and there is nothing left to keep.
 */

import {
  type AnalysisElementDraft,
  isListedAnalysisSection,
  parseAnalysisSectionEdit,
} from "@calepin/analysis";
import { runWithActor } from "@calepin/shared/audit";
import { errorLogFields } from "@calepin/shared/errors";
import { logger } from "@calepin/shared/logging";
import {
  addAnalysisAnnotation,
  deleteAnalysisAnnotation,
  editAnalysisSection,
  openProjectScope,
  type ProjectScope,
  updateAnalysisAnnotation,
} from "@calepin/shared/repository";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ANALYSIS_EDIT_UNAVAILABLE_MESSAGE,
  ANALYSIS_MISSING_MESSAGE,
  type AnalysisEditState,
  analysisPath,
  ANNOTATION_UNAVAILABLE_MESSAGE,
  readAnalysisSection,
  readPostedElements,
  readText,
} from "@/lib/analysis-edit";
import { getCurrentUser } from "@/lib/current-user";
import { withRequestLogContext } from "@/lib/request-context";
import { signInDestination } from "@/lib/sign-in-redirect";

const DASHBOARD_PATH = "/";

export async function editAnalysisSectionAction(
  _previous: AnalysisEditState,
  formData: FormData,
): Promise<AnalysisEditState> {
  const projectId = readText(formData.get("projectId"));
  const section = readAnalysisSection(formData.get("section"));
  if (projectId === null || section === null) redirect(DASHBOARD_PATH);

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(analysisPath(projectId)));

  const outcome = await withRequestLogContext(async (): Promise<AnalysisEditState> => {
    const posted = readPostedElements(formData, { listed: isListedAnalysisSection(section) });
    // The lineage is deliberately not handed to the schema: it is strict, and
    // identity is not one of the four things a section's definition governs.
    const parsed = parseAnalysisSectionEdit(
      section,
      posted.map((element) => ({
        kind: element.kind,
        label: element.label,
        statement: element.statement,
        evidence: element.evidence,
      })),
    );

    if (!parsed.ok) {
      logger.warn("analysis.section-edit-refused", {
        userId: user.id,
        projectId,
        ...errorLogFields(parsed.error),
      });

      return { status: "error", message: parsed.error.userMessage };
    }

    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) {
        return refuse("analysis.section-edit-refused", user.id, projectId, scope.error, {
          message: ANALYSIS_MISSING_MESSAGE,
        });
      }

      const saved = await runWithActor(user.id, async () =>
        editAnalysisSection(scope.value, {
          section,
          // The parse strips the lineage — its schema is strict and knows
          // nothing about identity — so the two lists are zipped back by
          // position. `parseAnalysisSectionEdit` preserves order and count,
          // which is what makes the index a safe key here.
          elements: parsed.value.map((element: AnalysisElementDraft, index) => ({
            ...element,
            lineageId: posted[index]?.lineageId ?? null,
          })),
        }),
      );

      if (!saved.ok) {
        const message =
          saved.error.category === "validation" || saved.error.category === "conflict"
            ? saved.error.userMessage
            : saved.error.code === "NOT_FOUND"
              ? ANALYSIS_MISSING_MESSAGE
              : ANALYSIS_EDIT_UNAVAILABLE_MESSAGE;

        return refuse("analysis.section-edit-refused", user.id, projectId, saved.error, {
          message,
        });
      }

      revalidateAnalysis(projectId);

      // A count and nothing else. The section name is not in `LOG_FIELD_KEYS`
      // and is not added for this: the allowlist is the mechanism §9 relies on,
      // and widening it to make one line more readable is the way it stops
      // being one.
      logger.info("analysis.section-edited", {
        userId: user.id,
        projectId,
        itemCount: saved.value.elementCount,
      });

      return { status: "idle" };
    } catch (error: unknown) {
      // A throw rather than a value, by §7: the transaction rolled back, so the
      // honest answer is that nothing happened.
      logger.error("analysis.section-edit-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return { status: "error", message: ANALYSIS_EDIT_UNAVAILABLE_MESSAGE };
    }
  });

  // Outside the try, because `redirect` works by throwing and a catch would
  // swallow it into the failure sentence above. Back to the read view, at the
  // section that was just saved — the form has nothing left to hold on to, and
  // the anchor is what stops a seventeen-section page from jumping to the top.
  if (outcome.status === "idle") redirect(sectionAnchor(projectId, section));

  return outcome;
}

export async function addAnalysisAnnotationAction(
  _previous: AnalysisEditState,
  formData: FormData,
): Promise<AnalysisEditState> {
  return runAnnotationAction(formData, async (scope, userId, projectId) => {
    const lineageId = readText(formData.get("lineageId"));
    const body = readText(formData.get("body"));

    if (lineageId === null || body === null) {
      return { status: "error", message: "Une annotation ne peut pas être vide." };
    }

    const written = await runWithActor(userId, async () =>
      addAnalysisAnnotation(scope, { lineageId, body }),
    );

    if (!written.ok) {
      return refuse("analysis.annotation-refused", userId, projectId, written.error, {
        message:
          written.error.category === "validation"
            ? written.error.userMessage
            : ANNOTATION_UNAVAILABLE_MESSAGE,
      });
    }

    logger.info("analysis.annotated", { userId, projectId });

    return { status: "idle" };
  });
}

export async function updateAnalysisAnnotationAction(
  _previous: AnalysisEditState,
  formData: FormData,
): Promise<AnalysisEditState> {
  return runAnnotationAction(formData, async (scope, userId, projectId) => {
    const annotationId = readText(formData.get("annotationId"));
    const body = readText(formData.get("body"));

    if (annotationId === null || body === null) {
      return { status: "error", message: "Une annotation ne peut pas être vide." };
    }

    const written = await runWithActor(userId, async () =>
      updateAnalysisAnnotation(scope, { annotationId, body }),
    );

    if (!written.ok) {
      return refuse("analysis.annotation-refused", userId, projectId, written.error, {
        message:
          written.error.category === "validation"
            ? written.error.userMessage
            : ANNOTATION_UNAVAILABLE_MESSAGE,
      });
    }

    logger.info("analysis.annotation-updated", { userId, projectId });

    return { status: "idle" };
  });
}

export async function deleteAnalysisAnnotationAction(
  _previous: AnalysisEditState,
  formData: FormData,
): Promise<AnalysisEditState> {
  return runAnnotationAction(formData, async (scope, userId, projectId) => {
    const annotationId = readText(formData.get("annotationId"));
    if (annotationId === null) return { status: "idle" };

    const removed = await runWithActor(userId, async () =>
      deleteAnalysisAnnotation(scope, annotationId),
    );

    if (!removed.ok) {
      return refuse("analysis.annotation-refused", userId, projectId, removed.error, {
        message: ANNOTATION_UNAVAILABLE_MESSAGE,
      });
    }

    logger.info("analysis.annotation-deleted", { userId, projectId });

    return { status: "idle" };
  });
}

/**
 * The three annotation actions differ by five lines; everything around them —
 * the session, the scope, the log context, the redirect on success and the one
 * sentence on an unexpected throw — is the same, and repeating it three times
 * is three places for it to drift.
 */
async function runAnnotationAction(
  formData: FormData,
  body: (scope: ProjectScope, userId: string, projectId: string) => Promise<AnalysisEditState>,
): Promise<AnalysisEditState> {
  const projectId = readText(formData.get("projectId"));
  if (projectId === null) redirect(DASHBOARD_PATH);

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(analysisPath(projectId)));

  const section = readAnalysisSection(formData.get("section"));

  const outcome = await withRequestLogContext(async (): Promise<AnalysisEditState> => {
    try {
      const scope = await openProjectScope({ ownerId: user.id, projectId });
      if (!scope.ok) {
        return refuse("analysis.annotation-refused", user.id, projectId, scope.error, {
          message: ANALYSIS_MISSING_MESSAGE,
        });
      }

      const state = await body(scope.value, user.id, projectId);
      if (state.status === "idle") revalidateAnalysis(projectId);

      return state;
    } catch (error: unknown) {
      logger.error("analysis.annotation-failed", {
        userId: user.id,
        projectId,
        ...errorLogFields(error),
      });

      return { status: "error", message: ANNOTATION_UNAVAILABLE_MESSAGE };
    }
  });

  if (outcome.status === "idle") redirect(sectionAnchor(projectId, section));

  return outcome;
}

/** The read view, at the section the form belonged to. */
function sectionAnchor(projectId: string, section: string | null): string {
  const base = analysisPath(projectId);

  return section === null ? base : `${base}#section-${section}`;
}

function revalidateAnalysis(projectId: string): void {
  revalidatePath(DASHBOARD_PATH);
  revalidatePath(analysisPath(projectId));
  revalidatePath(`/projects/${encodeURIComponent(projectId)}`);
}

function refuse(
  event: string,
  userId: string,
  projectId: string,
  error: unknown,
  { message }: { readonly message: string },
): AnalysisEditState {
  logger.warn(event, { userId, projectId, ...errorLogFields(error) });

  return { status: "error", message };
}
