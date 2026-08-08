/**
 * Deep duplication of a project (CAL-035) — the copier the plan next door
 * drives.
 *
 * **The criterion is total**: no row of the copy may reference a row of the
 * original. Everything the copy holds is reached through the identity map, and
 * a reference the map cannot resolve throws rather than being carried through
 * (`./duplication-row`), so the failure mode is a rolled-back transaction
 * instead of two projects quietly sharing a character.
 *
 * **One transaction, under the source project's row lock.** The lock is what
 * stops a chapter generation from committing between the copy of `chapters` and
 * the copy of `chapter_revisions` and leaving a revision behind — the same lock
 * CAL-033 and CAL-034 take, for a variant of the same reason. The new project is
 * created inside that transaction, so no other statement can see it until the
 * copy is complete: there is nothing to lock and nothing to race.
 *
 * **Identifiers are allocated by the copier, one model at a time.** Every row of
 * a model gets its new id before any row of that model is written, which is what
 * lets `TimelineEvent.precedingEventId` — a reference from a model to itself —
 * resolve inside a single multi-row insert. PostgreSQL checks a foreign key at
 * the end of the statement, not per row, so the insert satisfies its own
 * references. `randomUUID` rather than a cuid: `@prisma/client` ships no id
 * generator a caller can reach, the column is a `String` with no format
 * constraint, and uniqueness is the only property the copy needs from it.
 *
 * **Derived state is written last, ungated.** The copy writes rows directly,
 * which is exactly the case the ungated `reconcile*` twins of CLAUDE.md §4.3
 * exist for: the new project starts at `DRAFT` with no chapters, and the graph
 * it has just been given may be several stages ahead of that. Both the counters
 * and the status are recomputed inside the same transaction, so the copy is
 * never visible with derived state that disagrees with its rows.
 */

import { randomUUID } from "node:crypto";

import { InternalError } from "../errors/app-error";
import { type Result, succeed } from "../errors/result";
import { logger } from "../logging/logger";
import { writeAggregates } from "./aggregates";
import { DUPLICATION_PLAN } from "./duplication-plan";
import { remapCopiedRow } from "./duplication-row";
import { delegateName, PROJECT_OWNER_FIELD, type ProjectOwnedModelName } from "./owned-models";
import {
  projectNotFound,
  RollbackSignal,
  runLockedOnProject,
  type TransactionClient,
} from "./project-lock";
import { writeDerivedStatus } from "./project-status";
import { assertProjectScope, openProjectScope, type ProjectScope, scopedWhere } from "./scope";

/**
 * Longer than Prisma's five-second default, for the reason account deletion
 * raises its own: this transaction walks every table of a project once, and it
 * runs when a human asks for it rather than in a loop. A timeout rolls the whole
 * copy back, which is the right outcome — but not one worth provoking on a
 * finished novel.
 */
const DUPLICATION_TIMEOUT_MS = 30_000;

export interface DuplicateProjectInput {
  /**
   * The copy's title. Defaults to the original's — this layer holds no French
   * (CLAUDE.md §1), so the "(copie)" suffix a reader sees is composed by the
   * screen that asks for the duplication.
   */
  readonly title?: string;
}

export interface DuplicatedProject {
  readonly id: string;
  readonly title: string;
  /** How many rows the copy holds, the original's project row excluded. */
  readonly copiedRowCount: number;
}

/**
 * The project's own attributes, as the copy inherits them.
 *
 * Four columns are deliberately absent. `status`, `writtenChapterCount` and
 * `totalWordCount` are derived and are recomputed at the end from the rows the
 * copy actually received (CLAUDE.md §4.3) — copying them would be asserting a
 * value the rows had not yet justified. `archivedAt` is a decision about the
 * original: duplicating an archived project produces a project to work on, not a
 * second archive.
 */
const SOURCE_ATTRIBUTES = {
  title: true,
  language: true,
  targetLength: true,
  targetWordCount: true,
  targetAudience: true,
  freedomLevel: true,
} as const;

/**
 * Copies a project and everything narrative that hangs off it, under a new
 * owner-scoped identity.
 *
 * The caller must be inside an actor scope (`runWithActor`, CAL-022): every row
 * the copy writes is a new row, and the audit extension credits it to whoever
 * asked for the duplication rather than to the original's author.
 */
