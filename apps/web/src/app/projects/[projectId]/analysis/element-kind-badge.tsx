import styles from "./element-kind-badge.module.css";

interface ElementKindBadgeProps {
  readonly kind: "FACTUAL" | "INTERPRETATION";
}

const KIND_LABEL = {
  FACTUAL: "Fait",
  INTERPRETATION: "Interprétation",
} as const;

/**
 * Marks one element of the diagnostic as an explicit fact or as a reading of
 * the analysis (CAL-072). Never color alone: the icon shape, the visible
 * label and the border style (solid versus dashed) each carry the
 * distinction on their own, so the marker still reads for a colorblind eye
 * or a screen reader.
 */
export function ElementKindBadge({ kind }: ElementKindBadgeProps) {
  const isFactual = kind === "FACTUAL";

  return (
    <span className={`${styles.badge} ${isFactual ? styles.factual : styles.interpretation}`}>
      {isFactual ? <FactualIcon /> : <InterpretationIcon />}
      {KIND_LABEL[kind]}
    </span>
  );
}

function FactualIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.2 14.4-4.2-4.2 1.4-1.4 2.8 2.8 6-6 1.4 1.4-7.4 7.4Z"
      />
    </svg>
  );
}

function InterpretationIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 2a7 7 0 0 0-4 12.73V16a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1.27A7 7 0 0 0 12 2Zm-1.5 17h3a1.5 1.5 0 0 1-3 0Z"
      />
    </svg>
  );
}
