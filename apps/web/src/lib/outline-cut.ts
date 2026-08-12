/**
 * The French the plan screen speaks when a chapter is merged or split
 * (CAL-106).
 *
 * Beside `actions.ts` rather than inside it, `outline-move.ts`'s constraint: a
 * `"use server"` module may export only async functions, so a message table and
 * a state type cannot live there.
 *
 * The division is `lib/project-action-error.ts`'s: `@calepin/outline` decides
 * *what happened* — these two chapters are not adjacent, this redistribution
 * drops a fact — and this file decides the words. Nothing here quotes the plan:
 * a working title and a thread label are literary content (§9), and these
 * sentences are exactly what a log line is most tempted to copy.
 */

import {
  CHAPTER_MERGE_LOSS_KINDS,
  type ChapterMergeLossKind,
  type ChapterSplitDefectKind,
} from "@calepin/outline";

export function chapterSplitPath(projectId: string, chapterId: string): string {
  return `/projects/${projectId}/outline/chapters/${chapterId}/split`;
}

export const CHAPTER_MERGE_MISSING_MESSAGE =
  "Ce chapitre n'existe plus, ou il ne vous appartient pas.";

export const CHAPTER_MERGE_UNAVAILABLE_MESSAGE =
  "La fusion n'a pas abouti. Le plan est inchangé ; réessayez dans un instant.";

export const CHAPTER_SPLIT_UNAVAILABLE_MESSAGE =
  "La scission n'a pas abouti. Le plan est inchangé ; réessayez dans un instant.";

/** What the author is told when the plan itself stands in the way. */
export const CHAPTER_MERGE_REFUSED_MESSAGE =
  "Ces deux chapitres ne peuvent pas être fusionnés : ils doivent se suivre dans une même partie, et n'être ni rédigés ni verrouillés.";

/**
 * What each irreducible loss reads as, once the author has to decide about it.
 *
 * A chapter has one place, one personnage focal and one degré de précision, so
 * a merge of two that disagree has to choose. The sentence says what is kept
 * and what goes, because a warning that only says *quelque chose sera perdu*
 * is a warning nobody can act on.
 */
const MERGE_LOSS_SENTENCES: Readonly<Record<ChapterMergeLossKind, string>> = {
  place: "Le lieu du second chapitre ne sera pas conservé : un chapitre n'a qu'un lieu.",
  "focal-character":
    "Le personnage focal du second chapitre ne le restera pas ; il reste présent dans le chapitre fusionné.",
  "period-precision": "La période fusionnée sera datée à la précision la plus large des deux.",
};

/** The kinds a refusal named, kept to the closed vocabulary the domain declares. */
export function parseMergeLossKinds(fieldPath: string | undefined): ChapterMergeLossKind[] {
  if (fieldPath === undefined) return [];

  const known = new Set<string>(CHAPTER_MERGE_LOSS_KINDS);

  return fieldPath.split(",").filter((kind): kind is ChapterMergeLossKind => known.has(kind));
}

export function mergeLossSentence(kind: ChapterMergeLossKind): string {
  return MERGE_LOSS_SENTENCES[kind];
}

/**
 * What a conservation defect reads as beside the control that caused it.
 *
 * Every sentence names the thing the author has to put back, because the whole
 * point of the refusal is that something of the chapter has nowhere to go.
 */
const SPLIT_DEFECT_SENTENCES: Readonly<Record<ChapterSplitDefectKind, string>> = {
  "chapter-written": "Ce chapitre est déjà rédigé : sa scission relève du manuscrit, pas du plan.",
  "plan-locked": "Le plan de ce chapitre est verrouillé. Levez le verrou avant de le scinder.",
  "dropped-character": "Un personnage n'est présent dans aucune des deux moitiés.",
  "dropped-fact": "Un fait canonique n'est rattaché à aucune des deux moitiés.",
  "dropped-thread-action": "Une action sur un fil narratif n'est reprise par aucune moitié.",
  "unknown-character": "Une moitié nomme un personnage que le chapitre ne portait pas.",
  "unknown-fact": "Une moitié nomme un fait que le chapitre ne portait pas.",
  "unknown-thread-action": "Une moitié agit sur un fil que le chapitre ne touchait pas.",
  "duplicated-thread-endpoint":
    "Un fil ne peut pas s'ouvrir, ou se fermer, dans les deux moitiés à la fois.",
  "thread-closes-before-opens":
    "Un fil se fermerait dans la première moitié alors qu'il s'ouvre dans la seconde.",
  "focal-not-present": "Le personnage focal d'une moitié n'y est pas présent.",
  "period-outside-source-span": "Une moitié sort de la période du chapitre.",
  "word-budget-out-of-tolerance":
    "Les deux longueurs cibles ne totalisent plus celle du chapitre, à dix pour cent près.",
};

export function splitDefectSentence(kind: ChapterSplitDefectKind): string {
  return SPLIT_DEFECT_SENTENCES[kind];
}

/** What the tree announces once a merge has landed. Numbers only (§9). */
export function chaptersMergedAnnouncement(chapterNumber: number): string {
  return `Chapitres fusionnés : le plan compte un chapitre de moins, à partir du chapitre ${String(chapterNumber)}.`;
}

/**
 * The split has no announcement of its own: its screen navigates back to the
 * plan, where the two halves are simply there. A live region would be read out
 * on a page the reader is leaving.
 */

/** What a merge hands back to the tree. */
export type ChapterMergeState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string }
  /**
   * The merge is possible and would lose something. The kinds come from the
   * refusal itself rather than from a second computation on the screen, so the
   * panel and the write cannot disagree about what is at stake — and a caller
   * that never renders them cannot get the second attempt through, which is
   * what `acknowledgeLoss` is for.
   */
  | {
      readonly status: "confirm";
      readonly survivorChapterId: string;
      readonly absorbedChapterId: string;
      readonly losses: readonly ChapterMergeLossKind[];
    };

/** What a split hands back to its form. */
export type ChapterSplitState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string; readonly defects: readonly string[] };