export async function duplicateProject(
  scope: ProjectScope,
  input: DuplicateProjectInput = {},
): Promise<Result<DuplicatedProject>> {
  assertProjectScope(scope);

  const outcome = await runLockedOnProject(
    scope,
    async (tx) => succeed(await copyProject(tx, scope, input)),
    { timeoutMs: DUPLICATION_TIMEOUT_MS },
  );

  if (outcome.ok) {
    logger.info("project.duplicated", {
      projectId: outcome.value.id,
      itemCount: outcome.value.copiedRowCount,
    });
  }

  return outcome;
}

async function copyProject(
  tx: TransactionClient,
  scope: ProjectScope,
  input: DuplicateProjectInput,
): Promise<DuplicatedProject> {
  const source = await tx.project.findFirst({
    where: { id: scope.projectId, [PROJECT_OWNER_FIELD]: scope.ownerId },
    select: SOURCE_ATTRIBUTES,
  });

  // Unreachable behind the lock, which already refused a project the scope does
  // not own. Reported rather than dereferenced: the alternative is a copy of a
  // project that is not there.
  if (source === null) throw new RollbackSignal(projectNotFound());

  const created = await tx.project.create({
    data: { ...source, title: input.title ?? source.title, [PROJECT_OWNER_FIELD]: scope.ownerId },
  });

  // Minted inside the transaction, by the one function that mints a scope,
  // against a row only this transaction can see (CAL-023, CAL-035).
  const target = await openProjectScope({ ownerId: scope.ownerId, projectId: created.id }, tx);
  if (!target.ok) throw new RollbackSignal(target.error);

  // The project's own id is the first entry, which is what makes every
  // `projectId` below remap through the same rule as every other reference.
  const newIdsBySourceId = new Map<string, string>([[scope.projectId, created.id]]);
  let copiedRowCount = 0;

  for (const step of DUPLICATION_PLAN) {
    const rows = await delegateFor(tx, step.model).findMany({
      where: scopedWhere(step.model, scope),
      // Not required by anything, and kept so a copy is reproducible: two runs
      // over the same graph insert in the same order and read the same in a log.
      orderBy: { id: "asc" },
    });

    if (rows.length === 0) continue;

    // Every identifier of the model first, then every row: a reference from one
    // of these rows to another resolves in the same pass, which is what a
    // self-referencing model needs and what nothing else pays for.
    const allocated = rows.map((row) => ({ row, newId: randomUUID() }));
    for (const { row, newId } of allocated) {
      newIdsBySourceId.set(readRowId(step.model, row), newId);
    }

    const data = allocated.map(({ row, newId }) =>
      remapCopiedRow({
        model: step.model,
        row,
        references: step.references,
        newId,
        newIdsBySourceId,
      }),
    );

    const { count } = await delegateFor(tx, step.model).createMany({ data });
    copiedRowCount += count;
  }

  await writeAggregates(tx, target.value);
  await writeDerivedStatus(tx, target.value, { gated: false });

  return { id: created.id, title: created.title, copiedRowCount };
}

/**
 * The two operations the copier needs from a delegate it reaches by name.
 *
 * Cast and confined here, the same trade `./scope` documents for `requireOwnedRow`:
 * the alternative is thirty-four hand-written copy functions, and the one that
 * is eventually wrong shares a row between two projects. What keeps the cast
 * honest is that `prisma/schema.test.ts` proves the plan's models and columns
 * are the schema's.
 */
interface CopyDelegate {
  findMany: (args: { where: object; orderBy: object }) => Promise<Record<string, unknown>[]>;
  createMany: (args: { data: Record<string, unknown>[] }) => Promise<{ count: number }>;
}

function delegateFor(client: TransactionClient, model: ProjectOwnedModelName): CopyDelegate {
  const delegates: unknown = client;
  const delegate = (delegates as Record<string, CopyDelegate | undefined>)[delegateName(model)];

  if (delegate === undefined) {
    throw new InternalError({
      message: "the registered client exposes no delegate for a project-owned model",
      fieldPath: model,
    });
  }

  return delegate;
}

/** A row read back from the database is untrusted input like any other (§6). */
function readRowId(model: string, row: Record<string, unknown>): string {
  const id: unknown = row["id"];

  if (typeof id !== "string" || id === "") {
    throw new InternalError({
      code: "PROJECT_DUPLICATION_INCOMPLETE",
      message: "a row being copied carries no identifier",
      fieldPath: `${model}.id`,
    });
  }

  return id;
}
