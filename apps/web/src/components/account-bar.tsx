/**
 * The smallest surface that makes a session visible (CAL-024).
 *
 * It exists to answer the task's own acceptance criterion — a session is
 * readable server-side *and* client-side — with something a browser can be
 * pointed at, rather than with a claim. The server half reads `getCurrentUser`,
 * the client half reads `useSession`, and they are shown side by side so a
 * mismatch between them is visible instead of theoretical.
 *
 * CAL-029 replaces this with the real account screen.
 */

import Link from "next/link";

import { getCurrentUser } from "@/lib/current-user";

import styles from "./account-bar.module.css";
import { SessionIndicator } from "./session-indicator";

export async function AccountBar() {
  const user = await getCurrentUser();

  return (
    <header className={styles.bar}>
      <p className={styles.line}>
        Session serveur&nbsp;: <strong>{user ? user.email : "aucune"}</strong>
      </p>
      <SessionIndicator />
      {user ? null : <Link href="/sign-in">Se connecter</Link>}
    </header>
  );
}
