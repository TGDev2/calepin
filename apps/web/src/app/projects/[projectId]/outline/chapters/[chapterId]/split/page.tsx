/**
 * Arbitrating the split of one chapter (CAL-106).
 *
 * Its own route rather than a panel on the plan screen: the author decides
 * where each of a chapter's sixteen attributes goes, which is two columns of
 * form and not something that fits beside a tree.
 *
 * **No `Suspense` above the ownership decision** (`tasks/lessons.md`): this
 * component only decides — it authenticates, opens the scope, and 404s — and
 * everything it renders is handed to the client form below.
 *
 * The seed the form opens on is **loss-free by construction**: every reference
 * starts on both halves and every prose column starts as a copy of the
 * chapter's own. The author narrows from there, and the conservation rule is
 * satisfied at every step rather than only at the end. When an executor exists,
 * `split-chapter-outline`'s proposal resolves into exactly this shape and takes
 * the seed's place — `resolveChapterSplitProposal` returns a
 * `ChapterSplitArbitration`, which is what this form edits.
 */

import { resolveOutline } from "@calepin/outline";
import {
  getOutlineOverview,
  getProjectForOwner,
  openProjectScope,
} from "@calepin/shared/repository";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import { signInDestination } from "@/lib/sign-in-redirect";

import { splitChapterAction } from "../../../actions";
import { ChapterSplitForm, type ChapterSplitSourceView } from "./chapter-split-form";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Scinder un chapitre" };

interface PageProps {
  readonly params: Promise<{ readonly projectId: string; readonly chapterId: string }>;
}

export default async function ChapterSplitPage({ params }: PageProps) {
  const { projectId, chapterId } = await params;
  const user = await getCurrentUser();

  if (!user) redirect(signInDestination(`/projects/${projectId}/outline`));

  const [found, scope] = await Promise.all([
    getProjectForOwner({ ownerId: user.id, projectId }),
    openProjectScope({ ownerId: user.id, projectId }),
  ]);

  if (!found.ok || !scope.ok) notFound();

  const overview = await getOutlineOverview(scope.value);
  if (overview === null) return notFound();

  const resolved = resolveOutline(overview.parts, overview.chapters);
  if (!resolved.ok) throw new Error("the plan no longer resolves to a reading order");

  const numbered = resolved.value.chapters.find((entry) => entry.chapter.id === chapterId);
  if (numbered === undefined) notFound();

  const { chapter } = numbered;
  const plan = chapter.chapterOutline;
  // Named rather than read through `typeof overview.threads`: a type query
  // uses the declared type, not the narrowed one, so the `null` check above
  // would not reach inside it.
  const { threads } = overview;
  const threadsOf = (
    predicate: (thread: (typeof threads)[number]) => boolean,
  ): { id: string; label: string }[] =>
    threads.filter(predicate).map((thread) => ({ id: thread.id, label: thread.label }));

  const source: ChapterSplitSourceView = {
    chapterId,
    number: numbered.number,
    workingTitle: plan?.workingTitle ?? null,
    targetWordCount: plan?.targetWordCount ?? null,
    focalCharacterId: plan?.focalCharacterId ?? null,
    placeId: plan?.placeId ?? null,
    placeName: plan?.placeName ?? null,
    periodStartDay: plan?.periodStartDay ?? null,
    periodEndDay: plan?.periodEndDay ?? null,
    periodPrecision: plan?.periodPrecision ?? null,
    periodLabel: plan?.periodLabel ?? null,
    dramaticFunction: plan?.dramaticFunction ?? null,
    immediateGoal: plan?.immediateGoal ?? null,
    obstacle: plan?.obstacle ?? null,
    decision: plan?.decision ?? null,
    revelation: plan?.revelation ?? null,
    consequence: plan?.consequence ?? null,
    detailedSummary: plan?.detailedSummary ?? null,
    lockedAt: plan?.lockedAt ?? null,
    characters: (plan?.characters ?? []).map((entry) => ({
      id: entry.characterId,
      label: entry.characterName,
    })),
    facts: (plan?.facts ?? []).map((entry) => ({ id: entry.factId, label: entry.statement })),
    opensThreads: threadsOf((thread) => thread.openingChapterId === chapterId),
    continuesThreads: threadsOf((thread) => thread.continuationChapterIds.includes(chapterId)),
    closesThreads: threadsOf((thread) => thread.closingChapterId === chapterId),
  };

  return (
    <main className={styles.page}>
      <p className={styles.breadcrumb}>
        <a href={`/projects/${projectId}/outline`}>Retour au plan</a>
      </p>
      <h1 className={styles.title}>Scinder le chapitre {numbered.number}</h1>
      <p className={styles.lead}>
        Répartissez chaque élément entre les deux moitiés. Tout ce que le chapitre porte doit se
        retrouver au moins d&rsquo;un côté&nbsp;: la scission est refusée sinon.
      </p>

      <ChapterSplitForm
        source={source}
        outlinePath={`/projects/${projectId}/outline`}
        splitChapter={splitChapterAction.bind(null, projectId)}
      />
    </main>
  );
}
