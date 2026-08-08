import Link from "next/link";

import styles from "./page.module.css";

/**
 * The acknowledgement an account deletion lands on (CAL-031).
 *
 * **Public, by necessity rather than by exception** (`route-protection.ts`):
 * the account it acknowledges no longer exists, so nobody arriving here can
 * hold a session, and a protected page would answer the deletion with a
 * redirect to a sign-in screen — the one screen a person who just left has no
 * reason to see. It reads nothing and names nobody: one fixed sentence, the
 * same for every visitor.
 *
 * An irreversible action deserves a full response, not a silent return to a
 * page that looks exactly as it did before.
 */
export default function AccountDeletedPage() {
  return (
    <main className={styles.screen}>
      <h1 className={styles.title}>Votre compte a été supprimé</h1>

      <p className={styles.lead}>
        Vos projets, vos textes, vos versions et vos fichiers exportés ont été effacés. Il n&apos;en
        reste aucune copie, et cette suppression ne peut pas être annulée.
      </p>

      <p className={styles.lead}>
        Merci d&apos;avoir écrit avec Calepin. Vous pouvez recommencer à tout moment&nbsp;: une
        nouvelle connexion crée un nouveau compte.
      </p>

      <p className={styles.actions}>
        <Link href="/">Retour à l&apos;accueil</Link>
      </p>
    </main>
  );
}
