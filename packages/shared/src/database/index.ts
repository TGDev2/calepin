/**
 * `@calepin/shared/database` — the client seam, and nothing else.
 *
 * It is a separate entry point from `@calepin/shared/repository` so the lint
 * rule can ban it by name: the repository is what the interface layer imports,
 * the client is what only the process shell may touch (CLAUDE.md §3.5).
 */

export {
  configureDatabaseClient,
  type DatabaseClient,
  getDatabaseClient,
  resetDatabaseClient,
} from "./client";
