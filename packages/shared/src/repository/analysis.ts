/**
 * The narrative diagnostic — read back (CAL-072), edited and annotated
 * (CAL-073).
 *
 * `getAnalysis` reads as a bare nullable rather than a `Result`: a project with
 * no analysis is a legitimate, expected state (no executor is registered for
 * `analyze-source-text`, CLAUDE.md §13), not a failure. That is
 * `readGenerationForRun`'s convention rather than `getSourceText`'s — every
 * project is guaranteed a source text at creation and none is guaranteed an
 * analysis. The write paths below are `Result`s, because every way they can
 * refuse is a sentence the author has to be shown.
 *
 * **Editing appends.** `AnalysisSectionRevision` is append-only, so saving a
 * section writes a new revision and leaves every earlier one exactly as it was
 * — the shape `SourceTextVersion` already uses, and what makes CAL-147's
 * history possible. The elements of the new revision are new rows; what carries
 * across is the **lineage** (`AnalysisElement.lineageId`) and, through it, the
 * origin and the author's notes. `@calepin/shared/provenance` owns that rule
 * and nothing here re-decides it.
 *
 * **The domain owns what a section may say, and it is applied by the caller.**
 * The element counts, the ceilings and the five fixed kinds live in
 * `@calepin/analysis` (`parseAnalysisSectionEdit`), which `@calepin/shared` may
 * not import (§3.2). So `apps/web` parses and then persists, and the other
 * write path — a future executor — parses the same schema at the mission
 * boundary before it ever reaches a store (§6). One schema, applied at each
 * caller's own layer, rather than a second copy here that could disagree with
 * it.
 */

import type { $Enums, Prisma } from "@prisma/client";

import { getDatabaseClient } from "../database/client";
import { ConflictError, NotFoundError, ValidationError } from "../errors/app-error";
import { fail, type Result, succeed } from "../errors/result";
import {
  carryProvenance,
  type ContentOrigin,
  type PreviousElement,
  type ProvenanceState,
  resolveProvenanceState,
} from "../provenance";
import { withProjectStatus } from "./project-status";
import { assertProjectScope, type ProjectScope, requireOwnedRow, scopedWhere } from "./scope";
import { withProjectTransaction } from "./transaction";

