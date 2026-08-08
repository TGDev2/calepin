/**
 * Auth.js's `error` query/response code (CAL-028), turned into the French
 * sentence the sign-in screen shows.
 *
 * Only a closed set of `AuthError` subtypes ever reach the client as their
 * real type — `clientErrors` in `@auth/core/errors.js`. Everything else,
 * including whatever `sendVerificationRequest` throws (`RateLimitError`, an
 * SMTP `ProviderError` — both plain `AppError`s, not `AuthError`s), is
 * collapsed by Auth.js itself to `"Configuration"` before it leaves the
 * server. That is Auth.js's own security boundary, not a gap to work around:
 * CLAUDE.md §7 already forbids exposing the technical distinction, so the
 * generic bucket gets one honest French message rather than a guess at which
 * `AppError` produced it.
 */

const SIGN_IN_ERROR_MESSAGES: Record<string, string> = {
  Verification:
    "Ce lien de connexion n'est plus valide : il a déjà été utilisé ou a expiré. Demandez-en un nouveau.",
  OAuthAccountNotLinked:
    "Un compte existe déjà avec cette adresse, via une autre méthode de connexion non vérifiée. Connectez-vous avec la méthode utilisée initialement.",
  AccountNotLinked:
    "Un compte existe déjà avec cette adresse, via une autre méthode de connexion non vérifiée. Connectez-vous avec la méthode utilisée initialement.",
  OAuthCallbackError:
    "La connexion via ce fournisseur a échoué. Réessayez, ou utilisez une autre méthode.",
  AccessDenied: "La connexion a été annulée.",
  MissingCSRF:
    "Votre session a expiré avant l'envoi du formulaire. Rechargez la page, puis réessayez.",
};

/** Shown for `"Configuration"` and for any code this table does not name. */
const DEFAULT_SIGN_IN_ERROR_MESSAGE = "La connexion a échoué. Réessayez dans un instant.";

/** `null` for no code at all — the caller renders no banner in that case. */
export function signInErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;

  return SIGN_IN_ERROR_MESSAGES[code] ?? DEFAULT_SIGN_IN_ERROR_MESSAGE;
}
