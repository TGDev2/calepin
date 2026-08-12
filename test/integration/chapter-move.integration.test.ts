/**
 * CAL-105's acceptance criterion, against a real PostgreSQL: **moving a chapter
 * breaks neither the narrative threads nor the references to canon facts and
 * characters.**
 *
 * `order/move.test.ts` proves the arithmetic; this proves the write. The two
 * are not the same claim — the arithmetic returns one placement, and it is the
 * `UPDATE` that could touch a second row, drop a link, or reparent a chapter
 * into a plan it does not belong to.
 *
 * The method is a **census**: every reference the schema holds to a chapter,
 * read back after every single move and compared whole to what it was before
 * the first one. That covers all five shapes at once — `Thread.openingChapterId`
 * and `closingChapterId`, `ThreadContinuation`, `ChapterOutline` and, behind it,
 * `ChapterOutlineCharacter` and `ChapterOutlineFact` — and it fails on a
 * reference nobody anticipated too, because nothing about it is enumerated by
 * hand except the tables it reads.
 *
 * Every string is technical. §9 forbids literary content in a committed
 * artefact, and a reordering suite needs none: what is under test is where a
 * chapter sits, never what happens in it.
 */

import { resolveOutline } from "@calepin/outline";
import { moveChapter } from "@calepin/outline/repository";
import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import { openProjectScope, type ProjectScope } from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

/** Two parts of four chapters: enough for every shape of move to be distinct. */
const PART_COUNT = 2;
const CHAPTERS_PER_PART = 4;

interface Plan {
  readonly ownerId: string;
  readonly projectId: string;
  readonly outlineId: string;
  /** The parts in reading order. */
  readonly partIds: readonly string[];
  /** The chapters in reading order, at the moment the fixture was built. */
  readonly chapterIds: readonly string[];
}

/**
 * Everything outside the plan's own ordering that names a chapter.
 *
 * Sorted and flattened into strings so two censuses compare as values: what is
 * asserted is that the *same* thread still opens at the *same* chapter, not
 * merely that some thread opens somewhere.
 */
interface ReferenceCensus {
  readonly threads: readonly string[];
  readonly continuations: readonly string[];
  readonly chapterOutlines: readonly string[];
  readonly outlineCharacters: readonly string[];
  readonly outlineFacts: readonly string[];
}

/** A chapter's placement, which is the only thing a move may rewrite. */
interface Placement {
  readonly id: string;
  readonly partId: string;
  readonly orderKey: string;
  readonly version: number;
}

