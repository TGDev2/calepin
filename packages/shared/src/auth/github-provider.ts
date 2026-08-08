/**
 * The GitHub sign-in provider (CAL-027) — the same pattern as
 * `google-provider.ts`, with one necessary difference.
 *
 * `resolveOAuthAccountLink` (`account-linking.ts`) links an OAuth identity
 * only when the provider's own profile reports the incoming email as
 * verified. Google's raw profile carries that flag directly
 * (`GoogleProfile.email_verified`, straight from its ID token). GitHub's
 * default `/user` endpoint carries no such flag at all, and the stock
 * `@auth/core/providers/github` only calls `/user/emails` as a fallback for
 * a user with no public email — never to read that endpoint's own
 * `verified` boolean. Left as the stock provider, `profile.email_verified`
 * would always be `undefined` here, and the linking rule — unchanged and
 * correct as it is — would then correctly never link, silently defeating
 * this task's own acceptance criterion.
 *
 * So this factory overrides only `userinfo`: it always fetches
 * `/user/emails` (not just as a fallback), and reports the primary
 * address's own `verified` flag as `email_verified` on the profile handed to
 * `signIn`. Everything else — authorization, token, scope, the `profile()`
 * mapping into a `User` — stays the framework's stock GitHub config;
 * Auth.js deep-merges this factory's options over its own defaults
 * (`parseProviders` in `@auth/core`), so overriding one endpoint here
 * changes nothing else.
 */

import type { OAuthConfig } from "@auth/core/providers";
import GitHub, { type GitHubEmail, type GitHubProfile } from "@auth/core/providers/github";
import type { TokenSet } from "@auth/core/types";

export interface GitHubProviderOptions {
  /** The OAuth client id GitHub issued for this application. */
  readonly clientId: string;
  /** The OAuth client secret GitHub issued for this application. */
  readonly clientSecret: string;
}

const GITHUB_API_BASE_URL = "https://api.github.com";

export function createGitHubProvider(options: GitHubProviderOptions): OAuthConfig<GitHubProfile> {
  return GitHub({
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    userinfo: {
      url: `${GITHUB_API_BASE_URL}/user`,
      async request({ tokens }: { tokens: TokenSet }) {
        const headers = { Authorization: `Bearer ${tokens.access_token}`, "User-Agent": "calepin" };

        const profile = await fetch(`${GITHUB_API_BASE_URL}/user`, { headers }).then((res) => res.json());

        const emailsResponse = await fetch(`${GITHUB_API_BASE_URL}/user/emails`, { headers });
        const emails: GitHubEmail[] = emailsResponse.ok ? await emailsResponse.json() : [];
        const primaryEmail = emails.find((entry) => entry.primary) ?? emails[0];

        return {
          ...profile,
          email: profile.email ?? primaryEmail?.email ?? null,
          email_verified: primaryEmail?.verified === true,
        };
      },
    },
  });
}
