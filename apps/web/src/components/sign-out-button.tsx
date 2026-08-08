"use client";

/**
 * Invalidates the current session (CAL-029).
 *
 * `signOut()` deletes the database session row through the adapter before it
 * redirects — `apps/web/src/lib/auth.ts`'s database strategy (CAL-024) is
 * what makes that deletion, not just a cleared cookie, the thing that
 * actually signs the visitor out everywhere that row was trusted.
 *
 * Redirects to `/sign-in`, not `/`: since CAL-032 the home page is project
 * data, and a visitor who just signed out has no session to see it with —
 * landing there would only bounce straight back to sign-in.
 *
 * No `next/navigation` router, for the same reason `sign-in-form.tsx`
 * (CAL-028) has none: `signIn`/`signOut` are only ever *referenced* in an
 * `onClick`, never called during render, so the component stays renderable
 * by `renderToStaticMarkup` — the only component-test tool this repository
 * has.
 */

import { signOut } from "next-auth/react";
import { useState } from "react";

import styles from "./sign-out-button.module.css";

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  function handleClick() {
    setPending(true);
    void signOut({ redirectTo: "/sign-in" });
  }

  return (
    <button
      className={styles.button}
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={handleClick}
    >
      {pending ? "Déconnexion…" : "Se déconnecter"}
    </button>
  );
}
