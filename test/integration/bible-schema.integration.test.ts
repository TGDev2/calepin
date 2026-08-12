import type { Prisma } from "@prisma/client";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type AuditedClient, createAuditedClient } from "./audited-client";

const AGE_CHECK = /characters_age_check/;
const DISTINCT_CHARACTERS_CHECK = /relationships_distinct_characters_check/;
const SUPERNATURAL_BOUNDS_CHECK = /world_rules_supernatural_bounds_check/;
const VALIDATION_CHECK = /bibles_validation_check/;

/**
 * Every fixture string here is technical. CLAUDE.md §9 forbids literary content
 * in any committed artefact, and a schema suite needs none: what is under test
 * is the shape of the bible, never the prose it will one day hold.
 */
const COMPLETE_SHEET = {
  name: "fixture character",
  origin: "GENERATED",
  age: 40,
  role: "fixture role",
  importance: "MAIN",
  appearance: "fixture appearance",
  initialSituation: "fixture initial situation",
  apparentDesire: "fixture apparent desire",
  deepNeed: "fixture deep need",
  fear: "fixture fear",
  contradiction: "fixture contradiction",
  secret: "fixture secret",
  past: "fixture past",
  plannedArc: "fixture planned arc",
  speechStyle: "fixture speech style",
  heldKnowledge: ["fixture knowledge a", "fixture knowledge b"],
  elementsToPreserve: ["fixture element to preserve"],
  // `satisfies`, not `as const`. `as const` froze the two list columns into
  // readonly tuples, which Prisma's create input refuses; this keeps the
  // literal types the enum column needs without making the arrays readonly.
} satisfies Omit<Prisma.CharacterUncheckedCreateInput, "bibleId">;

