/**
 * The Prisma client the integration suites write through.
 *
 * Since CAL-022 every audited table's `updatedById` is `NOT NULL`, so a suite
 * writing through a bare `PrismaClient` would have to repeat the column on
 * every single `create` — three hundred and sixty-seven of them across this
 * directory. It writes through the audit extension instead, with the actor
 * injected rather than taken from an ambient scope: a test knows who it is
 * acting as without having to simulate a request, which is the same seam
 * `resolveActorId` exists for in production (CLAUDE.md §5.3).
 *
 * It lives here rather than beside a domain file for the reason `global-setup`
 * does: it is wiring, and no domain owns it (CLAUDE.md §4.1).
 */

import { auditExtension } from "@calepin/shared/audit";
import { PrismaClient } from "@prisma/client";

export function createAuditedClient() {
  let actorId: string | undefined;

  const prisma = new PrismaClient().$extends(auditExtension({ resolveActorId: () => actorId }));

  return {
    prisma,
    /**
     * Credits every audited write from here on to `id`. A fixture that creates
     * its own user calls this right after, so the trail names the user the rows
     * actually belong to.
     */
    setActor: (id: string) => {
      actorId = id;
    },
  };
}

export type AuditedClient = ReturnType<typeof createAuditedClient>["prisma"];
