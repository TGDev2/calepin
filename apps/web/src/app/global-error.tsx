"use client";

import "./globals.css";

import { GENERIC_ERROR_TITLE, USER_MESSAGES } from "@calepin/shared/errors";

import { ErrorScreen } from "../components/error-screen";

/**
 * The last boundary: a failure in the root layout itself.
 *
 * It replaces the whole document, so it renders its own `<html>` and `<body>`
 * and imports the stylesheet the root layout would otherwise have brought —
 * without them this screen would be unstyled text, which is a poor way to tell
 * someone their novel is intact.
 */
export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body>
        <ErrorScreen
          title={GENERIC_ERROR_TITLE}
          message={USER_MESSAGES.internal}
          reference={error.digest}
          action={
            <button type="button" onClick={reset}>
              Réessayer
            </button>
          }
        />
      </body>
    </html>
  );
}
