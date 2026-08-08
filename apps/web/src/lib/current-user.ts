/**
 * Who is asking (CAL-024) — the one helper a server component or a server
 * action calls to find out.
 *
 * **It returns a proven shape, never a cast.** `auth()` gives back Auth.js's
 * `Session`, whose `user.id` and `user.email` are optional in the type because
 * they are optional for some strategies and some providers. Neither is optional
 * for this application: an owner id is what `openProjectScope` requires, and an
 * address is what an account *is* here. So the session is narrowed by reading
 * it, and a session that somehow arrived without either is treated as no
 * session at all rather than widened away with an assertion (§6).
 *
 * **It does not open the actor scope.** `runWithActor` (CAL-022) belongs at the
 * top of a write, around an `await`ed call; opening it here would leave it open
 * for a read that writes nothing and closed again before the write that needs
 * it. A server action asks who is calling, then wraps its own writes.
 */

import {
  fail,
  ForbiddenError,
  type Result,
  succeed,
  UNAUTHENTICATED_MESSAGE,
} from "@calepin/shared/errors";

import { auth } from "@/lib/auth";

export interface CurrentUser {
  /** `User.id` — the owner id every scoped repository call takes. */
  readonly id: string;
  readonly email: string;
  /** Absent until the account holder gives one; an email sign-in knows none. */
  readonly name: string | null;
  readonly image: string | null;
}

/** The signed-in account, or `null` when the request carries no live session. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const user = session?.user;

  if (!user) return null;

  const { id, email } = user;

  // Not a defensive nicety: a session row whose user lost its id or its address
  // is a broken session, and answering "signed in as nobody" would hand an
  // empty owner id to the repository layer, which reads it as a missing
  // authentication check (see `openProjectScope`).
  if (typeof id !== "string" || id === "") return null;
  if (typeof email !== "string" || email === "") return null;

  return { id, email, name: user.name ?? null, image: user.image ?? null };
}

/**
 * The same answer, as a `Result`, for a call site that cannot continue without
 * one. Not signed in is an expected failure a caller handles — a redirect to
 * the sign-in screen — so it is a value rather than a throw (§7).
 *
 * `UNAUTHENTICATED` answers 401 while staying in the `forbidden` category,
 * which is the one code the status map overrides for exactly this case.
 */
export async function requireCurrentUser(): Promise<Result<CurrentUser>> {
  const user = await getCurrentUser();

  if (user === null) {
    return fail(
      new ForbiddenError({
        code: "UNAUTHENTICATED",
        message: "no live session carries this request",
        userMessage: UNAUTHENTICATED_MESSAGE,
      }),
    );
  }

  return succeed(user);
}
