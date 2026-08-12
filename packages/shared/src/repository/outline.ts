/**
 * The whole plan of a project, read at once (CAL-104).
 *
 * `getBibleOverview`'s shape one stage later: a plan is small enough — a
 * handful of parts, at most a few dozen chapters, a similar number of threads
 * — that the consultation screen reads it whole rather than page by page.
 * `null` when the project has no `Outline` row yet, `getBibleOverview`'s own
 * convention: no executor persists one today (CLAUDE.md §13), so a project
 * without a plan is an expected state, not a fault.
 *
 * This file only selects columns. Turning the rows into a numbered,
 * threaded, cumulative-length reading is `@calepin/outline`'s
 * `resolveOutline` plus the screen's own presentational shaping
 * (`apps/web`) — `@calepin/shared` may not import a domain (CLAUDE.md §3.2).
 */

import type { $Enums } from "@prisma/client";

import { getDatabaseClient } from "../database/client";
import { assertProjectScope, type ProjectScope, scopedWhere } from "./scope";

export interface OutlinePartRow {
  readonly id: string;
  readonly orderKey: string;
  readonly title: string;
  readonly dramaticObjective: string | null;
  readonly initialState: string | null;
  readonly tippingPoint: string | null;
  readonly finalState: string | null;
}

export interface OutlineChapterOutlineCharacterRow {
  readonly characterId: string;
  readonly characterName: string;
}

export interface OutlineChapterOutlineFactRow {
  readonly factId: string;
  readonly statement: string;
}

export interface OutlineChapterOutlineRow {
  readonly workingTitle: string | null;
  readonly targetWordCount: number | null;
  /** The id the plan stores, beside the name the screen shows: a split writes
   * ids, so a screen that arbitrates one has to read them (CAL-106). */
  readonly focalCharacterId: string | null;
  readonly focalCharacterName: string | null;
  readonly placeId: string | null;
  readonly placeName: string | null;
  readonly periodStartDay: number | null;
  readonly periodEndDay: number | null;
  readonly periodPrecision: $Enums.TimelinePrecision | null;
  readonly periodLabel: string | null;
  readonly dramaticFunction: string | null;
  readonly immediateGoal: string | null;
  readonly obstacle: string | null;
  readonly decision: string | null;
  readonly revelation: string | null;
  readonly consequence: string | null;
  readonly detailedSummary: string | null;
  readonly lockedAt: Date | null;
  readonly characters: readonly OutlineChapterOutlineCharacterRow[];
  readonly facts: readonly OutlineChapterOutlineFactRow[];
}

export interface OutlineChapterRow {
  readonly id: string;
  readonly partId: string;
  readonly orderKey: string;
  readonly status: $Enums.ChapterStatus;
  readonly chapterOutline: OutlineChapterOutlineRow | null;
}

export interface OutlineThreadRow {
  readonly id: string;
  readonly label: string;
  readonly narrativePromise: string;
  readonly status: $Enums.ThreadStatus;
  readonly openingChapterId: string;
  readonly closingChapterId: string | null;
  readonly continuationChapterIds: readonly string[];
}

export interface OutlineOverview {
  readonly id: string;
  readonly parts: readonly OutlinePartRow[];
  readonly chapters: readonly OutlineChapterRow[];
  readonly threads: readonly OutlineThreadRow[];
}

/**
 * The whole plan of a project — `null` when none exists yet.
 */
export async function getOutlineOverview(scope: ProjectScope): Promise<OutlineOverview | null> {
  assertProjectScope(scope);

  const database = getDatabaseClient();

  const outline = await database.outline.findFirst({
    where: scopedWhere("Outline", scope, { projectId: scope.projectId }),
    select: {
      id: true,
      parts: {
        orderBy: { orderKey: "asc" },
        select: {
          id: true,
          orderKey: true,
          title: true,
          dramaticObjective: true,
          initialState: true,
          tippingPoint: true,
          finalState: true,
        },
      },
      chapters: {
        orderBy: { orderKey: "asc" },
        select: {
          id: true,
          partId: true,
          orderKey: true,
          status: true,
          chapterOutline: {
            select: {
              workingTitle: true,
              targetWordCount: true,
              focalCharacterId: true,
              focalCharacter: { select: { name: true } },
              placeId: true,
              place: { select: { name: true } },
              periodStartDay: true,
              periodEndDay: true,
              periodPrecision: true,
              periodLabel: true,
              dramaticFunction: true,
              immediateGoal: true,
              obstacle: true,
              decision: true,
              revelation: true,
              consequence: true,
              detailedSummary: true,
              lockedAt: true,
              characters: {
                select: { characterId: true, character: { select: { name: true } } },
              },
              facts: {
                select: { factId: true, fact: { select: { statement: true } } },
              },
            },
          },
        },
      },
      threads: {
        orderBy: { label: "asc" },
        select: {
          id: true,
          label: true,
          narrativePromise: true,
          status: true,
          openingChapterId: true,
          closingChapterId: true,
          continuations: { select: { chapterId: true } },
        },
      },
    },
  });

  if (outline === null) {
    return null;
  }

  return {
    id: outline.id,
    parts: outline.parts,
    chapters: outline.chapters.map((chapter) => ({
      id: chapter.id,
      partId: chapter.partId,
      orderKey: chapter.orderKey,
      status: chapter.status,
      chapterOutline:
        chapter.chapterOutline === null
          ? null
          : {
              workingTitle: chapter.chapterOutline.workingTitle,
              targetWordCount: chapter.chapterOutline.targetWordCount,
              focalCharacterId: chapter.chapterOutline.focalCharacterId,
              focalCharacterName: chapter.chapterOutline.focalCharacter?.name ?? null,
              placeId: chapter.chapterOutline.placeId,
              placeName: chapter.chapterOutline.place?.name ?? null,
              periodStartDay: chapter.chapterOutline.periodStartDay,
              periodEndDay: chapter.chapterOutline.periodEndDay,
              periodPrecision: chapter.chapterOutline.periodPrecision,
              periodLabel: chapter.chapterOutline.periodLabel,
              dramaticFunction: chapter.chapterOutline.dramaticFunction,
              immediateGoal: chapter.chapterOutline.immediateGoal,
              obstacle: chapter.chapterOutline.obstacle,
              decision: chapter.chapterOutline.decision,
              revelation: chapter.chapterOutline.revelation,
              consequence: chapter.chapterOutline.consequence,
              detailedSummary: chapter.chapterOutline.detailedSummary,
              lockedAt: chapter.chapterOutline.lockedAt,
              characters: chapter.chapterOutline.characters.map((entry) => ({
                characterId: entry.characterId,
                characterName: entry.character.name,
              })),
              facts: chapter.chapterOutline.facts.map((entry) => ({
                factId: entry.factId,
                statement: entry.fact.statement,
              })),
            },
    })),
    threads: outline.threads.map((thread) => ({
      id: thread.id,
      label: thread.label,
      narrativePromise: thread.narrativePromise,
      status: thread.status,
      openingChapterId: thread.openingChapterId,
      closingChapterId: thread.closingChapterId,
      continuationChapterIds: thread.continuations.map((entry) => entry.chapterId),
    })),
  };
}
