/**
 * The seam between the repository layer and the Prisma client (CAL-023).
 *
 * The repository needs a client; the interface layer must never hold one. Both
 * are satisfied by inverting the wiring: the process shell composes the client
 * once — `apps/web/src/lib/database.ts`, and the worker from CAL-060 — and
 * registers it here, and every repository reaches it through
 * `getDatabaseClient()`. A route can then import a repository function without
 * ever being handed a client it could query directly, which is what makes the
 * lint rule of §3.5 a complete boundary rather than a discouragement.
 *
 * It is the same shape as `configureLogger` (CAL-009), and for the same reason:
 * `@calepin/shared` must not decide what a process connects to.
 *
 * **`import type`, deliberately.** The generated client is a type here and
 * never a value, so this module — and everything the repository layer builds on
 * it — stays free of a runtime dependency on `@prisma/client`. That is what
 * keeps the `unit` Vitest project runnable without `prisma generate` having
 * produced anything, the property CAL-022 established for `@calepin/shared/audit`.
 */

import type { PrismaClient } from "@prisma/client";

import { auditExtension } from "../audit/extension";
import { InternalError } from "../errors/app-error";

/**
 * Applies the policy every Calepin process writes under: the audit extension of
 * CAL-022, filling `updatedById` and `version` from the ambient actor scope.
 *
 * The seam applies it rather than accepting a client that already has it. A
 * shell that composed its own client could forget the extension, and the
 * failure would be a project full of rows credited to nobody — visible only
 * once someone went looking. Handing over a bare `PrismaClient` is the whole
 * contract, and there is nothing to get wrong.
 */
function withWritePolicy(base: PrismaClient) {
  return base.$extends(auditExtension());
}

/**
 * What a repository holds: the client, after the policy.
 *
 * Inferred rather than written, because an extended client is not assignable to
 * `PrismaClient` — Prisma's generated delegates differ in their argument types
 * once `$extends` has been applied, even for a query-only extension that
 * changes no shape. Naming the type by hand would mean casting at the one place
 * the boundary has to be airtight.
 */
export type DatabaseClient = ReturnType<typeof withWritePolicy>;

let client: DatabaseClient | undefined;

/**
 * Registers the client every repository will read. Called once, at startup, by
 * the process shell — `apps/web/src/lib/database.ts`, and the worker from
 * CAL-060 — with a bare `PrismaClient`.
 */
export function configureDatabaseClient(base: PrismaClient): DatabaseClient {
  client = withWritePolicy(base);

  return client;
}

/** Forgets the registered client. For a test's teardown, and for nothing else. */
export function resetDatabaseClient(): void {
  client = undefined;
}

export function getDatabaseClient(): DatabaseClient {
  if (client === undefined) {
    // A throw, not a `Result`: a process that reaches a query with no client
    // registered is mis-wired, which is a programming error rather than a
    // failure a caller could handle (CLAUDE.md §7).
    throw new InternalError({
      code: "DATABASE_NOT_CONFIGURED",
      message: "no database client was registered by the process shell",
    });
  }

  return client;
}
