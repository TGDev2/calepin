/**
 * The Auth.js persistence adapter (CAL-024).
 *
 * **Why it lives here and not in `apps/web`.** §3.5 allows exactly two files in
 * the application to name the database: `src/lib/database.ts`, which composes
 * the client, and `src/instrumentation.ts`, which imports it at boot. An
 * `auth.ts` holding `PrismaAdapter(new PrismaClient())` would be a third, and
 * the boundary would go back to being a convention someone remembers. Building
 * the adapter on `getDatabaseClient()` — the seam CAL-023 already established —
 * keeps the count at two: `apps/web` receives an `Adapter` and has no way to
 * reach through it.
 *
 * It also puts the adapter behind the write policy of CAL-022. The audit
 * extension passes these three models through untouched, since none of them is
 * in the audited registry, but a *user* created by the adapter is created by the
 * same client every other write goes through, which is one fewer client in the
 * process and one fewer thing to configure twice.
 */

import { PrismaAdapter } from "@auth/prisma-adapter";

import { getDatabaseClient } from "../database/client";

/**
 * Auth.js's `Adapter`, named through the function that returns one rather than
 * imported from `@auth/core/adapters`. `@auth/core` is the adapter's own
 * dependency, not ours: importing its types here would mean declaring a second
 * package whose version has to be kept in step with the first.
 */
export type AuthAdapter = ReturnType<typeof PrismaAdapter>;

/**
 * How long a session lives without being touched, in seconds — thirty days.
 *
 * The row expires; the cookie is given the same lifetime, so a browser stops
 * presenting a token the database would refuse anyway.
 */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * How often an active session is pushed back to its full lifetime, in seconds —
 * one day.
 *
 * This is the refresh half of the pair. Auth.js extends `expires` on a read
 * only when the session is older than this, so an active reader writes one row
 * per day rather than one row per request, and someone who stops coming back is
 * signed out `SESSION_MAX_AGE_SECONDS` after their last visit.
 */
export const SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60;

/**
 * Builds the adapter over the client the process shell registered.
 *
 * Called lazily — at the first request rather than at module load — because
 * `getDatabaseClient()` throws until `configureDatabaseClient` has run, and the
 * order in which a bundler evaluates two modules is not something to depend on.
 */
export function createAuthAdapter(): AuthAdapter {
  return PrismaAdapter(getDatabaseClient());
}
