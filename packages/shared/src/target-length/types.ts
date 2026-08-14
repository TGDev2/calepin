/**
 * The novel-length choice (CAL-043) and what it resolves to.
 * `prisma/schema.prisma` stores the choice; this file is the interpretation the
 * schema's own comment on `TargetLength` defers to.
 *
 * **In `@calepin/shared` rather than in `@calepin/outline`** (CAL-210). It was
 * the outline's until three consumers made it everybody's: `define-novel-identity`
 * copies the resolved number onto the bible (CAL-088), `assess-novel-potential`
 * and `propose-directions` each state it to a model, and the plan calibrates
 * parts and chapters from it. A domain may not import a domain (§3.2), so the
 * outline's own copy could serve none of them — `createVerbatimMatcher`'s reason,
 * and the shape `@calepin/shared/freedom-level` already has for the other stored
 * project choice. `@calepin/outline` re-exports every name below, so nothing that
 * reads them from there had to move.
 */

export const TARGET_LENGTHS = ["SHORT", "STANDARD", "LONG", "CUSTOM"] as const;

/**
 * Its own literal union rather than `@prisma/client`'s `$Enums.TargetLength` —
 * the same choice `packages/manuscript/src/chapter/revision.ts` makes for
 * `ChapterRevisionOrigin`. A value read through the generated client is
 * assignable here without a cast, because the two literal unions are
 * structurally identical.
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
