/**
 * Which sign-in methods a user has, beyond the email link (CAL-029).
 *
 * Auth.js's email provider never writes an `Account` row — confirmed by
 * reading `@auth/core`'s callback action directly
 * (`lib/actions/callback/index.js`): the `email` type only ever reaches
 * `adapter.getUserByEmail`/`createUser`, never `linkAccount`. So the address
 * itself is always a usable sign-in method for its own account, and this
 * function only has to answer the part that genuinely varies: which OAuth
 * providers (CAL-026, CAL-027) this user has actually linked.
 */

import { getDatabaseClient } from "../database/client";

/** The OAuth provider ids linked to `userId` — `[]` for an email-only account. */
export async function listLinkedProviders(userId: string): Promise<string[]> {
  const accounts = await getDatabaseClient().account.findMany({
    where: { userId },
    select: { provider: true },
    distinct: ["provider"],
  });

  return accounts.map((account) => account.provider);
}
