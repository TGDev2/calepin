/**
 * The smallest surface that makes a session visible (CAL-024).
 *
 * It exists to answer the task's own acceptance criterion — a session is
 * readable server-side *and* client-side — with something a browser can be
 * pointed at, rather than with a claim. The server half reads `getCurrentUser`,
 * the client half reads `useSession`, and they are shown side by side so a
 * mismatch between them is visible instead of theoretical.
 *
 * It turned out to be worth keeping rather than replacing: CAL-028 and
 * CAL-029 gave it a link to the sign-in screen and the account screen
 * instead of retiring it, the same way a persistent header would in any
 * other app.
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
      {user ? <Link href="/account">Mon compte</Link> : <Link href="/sign-in">Se connecter</Link>}
    </header>
  );
}
