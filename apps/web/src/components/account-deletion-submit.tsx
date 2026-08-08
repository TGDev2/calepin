"use client";

/**
 * The submit button of the account deletion form (CAL-031).
 *
 * The only client component on that screen, and it exists for one reason: the
 * deletion takes a transaction over every table an account touches, and a form
 * that looks unchanged while it runs invites a second submit. `useFormStatus`
 * reads the pending state of the form it sits inside, so the page around it
 * stays a plain server-rendered form that works with JavaScript off — the
 * button simply never changes its label in that case.
 *
 * **The pending state changes the text, not only the appearance.** Colour is
 * never the only signal, the constraint `sign-in-form.tsx` already follows.
 */

import { useFormStatus } from "react-dom";

import styles from "./account-deletion-submit.module.css";

export function AccountDeletionSubmit() {
  const { pending } = useFormStatus();

  return (
    <button className={styles.button} type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Suppression…" : "Supprimer définitivement mon compte"}
    </button>
  );
}
