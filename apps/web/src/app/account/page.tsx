import { listLinkedProviders } from "@calepin/shared/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentUser } from "@/lib/current-user";
import { signInDestination } from "@/lib/sign-in-redirect";

import styles from "./page.module.css";

/** The French label for each sign-in method's provider id. */
const PROVIDER_LABELS: Record<string, string> = {
  email: "Adresse électronique",
  google: "Google",
  github: "GitHub",
};

/**
 * The account page (CAL-029): address, linked sign-in methods, sign-out, and
 * an entry point toward account deletion (CAL-031 — not built here; the link
 * below is only the door to a page that task will add).
 *
 * A visitor with no session has nothing to see here — the mirror image of
 * the sign-in page's own "already authenticated → redirect home" (CAL-028).
 * `proxy.ts` already turns away a visitor with no session cookie at all
 * (CAL-030); this is what catches the one case it cannot — a cookie present
 * but not naming a live session — and preserves the destination the same way.
 */
export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect(signInDestination("/account"));

  const linkedProviders = await listLinkedProviders(user.id);
  const methods = ["email", ...linkedProviders].map(
    (provider) => PROVIDER_LABELS[provider] ?? provider,
  );

  return (
    <main className={styles.screen}>
      <h1 className={styles.title}>Mon compte</h1>

      <dl className={styles.details}>
        <dt>Adresse électronique</dt>
        <dd>{user.email}</dd>

        <dt>Méthodes de connexion liées</dt>
        <dd>
          <ul className={styles.methods}>
            {methods.map((method) => (
              <li key={method}>{method}</li>
            ))}
          </ul>
        </dd>
      </dl>

      <div className={styles.actions}>
        <SignOutButton />
      </div>

      <p className={styles.deleteEntry}>
        <Link href="/account/delete">Supprimer mon compte</Link>
      </p>
    </main>
  );
}
