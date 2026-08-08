/**
 * The Google sign-in provider (CAL-026).
 *
 * A thin wrapper over `@auth/core/providers/google`, the same division
 * `email-provider.ts` draws for the email link: `apps/web` supplies only the
 * client id and secret it read from `env` (§4.2), and building the actual
 * provider object is this module's job. Account linking is not this
 * provider's concern — `allowDangerousEmailAccountLinking` is deliberately
 * left unset, and `account-linking.ts`'s `resolveOAuthAccountLink` performs
 * the verified linking explicitly from the `signIn` callback instead.
 */

import type { OAuthConfig } from "@auth/core/providers";
import Google, { type GoogleProfile } from "@auth/core/providers/google";

export interface GoogleProviderOptions {
  /** The OAuth client id Google issued for this application. */
  readonly clientId: string;
  /** The OAuth client secret Google issued for this application. */
  readonly clientSecret: string;
}

export function createGoogleProvider(options: GoogleProviderOptions): OAuthConfig<GoogleProfile> {
  return Google({ clientId: options.clientId, clientSecret: options.clientSecret });
}
