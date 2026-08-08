import Link from "next/link";

import styles from "./page.module.css";

/**
 * Shown after the email sign-in form successfully requests a link
 * (CAL-028) — `sign-in-form.tsx` navigates here itself with
 * `window.location.assign` rather than following Auth.js's own
 * `verify-request` redirect, which this route replaces.
 *
 * `email` is optional and only ever echoed as text; React escapes it, so
 * there is nothing to sanitize by hand.
 */
export default async function CheckEmailPage({ searchParams }: PageProps<"/sign-in/check-email">) {
  const params = await searchParams;
  const emailParam = Array.isArray(params.email) ? params.email[0] : params.email;

  return (
    <main className={styles.screen}>
      <h1 className={styles.title}>Vérifiez votre boîte de réception</h1>

      <p className={styles.message}>
        {emailParam ? (
          <>
            Un lien de connexion a été envoyé à <strong>{emailParam}</strong>.
          </>
        ) : (
          "Un lien de connexion vous a été envoyé."
        )}
      </p>

      <p className={styles.hint}>
        Le lien est valable quinze minutes et ne peut être utilisé qu&apos;une seule fois. S&apos;il
        n&apos;apparaît pas rapidement, pensez à vérifier vos courriers indésirables.
      </p>

      <p className={styles.actions}>
        <Link href="/sign-in">Retour à la connexion</Link>
      </p>
    </main>
  );
}
