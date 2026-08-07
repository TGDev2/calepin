import { NOT_FOUND_MESSAGE, NOT_FOUND_TITLE } from "@calepin/shared/errors";
import Link from "next/link";

import { ErrorScreen } from "../components/error-screen";

/**
 * A missing resource is a `notFound()`, not a thrown error — the App Router
 * routes it here rather than to `error.tsx`. Without this file the most common
 * failure in the product would render the generic "something went wrong"
 * screen, which tells the reader nothing and worries them for no reason.
 */
export default function NotFound() {
  return (
    <ErrorScreen
      title={NOT_FOUND_TITLE}
      message={NOT_FOUND_MESSAGE}
      action={<Link href="/">Revenir à l&apos;accueil</Link>}
    />
  );
}
