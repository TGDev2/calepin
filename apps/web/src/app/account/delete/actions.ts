"use server";

/**
 * The one entry point that destroys an account (CAL-031).
 *
 * It composes and nothing more, which is what the interface layer is for
 * (§3.3): the session says who is asking, `@calepin/shared/account` decides and
 * performs, and this file supplies the two adapters the deletion needs outside
 * PostgreSQL. Neither exists yet — no S3 client and no BullMQ connection are in
 * the repository (CLAUDE.md §13) — so it passes the stand-ins that succeed on
 * an empty list and refuse a non-empty one, rather than a no-op that would
 * report a purge nobody performed.
 *
 * **Both outcomes redirect.** A refusal comes back to the page's own URL with
 * the reason in the query string, so the message is part of a server-rendered
 * response and survives JavaScript being off — the choice `sign-in` already
 * made for `?error=` (CAL-028). A success cannot come back at all: the page it
 * was submitted from reads an account that no longer exists.
 *
 * A `"use server"` module may export nothing but async functions, which is why
 * the reason codes live in `lib/account-deletion-error.ts` beside their French
 * messages rather than here.
 */

import {
  deleteAccount,
  unavailableQueueCancellation,
  unavailableStoragePurge,
} from "@calepin/shared/account";
import { errorLogFields } from "@calepin/shared/errors";
import { logger } from "@calepin/shared/logging";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { AccountDeletionError } from "@/lib/account-deletion-error";
import { getCurrentUser } from "@/lib/current-user";
import { withRequestLogContext } from "@/lib/request-context";
import { SESSION_COOKIE_NAMES } from "@/lib/route-protection";
import { signInDestination } from "@/lib/sign-in-redirect";

/** The page's own path, and where a refusal comes back to. */
const DELETE_PATH = "/account/delete";

/** Where a completed deletion lands — public, since the account is gone. */
const DELETED_PATH = "/account/deleted";

export async function deleteAccountAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(DELETE_PATH));

  const field = formData.get("confirmation");
  const confirmation = typeof field === "string" ? field : "";

  // Under the correlation id `proxy.ts` set, so the events the deletion emits
  // are one story in the log rather than several unrelated lines (CAL-009).
  const reason = await withRequestLogContext<AccountDeletionError | null>(async () => {
    try {
      const outcome = await deleteAccount({
        userId: user.id,
        confirmation,
        storage: unavailableStoragePurge,
        queue: unavailableQueueCancellation,
      });

      if (outcome.ok) return null;

      return outcome.error.code === "VALIDATION_FAILED" ? "confirmation" : "unavailable";
    } catch (error: unknown) {
      // An integrity fault or an outage — a throw rather than a value, by §7.
      // The transaction rolled back, so the account is intact and the honest
      // answer is that nothing happened. The trace goes to the log, classified
      // and stripped of every message (§9); the screen gets one French
      // sentence that says the account is still there.
      logger.error("account.deletion-failed", { userId: user.id, ...errorLogFields(error) });

      return "unavailable";
    }
  });

  // Outside the scope above: `redirect` throws, and a control-flow signal
  // thrown through an AsyncLocalStorage callback would be caught by the `catch`
  // it passes and reported as a failed deletion.
  if (reason !== null) redirect(`${DELETE_PATH}?error=${reason}`);

  // The session rows died with the account — every one of them, everywhere the
  // account was signed in. What is left is a cookie in this browser naming a
  // row that no longer exists; clearing it is what stops the next request from
  // being a redirect through the sign-in screen.
  const jar = await cookies();
  for (const name of SESSION_COOKIE_NAMES) jar.delete(name);

  redirect(DELETED_PATH);
}
