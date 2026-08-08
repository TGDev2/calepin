"use client";

/**
 * The client half of the account bar (CAL-024): the same session, read in the
 * browser through `useSession` rather than on the server through `auth()`.
 *
 * `SessionProvider` (root layout) fetches `/api/auth/session` and holds the
 * answer, so `status` is `loading` for the first paint of a fresh document.
 * That intermediate state is rendered rather than hidden — a test that waited
 * on a permanently empty string could not tell "not signed in" from "not
 * answered yet".
 */

import { useSession } from "next-auth/react";

import styles from "./account-bar.module.css";

function label(status: string, email: string | null | undefined): string {
  if (status === "loading") return "chargement…";
  if (status === "authenticated" && email) return email;

  return "aucune";
}

export function SessionIndicator() {
  const { data, status } = useSession();

  return (
    <p className={styles.line}>
      Session client&nbsp;: <strong>{label(status, data?.user?.email)}</strong>
    </p>
  );
}
