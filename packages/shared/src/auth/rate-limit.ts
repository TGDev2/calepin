/**
 * The email sign-in request limit (CAL-025): five requests per address, per
 * rolling hour.
 *
 * Lives beside the adapter and the email provider rather than in a domain,
 * for the same reason both of those do — this is authentication
 * infrastructure, not project data or a narrative rule.
 *
 * **Enforced from `sendVerificationRequest`, not from
 * `adapter.createVerificationToken`.** `@auth/core`'s `sendToken` action
 * starts both calls concurrently with `Promise.all` rather than one after the
 * other, so a rejection thrown from the adapter does not stop an email
 * already being sent. `sendVerificationRequest` is the one place that can
 * still gate the side effect before it happens — see `email-provider.ts`.
 */

import type { DatabaseClient } from "../database/client";
import { RateLimitError } from "../errors/app-error";

/** Requests allowed per address, per window. */
export const EMAIL_SIGN_IN_LIMIT = 5;

/** The window the limit counts over, in seconds — one hour. */
export const EMAIL_SIGN_IN_WINDOW_SECONDS = 60 * 60;

/**
 * Records one email sign-in request for `identifier`, or throws
 * `RateLimitError` if this address has already reached
 * `EMAIL_SIGN_IN_LIMIT` within the last `EMAIL_SIGN_IN_WINDOW_SECONDS`.
 *
 * Takes the client as a parameter rather than reading `getDatabaseClient()`
 * itself, the way `createAuthAdapter` does not read it either — the call site
 * resolves it, which keeps this function reachable with a fake client in a
 * test.
 */
export async function assertEmailSignInAllowed(
  client: DatabaseClient,
  identifier: string,
): Promise<void> {
  const windowStart = new Date(Date.now() - EMAIL_SIGN_IN_WINDOW_SECONDS * 1000);

  const recentRequests = await client.emailSignInRequest.count({
    where: { identifier, createdAt: { gte: windowStart } },
  });

  if (recentRequests >= EMAIL_SIGN_IN_LIMIT) {
    throw new RateLimitError({
      message: "email sign-in request limit reached for this address",
      retryAfterMs: EMAIL_SIGN_IN_WINDOW_SECONDS * 1000,
    });
  }

  await client.emailSignInRequest.create({ data: { identifier } });
}
