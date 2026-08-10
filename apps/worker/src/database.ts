/**
 * The composition root for the database, worker side (CAL-023, CAL-060).
 *
 * The twin of `apps/web/src/lib/database.ts`, and deliberately identical in
 * shape: the shell decides what a process connects to, and what it hands over
 * is a **bare** client — the audit write policy of CAL-022 is applied by the
 * seam in `@calepin/shared/database`, so it cannot be left out here any more
 * than it can be left out there.
 *
 * The worker registers it even though `ping` reads nothing: a worker exists to
 * run generations, and a generation is persisted through domain code that
 * reaches this client. A process that discovered the wiring was missing on its
 * first real job would discover it in the middle of one.
 */

import { configureDatabaseClient } from "@calepin/shared/database";
import { PrismaClient } from "@prisma/client";

/**
 * One client per process, and one across `tsx watch`'s reloads — a new
 * `PrismaClient` per reload exhausts PostgreSQL's connection limit within a few
 * edits. Same registry-symbol shape as the web shell uses.
 */
const CLIENT_KEY = Symbol.for("calepin.databaseClient");

interface ClientHolder {
  [CLIENT_KEY]?: PrismaClient;
}

const holder = globalThis as unknown as ClientHolder;

export const database = configureDatabaseClient((holder[CLIENT_KEY] ??= new PrismaClient()));

export async function disconnectDatabase(): Promise<void> {
  await holder[CLIENT_KEY]?.$disconnect();
}
