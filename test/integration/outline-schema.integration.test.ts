import {
  compareOrderKeys,
  isOrderKey,
  ORDER_KEY_ALPHABET,
  orderKeyAt,
  orderKeysBetween,
} from "@calepin/outline";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type AuditedClient, createAuditedClient } from "./audited-client";

const PART_ORDER_KEY_CHECK = /parts_order_key_check/;
const CHAPTER_ORDER_KEY_CHECK = /chapters_order_key_check/;
const TARGET_WORD_COUNT_CHECK = /chapter_outlines_target_word_count_check/;
const PERIOD_PRECISION_CHECK = /chapter_outlines_period_precision_check/;
const PERIOD_ORDER_CHECK = /chapter_outlines_period_order_check/;
const REVISION_NUMBER_CHECK = /chapter_revisions_revision_number_check/;
const WORD_COUNT_CHECK = /chapter_revisions_word_count_check/;

/**
 * Every fixture string here is technical. §9 forbids literary content in a
 * committed artefact, and an ordering suite needs none: what is under test is
 * where a chapter sits and what may reference it, never what happens in it.
 */
describe("outline schema", () => {
  let prisma: AuditedClient;
  let setActor: (id: string) => void;
  let sequence = 0;

  async function createPlanFixture() {
    sequence += 1;
    const user = await prisma.user.create({
      data: { email: `outline-schema-${sequence}@example.test`, name: "Test User" },
    });
    setActor(user.id);
    const project = await prisma.project.create({
      data: { title: `outline-schema-${sequence}`, userId: user.id },
    });
    const bible = await prisma.bible.create({ data: { projectId: project.id } });
    const outline = await prisma.outline.create({
      data: { projectId: project.id, bibleId: bible.id },
    });
    const part = await prisma.part.create({
      data: { outlineId: outline.id, orderKey: "i", title: `part-${sequence}` },
    });

    return {
      userId: user.id,
      projectId: project.id,
      bibleId: bible.id,
      outlineId: outline.id,
      partId: part.id,
    };
  }

  async function createChapter(
    plan: { outlineId: string; bibleId: string; partId: string },
    orderKey: string,
  ) {
    return prisma.chapter.create({
      data: {
        outlineId: plan.outlineId,
        bibleId: plan.bibleId,
        partId: plan.partId,
        orderKey,
      },
    });
  }

  /** The keys of a part's chapters, in the order the database returns them. */
  async function readKeys(partId: string) {
    const rows = await prisma.chapter.findMany({
      where: { partId },
      orderBy: { orderKey: "asc" },
      select: { id: true, orderKey: true },
    });

    return rows;
  }

  function keys(count: number): string[] {
    const result = orderKeysBetween(null, null, count);
    if (!result.ok) throw new Error("expected keys");

    return result.value;
  }

  async function rawQuery(sql: string, values: unknown[] = []) {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    try {
      return await client.query(sql, values);
    } finally {
      await client.end();
    }
  }

  beforeAll(() => {
    ({ prisma, setActor } = createAuditedClient());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("the order key", () => {
    it("stores a key the domain produced, on a part and on a chapter", async () => {
      const plan = await createPlanFixture();
      const [first, second] = keys(2);
      if (first === undefined || second === undefined) throw new Error("expected two keys");

      const chapter = await createChapter(plan, first);
      const part = await prisma.part.create({
        data: { outlineId: plan.outlineId, orderKey: second, title: "part-second" },
      });

      expect(isOrderKey(chapter.orderKey)).toBe(true);
      expect(isOrderKey(part.orderKey)).toBe(true);
    });

    // The invariant that makes the midpoint exist. The domain never produces a
    // key ending in the first digit; this makes one unstorable even through a
    // direct SQL insert, which is the only place the domain cannot reach.
    it("refuses a key ending in the first digit, from Prisma and from raw SQL", async () => {
      const plan = await createPlanFixture();

      await expect(createChapter(plan, "a0")).rejects.toThrow(CHAPTER_ORDER_KEY_CHECK);
      await expect(
        rawQuery(
          // `updatedById` is NOT NULL since CAL-022, and a raw insert is one of
          // the two paths the extension cannot see.
          `INSERT INTO "chapters" ("id", "outlineId", "bibleId", "partId", "orderKey", "updatedAt", "updatedById")
           VALUES ($1, $2, $3, $4, $5, now(),
                   (SELECT p."userId" FROM "projects" p JOIN "bibles" b ON b."projectId" = p."id" WHERE b."id" = $3))`,
          ["raw-trailing-zero", plan.outlineId, plan.bibleId, plan.partId, "a10"],
        ),
      ).rejects.toThrow(CHAPTER_ORDER_KEY_CHECK);
    });

    it("refuses an empty key and one outside the alphabet", async () => {
      const plan = await createPlanFixture();

      for (const orderKey of ["", "A", "a-b", "a b", "aé"]) {
        await expect(createChapter(plan, orderKey)).rejects.toThrow(CHAPTER_ORDER_KEY_CHECK);
      }
    });

    it("holds a part to the same shape", async () => {
      const plan = await createPlanFixture();

      await expect(
        prisma.part.create({
          data: { outlineId: plan.outlineId, orderKey: "b0", title: "part-bad-key" },
        }),
      ).rejects.toThrow(PART_ORDER_KEY_CHECK);
    });

    it("refuses two chapters in the same place of a part", async () => {
      const plan = await createPlanFixture();
      await createChapter(plan, "i");

      await expect(createChapter(plan, "i")).rejects.toMatchObject({
        code: "P2002",
        meta: { target: ["partId", "orderKey"] },
      });
    });

    it("lets two chapters of different parts hold the same key", async () => {
      const plan = await createPlanFixture();
      const second = await prisma.part.create({
        data: { outlineId: plan.outlineId, orderKey: "r", title: "part-second" },
      });

      await createChapter(plan, "i");
      await createChapter({ ...plan, partId: second.id }, "i");

      expect(await prisma.chapter.count({ where: { outlineId: plan.outlineId } })).toBe(2);
    });
  });

  // The claim the domain rests on and cannot verify on its own: the server
  // sorts these keys the way `compareOrderKeys` does. A collation that ordered
  // them differently would render the plan in one order and write it in
  // another, and nothing else in the suite would notice.
  describe("the database sorts the keys the way the domain does", () => {
    it("agrees with a character-by-character comparison over the whole alphabet", async () => {
      const plan = await createPlanFixture();
      const sample = [...ORDER_KEY_ALPHABET].flatMap((digit) =>
        ["", ...ORDER_KEY_ALPHABET.slice(0, 4), "zz"].map((tail) => digit + tail),
      );
      const storable = [...new Set(sample)].filter(isOrderKey);

      await prisma.chapter.createMany({
        data: storable.map((orderKey) => ({
          outlineId: plan.outlineId,
          bibleId: plan.bibleId,
          partId: plan.partId,
          orderKey,
        })),
      });

      const fromDatabase = (await readKeys(plan.partId)).map((row) => row.orderKey);
      const fromDomain = [...fromDatabase].sort(compareOrderKeys);

      expect(fromDatabase).toHaveLength(storable.length);
      expect(fromDatabase).toEqual(fromDomain);
    });
  });

  // The acceptance criterion, against the real server: reordering, merging or
  // splitting writes one row, and never touches another.
  describe("ordering stays stable in the database", () => {
    async function fivePlacedChapters() {
      const plan = await createPlanFixture();
      const placed = [];
      for (const orderKey of keys(5)) {
        placed.push(await createChapter(plan, orderKey));
      }

      return { plan, placed };
    }

    it("inserts between two chapters without rewriting a single other row", async () => {
      const { plan } = await fivePlacedChapters();
      const before = await readKeys(plan.partId);

      const orderKey = orderKeyAt(
        before.map((row) => row.orderKey),
        2,
      );
      if (!orderKey.ok) throw new Error("expected a key");
      const inserted = await createChapter(plan, orderKey.value);

      const after = await readKeys(plan.partId);
      expect(after.filter((row) => row.id !== inserted.id)).toEqual(before);
      expect(after[2]?.id).toBe(inserted.id);
    });

    it("moves a chapter by rewriting that chapter and nothing else", async () => {
      const { plan, placed } = await fivePlacedChapters();
      const before = await readKeys(plan.partId);
      const moved = placed[4];
      if (moved === undefined) throw new Error("expected five chapters");

      const remaining = before.filter((row) => row.id !== moved.id).map((row) => row.orderKey);
      const orderKey = orderKeyAt(remaining, 1);
      if (!orderKey.ok) throw new Error("expected a key");
      await prisma.chapter.update({ where: { id: moved.id }, data: { orderKey: orderKey.value } });

      const after = await readKeys(plan.partId);
      expect(after.filter((row) => row.id !== moved.id)).toEqual(
        before.filter((row) => row.id !== moved.id),
      );
      expect(after[1]?.id).toBe(moved.id);
    });

    it("splits a chapter in two without disturbing its neighbours", async () => {
      const { plan, placed } = await fivePlacedChapters();
      const before = await readKeys(plan.partId);
      const source = placed[1];
      if (source === undefined) throw new Error("expected five chapters");

      const orderKey = orderKeyAt(
        before.map((row) => row.orderKey),
        2,
      );
      if (!orderKey.ok) throw new Error("expected a key");
      const splitOff = await createChapter(plan, orderKey.value);

      const after = await readKeys(plan.partId);
      expect(after.filter((row) => row.id !== splitOff.id)).toEqual(before);
      expect(after[1]?.id).toBe(source.id);
      expect(after[2]?.id).toBe(splitOff.id);
    });

    it("merges two chapters by deleting one, rewriting no key at all", async () => {
      const { plan, placed } = await fivePlacedChapters();
      const before = await readKeys(plan.partId);
      const absorbed = placed[2];
      if (absorbed === undefined) throw new Error("expected five chapters");

      await prisma.chapter.delete({ where: { id: absorbed.id } });

      expect(await readKeys(plan.partId)).toEqual(before.filter((row) => row.id !== absorbed.id));
    });

    it("moves a chapter to another part by rewriting one row", async () => {
      const { plan, placed } = await fivePlacedChapters();
      const second = await prisma.part.create({
        data: { outlineId: plan.outlineId, orderKey: "r", title: "part-second" },
      });
      const before = await readKeys(plan.partId);
      const moved = placed[0];
      if (moved === undefined) throw new Error("expected five chapters");

      await prisma.chapter.update({
        where: { id: moved.id },
        data: { partId: second.id, orderKey: "i" },
      });

      expect(await readKeys(plan.partId)).toEqual(before.filter((row) => row.id !== moved.id));
      expect((await readKeys(second.id)).map((row) => row.id)).toEqual([moved.id]);
    });
  });

  describe("the chapter outline", () => {
    it("stores the planning attributes and reads them back", async () => {
      const plan = await createPlanFixture();
      const chapter = await createChapter(plan, "i");
      const character = await prisma.character.create({
        data: { bibleId: plan.bibleId, name: "fixture character", origin: "GENERATED" },
      });
      const place = await prisma.place.create({
        data: { bibleId: plan.bibleId, name: "fixture place", origin: "GENERATED" },
      });

      const stored = await prisma.chapterOutline.create({
        data: {
          bibleId: plan.bibleId,
          chapterId: chapter.id,
          workingTitle: "fixture title",
          targetWordCount: 2400,
          focalCharacterId: character.id,
          placeId: place.id,
          periodStartDay: 12,
          periodEndDay: 14,
          periodPrecision: "DAY",
          periodLabel: "fixture period label",
          dramaticFunction: "fixture function",
          immediateGoal: "fixture goal",
          obstacle: "fixture obstacle",
          decision: "fixture decision",
          revelation: "fixture revelation",
          consequence: "fixture consequence",
          detailedSummary: "fixture summary",
        },
      });

      expect(stored.targetWordCount).toBe(2400);
      expect(stored.periodPrecision).toBe("DAY");
      expect(stored.focalCharacterId).toBe(character.id);
      expect(stored.lockedAt).toBeNull();
    });

    it("stores a plan with nothing filled in but its chapter", async () => {
      const plan = await createPlanFixture();
      const chapter = await createChapter(plan, "i");

      const stored = await prisma.chapterOutline.create({
        data: { bibleId: plan.bibleId, chapterId: chapter.id },
      });

      expect(stored.dramaticFunction).toBeNull();
      expect(stored.consequence).toBeNull();
    });

    it("holds one plan per chapter", async () => {
      const plan = await createPlanFixture();
      const chapter = await createChapter(plan, "i");
      await prisma.chapterOutline.create({
        data: { bibleId: plan.bibleId, chapterId: chapter.id },
      });

      await expect(
        prisma.chapterOutline.create({ data: { bibleId: plan.bibleId, chapterId: chapter.id } }),
      ).rejects.toMatchObject({ code: "P2002", meta: { target: ["chapterId"] } });
    });

    it("refuses a target length of zero or below", async () => {
      const plan = await createPlanFixture();
      const chapter = await createChapter(plan, "i");

      for (const targetWordCount of [0, -1]) {
        await expect(
          prisma.chapterOutline.create({
            data: { bibleId: plan.bibleId, chapterId: chapter.id, targetWordCount },
          }),
        ).rejects.toThrow(TARGET_WORD_COUNT_CHECK);
      }
    });

    describe("the period", () => {
      async function planFor() {
        const plan = await createPlanFixture();
        const chapter = await createChapter(plan, "i");

        return { bibleId: plan.bibleId, chapterId: chapter.id };
      }

      it("accepts a period placed by words alone, with no day and no precision", async () => {
        const stored = await prisma.chapterOutline.create({
          data: { ...(await planFor()), periodLabel: "fixture period label" },
        });

        expect(stored.periodStartDay).toBeNull();
        expect(stored.periodPrecision).toBeNull();
      });

      it("refuses a day with no precision, and a precision with no day", async () => {
        await expect(
          prisma.chapterOutline.create({ data: { ...(await planFor()), periodStartDay: 3 } }),
        ).rejects.toThrow(PERIOD_PRECISION_CHECK);

        await expect(
          prisma.chapterOutline.create({ data: { ...(await planFor()), periodPrecision: "DAY" } }),
        ).rejects.toThrow(PERIOD_PRECISION_CHECK);
      });

      it("refuses a chapter that ends before it starts, and accepts one lasting a day", async () => {
        await expect(
          prisma.chapterOutline.create({
            data: {
              ...(await planFor()),
              periodStartDay: 10,
              periodEndDay: 9,
              periodPrecision: "DAY",
            },
          }),
        ).rejects.toThrow(PERIOD_ORDER_CHECK);

        const sameDay = await prisma.chapterOutline.create({
          data: {
            ...(await planFor()),
            periodStartDay: 10,
            periodEndDay: 10,
            periodPrecision: "DAY",
          },
        });

        expect(sameDay.periodEndDay).toBe(10);
      });

      it("refuses an update that strips the precision from a dated period", async () => {
        const stored = await prisma.chapterOutline.create({
          data: { ...(await planFor()), periodStartDay: 3, periodPrecision: "MONTH" },
        });

        await expect(
          prisma.chapterOutline.update({
            where: { id: stored.id },
            data: { periodPrecision: null },
          }),
        ).rejects.toThrow(PERIOD_PRECISION_CHECK);
      });
    });
  });

  describe("non-destructive versions", () => {
    async function chapterWithAuthor() {
      const plan = await createPlanFixture();
      const chapter = await createChapter(plan, "i");

      return { chapterId: chapter.id, createdById: plan.userId };
    }

    // CAL-122's acceptance criterion: three regenerations leave four versions.
    it("keeps every version after three regenerations", async () => {
      const { chapterId, createdById } = await chapterWithAuthor();

      for (let revisionNumber = 1; revisionNumber <= 4; revisionNumber += 1) {
        await prisma.chapterRevision.create({
          data: {
            chapterId,
            revisionNumber,
            origin: revisionNumber === 1 ? "GENERATED" : "GENERATED",
            content: `fixture content ${revisionNumber}`,
            wordCount: revisionNumber * 100,
            createdById,
          },
        });
      }

      const stored = await prisma.chapterRevision.findMany({
        where: { chapterId },
        orderBy: { revisionNumber: "asc" },
      });

      expect(stored.map((revision) => revision.revisionNumber)).toEqual([1, 2, 3, 4]);
      // A restoration is a fifth row carrying the first one's text, never an
      // overwrite: the four earlier ones survive it (CAL-149).
      await prisma.chapterRevision.create({
        data: {
          chapterId,
          revisionNumber: 5,
          origin: "EDITED",
          content: "fixture content 1",
          wordCount: 100,
          createdById,
        },
      });

      expect(await prisma.chapterRevision.count({ where: { chapterId } })).toBe(5);
    });

    it("refuses two versions numbered the same", async () => {
      const { chapterId, createdById } = await chapterWithAuthor();
      const revision = {
        chapterId,
        revisionNumber: 1,
        origin: "GENERATED" as const,
        content: "fixture content",
        wordCount: 2,
        createdById,
      };
      await prisma.chapterRevision.create({ data: revision });

      await expect(prisma.chapterRevision.create({ data: revision })).rejects.toMatchObject({
        code: "P2002",
        meta: { target: ["chapterId", "revisionNumber"] },
      });
    });

    it("refuses a version numbered below one, and a negative word count", async () => {
      const { chapterId, createdById } = await chapterWithAuthor();
      const base = {
        chapterId,
        origin: "GENERATED" as const,
        content: "fixture content",
        createdById,
      };

      await expect(
        prisma.chapterRevision.create({ data: { ...base, revisionNumber: 0, wordCount: 1 } }),
      ).rejects.toThrow(REVISION_NUMBER_CHECK);
      await expect(
        prisma.chapterRevision.create({ data: { ...base, revisionNumber: 1, wordCount: -1 } }),
      ).rejects.toThrow(WORD_COUNT_CHECK);
    });

    it("refuses to orphan the author of a version", async () => {
      const { chapterId, createdById } = await chapterWithAuthor();
      await prisma.chapterRevision.create({
        data: {
          chapterId,
          revisionNumber: 1,
          origin: "GENERATED",
          content: "fixture content",
          wordCount: 2,
          createdById,
        },
      });

      await expect(prisma.user.delete({ where: { id: createdById } })).rejects.toThrow(
        /chapter_revisions_createdById_fkey/,
      );
    });
  });

  describe("staying inside one project", () => {
    it("refuses a chapter outline focalised on another bible's character", async () => {
      const plan = await createPlanFixture();
      const other = await createPlanFixture();
      const chapter = await createChapter(plan, "i");
      const foreign = await prisma.character.create({
        data: { bibleId: other.bibleId, name: "foreign character", origin: "GENERATED" },
      });

      await expect(
        prisma.chapterOutline.create({
          data: { bibleId: plan.bibleId, chapterId: chapter.id, focalCharacterId: foreign.id },
        }),
      ).rejects.toThrow(/chapter_outlines_bibleId_focalCharacterId_fkey/);
    });

    it("refuses a chapter outline set in another bible's place", async () => {
      const plan = await createPlanFixture();
      const other = await createPlanFixture();
      const chapter = await createChapter(plan, "i");
      const foreign = await prisma.place.create({
        data: { bibleId: other.bibleId, name: "foreign place", origin: "GENERATED" },
      });

      await expect(
        prisma.chapterOutline.create({
          data: { bibleId: plan.bibleId, chapterId: chapter.id, placeId: foreign.id },
        }),
      ).rejects.toThrow(/chapter_outlines_bibleId_placeId_fkey/);
    });

    it("refuses a chapter of one part placed in another plan's part", async () => {
      const plan = await createPlanFixture();
      const other = await createPlanFixture();

      await expect(
        prisma.chapter.create({
          data: {
            outlineId: plan.outlineId,
            bibleId: plan.bibleId,
            partId: other.partId,
            orderKey: "i",
          },
        }),
      ).rejects.toThrow(/chapters_outlineId_partId_fkey/);
    });

    it("refuses a planned presence naming another bible's character", async () => {
      const plan = await createPlanFixture();
      const other = await createPlanFixture();
      const chapter = await createChapter(plan, "i");
      const chapterOutline = await prisma.chapterOutline.create({
        data: { bibleId: plan.bibleId, chapterId: chapter.id },
      });
      const foreign = await prisma.character.create({
        data: { bibleId: other.bibleId, name: "foreign character", origin: "GENERATED" },
      });

      await expect(
        prisma.chapterOutlineCharacter.create({
          data: {
            bibleId: plan.bibleId,
            chapterOutlineId: chapterOutline.id,
            characterId: foreign.id,
          },
        }),
      ).rejects.toThrow(/chapter_outline_characters_bibleId_characterId_fkey/);
    });

    it("refuses a planned fact belonging to another bible", async () => {
      const plan = await createPlanFixture();
      const other = await createPlanFixture();
      const chapter = await createChapter(plan, "i");
      const chapterOutline = await prisma.chapterOutline.create({
        data: { bibleId: plan.bibleId, chapterId: chapter.id },
      });
      const foreign = await prisma.canonFact.create({
        data: {
          bibleId: other.bibleId,
          statement: "fixture statement",
          isTrue: true,
          source: "USER",
        },
      });

      await expect(
        prisma.chapterOutlineFact.create({
          data: { bibleId: plan.bibleId, chapterOutlineId: chapterOutline.id, factId: foreign.id },
        }),
      ).rejects.toThrow(/chapter_outline_facts_bibleId_factId_fkey/);
    });

    it("holds one presence per character and one link per fact", async () => {
      const plan = await createPlanFixture();
      const chapter = await createChapter(plan, "i");
      const chapterOutline = await prisma.chapterOutline.create({
        data: { bibleId: plan.bibleId, chapterId: chapter.id },
      });
      const character = await prisma.character.create({
        data: { bibleId: plan.bibleId, name: "fixture character", origin: "GENERATED" },
      });
      const presence = {
        bibleId: plan.bibleId,
        chapterOutlineId: chapterOutline.id,
        characterId: character.id,
      };
      await prisma.chapterOutlineCharacter.create({ data: presence });

      await expect(prisma.chapterOutlineCharacter.create({ data: presence })).rejects.toMatchObject(
        { code: "P2002", meta: { target: ["chapterOutlineId", "characterId"] } },
      );
    });
  });

  // Probed, not assumed — the CAL-017 lesson. Two of these answers contradicted
  // what the design first assumed, and the schema was changed rather than the
  // claim: NO ACTION on the focal character made deleting the project fail,
  // because the character and the chapter outline sit in two different cascade
  // subtrees and the check fires before the other branch has run.
  describe("what a deletion does", () => {
    it("refuses to delete a part that still holds chapters", async () => {
      const plan = await createPlanFixture();
      await createChapter(plan, "i");

      await expect(prisma.part.delete({ where: { id: plan.partId } })).rejects.toThrow(
        /chapters_outlineId_partId_fkey/,
      );
    });

    it("deletes an empty part", async () => {
      const plan = await createPlanFixture();

      await prisma.part.delete({ where: { id: plan.partId } });

      expect(await prisma.part.count({ where: { id: plan.partId } })).toBe(0);
    });

    it("takes the parts and the chapters with the plan, NO ACTION notwithstanding", async () => {
      const plan = await createPlanFixture();
      await createChapter(plan, "i");

      await prisma.outline.delete({ where: { id: plan.outlineId } });

      expect(await prisma.part.count({ where: { outlineId: plan.outlineId } })).toBe(0);
      expect(await prisma.chapter.count({ where: { outlineId: plan.outlineId } })).toBe(0);
    });

    it("takes the whole plan with the project", async () => {
      const plan = await createPlanFixture();
      const chapter = await createChapter(plan, "i");
      const character = await prisma.character.create({
        data: { bibleId: plan.bibleId, name: "fixture character", origin: "GENERATED" },
      });
      const chapterOutline = await prisma.chapterOutline.create({
        data: { bibleId: plan.bibleId, chapterId: chapter.id, focalCharacterId: character.id },
      });
      await prisma.chapterOutlineCharacter.create({
        data: {
          bibleId: plan.bibleId,
          chapterOutlineId: chapterOutline.id,
          characterId: character.id,
        },
      });
      await prisma.chapterRevision.create({
        data: {
          chapterId: chapter.id,
          revisionNumber: 1,
          origin: "GENERATED",
          content: "fixture content",
          wordCount: 2,
          createdById: plan.userId,
        },
      });

      await prisma.project.delete({ where: { id: plan.projectId } });

      expect(await prisma.outline.count({ where: { id: plan.outlineId } })).toBe(0);
      expect(await prisma.chapter.count({ where: { id: chapter.id } })).toBe(0);
      expect(await prisma.chapterOutline.count({ where: { id: chapterOutline.id } })).toBe(0);
      expect(await prisma.chapterRevision.count({ where: { chapterId: chapter.id } })).toBe(0);
    });

    // SET NULL on one column, which is why the migration writes this foreign
    // key by hand: a bare SET NULL would null bibleId too and hit its NOT NULL.
    it("un-focalises a chapter when its character goes, keeping the rest of the plan", async () => {
      const plan = await createPlanFixture();
      const chapter = await createChapter(plan, "i");
      const character = await prisma.character.create({
        data: { bibleId: plan.bibleId, name: "fixture character", origin: "GENERATED" },
      });
      await prisma.chapterOutline.create({
        data: {
          bibleId: plan.bibleId,
          chapterId: chapter.id,
          focalCharacterId: character.id,
          dramaticFunction: "fixture function",
        },
      });

      await prisma.character.delete({ where: { id: character.id } });

      const after = await prisma.chapterOutline.findUnique({ where: { chapterId: chapter.id } });
      expect(after?.focalCharacterId).toBeNull();
      expect(after?.bibleId).toBe(plan.bibleId);
      expect(after?.dramaticFunction).toBe("fixture function");
    });

    it("empties the place of a chapter when the place goes", async () => {
      const plan = await createPlanFixture();
      const chapter = await createChapter(plan, "i");
      const place = await prisma.place.create({
        data: { bibleId: plan.bibleId, name: "fixture place", origin: "GENERATED" },
      });
      await prisma.chapterOutline.create({
        data: { bibleId: plan.bibleId, chapterId: chapter.id, placeId: place.id },
      });

      await prisma.place.delete({ where: { id: place.id } });

      const after = await prisma.chapterOutline.findUnique({ where: { chapterId: chapter.id } });
      expect(after?.placeId).toBeNull();
      expect(after?.bibleId).toBe(plan.bibleId);
    });

    it("takes a character's planned presences and a fact's links with them", async () => {
      const plan = await createPlanFixture();
      const chapter = await createChapter(plan, "i");
      const chapterOutline = await prisma.chapterOutline.create({
        data: { bibleId: plan.bibleId, chapterId: chapter.id },
      });
      const character = await prisma.character.create({
        data: { bibleId: plan.bibleId, name: "fixture character", origin: "GENERATED" },
      });
      const fact = await prisma.canonFact.create({
        data: {
          bibleId: plan.bibleId,
          statement: "fixture statement",
          isTrue: true,
          source: "USER",
        },
      });
      await prisma.chapterOutlineCharacter.create({
        data: {
          bibleId: plan.bibleId,
          chapterOutlineId: chapterOutline.id,
          characterId: character.id,
        },
      });
      await prisma.chapterOutlineFact.create({
        data: { bibleId: plan.bibleId, chapterOutlineId: chapterOutline.id, factId: fact.id },
      });

      await prisma.character.delete({ where: { id: character.id } });
      await prisma.canonFact.delete({ where: { id: fact.id } });

      expect(
        await prisma.chapterOutlineCharacter.count({
          where: { chapterOutlineId: chapterOutline.id },
        }),
      ).toBe(0);
      expect(
        await prisma.chapterOutlineFact.count({ where: { chapterOutlineId: chapterOutline.id } }),
      ).toBe(0);
      expect(await prisma.chapterOutline.count({ where: { id: chapterOutline.id } })).toBe(1);
    });

    it("takes a chapter's plan and every one of its versions with it", async () => {
      const plan = await createPlanFixture();
      const chapter = await createChapter(plan, "i");
      await prisma.chapterOutline.create({
        data: { bibleId: plan.bibleId, chapterId: chapter.id },
      });
      await prisma.chapterRevision.create({
        data: {
          chapterId: chapter.id,
          revisionNumber: 1,
          origin: "GENERATED",
          content: "fixture content",
          wordCount: 2,
          createdById: plan.userId,
        },
      });

      await prisma.chapter.delete({ where: { id: chapter.id } });

      expect(await prisma.chapterOutline.count({ where: { chapterId: chapter.id } })).toBe(0);
      expect(await prisma.chapterRevision.count({ where: { chapterId: chapter.id } })).toBe(0);
    });
  });

  describe("the plan itself", () => {
    it("holds one plan per project and one per bible", async () => {
      const plan = await createPlanFixture();

      await expect(
        prisma.outline.create({ data: { projectId: plan.projectId, bibleId: plan.bibleId } }),
      ).rejects.toMatchObject({ code: "P2002", meta: { target: ["projectId"] } });
    });

    it("refuses two parts named the same inside one plan", async () => {
      const plan = await createPlanFixture();
      const part = await prisma.part.findUniqueOrThrow({ where: { id: plan.partId } });

      await expect(
        prisma.part.create({
          data: { outlineId: plan.outlineId, orderKey: "r", title: part.title },
        }),
      ).rejects.toMatchObject({ code: "P2002", meta: { target: ["outlineId", "title"] } });
    });

    it("starts a chapter as planned", async () => {
      const plan = await createPlanFixture();

      expect((await createChapter(plan, "i")).status).toBe("PLANNED");
    });

    it("stores each of the seven statuses", async () => {
      const plan = await createPlanFixture();
      const statuses = [
        "PLANNED",
        "TO_WRITE",
        "GENERATING",
        "FIRST_DRAFT",
        "TO_REVISE",
        "VALIDATED",
        "LOCKED",
      ] as const;

      const placed = keys(statuses.length);
      for (const [index, status] of statuses.entries()) {
        const orderKey = placed[index];
        if (orderKey === undefined) throw new Error("expected a key per status");

        const chapter = await prisma.chapter.create({
          data: {
            outlineId: plan.outlineId,
            bibleId: plan.bibleId,
            partId: plan.partId,
            orderKey,
            status,
          },
        });

        expect(chapter.status).toBe(status);
      }
    });
  });
});
