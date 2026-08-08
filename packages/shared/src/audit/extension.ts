/**
 * The Prisma client extension that fills the audit fields from the request
 * context (CAL-022).
 *
 * The module imports nothing from `@prisma/client`, not even a type. An
 * extension is a plain object, and describing it structurally is what keeps
 * `@calepin/shared/audit` free of any runtime or build-time dependency on a
 * generated client — so the `unit` Vitest project and `prisma/schema.test.ts`
 * can read the registry without `prisma generate` having run, and a consumer
 * importing `@calepin/shared` for something else never drags Prisma in.
 *
 * **What this extension cannot see**, and why it is not the whole mechanism: a
 * client extension intercepts top-level operations only. A nested write, a
 * `$queryRaw`, and anything reaching the database around Prisma are invisible
 * to it. `updatedById` is therefore `NOT NULL` in PostgreSQL as well — the
 * extension exists to fail readably and early, the column exists to make the
 * guarantee unconditional.
 */

import { getContextActorId } from "./context";
import { applyAuditFields, isAuditedWriteOperation } from "./fields";
import { isAuditedModel } from "./models";

export interface AuditExtensionOptions {
  /**
   * Who to credit for a write that does not name an author itself. Defaults to
   * the ambient actor scope (`runWithActor`).
   *
   * It is injectable for the same reason the AI port is (CLAUDE.md §5.3): a
   * test — and the seed — knows its actor without having to simulate a request.
   */
  readonly resolveActorId?: () => string | undefined;
}

interface AllOperationsArgs {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}

/**
 * Builds the extension. Apply it once, where the client is composed:
 *
 * ```ts
 * const prisma = new PrismaClient().$extends(auditExtension());
 * ```
 */
export function auditExtension(options: AuditExtensionOptions = {}) {
  const resolveActorId = options.resolveActorId ?? getContextActorId;

  return {
    name: "calepin-audit",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }: AllOperationsArgs): Promise<unknown> {
          if (!isAuditedModel(model) || !isAuditedWriteOperation(operation)) {
            return query(args);
          }

          return query(applyAuditFields(model, operation, args, resolveActorId()));
        },
      },
    },
  };
}
