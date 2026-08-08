/**
 * OAuth account linking by verified email (CAL-026).
 *
 * `prisma/schema.prisma`'s `User.emailVerified` doc comment names this file's
 * job exactly: decide whether an incoming OAuth identity may be attached to
 * an existing account. Without this, Auth.js's own OAuth flow refuses to link
 * automatically — `getUserByAccount` finds nothing, falls back to
 * `getUserByEmail`, and by default throws `OAuthAccountNotLinked` rather than
 * risk attaching a stranger's identity to someone else's account. The
 * blanket escape hatch for that is `allowDangerousEmailAccountLinking`, which
 * skips verification entirely — the wrong tool here, since the whole point is
 * to check it.
 *
 * This function links only when **both** sides agree the address is proven:
 * the provider's own claim for the identity signing in (`identity.emailVerified`,
 * Google's `profile.email_verified`) and our own record of the *existing*
 * account (`User.emailVerified`, set once by CAL-025's email link or a prior
 * OAuth sign-in). Every other case is left alone — a new address creates a
 * new user through Auth.js's normal adapter flow, and an unverified match
 * falls through to Auth.js's own `OAuthAccountNotLinked` refusal. This
 * function only ever adds a link; it never denies a sign-in itself, which is
 * what keeps `apps/web/src/lib/auth.ts`'s `signIn` callback a one-line call
 * that always returns `true` afterwards.
 *
 * Provider-agnostic on purpose: CAL-027 (GitHub) calls this unchanged.
 */

import type { AdapterAccountType } from "@auth/core/adapters";
import type { Account } from "@auth/core/types";

import type { AuthAdapter } from "./adapter";

const LINKABLE_ACCOUNT_TYPES: readonly AdapterAccountType[] = ["oauth", "oidc"];

function isLinkableAccount(account: Account): account is Account & { type: AdapterAccountType } {
  return (LINKABLE_ACCOUNT_TYPES as readonly string[]).includes(account.type);
}

export interface OAuthIdentity {
  /** The email the provider's profile reports for the identity signing in. */
  readonly email: string | null | undefined;
  /** Whether the provider itself claims that address is verified. */
  readonly emailVerified: boolean;
}

/**
 * Links `account` to the existing user with a matching, verified email, if
 * one exists. A no-op in every other case — see this file's header comment.
 */
export async function resolveOAuthAccountLink(
  adapter: AuthAdapter,
  account: Account,
  identity: OAuthIdentity,
): Promise<void> {
  if (!isLinkableAccount(account) || !identity.email || !identity.emailVerified) {
    return;
  }

  const existingUser = await adapter.getUserByEmail?.(identity.email);

  if (!existingUser?.emailVerified) {
    return;
  }

  await adapter.linkAccount?.({ ...account, userId: existingUser.id });
}