describe("bible schema", () => {
  let prisma: AuditedClient;
  let setActor: (id: string) => void;
  let sequence = 0;

  async function createBibleFixture() {
    sequence += 1;
    const user = await prisma.user.create({
      data: { email: `bible-schema-${sequence}@example.test`, name: "Test User" },
    });
    setActor(user.id);
    const project = await prisma.project.create({
      data: { title: `bible-schema-${sequence}`, userId: user.id },
    });
    const bible = await prisma.bible.create({ data: { projectId: project.id } });

    return { userId: user.id, projectId: project.id, bibleId: bible.id };
  }

  async function createCharacterFixture(bibleId: string, name: string) {
    return prisma.character.create({ data: { bibleId, name, origin: "GENERATED" } });
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

  // CAL-016's first acceptance criterion, stated in its own terms: a complete
  // character sheet is persistable.
  describe("the character sheet", () => {
    it("round-trips every field of a complete sheet", async () => {
      const { bibleId } = await createBibleFixture();

      const created = await prisma.character.create({
        data: { bibleId, ...COMPLETE_SHEET },
      });
      const stored = await prisma.character.findUniqueOrThrow({ where: { id: created.id } });

      expect(stored).toMatchObject(COMPLETE_SHEET);
      expect(stored.lockedAt).toBeNull();
      expect(stored.lockedFields).toEqual([]);
    });

    // The sheet is filled progressively — CAL-097 saves as the author types —
    // so an incomplete sheet has to be storable. What a *generated* sheet must
    // contain is CAL-090's output schema, not a column constraint.
    it("stores a sheet that holds nothing but a name", async () => {
      const { bibleId } = await createBibleFixture();

      const stored = await createCharacterFixture(bibleId, "fixture minimal");

      expect(stored.name).toBe("fixture minimal");
      expect(stored.deepNeed).toBeNull();
      expect(stored.importance).toBe("SECONDARY");
      expect(stored.heldKnowledge).toEqual([]);
    });

    it("refuses a negative age, and accepts none, zero and a very large one", async () => {
      const { bibleId } = await createBibleFixture();

      await expect(
        prisma.character.create({
          data: { bibleId, name: "fixture negative", age: -1, origin: "GENERATED" },
        }),
      ).rejects.toThrow(AGE_CHECK);

      const stored = await prisma.character.createManyAndReturn({
        data: [
          { bibleId, name: "fixture unknown age", age: null, origin: "GENERATED" },
          { bibleId, name: "fixture newborn", age: 0, origin: "GENERATED" },
          { bibleId, name: "fixture ancient", age: 800, origin: "GENERATED" },
        ],
      });

      expect(stored.map((character) => character.age)).toEqual([null, 0, 800]);
    });

    // A model may name a character; business code resolves the primary key
    // (CLAUDE.md §6). The resolution is only unambiguous because of this.
    it("keeps a name unique inside its bible and free across bibles", async () => {
      const first = await createBibleFixture();
      const second = await createBibleFixture();

      await createCharacterFixture(first.bibleId, "fixture shared name");

      await expect(
        createCharacterFixture(first.bibleId, "fixture shared name"),
      ).rejects.toMatchObject({ code: "P2002" });
      await expect(
        createCharacterFixture(second.bibleId, "fixture shared name"),
      ).resolves.toMatchObject({ name: "fixture shared name" });
    });
  });

  describe("locking", () => {
    it("locks a whole element with a timestamp", async () => {
      const { bibleId } = await createBibleFixture();
      const character = await createCharacterFixture(bibleId, "fixture locked");

      const locked = await prisma.character.update({
        where: { id: character.id },
        data: { lockedAt: new Date() },
      });
      expect(locked.lockedAt).toBeInstanceOf(Date);

      const unlocked = await prisma.character.update({
        where: { id: character.id },
        data: { lockedAt: null },
      });
      expect(unlocked.lockedAt).toBeNull();
    });

    // CAL-097's per-field lock. The lock travels with the row, so reading it
    // costs nothing on a read the composer was making anyway.
    it("locks single sheet fields without locking the sheet", async () => {
      const { bibleId } = await createBibleFixture();
      const character = await prisma.character.create({
        data: { bibleId, ...COMPLETE_SHEET, name: "fixture field lock" },
      });

      const locked = await prisma.character.update({
        where: { id: character.id },
        data: { lockedFields: ["SECRET", "DEEP_NEED"] },
      });

      expect(locked.lockedFields).toEqual(["SECRET", "DEEP_NEED"]);
      expect(locked.lockedAt).toBeNull();
      // The field stays writable in the database: the lock is a declaration the
      // guard reads before a generation (CAL-095), not a column permission.
      // What matters here is that the declaration survives a write.
      const edited = await prisma.character.update({
        where: { id: character.id },
        data: { fear: "fixture edited fear" },
      });
      expect(edited.lockedFields).toEqual(["SECRET", "DEEP_NEED"]);
    });

    it("finds the characters whose given field is locked, in one query", async () => {
      const { bibleId } = await createBibleFixture();
      await prisma.character.create({
        data: {
          bibleId,
          name: "fixture secret locked",
          lockedFields: ["SECRET"],
          origin: "GENERATED",
        },
      });
      await prisma.character.create({
        data: {
          bibleId,
          name: "fixture past locked",
          lockedFields: ["PAST"],
          origin: "GENERATED",
        },
      });

      const found = await prisma.character.findMany({
        where: { bibleId, lockedFields: { has: "SECRET" } },
      });

      expect(found.map((character) => character.name)).toEqual(["fixture secret locked"]);
    });

    // The enum is what makes a lock on a field no column answers to impossible.
    // Prisma's types already refuse it; this proves the database does too.
    it("refuses a locked field name the sheet has no column for", async () => {
      const { bibleId } = await createBibleFixture();

      await expect(
        rawQuery(
          // `updatedById` is NOT NULL since CAL-022 and no client extension
          // sees a raw insert, so the statement supplies it — otherwise this
          // test would fail on the audit column instead of on the enum it names.
          `INSERT INTO "characters" ("id", "bibleId", "name", "lockedFields", "updatedAt", "updatedById")
           VALUES ($1, $2, 'fixture invalid lock', ARRAY['NOT_A_SHEET_FIELD']::"character_field"[], now(),
                   (SELECT p."userId" FROM "projects" p JOIN "bibles" b ON b."projectId" = p."id" WHERE b."id" = $2))`,
          ["bible-schema-invalid-lock", bibleId],
        ),
      ).rejects.toThrow(/invalid input value for enum character_field/);
    });

    it("locks every kind of bible element, not only characters", async () => {
      const { bibleId } = await createBibleFixture();
      const lockedAt = new Date();

      const identity = await prisma.bibleIdentity.create({
        data: {
          bibleId,
          workingTitle: "fixture title",
          genre: "fixture genre",
          subGenre: "fixture sub-genre",
          tone: "fixture tone",
          narrativePromise: "fixture promise",
          themes: ["fixture theme"],
          counterThemes: ["fixture counter-theme"],
          centralQuestion: "fixture question",
          endingNature: "fixture ending",
          origin: "GENERATED",
          lockedAt,
        },
      });
      const style = await prisma.bibleStyle.create({
        data: {
          bibleId,
          pointOfView: "fixture point of view",
          focalization: "fixture focalization",
          tense: "fixture tense",
          languageRegister: "fixture register",
          descriptiveDensity: "fixture density",
          pacing: "fixture pacing",
          dialogueBalance: "fixture dialogue balance",
          recurringMotifs: ["fixture motif"],
          elementsToAvoid: ["fixture element to avoid"],
          origin: "GENERATED",
          lockedAt,
        },
      });
      const place = await prisma.place.create({
        data: { bibleId, name: "fixture place", origin: "GENERATED", lockedAt },
      });
      const rule = await prisma.worldRule.create({
        data: {
          bibleId,
          name: "fixture rule",
          statement: "fixture statement",
          origin: "GENERATED",
          lockedAt,
        },
      });
      const from = await createCharacterFixture(bibleId, "fixture relation source");
      const to = await createCharacterFixture(bibleId, "fixture relation target");
      const relationship = await prisma.relationship.create({
        data: {
          bibleId,
          fromCharacterId: from.id,
          toCharacterId: to.id,
          type: "FAMILY",
          label: "fixture tie",
          origin: "GENERATED",
          lockedAt,
        },
      });

      for (const element of [identity, style, place, rule, relationship]) {
        expect(element.lockedAt).toEqual(lockedAt);
      }
    });
  });

  describe("relationships", () => {
    async function createPairFixture() {
      const { bibleId, projectId } = await createBibleFixture();
      const from = await createCharacterFixture(bibleId, "fixture source");
      const to = await createCharacterFixture(bibleId, "fixture target");

      return { bibleId, projectId, from, to };
    }

    // CAL-016's second acceptance criterion, and CAL-091's asymmetry: both
    // directions exist as their own rows and may say different things.
    it("holds both directions of a tie, each with its own type and wording", async () => {
      const { bibleId, from, to } = await createPairFixture();

      await prisma.relationship.create({
        data: {
          bibleId,
          fromCharacterId: from.id,
          toCharacterId: to.id,
          type: "FAMILY",
          label: "fixture forward tie",
          description: "fixture forward asymmetry",
          origin: "GENERATED",
        },
      });
      await prisma.relationship.create({
        data: {
          bibleId,
          fromCharacterId: to.id,
          toCharacterId: from.id,
          type: "HOSTILITY",
          label: "fixture reverse tie",
          description: "fixture reverse asymmetry",
          origin: "GENERATED",
        },
      });

      const stored = await prisma.relationship.findMany({
        where: { bibleId },
        orderBy: { label: "asc" },
      });

      expect(stored.map((edge) => [edge.type, edge.description])).toEqual([
        ["FAMILY", "fixture forward asymmetry"],
        ["HOSTILITY", "fixture reverse asymmetry"],
      ]);
    });

    // The reverse row is never written for you. CAL-099 has to be able to
    // *detect* a missing symmetric relation, which a schema that mirrors
    // automatically could never produce.
    it("leaves a one-sided tie one-sided", async () => {
      const { bibleId, from, to } = await createPairFixture();

      await prisma.relationship.create({
        data: {
          bibleId,
          fromCharacterId: from.id,
          toCharacterId: to.id,
          type: "MENTORSHIP",
          label: "fixture one-sided tie",
          origin: "GENERATED",
        },
      });

      expect(await prisma.relationship.count({ where: { bibleId } })).toBe(1);
      expect(
        await prisma.relationship.count({
          where: { fromCharacterId: to.id, toCharacterId: from.id },
        }),
      ).toBe(0);
    });

    it("reads the relations pointing at a character in one query", async () => {
      const { bibleId, from, to } = await createPairFixture();
      await prisma.relationship.create({
        data: {
          bibleId,
          fromCharacterId: from.id,
          toCharacterId: to.id,
          type: "RIVALRY",
          label: "fixture incoming tie",
          origin: "GENERATED",
        },
      });

      const incoming = await prisma.relationship.findMany({ where: { toCharacterId: to.id } });
      const both = await prisma.character.findUniqueOrThrow({
        where: { id: to.id },
        include: { outgoingRelationships: true, incomingRelationships: true },
      });

      expect(incoming).toHaveLength(1);
      expect(both.outgoingRelationships).toHaveLength(0);
      expect(both.incomingRelationships).toHaveLength(1);
    });

    it("allows two ties of different types between the same pair, and refuses a duplicate", async () => {
      const { bibleId, from, to } = await createPairFixture();
      await prisma.relationship.create({
        data: {
          bibleId,
          fromCharacterId: from.id,
          toCharacterId: to.id,
          type: "FAMILY",
          label: "fixture family tie",
          origin: "GENERATED",
        },
      });

      await expect(
        prisma.relationship.create({
          data: {
            bibleId,
            fromCharacterId: from.id,
            toCharacterId: to.id,
            type: "RIVALRY",
            label: "fixture rivalry tie",
            origin: "GENERATED",
          },
        }),
      ).resolves.toMatchObject({ type: "RIVALRY" });

      await expect(
        prisma.relationship.create({
          data: {
            bibleId,
            fromCharacterId: from.id,
            toCharacterId: to.id,
            type: "FAMILY",
            label: "fixture duplicate tie",
            origin: "GENERATED",
          },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    });

    it("refuses a character tied to themselves, naming the constraint", async () => {
      const { bibleId, from } = await createPairFixture();

      await expect(
        prisma.relationship.create({
          data: {
            bibleId,
            fromCharacterId: from.id,
            toCharacterId: from.id,
            type: "OTHER",
            label: "fixture self tie",
            origin: "GENERATED",
          },
        }),
      ).rejects.toThrow(DISTINCT_CHARACTERS_CHECK);
    });

    // Both foreign keys reference Character(bibleId, id), so the bible of an
    // edge cannot disagree with the bible of its characters, and an edge cannot
    // span two bibles.
    describe("staying inside one bible", () => {
      it("refuses an edge between characters of two different bibles", async () => {
        const first = await createPairFixture();
        const second = await createBibleFixture();
        const outsider = await createCharacterFixture(second.bibleId, "fixture outsider");

        await expect(
          prisma.relationship.create({
            data: {
              bibleId: first.bibleId,
              fromCharacterId: first.from.id,
              toCharacterId: outsider.id,
              type: "OTHER",
              label: "fixture cross-bible tie",
              origin: "GENERATED",
            },
          }),
        ).rejects.toMatchObject({ code: "P2003" });
      });

      it("refuses an edge whose bible contradicts its characters", async () => {
        const { from, to } = await createPairFixture();
        const other = await createBibleFixture();

        await expect(
          prisma.relationship.create({
            data: {
              bibleId: other.bibleId,
              fromCharacterId: from.id,
              toCharacterId: to.id,
              type: "OTHER",
              label: "fixture lying tie",
              origin: "GENERATED",
            },
          }),
        ).rejects.toMatchObject({ code: "P2003" });
      });
    });

    it("takes a character's ties with them, in both directions", async () => {
      const { bibleId, from, to } = await createPairFixture();
      await prisma.relationship.createMany({
        data: [
          {
            bibleId,
            fromCharacterId: from.id,
            toCharacterId: to.id,
            type: "FAMILY",
            label: "fixture outgoing tie",
            origin: "GENERATED",
          },
          {
            bibleId,
            fromCharacterId: to.id,
            toCharacterId: from.id,
            type: "FAMILY",
            label: "fixture incoming tie",
            origin: "GENERATED",
          },
        ],
      });

      await prisma.character.delete({ where: { id: from.id } });

      expect(await prisma.relationship.count({ where: { bibleId } })).toBe(0);
      expect(await prisma.character.count({ where: { bibleId } })).toBe(1);
    });
  });

  describe("world rules", () => {
    it("refuses a supernatural rule with no limits, naming the constraint", async () => {
      const { bibleId } = await createBibleFixture();

      await expect(
        prisma.worldRule.create({
          data: {
            bibleId,
            name: "fixture unlimited power",
            statement: "fixture statement",
            isSupernatural: true,
            limits: [],
            origin: "GENERATED",
          },
        }),
      ).rejects.toThrow(SUPERNATURAL_BOUNDS_CHECK);
    });

    // The case the first version of this suite missed, and the one that found
    // the hole: not an explicitly empty list, but a column never written at
    // all. A CHECK is only violated when it evaluates to FALSE, so an unwritten
    // limits column made `cardinality(NULL) > 0` evaluate to NULL and the row
    // was accepted — while the Prisma client showed it back as `[]`.
    it("refuses a supernatural rule whose limits were never written, raw insert included", async () => {
      const { bibleId } = await createBibleFixture();

      await expect(
        prisma.worldRule.create({
          data: {
            bibleId,
            name: "fixture unmentioned limits",
            statement: "fixture statement",
            isSupernatural: true,
            origin: "GENERATED",
          },
        }),
      ).rejects.toThrow(SUPERNATURAL_BOUNDS_CHECK);

      await expect(
        rawQuery(
          `INSERT INTO "world_rules" ("id", "bibleId", "name", "statement", "isSupernatural", "updatedAt", "updatedById")
           VALUES ($1, $2, 'fixture raw unmentioned limits', 'fixture statement', true, now(),
                   (SELECT p."userId" FROM "projects" p JOIN "bibles" b ON b."projectId" = p."id" WHERE b."id" = $2))`,
          ["bible-schema-raw-rule", bibleId],
        ),
      ).rejects.toThrow(SUPERNATURAL_BOUNDS_CHECK);
    });

    // The array columns are NOT NULL, which is what the Prisma client's own
    // type already claims: it reads a NULL list back as `[]`, so a NULL in the
    // database would be corruption nothing could see.
    it("refuses a NULL list even through raw SQL", async () => {
      const { bibleId } = await createBibleFixture();

      await expect(
        rawQuery(
          `INSERT INTO "world_rules" ("id", "bibleId", "name", "statement", "limits", "updatedAt", "updatedById")
           VALUES ($1, $2, 'fixture null limits', 'fixture statement', NULL, now(),
                   (SELECT p."userId" FROM "projects" p JOIN "bibles" b ON b."projectId" = p."id" WHERE b."id" = $2))`,
          ["bible-schema-null-limits", bibleId],
        ),
      ).rejects.toThrow(/null value in column "limits"/);
    });

    it("accepts a supernatural rule that carries its limits", async () => {
      const { bibleId } = await createBibleFixture();

      const rule = await prisma.worldRule.create({
        data: {
          bibleId,
          name: "fixture bounded power",
          statement: "fixture statement",
          isSupernatural: true,
          limits: ["fixture limit"],
          costs: ["fixture cost"],
          failureConditions: ["fixture failure condition"],
          origin: "GENERATED",
        },
      });

      expect(rule.limits).toEqual(["fixture limit"]);
      expect(rule.costs).toEqual(["fixture cost"]);
      expect(rule.failureConditions).toEqual(["fixture failure condition"]);
    });

    it("accepts an ordinary rule with no limits", async () => {
      const { bibleId } = await createBibleFixture();

      await expect(
        prisma.worldRule.create({
          data: {
            bibleId,
            name: "fixture ordinary rule",
            statement: "fixture statement",
            origin: "GENERATED",
          },
        }),
      ).resolves.toMatchObject({ isSupernatural: false, limits: [] });
    });

    // The constraint has to hold on the way out of a valid state too: emptying
    // any of the three bounds, or turning an ordinary rule supernatural, is the
    // same violation as inserting one.
    it("refuses an update that strips the limits or promotes a rule", async () => {
      const { bibleId } = await createBibleFixture();
      const bounded = await prisma.worldRule.create({
        data: {
          bibleId,
          name: "fixture rule to strip",
          statement: "fixture statement",
          isSupernatural: true,
          limits: ["fixture limit"],
          costs: ["fixture cost"],
          failureConditions: ["fixture failure condition"],
          origin: "GENERATED",
        },
      });
      const ordinary = await prisma.worldRule.create({
        data: {
          bibleId,
          name: "fixture rule to promote",
          statement: "fixture statement",
          origin: "GENERATED",
        },
      });

      await expect(
        prisma.worldRule.update({ where: { id: bounded.id }, data: { limits: [] } }),
      ).rejects.toThrow(SUPERNATURAL_BOUNDS_CHECK);
      await expect(
        prisma.worldRule.update({ where: { id: ordinary.id }, data: { isSupernatural: true } }),
      ).rejects.toThrow(SUPERNATURAL_BOUNDS_CHECK);
    });

    // CAL-092 widened the constraint from limits alone to all three. The three
    // are not interchangeable: a power with a ceiling but no cost is free to
    // use, and one that never fails is one no scene can be lost to — both are
    // the shape a resolution by convenience takes, which is what the bound
    // exists to keep detectable.
    it.each(["costs", "failureConditions"] as const)(
      "refuses a supernatural rule whose %s are empty, limits notwithstanding",
      async (bound) => {
        const { bibleId } = await createBibleFixture();

        await expect(
          prisma.worldRule.create({
            data: {
              bibleId,
              name: `fixture unbounded ${bound}`,
              statement: "fixture statement",
              isSupernatural: true,
              limits: ["fixture limit"],
              costs: bound === "costs" ? [] : ["fixture cost"],
              failureConditions: bound === "failureConditions" ? [] : ["fixture failure condition"],
              origin: "GENERATED",
            },
          }),
        ).rejects.toThrow(SUPERNATURAL_BOUNDS_CHECK);
      },
    );

    // The path no Zod schema and no client extension can see. The mission's
    // contract cannot represent an unbounded capability at all; this is the
    // layer beneath it, and it is the one a fixture, a seed or an import takes.
    it("refuses a half-bounded rule through raw SQL too", async () => {
      const { bibleId } = await createBibleFixture();

      await expect(
        rawQuery(
          `INSERT INTO "world_rules" ("id", "bibleId", "name", "statement", "isSupernatural",
                                      "limits", "updatedAt", "updatedById")
           VALUES ($1, $2, 'fixture raw half-bounded', 'fixture statement', true,
                   ARRAY['fixture limit'], now(),
                   (SELECT p."userId" FROM "projects" p JOIN "bibles" b ON b."projectId" = p."id" WHERE b."id" = $2))`,
          ["bible-schema-raw-half-bounded", bibleId],
        ),
      ).rejects.toThrow(SUPERNATURAL_BOUNDS_CHECK);
    });
  });

  describe("validation", () => {
    it("accepts a validation only with its author, on insert and on update", async () => {
      const { bibleId, userId } = await createBibleFixture();

      await expect(
        rawQuery(`UPDATE "bibles" SET "validatedAt" = now() WHERE "id" = $1`, [bibleId]),
      ).rejects.toThrow(VALIDATION_CHECK);
      await expect(
        rawQuery(`UPDATE "bibles" SET "validatedById" = $2 WHERE "id" = $1`, [bibleId, userId]),
      ).rejects.toThrow(VALIDATION_CHECK);

      const validated = await prisma.bible.update({
        where: { id: bibleId },
        data: { validatedAt: new Date(), validatedById: userId },
      });
      expect(validated.validatedAt).toBeInstanceOf(Date);

      await expect(
        prisma.bible.update({ where: { id: bibleId }, data: { validatedById: null } }),
      ).rejects.toThrow(VALIDATION_CHECK);
    });
  });

  // CLAUDE.md §5.8: context is composed, never dumped. The schema's part of
  // that is one row per element and typed markers to filter rows on, so the
  // composer reads what a generation needs without reading the rest.
  describe("selective reading", () => {
    it("reads the style section without touching a single character", async () => {
      const { bibleId } = await createBibleFixture();
      await prisma.bibleStyle.create({
        data: {
          bibleId,
          pointOfView: "fixture point of view",
          focalization: "fixture focalization",
          tense: "fixture tense",
          languageRegister: "fixture register",
          descriptiveDensity: "fixture density",
          pacing: "fixture pacing",
          dialogueBalance: "fixture dialogue balance",
          origin: "GENERATED",
        },
      });
      await prisma.character.createMany({
        data: [
          { bibleId, name: "fixture unread a", origin: "GENERATED" },
          { bibleId, name: "fixture unread b", origin: "GENERATED" },
        ],
      });

      const style = await prisma.bibleStyle.findUniqueOrThrow({ where: { bibleId } });

      expect(style.pacing).toBe("fixture pacing");
      expect(style).not.toHaveProperty("characters");
    });

    it("selects the main characters without reading the other sheets", async () => {
      const { bibleId } = await createBibleFixture();
      await prisma.character.createMany({
        data: [
          {
            bibleId,
            name: "fixture main",
            importance: "MAIN",
            secret: "fixture secret",
            origin: "GENERATED",
          },
          { bibleId, name: "fixture secondary", importance: "SECONDARY", origin: "GENERATED" },
          { bibleId, name: "fixture minor", importance: "MINOR", origin: "GENERATED" },
        ],
      });

      const main = await prisma.character.findMany({
        where: { bibleId, importance: "MAIN" },
        select: { id: true, name: true, deepNeed: true, contradiction: true },
      });

      expect(main).toHaveLength(1);
      expect(main[0]).not.toHaveProperty("secret");
    });

    it("reads the whole lock inventory of a bible without a join", async () => {
      const { bibleId } = await createBibleFixture();
      const lockedAt = new Date();
      await prisma.character.createMany({
        data: [
          { bibleId, name: "fixture locked sheet", lockedAt, origin: "GENERATED" },
          { bibleId, name: "fixture locked field", lockedFields: ["SECRET"], origin: "GENERATED" },
          { bibleId, name: "fixture open sheet", origin: "GENERATED" },
        ],
      });

      const locked = await prisma.character.findMany({
        where: {
          bibleId,
          OR: [{ lockedAt: { not: null } }, { NOT: { lockedFields: { isEmpty: true } } }],
        },
        select: { name: true, lockedAt: true, lockedFields: true },
      });

      expect(locked.map((character) => character.name).sort()).toEqual([
        "fixture locked field",
        "fixture locked sheet",
      ]);
    });
  });

  describe("deleting a project", () => {
    it("takes the whole bible with it", async () => {
      const { projectId, bibleId } = await createBibleFixture();
      const from = await createCharacterFixture(bibleId, "fixture doomed source");
      const to = await createCharacterFixture(bibleId, "fixture doomed target");
      await prisma.relationship.create({
        data: {
          bibleId,
          fromCharacterId: from.id,
          toCharacterId: to.id,
          type: "FRIENDSHIP",
          label: "fixture doomed tie",
          origin: "GENERATED",
        },
      });
      await prisma.place.create({
        data: { bibleId, name: "fixture doomed place", origin: "GENERATED" },
      });
      await prisma.worldRule.create({
        data: {
          bibleId,
          name: "fixture doomed rule",
          statement: "fixture statement",
          origin: "GENERATED",
        },
      });
      await prisma.bibleStyle.create({
        data: {
          bibleId,
          pointOfView: "fixture point of view",
          focalization: "fixture focalization",
          tense: "fixture tense",
          languageRegister: "fixture register",
          descriptiveDensity: "fixture density",
          pacing: "fixture pacing",
          dialogueBalance: "fixture dialogue balance",
          origin: "GENERATED",
        },
      });

      await prisma.project.delete({ where: { id: projectId } });

      expect(await prisma.bible.count({ where: { id: bibleId } })).toBe(0);
      expect(await prisma.bibleStyle.count({ where: { bibleId } })).toBe(0);
      expect(await prisma.character.count({ where: { bibleId } })).toBe(0);
      expect(await prisma.relationship.count({ where: { bibleId } })).toBe(0);
      expect(await prisma.place.count({ where: { bibleId } })).toBe(0);
      expect(await prisma.worldRule.count({ where: { bibleId } })).toBe(0);
    });
  });
});
