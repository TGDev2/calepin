/**
 * CAL-106's acceptance criterion, against a real PostgreSQL: **merging then
 * splitting gives back a coherent plan, with no attribute lost.**
 *
 * `chapters/merge.test.ts` and `chapters/split.test.ts` prove the arithmetic;
 * this proves the write, and the two are not the same claim. The arithmetic
 * returns column values and repointing sets — it is the statements that could
 * drop a link, forget a thread's closing chapter to a `SET NULL`, or be refused
 * outright by the `NoAction` on its opening.
 *
 * The instrument is a **census keyed by reading position** rather than by id.
 * A split mints a chapter, so an id-keyed census could never compare equal
 * across the cycle; what the criterion is about is whether the *plan* came
 * back, chapter for chapter, and a position is what says that. Every attribute
 * of every chapter, every character link, every fact link, every thread
 * endpoint and every continuation is in it, so a reference nobody anticipated
 * fails here too.
 *
 * Every string is technical. §9 forbids literary content in a committed
 * artefact, and this suite needs none: what is under test is where an attribute
 * lands, never what it says.
 */

import {
  CHAPTER_MERGE_CONNECTOR,
  CHAPTER_MERGE_TITLE_CONNECTOR,
  type ChapterSplitArbitration,
  type ChapterSplitHalf,
  resolveOutline,
} from "@calepin/outline";
import { mergeChapters, splitChapter } from "@calepin/outline/repository";
import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { openProjectScope, type ProjectScope } from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

const PART_COUNT = 2;
const CHAPTERS_PER_PART = 4;

interface Plan {
  readonly ownerId: string;
  readonly projectId: string;
  readonly outlineId: string;
  readonly bibleId: string;
  readonly partIds: readonly string[];
  readonly chapterIds: readonly string[];
  readonly characterIds: readonly string[];
  readonly factIds: readonly string[];
  readonly placeIds: readonly string[];
  readonly threadIds: readonly string[];
}

/** The whole plan, addressed by reading position — see the header. */
interface PlanCensus {
  readonly chapters: readonly string[];
  readonly characters: readonly string[];
  readonly facts: readonly string[];
  readonly threads: readonly string[];
  readonly continuations: readonly string[];
}

