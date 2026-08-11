import type { ProvenanceState } from "@calepin/shared/provenance";

import { PROVENANCE_LABELS } from "@/lib/analysis-edit";

import styles from "./provenance-badge.module.css";

interface ProvenanceBadgeProps {
  readonly provenance: ProvenanceState;
}

/**
 * Where one element of the diagnostic came from (CAL-073) — the second marker
 * on the screen, built to CAL-072's rule: a distinct icon shape, a visible
 * French label and a border style each carry the distinction on their own, so
 * it survives a colorblind eye, a monochrome print and a screen reader.
 *
 * The four states are `@calepin/shared/provenance`'s and are never re-derived
 * here; the words are `PROVENANCE_LABELS`'. `title` carries the one-sentence
 * explanation for a pointer, and the same sentence is in the visually hidden
 * span for everyone else — a `title` alone is invisible to a keyboard.
 */
export function ProvenanceBadge({ provenance }: ProvenanceBadgeProps) {
  const { label, explanation } = PROVENANCE_LABELS[provenance];

  return (
    <span className={`${styles.badge} ${styles[VARIANT[provenance]]}`} title={explanation}>
      <Icon provenance={provenance} />
      {label}
      <span className={styles.hidden}> — {explanation}</span>
    </span>
  );
}

/** CSS module keys cannot be built by interpolation without losing the type. */
const VARIANT = {
  proposed: "proposed",
  accepted: "accepted",
  edited: "edited",
  "user-written": "userWritten",
} as const satisfies Record<ProvenanceState, string>;

function Icon({ provenance }: ProvenanceBadgeProps) {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d={ICON_PATH[provenance]} />
    </svg>
  );
}

/**
 * Four shapes that stay apart at a glance and at 16 pixels: a spark for what
 * the model offered, a check for what the author kept, a pencil for what they
 * rewrote, a page with a plus for what they added.
 */
const ICON_PATH = {
  proposed:
    "M12 2 13.9 8.1 20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2Zm6 12 .9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z",
  accepted:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.2 14.4-4.2-4.2 1.4-1.4 2.8 2.8 6-6 1.4 1.4-7.4 7.4Z",
  edited:
    "M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25ZM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z",
  "user-written":
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 12h-2v2H9v-2H7v-2h2v-2h2v2h2v2Zm0-6V3.5L18.5 9H13Z",
} as const satisfies Record<ProvenanceState, string>;
