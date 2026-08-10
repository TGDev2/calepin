import type { ReactNode } from "react";

import styles from "./term-hint.module.css";

interface TermHintProps {
  /** Unique within the page — becomes the DOM id `aria-describedby` points at. */
  readonly id: string;
  readonly definition: string;
  readonly children: ReactNode;
}

/**
 * A specialised term, with a short plain-language explanation available on
 * mouse hover and on keyboard focus alike (CAL-072).
 *
 * No client component and no JavaScript: the definition is a sibling `<span
 * role="tooltip">`, always present in the accessibility tree, revealed
 * visually by CSS on `:hover`/`:focus` of the button before it. `aria-
 * describedby` makes a screen reader announce it on focus regardless of
 * whether the visual reveal ever happens — the standard accessible-tooltip
 * technique, and consistent with this app's forms working with JavaScript
 * off.
 */
export function TermHint({ id, definition, children }: TermHintProps) {
  const hintId = `term-hint-${id}`;

  return (
    <span className={styles.term}>
      <button type="button" className={styles.trigger} aria-describedby={hintId}>
        {children}
        <span aria-hidden="true" className={styles.mark}>
          ?
        </span>
      </button>
      <span role="tooltip" id={hintId} className={styles.hint}>
        {definition}
      </span>
    </span>
  );
}