describe("merging and splitting the chapters of a plan", () => {
  const { prisma, setActor } = createAuditedClient();
  /** The client the repository layer itself reads, registered on the seam. */
  const seam = new PrismaClient();

  let plan: Plan;
  let scope: ProjectScope;
  let strangerId: string;

  /** Reading position (from 1) for every chapter id, derived as the screen does. */
  async function readNumbers(): Promise<Map<string, number>> {
    const [parts, chapters] = await Promise.all([
      prisma.part.findMany({
        where: { outlineId: plan.outlineId },
        select: { id: true, orderKey: true },
      }),
      prisma.chapter.findMany({
        where: { outlineId: plan.outlineId },
        select: { id: true, partId: true, orderKey: true },
      }),
    ]);

    const resolved = resolveOutline(parts, chapters);
    if (!resolved.ok) throw new Error("the plan no longer resolves to a reading order");

    return new Map(resolved.value.chapters.map((entry) => [entry.chapter.id, entry.number]));
  }

  async function readCensus(): Promise<PlanCensus> {
    const numbers = await readNumbers();
    const at = (chapterId: string | null): string =>
      chapterId === null ? "-" : String(numbers.get(chapterId) ?? "?");

    const [outlines, threads, continuations] = await Promise.all([
      prisma.chapterOutline.findMany({
        where: { chapter: { outlineId: plan.outlineId } },
        select: {
          chapterId: true,
          workingTitle: true,
          targetWordCount: true,
          focalCharacterId: true,
          placeId: true,
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
          characters: { select: { characterId: true } },
          facts: { select: { factId: true } },
        },
      }),
      prisma.thread.findMany({
        where: { outlineId: plan.outlineId },
        select: {
          label: true,
          openingChapterId: true,
          closingChapterId: true,
          status: true,
        },
      }),
      prisma.threadContinuation.findMany({
        where: { thread: { outlineId: plan.outlineId } },
        select: { chapterId: true, thread: { select: { label: true } } },
      }),
    ]);

    return {
      chapters: outlines
        .map((row) =>
          [
            at(row.chapterId),
            row.workingTitle,
            row.targetWordCount,
            row.focalCharacterId,
            row.placeId,
            row.periodStartDay,
            row.periodEndDay,
            row.periodPrecision,
            row.periodLabel,
            row.dramaticFunction,
            row.immediateGoal,
            row.obstacle,
            row.decision,
            row.revelation,
            row.consequence,
            row.detailedSummary,
          ]
            .map((value) => String(value ?? "-"))
            .join("|"),
        )
        .sort(),
      characters: outlines
        .flatMap((row) => row.characters.map((link) => `${at(row.chapterId)}|${link.characterId}`))
        .sort(),
      facts: outlines
        .flatMap((row) => row.facts.map((link) => `${at(row.chapterId)}|${link.factId}`))
        .sort(),
      threads: threads
        .map(
          (row) =>
            `${row.label}|${at(row.openingChapterId)}|${at(row.closingChapterId)}|${row.status}`,
        )
        .sort(),
      continuations: continuations.map((row) => `${row.thread.label}|${at(row.chapterId)}`).sort(),
    };
  }

  async function readChapterIds(): Promise<string[]> {
    const numbers = await readNumbers();

    return [...numbers.entries()].sort((left, right) => left[1] - right[1]).map(([id]) => id);
  }

  async function merge(
    survivorChapterId: string,
    absorbedChapterId: string,
    acknowledgeLoss = false,
  ) {
    return runWithActor(plan.ownerId, async () =>
      mergeChapters(scope, { survivorChapterId, absorbedChapterId, acknowledgeLoss }),
    );
  }

  async function split(arbitration: ChapterSplitArbitration) {
    return runWithActor(plan.ownerId, async () => splitChapter(scope, arbitration));
  }

  /** A chapter's plan as an arbitration half reads it, links included. */
  async function readHalf(chapterId: string): Promise<ChapterSplitHalf> {
    const row = await prisma.chapterOutline.findFirstOrThrow({
      where: { chapterId },
      select: {
        workingTitle: true,
        targetWordCount: true,
        focalCharacterId: true,
        placeId: true,
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
        characters: { select: { characterId: true } },
        facts: { select: { factId: true } },
      },
    });
    const chapter = await prisma.chapter.findUniqueOrThrow({
      where: { id: chapterId },
      select: {
        threadOpenings: { select: { id: true } },
        threadClosings: { select: { id: true } },
        threadContinuations: { select: { threadId: true } },
      },
    });

    return {
      ...row,
      characterIds: row.characters.map((link) => link.characterId),
      factIds: row.facts.map((link) => link.factId),
      opensThreadIds: chapter.threadOpenings.map((thread) => thread.id),
      closesThreadIds: chapter.threadClosings.map((thread) => thread.id),
      continuesThreadIds: chapter.threadContinuations.map((link) => link.threadId),
    } as ChapterSplitHalf;
  }

  beforeAll(async () => {
    configureDatabaseClient(seam);

    const owner = await prisma.user.create({
      data: { email: "chapter-cut-owner@example.test", name: "Test User" },
    });
    const stranger = await prisma.user.create({
      data: { email: "chapter-cut-stranger@example.test", name: "Test User" },
    });
    strangerId = stranger.id;
    setActor(owner.id);

    const project = await prisma.project.create({
      data: { title: "chapter-cut", userId: owner.id },
    });
    const bible = await prisma.bible.create({ data: { projectId: project.id } });
    const outline = await prisma.outline.create({
      data: { projectId: project.id, bibleId: bible.id },
    });

    const characterIds: string[] = [];
    for (const suffix of ["alpha", "beta", "gamma"]) {
      const character = await prisma.character.create({
        data: { bibleId: bible.id, name: `chapter-cut-character-${suffix}`, origin: "GENERATED" },
      });
      characterIds.push(character.id);
    }

    const factIds: string[] = [];
    for (const suffix of ["one", "two"]) {
      const fact = await prisma.canonFact.create({
        data: { bibleId: bible.id, statement: `fixture-${suffix}`, isTrue: true, source: "BIBLE" },
      });
      factIds.push(fact.id);
    }

    const placeIds: string[] = [];
    for (const suffix of ["here", "there"]) {
      const place = await prisma.place.create({
        data: { bibleId: bible.id, name: `chapter-cut-place-${suffix}`, origin: "GENERATED" },
      });
      placeIds.push(place.id);
    }

    const partIds: string[] = [];
    const chapterIds: string[] = [];

    // Keys chosen by hand: what is under test is the write, and a fixture that
    // already used the ordering arithmetic could not fail it.
    const partKeys = ["i", "r"];
    const chapterKeys = ["c", "i", "o", "u"];

    for (let partIndex = 0; partIndex < PART_COUNT; partIndex += 1) {
      const part = await prisma.part.create({
        data: {
          outlineId: outline.id,
          orderKey: partKeys[partIndex] ?? "z",
          title: `chapter-cut-part-${String(partIndex)}`,
        },
      });
      partIds.push(part.id);

      for (let index = 0; index < CHAPTERS_PER_PART; index += 1) {
        const chapter = await prisma.chapter.create({
          data: {
            outlineId: outline.id,
            bibleId: bible.id,
            partId: part.id,
            orderKey: chapterKeys[index] ?? "z",
          },
        });
        chapterIds.push(chapter.id);

        const tag = `${String(partIndex)}-${String(index)}`;
        const chapterOutline = await prisma.chapterOutline.create({
          data: {
            bibleId: bible.id,
            chapterId: chapter.id,
            workingTitle: `titre-${tag}`,
            targetWordCount: 2_000 + index * 500,
            focalCharacterId: characterIds[0],
            // The second part's chapters sit in the other place, which is what
            // gives the acknowledgement path a pair that disagrees.
            placeId: placeIds[partIndex],
            periodStartDay: partIndex * 100 + index * 10,
            periodEndDay: partIndex * 100 + index * 10 + 5,
            periodPrecision: "DAY",
            periodLabel: `periode-${tag}`,
            dramaticFunction: `fonction-${tag}`,
            immediateGoal: `objectif-${tag}`,
            obstacle: `obstacle-${tag}`,
            decision: `decision-${tag}`,
            revelation: `revelation-${tag}`,
            consequence: `consequence-${tag}`,
            detailedSummary: `resume-${tag}`,
          },
        });

        for (const characterId of [characterIds[0], characterIds[1 + (index % 2)]]) {
          if (characterId === undefined) continue;

          await prisma.chapterOutlineCharacter.create({
            data: { bibleId: bible.id, chapterOutlineId: chapterOutline.id, characterId },
          });
        }

        const factId = factIds[index % factIds.length];
        if (factId !== undefined) {
          await prisma.chapterOutlineFact.create({
            data: { bibleId: bible.id, chapterOutlineId: chapterOutline.id, factId },
          });
        }
      }
    }

    // Chosen so the merge under test has every shape to exercise and none that
    // deduplicates: thread A is continued by both chapters (one row survives),
    // B is opened by the survivor, C is opened by the absorbed chapter — which
    // is the `NoAction` on `openingChapterId` the delete would otherwise hit.
    const threadShapes = [
      { opening: 0, continuations: [1, 2], closing: 3 },
      { opening: 1, continuations: [4], closing: 6 },
      { opening: 2, continuations: [], closing: 3 },
    ];
    const threadIds: string[] = [];

    for (const [index, shape] of threadShapes.entries()) {
      const openingChapterId = chapterIds[shape.opening];
      if (openingChapterId === undefined) throw new Error("the fixture is short of chapters");

      const thread = await prisma.thread.create({
        data: {
          outlineId: outline.id,
          bibleId: bible.id,
          label: `chapter-cut-thread-${String(index)}`,
          narrativePromise: "fixture",
          openingChapterId,
          closingChapterId: shape.closing === null ? null : chapterIds[shape.closing],
          status: shape.closing === null ? "OPEN" : "CLOSED",
        },
      });
      threadIds.push(thread.id);

      for (const position of shape.continuations) {
        const chapterId = chapterIds[position];
        if (chapterId === undefined) throw new Error("the fixture is short of chapters");

        await prisma.threadContinuation.create({
          data: { bibleId: bible.id, threadId: thread.id, chapterId },
        });
      }
    }

    plan = {
      ownerId: owner.id,
      projectId: project.id,
      outlineId: outline.id,
      bibleId: bible.id,
      partIds,
      chapterIds,
      characterIds,
      factIds,
      placeIds,
      threadIds,
    };

    const opened = await openProjectScope({ ownerId: owner.id, projectId: project.id });
    if (!opened.ok) throw new Error("the owner could not open a scope on their own project");
    scope = opened.value;
  });

  afterAll(async () => {
    resetDatabaseClient();
    await prisma.$disconnect();
    await seam.$disconnect();
  });

  it("built a plan with something to lose", async () => {
    const census = await readCensus();

    expect(plan.chapterIds).toHaveLength(PART_COUNT * CHAPTERS_PER_PART);
    expect(census.chapters).toHaveLength(PART_COUNT * CHAPTERS_PER_PART);
    expect(census.threads).toHaveLength(3);
    expect(census.continuations).toHaveLength(3);
  });

  /**
   * The criterion itself, in the backlog's own words: *fusionner puis scinder
   * restitue un plan cohérent, sans perte d'attribut*.
   */
  it("gives the plan back exactly, merged then split", async () => {
    const before = await readCensus();
    const idsBefore = await readChapterIds();
    const [, survivorId, absorbedId] = idsBefore;
    if (survivorId === undefined || absorbedId === undefined) throw new Error("plan too short");

    const merged = await merge(survivorId, absorbedId);

    expect(merged.ok).toBe(true);
    if (!merged.ok) throw new Error(merged.error.code);
    expect(merged.value.report.losses).toEqual([]);

    // One chapter fewer, and the numbering closed up behind it.
    const afterMerge = await readCensus();
    expect(afterMerge.chapters).toHaveLength(PART_COUNT * CHAPTERS_PER_PART - 1);
    expect(await readChapterIds()).toEqual(idsBefore.filter((id) => id !== absorbedId));

    // The consolidated chapter carries both chapters' prose, joined rather than
    // picked between — which is what makes the cut below derivable from the
    // database rather than remembered by the test.
    const consolidated = await readHalf(survivorId);
    expect(consolidated.obstacle).toBe(`obstacle-0-1 ${CHAPTER_MERGE_CONNECTOR} obstacle-0-2`);
    expect(consolidated.workingTitle).toBe(`titre-0-1 ${CHAPTER_MERGE_TITLE_CONNECTOR} titre-0-2`);
    expect(consolidated.targetWordCount).toBe(2_500 + 3_000);
    expect(consolidated.periodStartDay).toBe(10);
    expect(consolidated.periodEndDay).toBe(25);
    expect([...consolidated.characterIds].sort()).toEqual(
      [plan.characterIds[0], plan.characterIds[1], plan.characterIds[2]].sort(),
    );

    // The arbitration is cut out of what the merge actually wrote: every prose
    // column split back at the connector it was joined with.
    const cut = (joined: string | null, connector: string): [string | null, string | null] => {
      if (joined === null) return [null, null];

      const parts = joined.split(` ${connector} `);

      return [parts[0] ?? null, parts[1] ?? null];
    };
    const proseColumns = [
      "dramaticFunction",
      "immediateGoal",
      "obstacle",
      "decision",
      "revelation",
      "consequence",
      "detailedSummary",
    ] as const;
    const first: Record<string, unknown> = {};
    const second: Record<string, unknown> = {};

    for (const column of proseColumns) {
      const [left, right] = cut(consolidated[column], CHAPTER_MERGE_CONNECTOR);
      first[column] = left;
      second[column] = right;
    }

    const [firstTitle, secondTitle] = cut(consolidated.workingTitle, CHAPTER_MERGE_TITLE_CONNECTOR);
    const [firstLabel, secondLabel] = cut(consolidated.periodLabel, CHAPTER_MERGE_TITLE_CONNECTOR);
    const [threadA, threadB, threadC] = plan.threadIds;
    if (threadA === undefined || threadB === undefined || threadC === undefined) {
      throw new Error("the fixture is short of threads");
    }

    const arbitration: ChapterSplitArbitration = {
      chapterId: survivorId,
      first: {
        ...(first as Omit<ChapterSplitHalf, "workingTitle">),
        workingTitle: firstTitle,
        targetWordCount: 2_500,
        focalCharacterId: plan.characterIds[0] ?? null,
        placeId: plan.placeIds[0] ?? null,
        periodStartDay: 10,
        periodEndDay: 15,
        periodPrecision: "DAY",
        periodLabel: firstLabel,
        characterIds: [plan.characterIds[0], plan.characterIds[2]].filter(
          (id): id is string => id !== undefined,
        ),
        factIds: [plan.factIds[1]].filter((id): id is string => id !== undefined),
        opensThreadIds: [threadB],
        continuesThreadIds: [threadA],
        closesThreadIds: [],
      } as ChapterSplitHalf,
      second: {
        ...(second as Omit<ChapterSplitHalf, "workingTitle">),
        workingTitle: secondTitle,
        targetWordCount: 3_000,
        focalCharacterId: plan.characterIds[0] ?? null,
        placeId: plan.placeIds[0] ?? null,
        periodStartDay: 20,
        periodEndDay: 25,
        periodPrecision: "DAY",
        periodLabel: secondLabel,
        characterIds: [plan.characterIds[0], plan.characterIds[1]].filter(
          (id): id is string => id !== undefined,
        ),
        factIds: [plan.factIds[0]].filter((id): id is string => id !== undefined),
        opensThreadIds: [threadC],
        continuesThreadIds: [threadA],
        closesThreadIds: [],
      } as ChapterSplitHalf,
    };

    const restored = await split(arbitration);

    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error(restored.error.code);

    // Nothing was rewritten: every prose column of both halves is a passage of
    // what the merged chapter held — the "no attribute lost" claim for prose.
    expect(restored.value.report.advisories).toEqual([]);

    // And the plan is the one that was there before the cycle, position for
    // position, attribute for attribute.
    expect(await readCensus()).toEqual(before);

    // Only the absorbed chapter's id is gone, replaced by the minted one at the
    // same position; every other id is untouched.
    const idsAfter = await readChapterIds();
    expect(idsAfter).toHaveLength(idsBefore.length);
    expect(idsAfter[2]).toBe(restored.value.createdChapterId);
    expect(idsAfter.filter((id) => id !== restored.value.createdChapterId)).toEqual(
      idsBefore.filter((id) => id !== absorbedId),
    );
  });

  it("refuses a pair the plan does not read one after the other, and writes nothing", async () => {
    const census = await readCensus();
    const ids = await readChapterIds();
    const [first, , third] = ids;
    if (first === undefined || third === undefined) throw new Error("plan too short");

    const refused = await merge(first, third);

    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe("CHAPTER_MERGE_REFUSED");
    expect(await readCensus()).toEqual(census);
  });

  it("refuses a pair straddling two parts, and writes nothing", async () => {
    const census = await readCensus();
    const ids = await readChapterIds();
    const [, , , lastOfFirst, firstOfSecond] = ids;
    if (lastOfFirst === undefined || firstOfSecond === undefined) throw new Error("plan too short");

    const refused = await merge(lastOfFirst, firstOfSecond);

    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe("CHAPTER_MERGE_REFUSED");
    expect(await readCensus()).toEqual(census);
  });

  it("refuses a chapter that already holds a revision, and writes nothing", async () => {
    const ids = await readChapterIds();
    const [, , , , , sixth, seventh] = ids;
    if (sixth === undefined || seventh === undefined) throw new Error("plan too short");

    const revision = await prisma.chapterRevision.create({
      data: {
        chapterId: seventh,
        revisionNumber: 1,
        origin: "EDITED",
        content: "fixture",
        wordCount: 1,
        createdById: plan.ownerId,
      },
    });

    try {
      const census = await readCensus();
      const refused = await merge(sixth, seventh, true);

      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.code).toBe("CHAPTER_MERGE_REFUSED");
      expect(await readCensus()).toEqual(census);
    } finally {
      await prisma.chapterRevision.delete({ where: { id: revision.id } });
    }
  });

  it("refuses a locked plan, and writes nothing", async () => {
    const ids = await readChapterIds();
    const [, , , , , sixth, seventh] = ids;
    if (sixth === undefined || seventh === undefined) throw new Error("plan too short");

    await prisma.chapterOutline.updateMany({
      where: { chapterId: seventh },
      data: { lockedAt: new Date() },
    });

    try {
      const census = await readCensus();
      const refused = await merge(sixth, seventh, true);

      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.code).toBe("CHAPTER_MERGE_REFUSED");
      expect(await readCensus()).toEqual(census);
    } finally {
      await prisma.chapterOutline.updateMany({
        where: { chapterId: seventh },
        data: { lockedAt: null },
      });
    }
  });

  it("refuses a merge that would lose a place until the caller says they know", async () => {
    const ids = await readChapterIds();
    const [, , , lastOfFirst] = ids;
    if (lastOfFirst === undefined) throw new Error("plan too short");

    // A pair inside one part that disagrees on the place: the fixture sets the
    // second part elsewhere, so one chapter is moved there by hand.
    await prisma.chapterOutline.updateMany({
      where: { chapterId: lastOfFirst },
      data: { placeId: plan.placeIds[1] },
    });

    try {
      const census = await readCensus();
      const previous = ids[2];
      if (previous === undefined) throw new Error("plan too short");

      const refused = await merge(previous, lastOfFirst);

      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.error.code).toBe("CHAPTER_MERGE_LOSS_NOT_ACKNOWLEDGED");
      expect(await readCensus()).toEqual(census);

      const accepted = await merge(previous, lastOfFirst, true);

      expect(accepted.ok).toBe(true);
      if (!accepted.ok) throw new Error(accepted.error.code);
      expect(accepted.value.report.losses.map((loss) => loss.kind)).toEqual(["place"]);

      // The survivor kept its own place; nothing else went quietly.
      const survivor = await readHalf(previous);
      expect(survivor.placeId).toBe(plan.placeIds[0]);
    } finally {
      // The merge is not undone: the suite's later cases read the plan as it
      // now stands, and the census is re-read rather than remembered.
      await prisma.chapterOutline.updateMany({
        where: { chapterId: lastOfFirst },
        data: { placeId: plan.placeIds[0] },
      });
    }
  });

  it("refuses another owner, and writes nothing", async () => {
    const census = await readCensus();
    const ids = await readChapterIds();
    const [first, second] = ids;
    if (first === undefined || second === undefined) throw new Error("plan too short");

    const theirs = await runWithActor(strangerId, async () =>
      mergeChapters(forgedScope(strangerId, plan.projectId), {
        survivorChapterId: first,
        absorbedChapterId: second,
        acknowledgeLoss: true,
      }),
    );

    expect(theirs.ok).toBe(false);
    if (!theirs.ok) expect(theirs.error.code).toBe("NOT_FOUND");
    expect(await readCensus()).toEqual(census);
  });

  it("refuses a redistribution that drops a reference, and writes nothing", async () => {
    const census = await readCensus();
    const ids = await readChapterIds();
    const [source] = ids;
    if (source === undefined) throw new Error("plan too short");

    const half = await readHalf(source);
    const refused = await split({
      chapterId: source,
      first: {
        ...half,
        characterIds: [],
        factIds: [],
        opensThreadIds: [],
        continuesThreadIds: [],
        closesThreadIds: [],
      },
      second: {
        ...half,
        characterIds: [],
        factIds: [],
        opensThreadIds: [],
        continuesThreadIds: [],
        closesThreadIds: [],
      },
    });

    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe("CHAPTER_SPLIT_REFUSED");
    expect(await readCensus()).toEqual(census);
  });

  it("conserves every reference under a redistribution nobody designed", async () => {
    const ids = await readChapterIds();
    const source = ids[ids.length - 1];
    if (source === undefined) throw new Error("plan too short");

    const half = await readHalf(source);
    const before = await readCensus();
    /**
     * The referenced ids, deduplicated and with the position dropped: what is
     * under test here is that nothing **vanished** from the plan, not that it
     * stayed where it was. A count comparison would be the wrong instrument —
     * a reference the author gives to both halves is legitimately two links
     * where it was one, which is the case below for the fact.
     */
    const referencedBy = (census: PlanCensus): Record<string, string[]> => {
      const idsOf = (entries: readonly string[], field: number): string[] =>
        [...new Set(entries.map((entry) => entry.split("|")[field] ?? ""))].sort();

      return {
        characters: idsOf(census.characters, 1),
        facts: idsOf(census.facts, 1),
        threads: idsOf(census.threads, 0),
        continuations: idsOf(census.continuations, 0),
      };
    };

    // A partition nothing in the domain suggested: the cast split in two, the
    // facts deliberately carried by **both** halves, the openings kept on the
    // first and the closings pushed to the second.
    const [head, ...tail] = half.characterIds;
    const applied = await split({
      chapterId: source,
      first: {
        ...half,
        targetWordCount: Math.round((half.targetWordCount ?? 2_000) / 2),
        characterIds: head === undefined ? [] : [head],
        focalCharacterId: head ?? null,
        closesThreadIds: [],
      },
      second: {
        ...half,
        targetWordCount: Math.round((half.targetWordCount ?? 2_000) / 2),
        characterIds: tail.length === 0 ? half.characterIds : tail,
        focalCharacterId: tail[0] ?? half.focalCharacterId,
        opensThreadIds: [],
        periodStartDay: half.periodEndDay,
      },
    });

    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error(applied.error.code);

    const after = await readCensus();

    expect(referencedBy(after)).toEqual(referencedBy(before));
    // The fact went to both halves, so it holds two links where it held one —
    // a gain, never a loss, and the reason the comparison above is over sets.
    expect(after.facts.length).toBe(before.facts.length + half.factIds.length);
    // And the plan still reads as a contiguous run of chapters.
    expect(after.chapters).toHaveLength(before.chapters.length + 1);
    expect((await readNumbers()).size).toBe(before.chapters.length + 1);
  });
});

function forgedScope(ownerId: string, projectId: string): ProjectScope {
  return {
    [Symbol.for("calepin.ProjectScope")]: true,
    projectId,
    ownerId,
  } as unknown as ProjectScope;
}
