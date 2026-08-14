import type { TargetLengthRange } from "./types";

/**
 * The three presets of the specification, in words. `prisma/schema.test.ts`
 * pins the enum member order against these same figures in its comments; this
 * is where the numbers themselves live.
 */
export const TARGET_LENGTH_RANGES: Record<"SHORT" | "STANDARD" | "LONG", TargetLengthRange> = {
  SHORT: { min: 30_000, max: 45_000 },
  STANDARD: { min: 50_000, max: 80_000 },
  LONG: { min: 80_000, max: 110_000 },
};

/**
 * The bounds a `CUSTOM` choice must fall inside — the backlog's own "longueur
 * personnalisée avec bornes de validation".
 *
 * A product judgment call, not a number the specification states: below
 * 20 000 words reads as a novella rather than the "roman" this product
 * targets, and above 200 000 is well past the `LONG` preset's own ceiling —
 * the point past which a chapter-by-chapter generation pipeline stops being a
 * proportionate way to write the text. Revisit deliberately, not by
 * archaeology, if either bound turns out wrong in practice.
 */
export const CUSTOM_TARGET_WORD_COUNT_RANGE: TargetLengthRange = { min: 20_000, max: 200_000 };
