/**
 * The owner scope (CAL-023) — the value that says a project was checked against
 * the user asking for it, and the filter every scoped query carries.
 *
 * **Ownership is an argument, never ambient.** The actor scope of CAL-022 is
 * ambient because *who writes* is a property of the request, the same for every
 * write it makes. *Whose data it is* is not: an ambient owner is exactly how a
 * job, a nested call or a second query ends up reading a row for the wrong
 * user, and nothing in the type system would complain. So `ProjectScope` is a
 * parameter, `openProjectScope` is the only thing that mints one, and it cannot
 * be called without an owner id.
 *
 * **The scope is a receipt, not the guarantee.** What protects a row is the
 * `where` clause: every filter this module builds constrains `projects` on
 * `id` *and* `userId`, so a scope that somehow carried the wrong owner still
 * reads nothing. The check and the filter say the same thing twice, on purpose.
 *
 * **A scope never crosses a serialisation boundary.** It carries a brand a
 * plain object cannot have, so a value round-tripped through JSON — a server
 * action's arguments, a queue payload — is refused by `assertProjectScope`
 * rather than trusted.
 */

import { getDatabaseClient, type TransactionClient } from "../database/client";
import { InternalError, NotFoundError } from "../errors/app-error";
import { fail, type Result, succeed } from "../errors/result";
import {
  delegateName,
  PROJECT_OWNED_MODELS,
  PROJECT_OWNER_FIELD,
  type ProjectOwnedModelName,
} from "./owned-models";

/**
 * `Symbol.for`, for the reason `AppError` uses one: `apps/web` compiles
 * `packages/*` from source into separate chunk graphs, so two copies of this
 * module can exist in one process and a module-local symbol would make a scope
 * minted on one side unrecognisable on the other.
 */
const PROJECT_SCOPE_BRAND: unique symbol = Symbol.for("calepin.ProjectScope");

export interface ProjectScope {
  readonly [PROJECT_SCOPE_BRAND]: true;
  /** The project every scoped query is confined to. */
  readonly projectId: string;
  /** The `User.id` that owns it — `Project.userId`, verified, not claimed. */
  readonly ownerId: string;
}

export interface ProjectScopeInput {
  readonly ownerId: string;
  readonly projectId: string;
}

/** The filter applied to `projects`, whatever the model being read. */
export interface ProjectOwnerFilter {
  readonly id: string;
  readonly [PROJECT_OWNER_FIELD]: string;
}

/**
 * The owner filter, nested under the relation path that reaches `Project`.
 * `Project` itself is filtered flat; `Character` becomes
 * `{ bible: { project: { id, userId } } }`.
 */
export type ScopedFilter<P extends readonly string[]> = P extends readonly [
  infer Head extends string,
  ...infer Tail extends readonly string[],
]
  ? { readonly [K in Head]: ScopedFilter<Tail> }
  : ProjectOwnerFilter;

export type ProjectOwnedFilter<M extends ProjectOwnedModelName> = ScopedFilter<
  (typeof PROJECT_OWNED_MODELS)[M]["path"]
>;

export function isProjectScope(value: unknown): value is ProjectScope {
  return typeof value === "object" && value !== null && PROJECT_SCOPE_BRAND in value;
}

/**
 * Refuses a scope that was not minted by `openProjectScope` — a plain object, a
 * value deserialised from a client payload, anything a cast let through.
 *
 * A throw rather than a `Result`: a repository reached without a proven scope
 * is a mis-wired call site, not a failure the caller could recover from
 * (CLAUDE.md §7).
 */
export function assertProjectScope(scope: ProjectScope): void {
  if (!isProjectScope(scope) || scope.projectId === "" || scope.ownerId === "") {
    throw new InternalError({
      code: "PROJECT_SCOPE_REQUIRED",
      message: "a repository was reached without a proven project scope",
    });
  }
}

/**
 * Verifies that `projectId` belongs to `ownerId`, and returns the scope every
 * other repository call requires.
 *
 * **A project that is not yours and a project that does not exist are the same
 * failure**, deliberately, and it carries the same `NOT_FOUND` code. The code
 * travels to the client in the error payload (CLAUDE.md §7), so a distinct one
 * would answer "this project exists, but not for you" — the enumeration leak a
 * 404 is chosen to close. Whether the row is missing or someone else's is not
 * information this layer is willing to give.
 *
 * **The client is a parameter since CAL-035**, defaulting to the registered
 * one. A duplication creates a project and then has to operate on it under the
 * scope every repository call requires — inside the transaction that created
 * it, where no other client can see the row yet. Passing the transaction's own
 * client keeps this the only function that mints a scope, and keeps the mint
 * backed by a real `WHERE id = ? AND userId = ?` rather than by a second,
 * weaker way of asserting ownership.
 */
