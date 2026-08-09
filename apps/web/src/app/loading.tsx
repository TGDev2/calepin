/**
 * The dashboard's loading state (CAL-039) — Next's route-segment convention,
 * shown automatically while `page.tsx`'s data fetch resolves. No wiring
 * needed in the page itself.
 *
 * Shape mirrors `page.tsx`'s real layout (title, filter bar, three project
 * cards) so the skeleton doesn't jump when the real content replaces it.
 * `role="status"` plus a visually-hidden label gives a screen reader the
 * announcement a sighted user gets from the shimmer.
 */

import { SkeletonBlock } from "@/components/skeleton";

import styles from "./loading.module.css";

export default function Loading() {
  return (
    <main className={styles.main} role="status" aria-live="polite">
      <span className="visually-hidden">Chargement du tableau de bord…</span>

      <SkeletonBlock className={styles.title} height="2rem" width="12rem" />
      <SkeletonBlock className={styles.filters} height="4.5rem" />

      <div className={styles.projects}>
        {[0, 1, 2].map((index) => (
          <div key={index} className={styles.project}>
            <SkeletonBlock height="1.25rem" width="60%" />
            <SkeletonBlock height="0.85rem" width="40%" />
            <SkeletonBlock height="1.5rem" width="80%" />
          </div>
        ))}
      </div>
    </main>
  );
}
