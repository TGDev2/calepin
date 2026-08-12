/**
 * The plan of the novel, consulted whole (CAL-104).
 *
 * Overview by parts and chapters, collapsible, with each chapter's dramatic
 * function and consequence, the narrative threads it opens, continues and
 * closes, and the planned length running against the novel's target.
 * Consultation only: reordering (CAL-105), merge/split (CAL-106) and
 * add/delete/lock (CAL-107) are their own tasks, so there is no `actions.ts`
 * beside this page — `bible/page.tsx`'s own reasoning.
 *
 * **No `<Suspense>` boundary.** The ownership check must resolve before
 * anything renders, `bible/page.tsx`'s documented trap.
 *
 * All the narrative reading of the raw rows happens here, server-side,
 * because `@calepin/shared` may not import a domain (CLAUDE.md §3.2):
 * `resolveOutline` numbers the chapters, `chapterWordBudgetGap` and
 * `resolveNovelTargetWordCount` (`@calepin/outline`) turn the planned
 * lengths into a gap against the novel's target, `isThreadOpen` counts what
 * is still open. `views.ts`'s `outline-tree.tsx` (a client component) only
 * ever sees the already-shaped result.
 */

import {
  chapterWordBudgetGap,
  isThreadOpen,
  type NovelLengthChoice,
  resolveNovelTargetWordCount,
  resolveOutline,
} from "@calepin/outline";
import {
  getOutlineOverview,
  getProjectForOwner,
  openProjectScope,
  type OutlineChapterRow,
  type OutlineOverview,
} from "@calepin/shared/repository";
import { notFound, redirect } from "next/navigation";

import { chapterStatusLabel } from "@/lib/chapter-status-label";
import { getCurrentUser } from "@/lib/current-user";
import { signInDestination } from "@/lib/sign-in-redirect";

import { OutlineSummary } from "./outline-summary";
import { OutlineTree } from "./outline-tree";
import styles from "./page.module.css";
import type { ChapterView, OutlineSummaryView, PartView, ThreadActionView } from "./views";

type FoundProject = Extract<Awaited<ReturnType<typeof getProjectForOwner>>, { ok: true }>["value"];