describe("moving a chapter of the plan", () => {
  const { prisma, setActor } = createAuditedClient();
  /** The client the repository layer itself reads, registered on the seam. */
  const seam = new PrismaClient();

  let plan: Plan;
  let scope: ProjectScope;
  let strangerId: string;

  async function readCensus(outlineId: string): Promise<ReferenceCensus> {
    const [threads, continuations, chapterOutlines, outlineCharacters, outlineFacts] =
      await Promise.all([
        prisma.thread.findMany({
          where: { outlineId },
          select: { id: true, openingChapterId: true, closingChapterId: true, status: true },
          orderBy: { label: "asc" },
        }),
        prisma.threadContinuation.findMany({
          where: { thread: { outlineId } },
          select: { threadId: true, chapterId: true },
        }),
        prisma.chapterOutline.findMany({
          where: { chapter: { outlineId } },
          select: { id: true, chapterId: true, workingTitle: true, lockedAt: true },
        }),
        prisma.chapterOutlineCharacter.findMany({
          where: { chapterOutline: { chapter: { outlineId } } },
          select: { chapterOutlineId: true, characterId: true },
        }),
        prisma.chapterOutlineFact.findMany({
          where: { chapterOutline: { chapter: { outlineId } } },
          select: { chapterOutlineId: true, factId: true },
        }),
      ]);

    return {
      threads: threads
        .map(
          (row) => `${row.id}|${row.openingChapterId}|${row.closingChapterId ?? "-"}|${row.status}`,
        )
        .sort(),
      continuations: continuations.map((row) => `${row.threadId}|${row.chapterId}`).sort(),
      chapterOutlines: chapterOutlines
        .map((row) => `${row.id}|${row.chapterId}|${row.workingTitle ?? "-"}`)
        .sort(),
      outlineCharacters: outlineCharacters
        .map((row) => `${row.chapterOutlineId}|${row.characterId}`)
        .sort(),
      outlineFacts: outlineFacts.map((row) => `${row.chapterOutlineId}|${row.factId}`).sort(),
    };
  }

  async function readPlacements(outlineId: string): Promise<Placement[]> {
    const rows = await prisma.chapter.findMany({
      where: { outlineId },
      select: { id: true, partId: true, orderKey: true, version: true },
      orderBy: { id: "asc" },
    });

    return rows;
  }

  /** The plan as a reader sees it: every chapter numbered, in reading order. */
  async function readReadingOrder(outlineId: string): Promise<{ id: string; number: number }[]> {
    const [parts, chapters] = await Promise.all([
      prisma.part.findMany({ where: { outlineId }, select: { id: true, orderKey: true } }),
      prisma.chapter.findMany({
        where: { outlineId },
        select: { id: true, partId: true, orderKey: true },
      }),
    ]);

    const resolved = resolveOutline(parts, chapters);
    if (!resolved.ok) throw new Error("the plan no longer resolves to a reading order");

    return resolved.value.chapters.map((entry) => ({
      id: entry.chapter.id,
      number: entry.number,
    }));
  }

  async function move(chapterId: string, targetPartId: string, afterChapterId: string | null) {
    return runWithActor(plan.ownerId, async () =>
      moveChapter(scope, { chapterId, targetPartId, afterChapterId }),
    );
  }

  beforeAll(async () => {
    configureDatabaseClient(seam);

    const owner = await prisma.user.create({
      data: { email: "chapter-move-owner@example.test", name: "Test User" },
    });
    const stranger = await prisma.user.create({
      data: { email: "chapter-move-stranger@example.test", name: "Test User" },
    });
    strangerId = stranger.id;
    setActor(owner.id);

    const project = await prisma.project.create({
      data: { title: "chapter-move", userId: owner.id },
    });
    const bible = await prisma.bible.create({ data: { projectId: project.id } });
    const outline = await prisma.outline.create({
      data: { projectId: project.id, bibleId: bible.id },
    });

    const character = await prisma.character.create({
      data: { bibleId: bible.id, name: "chapter-move-character", origin: "GENERATED" },
    });
    const fact = await prisma.canonFact.create({
      data: { bibleId: bible.id, statement: "fixture", isTrue: true, source: "BIBLE" },
    });

    const partIds: string[] = [];
    const chapterIds: string[] = [];

    // Keys chosen by hand rather than minted: what is under test is the move,
    // and a fixture that already used the arithmetic could not fail it.
    const partKeys = ["i", "r"];
    const chapterKeys = ["c", "i", "o", "u"];

    for (let partIndex = 0; partIndex < PART_COUNT; partIndex += 1) {
      const part = await prisma.part.create({
        data: {
          outlineId: outline.id,
          orderKey: partKeys[partIndex] ?? "z",
          title: `chapter-move-part-${String(partIndex)}`,
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
            // The last chapter of the last part is locked, both ways a chapter
            // can be: the plan's own lock and the manuscript's status. A move is
            // the author's decision, so neither stands in its way (CAL-107's
            // wording is about *automatic* modification).
            status:
              partIndex === PART_COUNT - 1 && index === CHAPTERS_PER_PART - 1
                ? "LOCKED"
                : "PLANNED",
          },
        });
        chapterIds.push(chapter.id);

        const chapterOutline = await prisma.chapterOutline.create({
          data: {
            bibleId: bible.id,
            chapterId: chapter.id,
            workingTitle: `chapter-move-${String(partIndex)}-${String(index)}`,
            lockedAt:
              partIndex === PART_COUNT - 1 && index === CHAPTERS_PER_PART - 1 ? new Date() : null,
          },
        });
        await prisma.chapterOutlineCharacter.create({
          data: {
            bibleId: bible.id,
            chapterOutlineId: chapterOutline.id,
            characterId: character.id,
          },
        });
        await prisma.chapterOutlineFact.create({
          data: { bibleId: bible.id, chapterOutlineId: chapterOutline.id, factId: fact.id },
        });
      }
    }

    // Three threads whose openings, continuations and closings straddle the two
    // parts: a move that reparented or dropped a link has somewhere to show it.
    const threadShapes = [
      { opening: 0, continuations: [1, 2], closing: 3 },
      { opening: 1, continuations: [4], closing: 6 },
      { opening: 5, continuations: [6, 7], closing: null },
    ];

    for (const [index, shape] of threadShapes.entries()) {
      const openingChapterId = chapterIds[shape.opening];
      if (openingChapterId === undefined) throw new Error("the fixture is short of chapters");

      const thread = await prisma.thread.create({
        data: {
          outlineId: outline.id,
          bibleId: bible.id,
          label: `chapter-move-thread-${String(index)}`,
          narrativePromise: "fixture",
          openingChapterId,
          closingChapterId: shape.closing === null ? null : chapterIds[shape.closing],
          status: shape.closing === null ? "OPEN" : "CLOSED",
        },
      });

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
      partIds,
      chapterIds,
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

  it("built a plan with something to break", () => {
    expect(plan.chapterIds).toHaveLength(PART_COUNT * CHAPTERS_PER_PART);
    expect(plan.partIds).toHaveLength(PART_COUNT);
  });

  /**
   * The criterion itself, in the backlog's own words.
   *
   * A series rather than a single move: the property that matters is that it
   * holds *after each one*, and a single move could pass by accident where a
   * chapter carried back and forth across a part boundary could not.
   */
  it("breaks no reference through a series of moves", async () => {
    const [a, b, c, d, e, f, g, h] = plan.chapterIds;
    const [first, second] = plan.partIds;
    if (
      a === undefined ||
      b === undefined ||
      c === undefined ||
      d === undefined ||
      e === undefined ||
      f === undefined ||
      g === undefined ||
      h === undefined ||
      first === undefined ||
      second === undefined
    ) {
      throw new Error("the fixture is incomplete");
    }

    const census = await readCensus(plan.outlineId);
    const identities = new Set(plan.chapterIds);

    const series: { chapterId: string; partId: string; after: string | null }[] = [
      // Down one, inside the part.
      { chapterId: a, partId: first, after: b },
      // Back to the head.
      { chapterId: a, partId: first, after: null },
      // To the tail of its own part.
      { chapterId: a, partId: first, after: d },
      // Across, to the head of the second part.
      { chapterId: a, partId: second, after: null },
      // Across, to the tail of the second part — behind the locked chapter.
      { chapterId: a, partId: second, after: h },
      // The locked chapter itself moves, to the head of the first part.
      { chapterId: h, partId: first, after: null },
      // A chapter carrying a thread opening, into the middle of the other part.
      { chapterId: f, partId: first, after: c },
      // A chapter carrying a thread closing, behind the one that crossed over.
      { chapterId: g, partId: second, after: a },
      // Two more inside one part, in both directions.
      { chapterId: e, partId: second, after: g },
      { chapterId: e, partId: second, after: null },
    ];

    for (const step of series) {
      const before = await readPlacements(plan.outlineId);

      const result = await move(step.chapterId, step.partId, step.after);
      expect(result.ok).toBe(true);
      // Every step of this series is a real move; a step that quietly became a
      // no-op would satisfy every assertion below without proving anything.
      expect(result.ok && result.value.moved).toBe(true);

      // Every reference still names the chapter it named, and no link was
      // dropped, duplicated or reparented.
      expect(await readCensus(plan.outlineId)).toEqual(census);

      // No chapter appeared, disappeared or changed identity.
      const after = await readPlacements(plan.outlineId);
      expect(new Set(after.map((row) => row.id))).toEqual(identities);

      // One operation writes one row. `version` is the audit block's own
      // counter, so a row rewritten with the values it already held would show
      // up here too.
      const changed = after.filter((row) => {
        const previous = before.find((candidate) => candidate.id === row.id);

        return (
          previous === undefined ||
          previous.partId !== row.partId ||
          previous.orderKey !== row.orderKey ||
          previous.version !== row.version
        );
      });
      expect(changed).toHaveLength(1);
      expect(changed[0]?.id).toBe(step.chapterId);
      expect(changed[0]?.partId).toBe(step.partId);

      // And the numbering a reader sees is still a contiguous 1..N.
      const reading = await readReadingOrder(plan.outlineId);
      expect(reading.map((entry) => entry.number)).toEqual(
        Array.from({ length: plan.chapterIds.length }, (_, index) => index + 1),
      );
    }
  });

  it("lands the chapter exactly where the anchor pointed", async () => {
    const before = (await readReadingOrder(plan.outlineId)).map((entry) => entry.id);
    const head = before[0];
    const third = before[2];
    if (head === undefined || third === undefined) throw new Error("the plan is too short");

    // Whatever the series above left behind, the head chapter goes behind the
    // third one of the plan — which is only a well-defined instruction because
    // both are read back from the database first.
    const thirdPart = await prisma.chapter.findUniqueOrThrow({
      where: { id: third },
      select: { partId: true },
    });

    const moved = await move(head, thirdPart.partId, third);
    expect(moved.ok).toBe(true);

    const after = (await readReadingOrder(plan.outlineId)).map((entry) => entry.id);
    expect(after.indexOf(head)).toBe(after.indexOf(third) + 1);
    expect(new Set(after)).toEqual(new Set(before));
  });

  it("writes nothing when the chapter is already where it is asked to go", async () => {
    const [firstPart] = plan.partIds;
    if (firstPart === undefined) throw new Error("the fixture is incomplete");

    const siblings = await prisma.chapter.findMany({
      where: { partId: firstPart },
      select: { id: true },
      orderBy: { orderKey: "asc" },
    });
    const [above, resubmitted] = siblings;
    if (above === undefined || resubmitted === undefined) throw new Error("part too short");

    const before = await readPlacements(plan.outlineId);
    // Behind the sibling it already sits behind: the same request the screen
    // would send if the author dropped a chapter back where they picked it up.
    const result = await move(resubmitted.id, firstPart, above.id);

    expect(result.ok && result.value.moved).toBe(false);
    // Not the placement, not the audit block, not the optimistic token.
    expect(await readPlacements(plan.outlineId)).toEqual(before);
  });

  it("refuses another owner, and moves nothing on the way out", async () => {
    const before = await readPlacements(plan.outlineId);
    const census = await readCensus(plan.outlineId);
    const [entry] = plan.chapterIds;
    if (entry === undefined) throw new Error("plan too short");

    const chapter = await prisma.chapter.findUniqueOrThrow({
      where: { id: entry },
      select: { partId: true },
    });

    const theirs = await runWithActor(strangerId, async () =>
      moveChapter(forgedScope(strangerId, plan.projectId), {
        chapterId: entry,
        targetPartId: chapter.partId,
        afterChapterId: null,
      }),
    );

    expect(theirs.ok).toBe(false);
    if (!theirs.ok) expect(theirs.error.code).toBe("NOT_FOUND");
    expect(await readPlacements(plan.outlineId)).toEqual(before);
    expect(await readCensus(plan.outlineId)).toEqual(census);
  });

  it("refuses an anchor that is not in the destination part, and moves nothing", async () => {
    const before = await readPlacements(plan.outlineId);
    const [firstPart, secondPart] = plan.partIds;
    if (firstPart === undefined || secondPart === undefined) throw new Error("plan too short");

    const inFirst = await prisma.chapter.findFirstOrThrow({
      where: { partId: firstPart },
      select: { id: true },
    });
    const inSecond = await prisma.chapter.findFirstOrThrow({
      where: { partId: secondPart },
      select: { id: true },
    });

    const stale = await move(inFirst.id, firstPart, inSecond.id);

    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.error.category).toBe("validation");
      expect(stale.error.userMessage).toBe(
        "Le plan a changé depuis son affichage. Rechargez-le avant de déplacer ce chapitre.",
      );
    }
    expect(await readPlacements(plan.outlineId)).toEqual(before);
  });

  it("refuses a part that belongs to another plan, and moves nothing", async () => {
    const before = await readPlacements(plan.outlineId);

    const otherProject = await prisma.project.create({
      data: { title: "chapter-move-other", userId: plan.ownerId },
    });
    const otherBible = await prisma.bible.create({ data: { projectId: otherProject.id } });
    const otherOutline = await prisma.outline.create({
      data: { projectId: otherProject.id, bibleId: otherBible.id },
    });
    const otherPart = await prisma.part.create({
      data: { outlineId: otherOutline.id, orderKey: "i", title: "chapter-move-other-part" },
    });

    const entry = plan.chapterIds[0];
    if (entry === undefined) throw new Error("plan too short");

    // The owner is the same person, so this is not an ownership refusal: it is
    // a part of another novel, and the composite foreign key would have refused
    // the write with a constraint name nobody can act on.
    const crossed = await move(entry, otherPart.id, null);

    expect(crossed.ok).toBe(false);
    if (!crossed.ok) expect(crossed.error.code).toBe("NOT_FOUND");
    expect(await readPlacements(plan.outlineId)).toEqual(before);
  });
});

/**
 * A scope nobody opened, built the way an attacker would: the brand is a
 * registry symbol and therefore forgeable, which is exactly why it is not what
 * protects the row — `owner-access.integration.test.ts` states the same case at
 * length, and a repository function in a domain package answers to it too.
 */
function forgedScope(ownerId: string, projectId: string): ProjectScope {
  return {
    [Symbol.for("calepin.ProjectScope")]: true,
    projectId,
    ownerId,
  } as unknown as ProjectScope;
}
