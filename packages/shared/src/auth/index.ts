/**
 * The authentication seam (CAL-024) — everything the process shell needs to
 * wire Auth.js without holding a database client itself.
 */

export { type OAuthIdentity, resolveOAuthAccountLink } from "./account-linking";
export {
  type AuthAdapter,
  createAuthAdapter,
  SESSION_MAX_AGE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
} from "./adapter";
export {
  buildSignInEmail,
  createEmailProvider,
  EMAIL_SIGN_IN_MAX_AGE_SECONDS,
  type EmailProviderOptions,
} from "./email-provider";
export { createGitHubProvider, type GitHubProviderOptions } from "./github-provider";
export { createGoogleProvider, type GoogleProviderOptions } from "./google-provider";
export {
  assertEmailSignInAllowed,
  EMAIL_SIGN_IN_LIMIT,
  EMAIL_SIGN_IN_WINDOW_SECONDS,
} from "./rate-limit";