export default async function OutlinePage({ params }: PageProps<"/projects/[projectId]/outline">) {
  const { projectId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(signInDestination(`/projects/${projectId}/outline`));

  const [found, scope] = await Promise.all([
    getProjectForOwner({ ownerId: user.id, projectId }),
    openProjectScope({ ownerId: user.id, projectId }),
  ]);
  if (!found.ok || !scope.ok) notFound();

  const overview = await getOutlineOverview(scope.value);

  return (
    <main className={styles.main}>
      <p className={styles.back}>
        <a href={`/projects/${projectId}`}>← {found.value.title}</a>
      </p>

      <h1 className={styles.title}>Plan</h1>

      {overview === null ? (
        <p className={styles.empty}>
          Ce projet n&rsquo;a pas encore de plan&nbsp;: il s&rsquo;écrira une fois la bible validée.
        </p>
      ) : (
        <OutlinePageData project={found.value} overview={overview} />
      )}
    </main>
  );
}

interface OutlinePageDataProps {
  readonly project: FoundProject;
  readonly overview: OutlineOverview;
}

function projectLengthChoice(project: FoundProject): NovelLengthChoice {
  if (project.targetLength === "CUSTOM") {
    return { targetLength: "CUSTOM", targetWordCount: project.targetWordCount ?? 0 };
  }
  return { targetLength: project.targetLength };
}

interface MutableThreadActions {
  readonly opens: ThreadActionView[];
  readonly continues: ThreadActionView[];
  readonly closes: ThreadActionView[];
}

function emptyThreadActions(): MutableThreadActions {
  return { opens: [], continues: [], closes: [] };
}

/**
 * Splits the read from the shaping, `BibleWorkspaceData`'s own division:
 * everything above is a fetch, everything here turns raw rows into what the
 * client component renders.
 */
function OutlinePageData({ project, overview }: OutlinePageDataProps) {
  const resolved = resolveOutline(overview.parts, overview.chapters);
  // `overview.chapters` and `overview.parts` come from the same `Outline` row
  // in the same read, so a chapter naming a part absent from that read cannot
  // happen short of a foreign-key violation — a bug, not a value to render
  // around (CLAUDE.md §7).
  if (!resolved.ok) {
    throw new Error("a chapter of this plan names a part absent from its own outline");
  }

  const actionsByChapter = new Map<string, MutableThreadActions>();
  for (const chapter of overview.chapters) {
    actionsByChapter.set(chapter.id, emptyThreadActions());
  }
  for (const thread of overview.threads) {
    const action = { id: thread.id, label: thread.label };
    actionsByChapter.get(thread.openingChapterId)?.opens.push(action);
    if (thread.closingChapterId !== null) {
      actionsByChapter.get(thread.closingChapterId)?.closes.push(action);
    }
    for (const chapterId of thread.continuationChapterIds) {
      actionsByChapter.get(chapterId)?.continues.push(action);
    }
  }

  function toChapterView(chapter: OutlineChapterRow, number: number): ChapterView {
    const plan = chapter.chapterOutline;

    return {
      id: chapter.id,
      number,
      status: chapter.status,
      statusLabel: chapterStatusLabel(chapter.status),
      workingTitle: plan?.workingTitle ?? null,
      targetWordCount: plan?.targetWordCount ?? null,
      focalCharacterName: plan?.focalCharacterName ?? null,
      placeName: plan?.placeName ?? null,
      periodLabel: plan?.periodLabel ?? null,
      dramaticFunction: plan?.dramaticFunction ?? null,
      immediateGoal: plan?.immediateGoal ?? null,
      obstacle: plan?.obstacle ?? null,
      decision: plan?.decision ?? null,
      revelation: plan?.revelation ?? null,
      consequence: plan?.consequence ?? null,
      detailedSummary: plan?.detailedSummary ?? null,
      lockedAt: plan?.lockedAt ?? null,
      presentCharacterNames: plan?.characters.map((entry) => entry.characterName) ?? [],
      factStatements: plan?.facts.map((entry) => entry.statement) ?? [],
      threadActions: actionsByChapter.get(chapter.id) ?? emptyThreadActions(),
    };
  }

  // Built with `reduce` rather than a `let` running total reassigned inside
  // `map`: this function runs at render time, and a mutated outer binding
  // there is exactly what `react-hooks/immutability` refuses.
  const parts: readonly PartView[] = resolved.value.parts.reduce<{
    readonly list: readonly PartView[];
    readonly cumulative: number;
  }>(
    (acc, resolvedPart, index) => {
      const chapters = resolvedPart.chapters.map(({ chapter, number }) =>
        toChapterView(chapter, number),
      );
      const plannedWordCount = chapters.reduce(
        (sum, chapter) => sum + (chapter.targetWordCount ?? 0),
        0,
      );
      const unplannedChapterCount = chapters.filter(
        (chapter) => chapter.targetWordCount === null,
      ).length;
      const cumulativeWordCount = acc.cumulative + plannedWordCount;

      const part: PartView = {
        id: resolvedPart.part.id,
        number: index + 1,
        title: resolvedPart.part.title,
        dramaticObjective: resolvedPart.part.dramaticObjective,
        initialState: resolvedPart.part.initialState,
        tippingPoint: resolvedPart.part.tippingPoint,
        finalState: resolvedPart.part.finalState,
        chapters,
        plannedWordCount,
        unplannedChapterCount,
        cumulativeWordCount,
      };

      return { list: [...acc.list, part], cumulative: cumulativeWordCount };
    },
    { list: [], cumulative: 0 },
  ).list;

  const totalPlannedWordCount = parts.at(-1)?.cumulativeWordCount ?? 0;
  const novelTargetWordCount = resolveNovelTargetWordCount(projectLengthChoice(project));
  const gap = chapterWordBudgetGap(totalPlannedWordCount, novelTargetWordCount);

  const summary: OutlineSummaryView = {
    plannedWordCount: gap.totalTargetWordCount,
    unplannedChapterCount: parts.reduce((sum, part) => sum + part.unplannedChapterCount, 0),
    targetWordCount: gap.novelTargetWordCount,
    deviationWordCount: gap.deviationWordCount,
    deviationRatio: gap.deviationRatio,
    withinTolerance: gap.withinTolerance,
    writtenChapterCount: project.writtenChapterCount,
    totalWordCount: project.totalWordCount,
    openThreadCount: overview.threads.filter(isThreadOpen).length,
    totalThreadCount: overview.threads.length,
  };

  return (
    <>
      <OutlineSummary summary={summary} />
      <OutlineTree parts={parts} />
    </>
  );
}
