/**
 * The project page's loading state (CAL-039) — Next's route-segment
 * convention, shown automatically while `page.tsx`'s data fetch resolves.
 *
 * Mirrors the real page's shape: header, stats, the nine-step process bar's
 * track, and the three action sections. `role="status"` plus a
 * visually-hidden label gives a screen reader the announcement a sighted
 * user gets from the shimmer.
 */

import { SkeletonBlock } from "@/components/skeleton";

import styles from "./loading.module.css";

export default function Loading() {
  return (
    <main className={styles.main} role="status" aria-live="polite">
      <span className="visually-hidden">Chargement du projet…</span>

      <SkeletonBlock className={styles.back} height="1rem" width="8rem" />

      <div className={styles.header}>
        <SkeletonBlock height="2rem" width="16rem" />
        <SkeletonBlock height="1.5rem" width="6rem" />
      </div>

      <SkeletonBlock height="0.85rem" width="10rem" />

      <div className={styles.stats}>
        <SkeletonBlock height="2.5rem" width="8rem" />
        <SkeletonBlock height="2.5rem" width="8rem" />
      </div>

      <div className={styles.stepper}>
        {Array.from({ length: 9 }, (_, index) => (
          <SkeletonBlock key={index} className={styles.step} height="0.75rem" />
        ))}
      </div>

      <div className={styles.actions}>
        {[0, 1, 2].map((index) => (
          <div key={index} className={styles.action}>
            <SkeletonBlock height="1.1rem" width="30%" />
            <SkeletonBlock height="0.85rem" width="70%" />
            <SkeletonBlock height="2.25rem" width="10rem" />
          </div>
        ))}
      </div>
    </main>
  );
}
