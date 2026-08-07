"use client";

import { GENERIC_ERROR_TITLE, USER_MESSAGES } from "@calepin/shared/errors";

import { ErrorScreen } from "../components/error-screen";

/**
 * The route-segment error boundary.
 *
 * It shows the `internal` message and never inspects the error, for a reason
 * that is structural rather than cautious: React does not serialise class
 * instances across the server/client boundary, so an `AppError` thrown on the
 * server never arrives here as one. In production Next replaces it with a
 * generic error carrying only a `digest`; in development it arrives with the
 * real message, which is exactly the technical detail §7 keeps off the screen.
 *
 * The `digest` is shown as a reference. It is the token the log line carries
 * too (`apps/web/src/lib/report-request-error.ts`), so a reader who quotes it
 * can be found in the trace.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
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
  );
}