/** A free note the author attached to one element, across its revisions. */
export interface AnalysisAnnotationSnapshot {
  readonly id: string;
  readonly body: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** One assertion the diagnostic makes about the source text. */
export interface AnalysisElementSnapshot {
  /** The element's identity across the revisions of its section (CAL-073). */
  readonly lineageId: string;
  readonly kind: $Enums.AnalysisElementKind;
  readonly label: string | null;
  readonly statement: string;
  readonly evidence: string | null;
  readonly origin: ContentOrigin;
  /** Derived here so no screen re-derives it differently. */
  readonly provenance: ProvenanceState;
  readonly annotations: readonly AnalysisAnnotationSnapshot[];
}

/** A section's current content — the revision with the highest number. */
export interface AnalysisSectionSnapshot {
  readonly section: $Enums.AnalysisSection;
  readonly revisionNumber: number;
  readonly origin: $Enums.AnalysisRevisionOrigin;
  readonly elements: readonly AnalysisElementSnapshot[];
}

/** The diagnostic as it stands: only the sections that have been written. */
export interface AnalysisSnapshot {
  readonly validatedAt: Date | null;
  readonly sections: readonly AnalysisSectionSnapshot[];
}

/** One element as the author submitted it, before provenance is decided. */
export interface AnalysisElementSubmission {
  /** The lineage of the element being replaced, or null for a new one. */
  readonly lineageId: string | null;
  readonly kind: $Enums.AnalysisElementKind;
  readonly label: string | null;
  readonly statement: string;
  readonly evidence: string | null;
}

export interface EditAnalysisSectionInput {
  readonly section: $Enums.AnalysisSection;
  readonly elements: readonly AnalysisElementSubmission[];
}

export interface AnalysisSectionEdit {
  /** `false` when the form was posted back untouched and nothing was written. */
  readonly created: boolean;
  readonly revisionNumber: number;
  readonly elementCount: number;
}

/**
 * The project's analysis, or `null` when it has not been produced yet.
 *
 * **The current revision of a section is the one with the highest
 * `revisionNumber`.** `AnalysisSectionRevision` carries no `isCurrent` flag on
 * purpose (its own doc comment: a flag could point at revision 2 while revision
 * 3 exists, and no constraint can forbid it) — so this reads every revision
 * ordered ascending and keeps the last one seen per section, which is that same
 * rule written as a fold instead of left implicit.
 *
 * **The annotations are fetched beside the revisions, not under them.** Since
 * CAL-073 a note names the analysis and a lineage rather than an element row,
 * which is exactly what lets it survive the rewrite of a section; the join back
 * is therefore in memory, keyed by lineage, and a note whose element is no
 * longer in the current revision is simply not shown — it is still there for the
 * revision it belongs to, and for the day CAL-147 displays one.
 */
export async function getAnalysis(scope: ProjectScope): Promise<AnalysisSnapshot | null> {
  assertProjectScope(scope);

  const analysis = await getDatabaseClient().analysis.findFirst({
    where: scopedWhere("Analysis", scope),
    select: {
      validatedAt: true,
      annotations: {
        orderBy: { createdAt: "asc" },
        select: { id: true, lineageId: true, body: true, createdAt: true, updatedAt: true },
      },
      sectionRevisions: {
        orderBy: { revisionNumber: "asc" },
        select: {
          section: true,
          revisionNumber: true,
          origin: true,
          elements: {
            orderBy: { position: "asc" },
            select: {
              lineageId: true,
              kind: true,
              label: true,
              statement: true,
              evidence: true,
              origin: true,
            },
          },
        },
      },
    },
  });

  if (analysis === null) return null;

  const notesByLineage = new Map<string, AnalysisAnnotationSnapshot[]>();
  for (const { lineageId, ...note } of analysis.annotations) {
    const existing = notesByLineage.get(lineageId);
    if (existing === undefined) notesByLineage.set(lineageId, [note]);
    else existing.push(note);
  }

  const currentBySection = new Map<$Enums.AnalysisSection, AnalysisSectionSnapshot>();
  for (const revision of analysis.sectionRevisions) {
    const reviewedByAuthor = revision.origin === "EDITED";

    currentBySection.set(revision.section, {
      section: revision.section,
      revisionNumber: revision.revisionNumber,
      origin: revision.origin,
      elements: revision.elements.map((element) => ({
        ...element,
        provenance: resolveProvenanceState({ origin: element.origin, reviewedByAuthor }),
        annotations: notesByLineage.get(element.lineageId) ?? [],
      })),
    });
  }

  return { validatedAt: analysis.validatedAt, sections: [...currentBySection.values()] };
}

/**
 * Saves one section, by appending a revision to it.
 *
 * **One section, never the analysis.** The section is the unit of regeneration
 * (CAL-077) and therefore the unit of versioning: the sixteen others' rows, and
 * every note hanging off them, are untouched by this statement — which is what
 * makes editing safe to offer at all.
 *
 * **An identical submit writes nothing.** `carryProvenance` answers whether the
 * author added, removed, reordered or rewrote anything; a form posted back
 * untouched is not a modification, and a history padded with duplicates would
 * turn every visit to the editor into a version nobody made.
 *
 * **The revision records the current source text version**, not the one the
 * previous revision read. The column means *the version this revision was
 * produced against*, and a person editing today is working against today's
 * text. The consequence is deliberate: editing a section takes it out of
 * `SourceTextObsolescence`'s doubt, because the author has just passed over it.
 * Deciding otherwise for them is exactly what CAL-046 refuses to do.
 *
 * **The analysis row is touched on purpose.** `Analysis` carries the audit
 * block and the revision does not; the revision records who wrote it, the
 * update records that the analysis as a whole moved. The caller must therefore
 * be inside `runWithActor`, or the write is refused rather than landing
 * unattributed.
 */
export async function editAnalysisSection(
  scope: ProjectScope,
  input: EditAnalysisSectionInput,
): Promise<Result<AnalysisSectionEdit>> {
  assertProjectScope(scope);

  return withProjectTransaction<AnalysisSectionEdit>(scope, async (tx) => {
    const analysis = await tx.analysis.findFirst({
      where: scopedWhere("Analysis", scope),
      select: { id: true, validatedAt: true },
    });

    if (analysis === null) {
      return fail(new NotFoundError({ message: "this project holds no analysis" }));
    }

    // A validated analysis is locked (CAL-074 owns the action that validates
    // one and the screen that says so). Refusing here is what makes the lock
    // true for every caller rather than for the one screen that hides a button.
    if (analysis.validatedAt !== null) {
      return fail(
        new ConflictError({
          message: "the analysis is validated and no longer editable",
          userMessage:
            "Cette analyse est validée : elle ne peut plus être modifiée section par section.",
        }),
      );
    }

    const currentVersion = await tx.sourceTextVersion.findFirst({
      where: scopedWhere("SourceTextVersion", scope),
      orderBy: { versionNumber: "desc" },
      select: { id: true },
    });

    if (currentVersion === null) {
      return fail(new NotFoundError({ message: "this project holds no source text" }));
    }

    const previousRevision = await tx.analysisSectionRevision.findFirst({
      where: { analysisId: analysis.id, section: input.section },
      orderBy: { revisionNumber: "desc" },
      select: {
        revisionNumber: true,
        elements: {
          orderBy: { position: "asc" },
          select: {
            lineageId: true,
            origin: true,
            kind: true,
            label: true,
            statement: true,
            evidence: true,
          },
        },
      },
    });

    const previous = new Map<string, PreviousElement<ElementContent>>(
      (previousRevision?.elements ?? []).map(({ lineageId, origin, ...content }) => [
        lineageId,
        { origin, content },
      ]),
    );

    const { elements, unchanged } = carryProvenance({
      previous,
      submitted: input.elements.map(({ lineageId, ...content }) => ({ lineageId, content })),
      isUnchanged: isSameContent,
    });

    const revisionNumber = (previousRevision?.revisionNumber ?? 0) + 1;

    if (unchanged) {
      return succeed({
        created: false,
        revisionNumber: previousRevision?.revisionNumber ?? 0,
        elementCount: elements.length,
      });
    }

    const revision = await tx.analysisSectionRevision.create({
      data: {
        analysisId: analysis.id,
        section: input.section,
        revisionNumber,
        origin: "EDITED",
        sourceTextVersionId: currentVersion.id,
        createdById: scope.ownerId,
      },
      select: { id: true },
    });

    await tx.analysisElement.createMany({
      data: elements.map((element, index) => ({
        sectionRevisionId: revision.id,
        // `undefined` rather than null: the column's cuid default is what mints
        // a lineage for an element the author added, so nothing here has to
        // know how an identifier is made.
        lineageId: element.lineageId ?? undefined,
        position: index + 1,
        origin: element.origin,
        ...element.content,
      })),
    });

    // Empty data on purpose: `@updatedAt` and the CAL-022 extension are the
    // whole point of the statement. The revision beside it holds what changed.
    await tx.analysis.update({ where: { id: analysis.id }, data: {} });

    return succeed({ created: true, revisionNumber, elementCount: elements.length });
  });
}

/**
 * One element of a regenerated section, as the mission answered it.
 *
 * No `lineageId`: a regeneration proposes elements, it does not claim to
 * continue the ones that were there. §6 forbids trusting a model with an
 * identifier and matching by position would be worse than not matching at all
 * — it would move the author's note about one theme onto a different theme,
 * which is the loudest side effect a feature judged on having none could have.
 */
export interface RegeneratedAnalysisElement {
  readonly kind: $Enums.AnalysisElementKind;
  readonly label: string | null;
  readonly statement: string;
  readonly evidence: string | null;
}

export interface RegenerateAnalysisSectionInput {
  readonly section: $Enums.AnalysisSection;
  readonly elements: readonly RegeneratedAnalysisElement[];
  /**
   * The generation this answer came from — the ADR-001 link a successful
   * generation appends with. Null only for a write with no generation behind
   * it: a fixture, a seed, an import.
   */
  readonly generationId: string | null;
}

export interface AnalysisSectionRegeneration {
  readonly revisionNumber: number;
  readonly elementCount: number;
  /**
   * Notes that were attached to an element this revision replaced.
   *
   * They are not touched, and this is not a deletion count: an annotation
   * names `(analysisId, lineageId)` precisely so it survives the rewrite of
   * its section, and `getAnalysis` keeps showing every note whose lineage is
   * still in the current revision. What the number says is how many of the
   * author's notes stopped bearing on what is now on screen — a fact a screen
   * has to be able to tell them, and one nothing else can compute afterwards
   * without re-reading the revision that was replaced. A count, so it is safe
   * to log (§9).
   */
  readonly orphanedAnnotationCount: number;
}

/**
 * Regenerates one section, by appending a revision to it (CAL-077).
 *
 * `editAnalysisSection`'s twin, and every difference between the two is the
 * point of this one:
 *
 * - **The origin is `GENERATED` and the revision names its generation.** That
 *   is the ADR-001 link — *a successful generation appends a `Revision` linked
 *   to its `Generation`* — and it is what makes the new elements read as
 *   proposals in the editor rather than as the author's own work.
 * - **No lineage is carried, so no provenance is carried.** See
 *   `RegeneratedAnalysisElement`. The consequence is reported rather than
 *   hidden, in `orphanedAnnotationCount`.
 * - **There is no identical-answer short circuit.** An edit that changes
 *   nothing is a form posted back and writing a revision for it would pad the
 *   history with versions nobody made; an answer that happens to match is
 *   still an answer somebody paid for, and the revision is the only thing that
 *   links the generation to what it produced.
 *
 * What it shares with its twin is the whole of the acceptance criterion. The
 * statement below names one `(analysisId, section)` pair: the sixteen other
 * sections, every earlier revision of this one, and every annotation row are
 * outside everything it touches — not preserved by care, but never addressed.
 * A validated analysis is refused here too, for the same reason: the lock is
 * true for every writer or it is true for none.
 *
 * The caller must be inside `runWithActor` — the `Analysis` update at the end
 * carries the audit block, exactly as in an edit.
 */
export async function regenerateAnalysisSection(
  scope: ProjectScope,
  input: RegenerateAnalysisSectionInput,
): Promise<Result<AnalysisSectionRegeneration>> {
  assertProjectScope(scope);

  if (input.elements.length === 0) {
    return fail(
      new ValidationError({
        message: "a regenerated section holds no element",
        userMessage: "La régénération n'a produit aucun élément pour cette section.",
        fieldPath: "elements",
      }),
    );
  }

  // Resolved before the transaction, and through the scope: the foreign key
  // proves the generation exists and nothing else proves it belongs to this
  // project (§3.5). A generation's project never moves, so reading it outside
  // the statement below costs nothing.
  if (input.generationId !== null) {
    const owned = await requireOwnedRow("Generation", input.generationId, scope);
    if (!owned.ok) return owned;
  }

  return withProjectTransaction<AnalysisSectionRegeneration>(scope, async (tx) => {
    const analysis = await tx.analysis.findFirst({
      where: scopedWhere("Analysis", scope),
      select: { id: true, validatedAt: true },
    });

    if (analysis === null) {
      return fail(new NotFoundError({ message: "this project holds no analysis" }));
    }

    if (analysis.validatedAt !== null) {
      return fail(
        new ConflictError({
          message: "the analysis is validated and no longer regenerable",
          userMessage: "Cette analyse est validée : ses sections ne peuvent plus être régénérées.",
        }),
      );
    }

    const currentVersion = await tx.sourceTextVersion.findFirst({
      where: scopedWhere("SourceTextVersion", scope),
      orderBy: { versionNumber: "desc" },
      select: { id: true },
    });

    if (currentVersion === null) {
      return fail(new NotFoundError({ message: "this project holds no source text" }));
    }

    const previousRevision = await tx.analysisSectionRevision.findFirst({
      where: { analysisId: analysis.id, section: input.section },
      orderBy: { revisionNumber: "desc" },
      select: { revisionNumber: true, elements: { select: { lineageId: true } } },
    });

    const replacedLineages = (previousRevision?.elements ?? []).map((row) => row.lineageId);

    // The notes that were bearing on the section as it stood. Counted before
    // the append and never modified by it — a `count`, not an `updateMany`.
    const orphanedAnnotationCount =
      replacedLineages.length === 0
        ? 0
        : await tx.analysisAnnotation.count({
            where: { analysisId: analysis.id, lineageId: { in: replacedLineages } },
          });

    const revisionNumber = (previousRevision?.revisionNumber ?? 0) + 1;

    const revision = await tx.analysisSectionRevision.create({
      data: {
        analysisId: analysis.id,
        section: input.section,
        revisionNumber,
        origin: "GENERATED",
        sourceTextVersionId: currentVersion.id,
        generationId: input.generationId,
        createdById: scope.ownerId,
      },
      select: { id: true },
    });

    await tx.analysisElement.createMany({
      data: input.elements.map((element, index) => ({
        sectionRevisionId: revision.id,
        position: index + 1,
        origin: "GENERATED" as const,
        kind: element.kind,
        label: element.label,
        statement: element.statement,
        evidence: element.evidence,
      })),
    });

    // Empty data on purpose, as in an edit: `@updatedAt` and the CAL-022
    // extension are the whole point of the statement.
    await tx.analysis.update({ where: { id: analysis.id }, data: {} });

    return succeed({
      revisionNumber,
      elementCount: input.elements.length,
      orphanedAnnotationCount,
    });
  });
}

/** What validating the analysis produces (CAL-074). */
export interface AnalysisValidation {
  readonly validatedAt: Date;
}

/**
 * Validates the analysis: the explicit action that locks the diagnostic and
 * moves the project on to choosing a direction (CAL-074).
 *
 * **There is no separate "validated version" to create.** `getAnalysis` already
 * reads each section's current (highest `revisionNumber`) row as the analysis
 * as it stands; stamping `validatedAt`/`validatedById` on the `Analysis` row
 * *is* creating the validated version, in this schema's own vocabulary — the
 * same shape `Bible.validatedAt` takes. This writes no new revision.
 *
 * **The lock this produces already existed.** `editAnalysisSection` has
 * refused to write past a validated analysis since CAL-073; this function is
 * the only thing that was missing to ever reach that state.
 *
 * **The status transition is the existing machine's, not a decision made
 * here.** `withProjectStatus` locks the project row, runs the write below, and
 * recomputes `Project.status` from the rows in the same transaction —
 * `DIRECTION_TO_CHOOSE` follows the moment `isAnalysisValidated` is true
 * (`PROJECT_STAGE_CONDITIONS`), which is also what keeps every step downstream
 * of it unreachable until this write happens: nothing else produces that fact.
 *
 * No completeness check runs here. The specification asks that the analysis be
 * validated before the next step, not that every section be filled in first,
 * and inventing that rule would refuse the very fixtures this module's own
 * tests build on.
 *
 * The caller must be inside `runWithActor`, same contract as
 * `editAnalysisSection`: the update below is empty of `updatedById` on
 * purpose, and the audit extension is what fills it.
 */
export async function validateAnalysis(scope: ProjectScope): Promise<Result<AnalysisValidation>> {
  assertProjectScope(scope);

  return withProjectStatus(scope, async (tx) => {
    const analysis = await tx.analysis.findFirst({
      where: scopedWhere("Analysis", scope),
      select: { id: true, validatedAt: true },
    });

    if (analysis === null) {
      return fail(new NotFoundError({ message: "this project holds no analysis" }));
    }

    if (analysis.validatedAt !== null) {
      return fail(
        new ConflictError({
          message: "the analysis is already validated",
          userMessage: "Cette analyse est déjà validée.",
        }),
      );
    }

    const validatedAt = new Date();

    await tx.analysis.update({
      where: { id: analysis.id },
      data: { validatedAt, validatedById: scope.ownerId },
    });

    return succeed({ validatedAt });
  });
}

export interface AddAnalysisAnnotationInput {
  readonly lineageId: string;
  readonly body: string;
}

export interface AnalysisAnnotationWritten {
  readonly annotationId: string;
}

/** The longest note the editor accepts — a margin note, not a second analysis. */
export const ANALYSIS_ANNOTATION_CHAR_CEILING = 1_000;

/**
 * Attaches a note to one element, by lineage.
 *
 * **The lineage is resolved before the note is written.** No foreign key can
 * check it — that is the price of a note that outlives the row it is about —
 * so the statement that would have been the constraint is here instead: the
 * lineage must belong to an element of *this* analysis. Without it the column
 * would accept any string, and a note would attach to nothing.
 */
export async function addAnalysisAnnotation(
  scope: ProjectScope,
  input: AddAnalysisAnnotationInput,
): Promise<Result<AnalysisAnnotationWritten>> {
  assertProjectScope(scope);

  const body = input.body.trim();
  const invalid = annotationRefusal(body);
  if (invalid !== null) return fail(invalid);

  return withProjectTransaction<AnalysisAnnotationWritten>(scope, async (tx) => {
    const analysis = await tx.analysis.findFirst({
      where: scopedWhere("Analysis", scope),
      select: { id: true },
    });

    if (analysis === null) {
      return fail(new NotFoundError({ message: "this project holds no analysis" }));
    }

    const element = await tx.analysisElement.findFirst({
      where: {
        lineageId: input.lineageId,
        sectionRevision: { analysisId: analysis.id },
      },
      select: { id: true },
    });

    if (element === null) {
      return fail(new NotFoundError({ message: "no such element in this analysis" }));
    }

    const annotation = await tx.analysisAnnotation.create({
      data: {
        analysisId: analysis.id,
        lineageId: input.lineageId,
        authorId: scope.ownerId,
        body,
      },
      select: { id: true },
    });

    return succeed({ annotationId: annotation.id });
  });
}

export interface UpdateAnalysisAnnotationInput {
  readonly annotationId: string;
  readonly body: string;
}

/** Rewrites a note. The scope is what proves it is the caller's to rewrite. */
export async function updateAnalysisAnnotation(
  scope: ProjectScope,
  input: UpdateAnalysisAnnotationInput,
): Promise<Result<AnalysisAnnotationWritten>> {
  assertProjectScope(scope);

  const body = input.body.trim();
  const invalid = annotationRefusal(body);
  if (invalid !== null) return fail(invalid);

  // `updateMany` with the ownership filter on the statement itself, not a read
  // followed by a write: what protects the row is the statement that touches it
  // (§3.5), and a count of zero is the same answer for *not yours* and *not
  // there*.
  const { count } = await getDatabaseClient().analysisAnnotation.updateMany({
    where: { AND: [scopedWhere("AnalysisAnnotation", scope), { id: input.annotationId }] },
    data: { body },
  });

  if (count === 0) return fail(new NotFoundError({ message: "no such annotation" }));

  return succeed({ annotationId: input.annotationId });
}

/** Removes a note. Hard delete: a margin note nobody wants leaves nothing behind. */
export async function deleteAnalysisAnnotation(
  scope: ProjectScope,
  annotationId: string,
): Promise<Result<AnalysisAnnotationWritten>> {
  assertProjectScope(scope);

  const { count } = await getDatabaseClient().analysisAnnotation.deleteMany({
    where: { AND: [scopedWhere("AnalysisAnnotation", scope), { id: annotationId }] },
  });

  if (count === 0) return fail(new NotFoundError({ message: "no such annotation" }));

  return succeed({ annotationId });
}

/** The content of one element — everything provenance compares, and no more. */
type ElementContent = Pick<
  Prisma.AnalysisElementCreateManyInput,
  "kind" | "label" | "statement" | "evidence"
>;

/**
 * Whether the author left an element exactly as it was.
 *
 * Field by field rather than by a serialisation of the two: a key order that
 * changed would read as an edit, and marking a proposal as the author's work
 * because of it is precisely the failure this pattern exists to avoid.
 */
function isSameContent(previous: ElementContent, submitted: ElementContent): boolean {
  return (
    previous.kind === submitted.kind &&
    (previous.label ?? null) === (submitted.label ?? null) &&
    previous.statement === submitted.statement &&
    (previous.evidence ?? null) === (submitted.evidence ?? null)
  );
}

/** The two ways a note is refused, with the sentence the author is shown. */
function annotationRefusal(body: string): ValidationError | null {
  if (body === "") {
    return new ValidationError({
      message: "annotation body is empty",
      userMessage: "Une annotation ne peut pas être vide.",
      fieldPath: "body",
    });
  }

  if (body.length > ANALYSIS_ANNOTATION_CHAR_CEILING) {
    return new ValidationError({
      message: "annotation body exceeds its ceiling",
      userMessage: `Une annotation est limitée à ${ANALYSIS_ANNOTATION_CHAR_CEILING} caractères.`,
      fieldPath: "body",
    });
  }

  return null;
}
