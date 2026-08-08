/**
 * The French messages a user is allowed to read.
 *
 * The repository is English and the product is French (CLAUDE.md §1), so this
 * is the one file in `@calepin/shared` whose string values are French: they are
 * product surface, not code.
 *
 * Three properties every message here must keep:
 *
 * 1. **No technical detail.** No stack, no provider name, no SQL, no field
 *    name, no error code in prose (CLAUDE.md §7). The code travels beside the
 *    message, in the payload, for support to quote.
 * 2. **It says what the user can do next.** A message that only states that
 *    something failed leaves the reader stuck.
 * 3. **It reassures where reassurance is true.** A failed generation never
 *    corrupts a project — the write path is append-only (ADR-001) — and the
 *    author of a novel needs to be told that in the moment it fails, not in the
 *    documentation.
 */

import type { ErrorCategory } from "./categories";

export const USER_MESSAGES = {
  validation:
    "Les informations fournies ne sont pas valides. Vérifiez votre saisie, puis réessayez.",
  not_found: "Cet élément est introuvable. Il a peut-être été supprimé entre-temps.",
  forbidden: "Vous n'avez pas accès à cet élément.",
  conflict:
    "Cette action entre en conflit avec l'état actuel du projet. Rechargez la page pour repartir de la dernière version, puis réessayez.",
  rate_limit:
    "Trop de demandes ont été envoyées coup sur coup. Patientez un instant avant de réessayer.",
  provider:
    "Le service de génération est momentanément indisponible. Votre projet est intact : vous pouvez relancer la génération dans un moment.",
  timeout:
    "L'opération a mis trop de temps à répondre et a été interrompue. Votre projet est intact : vous pouvez la relancer.",
  internal:
    "Une erreur inattendue s'est produite. Votre projet est intact : réessayez dans un instant.",
} as const satisfies Record<ErrorCategory, string>;

/**
 * `UNAUTHENTICATED` is the one code whose own message has to differ from its
 * category's (CAL-024). It shares the `forbidden` category with `FORBIDDEN`,
 * but the two say opposite things to a reader: one has no right to this, the
 * other has no session yet — and only the second has something to do next.
 */
export const UNAUTHENTICATED_MESSAGE = "Vous devez vous connecter pour accéder à cette page.";

/**
 * Shown by the React error boundaries, which receive an opaque error rather
 * than an `AppError` — React does not serialise class instances across the
 * server/client boundary, so a boundary can never learn the real category.
 */
export const GENERIC_ERROR_TITLE = "Une erreur est survenue";
export const NOT_FOUND_TITLE = "Page introuvable";
export const NOT_FOUND_MESSAGE =
  "Cette page n'existe pas ou n'est plus accessible. Vérifiez l'adresse, ou revenez à l'accueil.";
