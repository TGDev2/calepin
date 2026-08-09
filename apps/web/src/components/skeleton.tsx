/**
 * A loading placeholder block (CAL-039).
 *
 * A plain function component, not `"use client"`: it renders no state and
 * needs no interactivity, so it can be composed directly inside a `loading.tsx`
 * Server Component. `aria-hidden` on every block — the region around it
 * carries `role="status"` and the visible text alternative, so a screen
 * reader announces "chargement" once rather than reading each placeholder.
 */

import styles from "./skeleton.module.css";

export interface SkeletonBlockProps {
  readonly width?: string;
  readonly height?: string;
  readonly radius?: string;
  readonly className?: string;
}

export function SkeletonBlock({ width, height, radius, className }: SkeletonBlockProps) {
  return (
    <span
      className={[styles.block, className].filter(Boolean).join(" ")}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}
