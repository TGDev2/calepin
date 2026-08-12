import styles from "./lock-badge.module.css";

interface LockBadgeProps {
  /**
   * `"locked"` — the whole row is locked (`lockedAt` set): CAL-095 refuses a
   * generation that would rewrite it before it starts. `"partial"` — only
   * some of the sheet's fields are (`Character.lockedFields`, CAL-097): the
   * row itself can still be regenerated, but a locked field inside it cannot
   * move.
   */
  readonly variant: "locked" | "partial";
}

/**
 * CAL-096's lock indicator. Not color alone: a distinct icon (closed padlock
 * for a full lock, an ajar one for a partial one), a visible French label and
 * a border weight each carry the distinction, `ProvenanceBadge`'s convention.
 *
 * Renders only when there is something to say — the caller decides whether an
 * unlocked row gets one at all (never, in every screen this ships in), the
 * same convention the relationships screen already used before this
 * component existed.
 */
export function LockBadge({ variant }: LockBadgeProps) {
  const { label, explanation } = COPY[variant];

  return (
    <span className={`${styles.badge} ${styles[variant]}`} title={explanation}>
      <Icon variant={variant} />
      {label}
      <span className={styles.hidden}> — {explanation}</span>
    </span>
  );
}

const COPY: Record<LockBadgeProps["variant"], { label: string; explanation: string }> = {
  locked: {
    label: "Verrouillé",
    explanation: "Une génération qui reconstruirait cet élément est bloquée avant de s'exécuter.",
  },
  partial: {
    label: "Partiellement verrouillé",
    explanation:
      "Certains champs de cette fiche sont verrouillés ; les autres restent modifiables.",
  },
};

function Icon({ variant }: LockBadgeProps) {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d={ICON_PATH[variant]} />
    </svg>
  );
}

/**
 * A closed shackle for a full lock; the same body with the shackle swung open
 * for a partial one, so the two stay apart by shape and not only by label.
 */
const ICON_PATH = {
  locked:
    "M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm0 2a3 3 0 0 1 3 3v3H9V7a3 3 0 0 1 3-3Z",
  partial:
    "M17 10V7a5 5 0 0 0-9.53-2.18l1.8.93A3 3 0 0 1 15 7v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Z",
} as const satisfies Record<LockBadgeProps["variant"], string>;
