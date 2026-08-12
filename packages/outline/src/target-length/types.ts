/**
 * The novel-length choice (CAL-043) and what it resolves to. `prisma/schema.prisma`
 * stores the choice; this file is the interpretation the schema's own comment on
 * `TargetLength` defers to this task.
 */

export const TARGET_LENGTHS = ["SHORT", "STANDARD", "LONG", "CUSTOM"] as const;

/**
 * Its own literal union rather than `@prisma/client`'s `$Enums.TargetLength` —
 * the same choice `packages/manuscript/src/chapter/revision.ts` makes for
 * `ChapterRevisionOrigin`. Only `@calepin/shared` may import a provider's
 * generated client; a value read through it is assignable here without a cast
 * because the two literal unions are structurally identical.
 */
export type TargetLength = (typeof TARGET_LENGTHS)[number];

export interface TargetLengthRange {
  readonly min: number;
  readonly max: number;
}

/**
 * The choice as `projects_custom_target_word_count_check` guarantees it: a
 * word count if and only if the length is `CUSTOM`. A discriminated union
 * rather than the nullable pair the database carries, so a `CUSTOM` choice
 * with no word count fails to compile instead of needing a runtime check
 * everywhere it is read.
 */
export type NovelLengthChoice =
  | { readonly targetLength: "SHORT" | "STANDARD" | "LONG" }
  | { readonly targetLength: "CUSTOM"; readonly targetWordCount: number };

/** What a novel-length choice is worth in chapters, once resolved to a number. */
export interface ChapterCalibration {
  /** The choice resolved to a single number — a preset's midpoint, or the custom value. */
  readonly novelTargetWordCount: number;
  readonly chapterCount: number;
  readonly chapterTargetWordCount: number;
}

/**
 * What a novel-length choice is worth in parts (CAL-101). A range rather than
 * `ChapterCalibration`'s single count, because how many parts a novel takes is
 * itself a dramatic decision — the mission chooses within the range, and the
 * checker refuses a split outside it.
 */
export interface PartCalibration {
  /** The choice resolved to a single number — a preset's midpoint, or the custom value. */
  readonly novelTargetWordCount: number;
  readonly minParts: number;
  readonly maxParts: number;
}
