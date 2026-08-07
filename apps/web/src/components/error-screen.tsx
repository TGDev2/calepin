import type { ReactNode } from "react";

import styles from "./error-screen.module.css";

/**
 * The one screen every failure is shown on.
 *
 * It renders exactly what it is given, and it is never given an error. That is
 * the point: CLAUDE.md §7 says the reader sees `userMessage`, in French, and
 * nothing else — no stack, no provider payload, no field name. A component that
 * accepted an `Error` would sooner or later print part of it, and in
 * development that message is the real one rather than the placeholder Next
 * substitutes in production.
 *
 * `action` is a node rather than a callback so the same screen serves a
 * boundary (a *Réessayer* button) and a missing page (a link home) without
 * either caller reaching for a class name. The styling of whatever is passed
 * lives in the stylesheet beside this file.
 */
export interface ErrorScreenProps {
  title: string;
  /** French, user-facing. */
  message: string;
  /** A support reference the reader can quote — never an explanation. */
  reference?: string | undefined;
  action?: ReactNode;
}

export function ErrorScreen({ title, message, reference, action }: ErrorScreenProps) {
  return (
    <main className={styles.screen}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.message}>{message}</p>

      {action ? <div className={styles.actions}>{action}</div> : null}

      {reference ? (
        <p className={styles.reference}>
          Référence à indiquer en cas de demande d&apos;assistance : <code>{reference}</code>
        </p>
      ) : null}
    </main>
  );
}
