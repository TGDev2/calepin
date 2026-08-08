"use client";

/**
 * The interactive body of the single sign-in / sign-up screen (CAL-028):
 * email link, Google, GitHub — one screen for both, since Auth.js's adapter
 * creates the `User` row on first use of any of the three (CAL-024/025/026/
 * 027).
 *
 * **No `next/navigation` router here, deliberately.** `useRouter()` throws
 * outside a real Next app-router context — exactly the context
 * `renderToStaticMarkup` does not provide, and that is the only
 * component-test tool this repository has (no `@testing-library/react`).
 * `signIn` is only ever *referenced* in an `onClick`, never called during
 * render, so it does not need that context either; a successful email
 * request navigates with `window.location.assign`, the same kind of hard
 * navigation `next-auth/react`'s own `signIn`/`signOut` already do.
 *
 * **Color is never the only signal (accessibility requirement).** Both error
 * regions pair a `⚠` glyph with an "Erreur : " text prefix, not color alone;
 * a field error is additionally tied to its input by `aria-describedby` and
 * `aria-invalid`, and every pending state changes the button's own text, not
 * just its appearance.
 */

import { signIn } from "next-auth/react";
import { type FormEvent, useId, useState } from "react";

import { signInErrorMessage } from "@/lib/sign-in-error-message";

import styles from "./sign-in-form.module.css";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVALID_EMAIL_MESSAGE =
  "Saisissez une adresse électronique valide, par exemple prenom@exemple.fr.";

type PendingMethod = "email" | "google" | "github" | null;

export interface SignInFormProps {
  /** French, ready to show — mapped server-side from `?error=` (CAL-028). */
  initialError: string | null;
}

export function SignInForm({ initialError }: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(initialError);
  const [pending, setPending] = useState<PendingMethod>(null);

  const emailInputId = useId();
  const emailErrorId = useId();

  const isPending = pending !== null;

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setFormError(null);

    const trimmedEmail = email.trim();

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setFieldError(INVALID_EMAIL_MESSAGE);
      return;
    }

    setFieldError(null);
    setPending("email");

    const result = await signIn("email", { email: trimmedEmail, redirect: false });

    if (result?.error) {
      setPending(null);
      setFormError(signInErrorMessage(result.error));
      return;
    }

    // A hard navigation, not `useRouter().push()`, on purpose: this component
    // takes no dependency on `next/navigation`'s router so it stays
    // renderable by `renderToStaticMarkup` in a unit test (see the file
    // header) — the same reason `next-auth/react`'s own `signIn`/`signOut`
    // navigate with `window.location.href` rather than the app router.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/sign-in/check-email?email=${encodeURIComponent(trimmedEmail)}`);
  }

  function handleOAuthClick(provider: "google" | "github") {
    setFormError(null);
    setPending(provider);
    void signIn(provider);
  }

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Connexion à Calepin</h1>
      <p className={styles.lead}>
        Connectez-vous avec le lien envoyé par courriel, avec Google ou avec GitHub. Aucun
        compte&nbsp;? La première connexion en crée un automatiquement.
      </p>

      {formError ? (
        <p className={styles.error} role="alert">
          <span className={styles.errorIcon} aria-hidden="true">
            ⚠
          </span>
          <span>
            <strong>Erreur&nbsp;: </strong>
            {formError}
          </span>
        </p>
      ) : null}

      <form className={styles.form} noValidate onSubmit={(event) => void handleEmailSubmit(event)}>
        <label className={styles.label} htmlFor={emailInputId}>
          Adresse électronique
        </label>
        <input
          className={styles.input}
          id={emailInputId}
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-required="true"
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? emailErrorId : undefined}
          disabled={isPending}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {fieldError ? (
          <p className={styles.fieldError} id={emailErrorId} role="alert">
            <span className={styles.errorIcon} aria-hidden="true">
              ⚠
            </span>{" "}
            {fieldError}
          </p>
        ) : null}

        <button
          className={styles.primaryButton}
          type="submit"
          disabled={isPending}
          aria-busy={pending === "email"}
        >
          {pending === "email" ? "Envoi du lien…" : "Recevoir le lien de connexion"}
        </button>
      </form>

      <p className={styles.divider}>
        <span>ou</span>
      </p>

      <div className={styles.oauthGroup}>
        <button
          className={styles.oauthButton}
          type="button"
          disabled={isPending}
          aria-busy={pending === "google"}
          onClick={() => handleOAuthClick("google")}
        >
          <GoogleMark />
          {pending === "google" ? "Redirection vers Google…" : "Continuer avec Google"}
        </button>
        <button
          className={styles.oauthButton}
          type="button"
          disabled={isPending}
          aria-busy={pending === "github"}
          onClick={() => handleOAuthClick("github")}
        >
          <GitHubMark />
          {pending === "github" ? "Redirection vers GitHub…" : "Continuer avec GitHub"}
        </button>
      </div>
    </div>
  );
}

/**
 * Decorative only — `aria-hidden`, and each button's own text carries the
 * provider's name, so the accessible name never depends on the mark.
 */
function GoogleMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M21.6 12.23c0-.7-.06-1.38-.18-2.03H12v3.84h5.4a4.62 4.62 0 0 1-2 3.03v2.5h3.24c1.9-1.75 3-4.32 3-7.34Z"
      />
      <path
        fill="currentColor"
        d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.23-2.5c-.9.6-2.05.96-3.4.96-2.6 0-4.8-1.76-5.6-4.12H3.05v2.58A10 10 0 0 0 12 22Z"
      />
      <path
        fill="currentColor"
        d="M6.4 13.91a5.99 5.99 0 0 1 0-3.82V7.51H3.05a10 10 0 0 0 0 8.98l3.35-2.58Z"
      />
      <path
        fill="currentColor"
        d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.96 9.96 0 0 0 12 2a10 10 0 0 0-8.95 5.51l3.35 2.58C7.2 7.74 9.4 5.98 12 5.98Z"
      />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 0 0-3.16 19.49c.5.1.68-.22.68-.48v-1.7c-2.78.6-3.37-1.35-3.37-1.35-.46-1.15-1.11-1.46-1.11-1.46-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.35 1.08 2.92.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.93 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.9-1.3 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.83-2.34 4.68-4.57 4.92.36.31.68.92.68 1.86v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
      />
    </svg>
  );
}
