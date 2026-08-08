import { type AccountInventory, collectAccountInventory } from "@calepin/shared/account";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AccountDeletionSubmit } from "@/components/account-deletion-submit";
import { accountDeletionErrorMessage } from "@/lib/account-deletion-error";
import { getCurrentUser } from "@/lib/current-user";
import { signInDestination } from "@/lib/sign-in-redirect";

import { deleteAccountAction } from "./actions";
import styles from "./page.module.css";

/**
 * The account deletion screen (CAL-031).
 *
 * **It shows the census before it asks for the confirmation.** An irreversible
 * button under the words "êtes-vous sûr ?" asks the visitor to agree to
 * something they cannot see; the counts below are what turn it into a decision.
 * They are counts and nothing else — how many chapters, never their titles
 * (§9), which is also why the census is safe to render on a page a screenshot
 * or a support session might capture.
 *
 * **The form is a plain form.** No client state decides whether the button is
 * enabled: the server matches the typed address against the stored one, and a
 * refusal comes back on this URL as `?error=`. That is one code path rather
 * than two, it works with JavaScript off, and the check that matters is the one
 * on the server either way.
 *
 * `proxy.ts` turns away a visitor with no session cookie (CAL-030); this is
 * what catches the one case it cannot — a cookie present but not naming a live
 * session — and preserves the destination the same way `/account` does.
 */
export default async function DeleteAccountPage({ searchParams }: PageProps<"/account/delete">) {
  const user = await getCurrentUser();
  if (!user) redirect(signInDestination("/account/delete"));

  const inventory = await collectAccountInventory(user.id);
  // A live session naming a row that is gone — the account was deleted in
  // another tab, or by an operator. Same answer as no session at all.
  if (!inventory.ok) redirect(signInDestination("/account/delete"));

  const params = await searchParams;
  const error = accountDeletionErrorMessage(params.error);

  return (
    <main className={styles.screen}>
      <h1 className={styles.title}>Supprimer mon compte</h1>

      <p className={styles.warning} role="note">
        <span className={styles.warningIcon} aria-hidden="true">
          ⚠
        </span>
        <span>
          <strong>Cette action est définitive.</strong> Tout ce que contient votre compte est
          supprimé, y compris les fichiers déjà exportés. Aucune restauration n&apos;est possible,
          et l&apos;équipe de Calepin ne conserve aucune copie.
        </span>
      </p>

      <h2 className={styles.subtitle}>Ce qui sera supprimé</h2>
      <ul className={styles.census}>
        {censusOf(inventory.value).map((line) => (
          <li key={line.label}>
            <span className={styles.count}>{line.count}</span> {line.label}
          </li>
        ))}
      </ul>
      <p className={styles.censusNote}>
        Les générations en attente ou en cours sont annulées, et les fichiers stockés sont purgés.
      </p>

      {error ? (
        <p className={styles.error} role="alert">
          <span className={styles.errorIcon} aria-hidden="true">
            ⚠
          </span>
          <span>
            <strong>Erreur&nbsp;: </strong>
            {error}
          </span>
        </p>
      ) : null}

      <form className={styles.form} action={deleteAccountAction}>
        <label className={styles.label} htmlFor="confirmation">
          Pour confirmer, saisissez votre adresse électronique&nbsp;:
        </label>
        <p className={styles.address} id="confirmation-hint">
          {inventory.value.email}
        </p>
        <input
          className={styles.input}
          id="confirmation"
          name="confirmation"
          type="text"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          required
          aria-required="true"
          aria-describedby="confirmation-hint"
          aria-invalid={error ? true : undefined}
        />

        <AccountDeletionSubmit />
      </form>

      <p className={styles.cancel}>
        <Link href="/account">Annuler et revenir à mon compte</Link>
      </p>
    </main>
  );
}

interface CensusLine {
  readonly count: number;
  readonly label: string;
}

/**
 * The inventory as French lines. French keeps the singular for zero and for
 * one, so the rule is `count > 1`, not `count !== 1`.
 */
function censusOf(inventory: AccountInventory): readonly CensusLine[] {
  const lines: readonly (readonly [number, string, string])[] = [
    [inventory.projects, "projet", "projets"],
    [inventory.chapters, "chapitre", "chapitres"],
    [inventory.revisions, "version de chapitre", "versions de chapitre"],
    [inventory.generations, "génération", "générations"],
    [inventory.queuedGenerations, "génération en attente ou en cours", "générations en attente ou en cours"], // prettier-ignore
    [inventory.exports, "export", "exports"],
    [inventory.publications, "publication", "publications"],
    [inventory.storedObjects, "fichier stocké", "fichiers stockés"],
  ];

  return lines.map(([count, singular, plural]) => ({
    count,
    label: count > 1 ? plural : singular,
  }));
}
