import styles from "./outline-summary.module.css";
import type { OutlineSummaryView } from "./views";

interface OutlineSummaryProps {
  readonly summary: OutlineSummaryView;
}

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");
const PERCENT_FORMAT = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

/**
 * The plan's three stats, above the tree so they read at a glance without
 * expanding anything: the planned length against the novel's target
 * (CAL-103's own ±10 % tolerance and wording), how much is actually written
 * so far (`Project.writtenChapterCount`/`totalWordCount`, already on the
 * page's own fetch — a second, distinct figure from the planned one), and how
 * many narrative threads are still open.
 */
export function OutlineSummary({ summary }: OutlineSummaryProps) {
  const unplannedCount = summary.unplannedChapterCount;

  return (
    <dl className={styles.summary} aria-label="Longueur et fils narratifs du plan">
      <div className={styles.stat}>
        <dt className={styles.label}>Longueur planifiée</dt>
        <dd className={styles.value}>
          {NUMBER_FORMAT.format(summary.plannedWordCount)} /{" "}
          {NUMBER_FORMAT.format(summary.targetWordCount)} mots
          <span className={styles.tolerance} data-within-tolerance={summary.withinTolerance}>
            {" "}
            ({PERCENT_FORMAT.format(summary.deviationRatio)}) —{" "}
            {summary.withinTolerance ? "dans la marge de 10 %" : "hors de la marge de 10 %"}
          </span>
        </dd>
        {unplannedCount > 0 ? (
          <p className={styles.note}>
            {unplannedCount} chapitre{unplannedCount > 1 ? "s" : ""} non planifié
            {unplannedCount > 1 ? "s" : ""}, non compté dans le total.
          </p>
        ) : null}
      </div>

      <div className={styles.stat}>
        <dt className={styles.label}>Rédigé à ce jour</dt>
        <dd className={styles.value}>
          {summary.writtenChapterCount} chapitre{summary.writtenChapterCount > 1 ? "s" : ""} ·{" "}
          {NUMBER_FORMAT.format(summary.totalWordCount)} mots
        </dd>
      </div>

      <div className={styles.stat}>
        <dt className={styles.label}>Fils narratifs</dt>
        <dd className={styles.value}>
          {summary.openThreadCount} ouvert{summary.openThreadCount > 1 ? "s" : ""} sur{" "}
          {summary.totalThreadCount}
        </dd>
      </div>
    </dl>
  );
}
