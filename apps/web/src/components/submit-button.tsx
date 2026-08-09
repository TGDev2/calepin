"use client";

/**
 * The pending-state submit button of CAL-039, generalizing the pattern
 * `account-deletion-submit.tsx` introduced for CAL-031.
 *
 * `useFormStatus` reads the pending state of the `<form>` this button sits
 * inside, so the form around it stays a plain server-rendered form that
 * works with JavaScript off — the button simply never changes its label in
 * that case. This is the mechanism behind CAL-039's 200ms budget: the label
 * and `disabled`/`aria-busy` flip synchronously when the transition starts,
 * before any network round trip.
 *
 * **The pending state changes the text, not only the appearance** — colour
 * is never the only signal, the constraint `sign-in-form.tsx` already
 * follows.
 */

import { useFormStatus } from "react-dom";

import styles from "./submit-button.module.css";

export interface SubmitButtonProps {
  readonly children: React.ReactNode;
  readonly pendingLabel: string;
  readonly variant?: "primary" | "danger";
  readonly className?: string;
}

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className={[styles.button, styles[variant], className].filter(Boolean).join(" ")}
      type="submit"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
