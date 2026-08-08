/**
 * The composition root for the database (CAL-023).
 *
 * **This is one of exactly two files in `apps/web` allowed to name the
 * database**, the other being `instrumentation.ts`, which imports this one at
 * startup. Everywhere else in the application — every page, layout, route
 * handler and server action — reaches project data through
 * `@calepin/shared/repository`, which requires the owner id. `eslint.config.mjs`
 * enforces it, the same shape as the `process.env` rule of CAL-006: one rule,
 * one named exception list, no judgement call at the call site.
 *
 * The client is composed here rather than inside `@calepin/shared` because the
 * shell decides what a process connects to (ADR-001, CLAUDE.md §3.3) — and
 * because a repository that constructed its own client would be a repository
 * `apps/web` could not point at a test database. What the shell hands over is a
 * bare client: the write policy of CAL-022 is applied by the seam, so it cannot
 * be left out here or in the worker (CAL-060).
 */

import { configureDatabaseClient } from "@calepin/shared/database";
import { PrismaClient } from "@prisma/client";

/**
 * One client per process, and one across `next dev`'s module reloads.
 *
 * A `PrismaClient` owns a connection pool; a new one on every hot reload
 * exhausts PostgreSQL's connection limit within a few edits. The instance is
 * therefore parked on `globalThis` under a registry symbol, which is the shape
 * Prisma's own App Router guidance uses.
 */
const CLIENT_KEY = Symbol.for("calepin.databaseClient");

interface ClientHolder {
  [CLIENT_KEY]?: PrismaClient;
}

const holder = globalThis as unknown as ClientHolder;

export const database = configureDatabaseClient((holder[CLIENT_KEY] ??= new PrismaClient()));
