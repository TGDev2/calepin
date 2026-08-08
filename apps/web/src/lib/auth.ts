/**
 * The Auth.js instance (CAL-024) — the composition root for authentication, the
 * way `lib/database.ts` is the composition root for persistence.
 *
 * **Database sessions, not JWT.** The two strategies are not interchangeable
 * here. A JWT session is a signed cookie nobody can revoke: signing out clears
 * the browser's copy and the token keeps working anywhere it was already sent,
 * until it expires on its own. CAL-029 requires signing out to invalidate the
 * session, so the session has to be a row. That row is also what makes
 * "persists across two reloads" a fact about the database rather than about a
 * cookie, and what lets an operator see and end a live session later (E16).
 *
 * **The config is a function, evaluated per request.** `createAuthAdapter()`
 * reads the client `instrumentation.ts` registered at boot, and a module
 * evaluated at import time could run before it. Auth.js accepts a lazy config
 * for exactly this, so the adapter is built when the first request arrives —
 * after the shell has finished composing.
 *
 * This file names no database. `@calepin/shared/auth` builds the adapter over
 * the seam of CAL-023, which is what keeps §3.5's list of files allowed to hold
 * a client at two.
 */

import {
  createAuthAdapter,
  SESSION_MAX_AGE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
} from "@calepin/shared/auth";
import { env } from "@calepin/shared/config";
import NextAuth from "next-auth";

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: createAuthAdapter(),

  /**
   * No provider yet, deliberately. The email link is CAL-025, Google CAL-026,
   * GitHub CAL-027; each adds one entry here and nothing else. Auth.js serves
   * its session and sign-out endpoints with an empty list, which is what this
   * task's own acceptance criterion exercises.
   */
  providers: [],

  session: {
    strategy: "database",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },

  /**
   * Read from the validated configuration rather than left to Auth.js's own
   * `process.env` lookup, so a missing key fails at startup with every other
   * missing variable (§4.2, CAL-006).
   */
  secret: env.AUTH_SECRET,

  /**
   * Calepin is self-hosted behind its own reverse proxy (ADR-001), never on a
   * platform that injects a canonical URL. Without this, Auth.js refuses to
   * derive its callback URL from the request and every route answers 500.
   */
  trustHost: true,

  callbacks: {
    /**
     * **Returning the session unchanged is not a no-op — deleting this
     * callback breaks the owner id.** Auth.js's *default* session callback
     * rebuilds `user` from `name`, `email` and `image` alone; under the
     * database strategy the session it is handed carries the adapter's whole
     * user row, and `id` is the field the default one drops. Declaring a
     * callback of our own is what keeps it.
     *
     * `id` is not a nicety here: `openProjectScope` takes the owner id and
     * nothing else, so the whole access policy of CAL-023 rests on it. The
     * integration suite asserts it off the real endpoint, which is what turns
     * this comment into something that fails rather than something to believe.
     */
    session({ session }) {
      return session;
    },
  },
}));