export async function openProjectScope(
  input: ProjectScopeInput,
  client?: TransactionClient,
): Promise<Result<ProjectScope>> {
  const { ownerId, projectId } = input;

  if (ownerId === "" || projectId === "") {
    // An empty owner reaching here means the caller never established who is
    // asking. Failing loudly is the point: the alternative is a query for the
    // projects of nobody, which silently returns nothing and looks like a
    // missing row rather than a missing authentication check.
    throw new InternalError({
      code: "PROJECT_SCOPE_REQUIRED",
      message: "a project scope was opened without an owner or a project",
    });
  }

  // Resolved after the guard above, never as a default argument: a default is
  // evaluated on entry, and reaching for the registered client there would make
  // "no client configured" the answer to a call that has no owner — the
  // mis-wiring the guard exists to name.
  const project = await (client ?? getDatabaseClient()).project.findFirst({
    where: { id: projectId, [PROJECT_OWNER_FIELD]: ownerId },
    select: { id: true },
  });

  if (project === null) {
    return fail(new NotFoundError({ message: "no project with this id belongs to this owner" }));
  }

  const scope: ProjectScope = { [PROJECT_SCOPE_BRAND]: true, projectId, ownerId };

  return succeed(scope);
}

/**
 * The owner filter for one model, built from its path in the registry.
 *
 * The single cast in this layer, and the reason it is worth one: the alternative
 * is thirty-five hand-written literals, and the one that is eventually wrong is
 * a row of someone else's novel. The shape is checked twice instead —
 * `prisma/schema.test.ts` proves every path segment is a real relation reaching
 * `Project`, and the isolation suite proves the resulting filter reaches nothing
 * of another owner's, model by model.
 */
export function projectOwnedFilter<M extends ProjectOwnedModelName>(
  model: M,
  scope: ProjectScope,
): ProjectOwnedFilter<M> {
  assertProjectScope(scope);

  const owner: ProjectOwnerFilter = { id: scope.projectId, [PROJECT_OWNER_FIELD]: scope.ownerId };

  const filter = PROJECT_OWNED_MODELS[model].path.reduceRight<object>(
    (nested, relation) => ({ [relation]: nested }),
    owner,
  );

  return filter as ProjectOwnedFilter<M>;
}

/**
 * A `where` for one model, constrained to the scope and to nothing else the
 * caller happened to name.
 *
 * The owner filter and the caller's own conditions are combined with `AND`
 * rather than merged into one object: a caller filtering on the same relation
 * the path walks through — `{ bible: { validatedAt: null } }` on a `Character` —
 * would otherwise overwrite the ownership clause with its own, and the query
 * would still look right.
 */
export function scopedWhere<M extends ProjectOwnedModelName>(
  model: M,
  scope: ProjectScope,
  ...conditions: object[]
): { AND: [ProjectOwnedFilter<M>, ...object[]] } {
  return { AND: [projectOwnedFilter(model, scope), ...conditions] };
}

/**
 * The delegate serving a model, reached by name.
 *
 * Cast and confined here, so the generic helpers below can iterate the registry
 * instead of naming thirty-five delegates by hand — the same trade
 * `test/integration/audit-fields.integration.test.ts` documents for the audit
 * registry. Only the two operations this module uses are described.
 */
interface ScopedDelegate {
  count: (args: { where: object }) => Promise<number>;
}

function delegateOf(model: ProjectOwnedModelName): ScopedDelegate {
  const client: unknown = getDatabaseClient();
  const delegate = (client as Record<string, ScopedDelegate | undefined>)[delegateName(model)];

  if (delegate === undefined) {
    throw new InternalError({
      message: "the registered client exposes no delegate for a project-owned model",
      fieldPath: model,
    });
  }

  return delegate;
}

/**
 * Confirms that a row belongs to the scope's project before anything is written
 * against it.
 *
 * This is the check a create needs and a filter cannot make: `where` protects a
 * read, an update and a delete, but the parent id of a new child row is a value
 * the caller supplied and nothing constrains it. A domain repository resolves
 * its foreign keys through this, then writes.
 */
export async function requireOwnedRow(
  model: ProjectOwnedModelName,
  id: string,
  scope: ProjectScope,
): Promise<Result<void>> {
  const found = await delegateOf(model).count({ where: scopedWhere(model, scope, { id }) });

  if (found === 0) {
    return fail(new NotFoundError({ message: "no row with this id belongs to this project" }));
  }

  return succeed();
}
