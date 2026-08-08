import { PrismaClient } from "@prisma/client";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const VALIDITY_CHECK = /canon_facts_validity_check/;
const FROM_PRECISION_CHECK = /canon_facts_valid_from_precision_check/;
const UNTIL_PRECISION_CHECK = /canon_facts_valid_until_precision_check/;
const PERIOD_ORDER_CHECK = /canon_facts_period_order_check/;
const EXACTLY_ONE_CHECK = /canon_fact_subjects_exactly_one_check/;

/**
 * Three fixtures here are not technical strings: the specification's own
 * acceptance examples for CAL-018, quoted from the backlog's entry, because
 * the criterion is that they are representable and the proof is storing them.
 * They are short, synthetic and committed knowingly (CLAUDE.md §8). Every
 * other fixture string is technical, as §9 requires and as the timeline suite
 * already practices.
 */
describe("canon fact schema", () => {
  let prisma: PrismaClient;
  let sequence = 0;

  async function createBibleFixture() {
    sequence += 1;
    const user = await prisma.user.create({
      data: { email: `canon-fact-schema-${sequence}@example.test`, name: "Test User" },
    });
    const project = await prisma.project.create({
      data: { title: `canon-fact-schema-${sequence}`, userId: user.id },
    });
    const bible = await prisma.bible.create({ data: { projectId: project.id } });

    return { userId: user.id, projectId: project.id, bibleId: bible.id };
  }

  async function createCharacter(bibleId: string, name: string) {
    return prisma.character.create({ data: { bibleId, name } });
  }

  async function createPlace(bibleId: string, name: string) {
    return prisma.place.create({ data: { bibleId, name } });
  }

  async function createDatedEvent(bibleId: string, name: string, absoluteDay: number) {
    return prisma.timelineEvent.create({
      data: { bibleId, name, category: "BACKSTORY", absoluteDay, datePrecision: "DAY" },
    });
  }

  /** A permanent fact with technical content, the base of the constraint probes. */
  async function createFactFixture(bibleId: string) {
    return prisma.canonFact.create({
      data: { bibleId, statement: `fixture statement ${sequence}`, isTrue: true, source: "USER" },
    });
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
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("the three examples of the specification", () => {
    // « La maison ne possède pas de cave » — stored as the affirmative
    // statement marked false: the polarity is a column, not a wording, which
    // is what makes the opposite assertion mechanically comparable to it.
    it("represents the permanent negative fact, polarity in a column", async () => {
      const { bibleId } = await createBibleFixture();
      const house = await createPlace(bibleId, "la maison");

      const fact = await prisma.canonFact.create({
        data: {
          bibleId,
          statement: "La maison possède une cave",
          isTrue: false,
          source: "SOURCE_TEXT",
        },
      });
      const subject = await prisma.canonFactSubject.create({
        data: { bibleId, factId: fact.id, placeId: house.id },
      });

      expect(fact.isTrue).toBe(false);
      expect(fact.validity).toBe("PERMANENT");
      expect(fact.status).toBe("PROPOSED");
      expect(subject.placeId).toBe(house.id);

      const confirmed = await prisma.canonFact.update({
        where: { id: fact.id },
        data: { status: "CONFIRMED" },
      });

      expect(confirmed.status).toBe("CONFIRMED");
    });

    // « Nora ignore que son père est encore vivant » — true in the world,
    // absent from her mind: the two dimensions are two different rows.
    it("represents the fact one character is unaware of", async () => {
      const { bibleId } = await createBibleFixture();
      const nora = await createCharacter(bibleId, "Nora");
      const father = await createCharacter(bibleId, "le père de Nora");

      const created = await prisma.canonFact.create({
        data: {
          bibleId,
          statement: "Le père de Nora est encore vivant",
          isTrue: true,
          source: "BIBLE",
        },
      });
      await prisma.canonFactSubject.create({
        data: { bibleId, factId: created.id, characterId: father.id },
      });
      await prisma.canonFactBelief.create({
        data: { bibleId, factId: created.id, characterId: nora.id, state: "UNAWARE" },
      });

      const fact = await prisma.canonFact.findUniqueOrThrow({
        where: { id: created.id },
        include: { beliefs: true, subjects: true },
      });

      expect(fact.isTrue).toBe(true);
      expect(fact.beliefs).toHaveLength(1);
      expect(fact.beliefs[0]?.characterId).toBe(nora.id);
      expect(fact.beliefs[0]?.state).toBe("UNAWARE");
      expect(fact.subjects[0]?.characterId).toBe(father.id);
    });

    // « L'accident s'est produit en novembre 1998 » — a start bound on the
    // day axis, known to the month, the author's wording beside the number.
    it("represents the fact dated to a month of a year", async () => {
      const { bibleId } = await createBibleFixture();

      const fact = await prisma.canonFact.create({
        data: {
          bibleId,
          statement: "L'accident s'est produit en novembre 1998",
          isTrue: true,
          validity: "DURING_PERIOD",
          validFromDay: -240,
          validFromPrecision: "MONTH",
          validFromLabel: "novembre 1998",
          source: "USER",
        },
      });

      expect(fact.validity).toBe("DURING_PERIOD");
      expect(fact.validFromDay).toBe(-240);
      expect(fact.validFromPrecision).toBe("MONTH");
      expect(fact.validFromLabel).toBe("novembre 1998");
      expect(fact.validUntilDay).toBeNull();
    });

    // The same dated fact before day 0 is anchored to any calendar: the bound
    // exists as the author's words alone, exactly as a timeline event may.
    it("stores a bound as words alone, before day 0 is anchored", async () => {
      const { bibleId } = await createBibleFixture();

      const fact = await prisma.canonFact.create({
        data: {
          bibleId,
          statement: `fixture statement ${sequence}`,
          isTrue: true,
          validity: "DURING_PERIOD",
          validFromLabel: "fixture from label",
          source: "USER",
        },
      });

      expect(fact.validFromDay).toBeNull();
      expect(fact.validFromLabel).toBe("fixture from label");
    });

    it("holds a fact false after a given event, ended by its own bible's event", async () => {
      const { bibleId } = await createBibleFixture();
      const event = await createDatedEvent(bibleId, "turning point", 120);

      const fact = await prisma.canonFact.create({
        data: {
          bibleId,
          statement: `fixture statement ${sequence}`,
          isTrue: true,
          validity: "UNTIL_EVENT",
          invalidatedByEventId: event.id,
          source: "CHAPTER",
        },
      });

      expect(fact.validity).toBe("UNTIL_EVENT");
      expect(fact.invalidatedByEventId).toBe(event.id);
    });

    it("locks a fact like every other bible element", async () => {
      const { bibleId } = await createBibleFixture();
      const fact = await createFactFixture(bibleId);

      const locked = await prisma.canonFact.update({
        where: { id: fact.id },
        data: { lockedAt: new Date() },
      });

      expect(locked.lockedAt).toBeInstanceOf(Date);
    });
  });

  describe("the constraints Prisma cannot express", () => {
    describe("canon_facts_validity_check", () => {
      it("refuses a permanent fact carrying a bound", async () => {
        const { bibleId } = await createBibleFixture();

        await expect(
          prisma.canonFact.create({
            data: {
              bibleId,
              statement: "fixture statement",
              isTrue: true,
              validFromDay: 0,
              validFromPrecision: "DAY",
              source: "USER",
            },
          }),
        ).rejects.toThrow(VALIDITY_CHECK);
      });

      it("refuses a period with no bound at all", async () => {
        const { bibleId } = await createBibleFixture();

        await expect(
          prisma.canonFact.create({
            data: {
              bibleId,
              statement: "fixture statement",
              isTrue: true,
              validity: "DURING_PERIOD",
              source: "USER",
            },
          }),
        ).rejects.toThrow(VALIDITY_CHECK);
      });

      // The trap add_narrative_bible fell into: a CHECK rejects a row only
      // when it evaluates to FALSE, so bound columns a client leaves unwritten
      // must be rejected exactly like ones written as NULL.
      it("refuses a raw insert of a period that writes no bound column", async () => {
        const { bibleId } = await createBibleFixture();

        await expect(
          rawQuery(
            `INSERT INTO "canon_facts" ("id", "bibleId", "statement", "isTrue", "validity", "source", "updatedAt")
             VALUES ($1, $2, 'fixture statement', true, 'DURING_PERIOD', 'USER', now())`,
            [`raw-${sequence}`, bibleId],
          ),
        ).rejects.toThrow(VALIDITY_CHECK);
      });

      it("refuses a period ended by an event", async () => {
        const { bibleId } = await createBibleFixture();
        const event = await createDatedEvent(bibleId, "event", 0);

        await expect(
          prisma.canonFact.create({
            data: {
              bibleId,
              statement: "fixture statement",
              isTrue: true,
              validity: "DURING_PERIOD",
              validFromDay: 0,
              validFromPrecision: "DAY",
              invalidatedByEventId: event.id,
              source: "USER",
            },
          }),
        ).rejects.toThrow(VALIDITY_CHECK);
      });

      it("refuses an event-ended fact with no event", async () => {
        const { bibleId } = await createBibleFixture();

        await expect(
          prisma.canonFact.create({
            data: {
              bibleId,
              statement: "fixture statement",
              isTrue: true,
              validity: "UNTIL_EVENT",
              source: "USER",
            },
          }),
        ).rejects.toThrow(VALIDITY_CHECK);
      });

      it("refuses an event-ended fact carrying a bound of its own", async () => {
        const { bibleId } = await createBibleFixture();
        const event = await createDatedEvent(bibleId, "event", 0);

        await expect(
          prisma.canonFact.create({
            data: {
              bibleId,
              statement: "fixture statement",
              isTrue: true,
              validity: "UNTIL_EVENT",
              invalidatedByEventId: event.id,
              validUntilDay: 50,
              validUntilPrecision: "DAY",
              source: "USER",
            },
          }),
        ).rejects.toThrow(VALIDITY_CHECK);
      });

      // The update path, where add_narrative_bible's own check was first found
      // wanting: a period may lose its last bound after the fact.
      it("refuses the update that strips the last bound of a period", async () => {
        const { bibleId } = await createBibleFixture();
        const fact = await prisma.canonFact.create({
          data: {
            bibleId,
            statement: "fixture statement",
            isTrue: true,
            validity: "DURING_PERIOD",
            validFromDay: 0,
            validFromPrecision: "DAY",
            source: "USER",
          },
        });

        await expect(
          prisma.canonFact.update({
            where: { id: fact.id },
            data: { validFromDay: null, validFromPrecision: null },
          }),
        ).rejects.toThrow(VALIDITY_CHECK);
      });
    });

    describe("the precision pairing, on both bounds", () => {
      it("refuses a start day whose precision is unknown", async () => {
        const { bibleId } = await createBibleFixture();

        await expect(
          prisma.canonFact.create({
            data: {
              bibleId,
              statement: "fixture statement",
              isTrue: true,
              validity: "DURING_PERIOD",
              validFromDay: 0,
              source: "USER",
            },
          }),
        ).rejects.toThrow(FROM_PRECISION_CHECK);
      });

      it("refuses a precision that bounds nothing", async () => {
        const { bibleId } = await createBibleFixture();

        await expect(
          prisma.canonFact.create({
            data: {
              bibleId,
              statement: "fixture statement",
              isTrue: true,
              validity: "DURING_PERIOD",
              validFromLabel: "fixture from label",
              validUntilPrecision: "YEAR",
              source: "USER",
            },
          }),
        ).rejects.toThrow(UNTIL_PRECISION_CHECK);
      });
    });

    describe("canon_facts_period_order_check", () => {
      it("refuses a period that ends before it starts", async () => {
        const { bibleId } = await createBibleFixture();

        await expect(
          prisma.canonFact.create({
            data: {
              bibleId,
              statement: "fixture statement",
              isTrue: true,
              validity: "DURING_PERIOD",
              validFromDay: 20,
              validFromPrecision: "DAY",
              validUntilDay: 10,
              validUntilPrecision: "DAY",
              source: "USER",
            },
          }),
        ).rejects.toThrow(PERIOD_ORDER_CHECK);
      });

      it("accepts equal bounds — a fact true a single day", async () => {
        const { bibleId } = await createBibleFixture();

        const fact = await prisma.canonFact.create({
          data: {
            bibleId,
            statement: `fixture statement ${sequence}`,
            isTrue: true,
            validity: "DURING_PERIOD",
            validFromDay: 15,
            validFromPrecision: "DAY",
            validUntilDay: 15,
            validUntilPrecision: "DAY",
            source: "USER",
          },
        });

        expect(fact.validFromDay).toBe(15);
        expect(fact.validUntilDay).toBe(15);
      });
    });

    describe("canon_fact_subjects_exactly_one_check", () => {
      it("refuses a subject naming neither a character nor a place", async () => {
        const { bibleId } = await createBibleFixture();
        const fact = await createFactFixture(bibleId);

        await expect(
          prisma.canonFactSubject.create({ data: { bibleId, factId: fact.id } }),
        ).rejects.toThrow(EXACTLY_ONE_CHECK);
      });

      it("refuses a subject naming both at once", async () => {
        const { bibleId } = await createBibleFixture();
        const fact = await createFactFixture(bibleId);
        const character = await createCharacter(bibleId, "fixture character");
        const place = await createPlace(bibleId, "fixture place");

        await expect(
          prisma.canonFactSubject.create({
            data: { bibleId, factId: fact.id, characterId: character.id, placeId: place.id },
          }),
        ).rejects.toThrow(EXACTLY_ONE_CHECK);
      });
    });

    describe("the two partial unique subject indexes", () => {
      it("holds one subject row per character per fact, and per place per fact", async () => {
        const { bibleId } = await createBibleFixture();
        const fact = await createFactFixture(bibleId);
        const character = await createCharacter(bibleId, "fixture character");
        const place = await createPlace(bibleId, "fixture place");
        await prisma.canonFactSubject.create({
          data: { bibleId, factId: fact.id, characterId: character.id },
        });
        await prisma.canonFactSubject.create({
          data: { bibleId, factId: fact.id, placeId: place.id },
        });

        // Prisma reports a partial unique index by its columns, not its name.
        await expect(
          prisma.canonFactSubject.create({
            data: { bibleId, factId: fact.id, characterId: character.id },
          }),
        ).rejects.toThrow(/Unique constraint|P2002/);
        await expect(
          prisma.canonFactSubject.create({
            data: { bibleId, factId: fact.id, placeId: place.id },
          }),
        ).rejects.toThrow(/Unique constraint|P2002/);
      });

      it("still allows one fact to concern several characters", async () => {
        const { bibleId } = await createBibleFixture();
        const fact = await createFactFixture(bibleId);
        const first = await createCharacter(bibleId, "fixture character 1");
        const second = await createCharacter(bibleId, "fixture character 2");

        await prisma.canonFactSubject.create({
          data: { bibleId, factId: fact.id, characterId: first.id },
        });
        await prisma.canonFactSubject.create({
          data: { bibleId, factId: fact.id, characterId: second.id },
        });

        expect(await prisma.canonFactSubject.count({ where: { factId: fact.id } })).toBe(2);
      });
    });

    it("holds one stance per character per fact", async () => {
      const { bibleId } = await createBibleFixture();
      const fact = await createFactFixture(bibleId);
      const character = await createCharacter(bibleId, "fixture character");
      await prisma.canonFactBelief.create({
        data: { bibleId, factId: fact.id, characterId: character.id, state: "UNAWARE" },
      });

      await expect(
        prisma.canonFactBelief.create({
          data: { bibleId, factId: fact.id, characterId: character.id, state: "BELIEVES_TRUE" },
        }),
      ).rejects.toThrow(/Unique constraint|P2002/);
    });
  });

  describe("a canon stays inside one bible", () => {
    it("refuses a belief tying a fact and a character of two bibles", async () => {
      const first = await createBibleFixture();
      const second = await createBibleFixture();
      const fact = await createFactFixture(first.bibleId);
      const foreignCharacter = await createCharacter(second.bibleId, "fixture character");

      await expect(
        prisma.canonFactBelief.create({
          data: {
            bibleId: first.bibleId,
            factId: fact.id,
            characterId: foreignCharacter.id,
            state: "UNAWARE",
          },
        }),
      ).rejects.toThrow(/Foreign key constraint|P2003/);
    });

    it("refuses a subject naming a place of another bible", async () => {
      const first = await createBibleFixture();
      const second = await createBibleFixture();
      const fact = await createFactFixture(first.bibleId);
      const foreignPlace = await createPlace(second.bibleId, "fixture place");

      await expect(
        prisma.canonFactSubject.create({
          data: { bibleId: first.bibleId, factId: fact.id, placeId: foreignPlace.id },
        }),
      ).rejects.toThrow(/Foreign key constraint|P2003/);
    });

    it("refuses an invalidating event belonging to another bible", async () => {
      const first = await createBibleFixture();
      const second = await createBibleFixture();
      const foreignEvent = await createDatedEvent(second.bibleId, "foreign event", 0);

      await expect(
        prisma.canonFact.create({
          data: {
            bibleId: first.bibleId,
            statement: "fixture statement",
            isTrue: true,
            validity: "UNTIL_EVENT",
            invalidatedByEventId: foreignEvent.id,
            source: "USER",
          },
        }),
      ).rejects.toThrow(/Foreign key constraint|P2003/);
    });
  });

  describe("reading and deleting a canon", () => {
    // The read CLAUDE.md §5.8 exists for: the confirmed facts concerning one
    // character, chosen by typed markers, without reading a single statement.
    it("reads the confirmed facts concerning a character, in one query", async () => {
      const { bibleId } = await createBibleFixture();
      const character = await createCharacter(bibleId, "fixture character");
      const other = await createCharacter(bibleId, "fixture character 2");

      const concerning = await prisma.canonFact.create({
        data: {
          bibleId,
          statement: "fixture statement confirmed",
          isTrue: true,
          status: "CONFIRMED",
          source: "USER",
        },
      });
      await prisma.canonFactSubject.create({
        data: { bibleId, factId: concerning.id, characterId: character.id },
      });
      // Still proposed: not canon, so not returned.
      const proposed = await prisma.canonFact.create({
        data: { bibleId, statement: "fixture statement proposed", isTrue: true, source: "USER" },
      });
      await prisma.canonFactSubject.create({
        data: { bibleId, factId: proposed.id, characterId: character.id },
      });
      // Canon, but concerns someone else.
      const elsewhere = await prisma.canonFact.create({
        data: {
          bibleId,
          statement: "fixture statement other",
          isTrue: true,
          status: "CONFIRMED",
          source: "USER",
        },
      });
      await prisma.canonFactSubject.create({
        data: { bibleId, factId: elsewhere.id, characterId: other.id },
      });

      const canon = await prisma.canonFact.findMany({
        where: {
          bibleId,
          status: "CONFIRMED",
          subjects: { some: { characterId: character.id } },
        },
        include: { beliefs: true },
      });

      expect(canon.map((fact) => fact.id)).toEqual([concerning.id]);
    });

    // What NoAction buys and what it costs, both probed rather than assumed —
    // the CAL-017 lesson. Deleting the event a fact depends on is refused;
    // deleting the whole project still cascades, because the facts go in the
    // same statement, before the check runs.
    it("refuses to delete the event that ends a fact", async () => {
      const { bibleId } = await createBibleFixture();
      const event = await createDatedEvent(bibleId, "event", 0);
      await prisma.canonFact.create({
        data: {
          bibleId,
          statement: `fixture statement ${sequence}`,
          isTrue: true,
          validity: "UNTIL_EVENT",
          invalidatedByEventId: event.id,
          source: "USER",
        },
      });

      await expect(prisma.timelineEvent.delete({ where: { id: event.id } })).rejects.toThrow(
        /Foreign key constraint|P2003/,
      );
    });

    it("still deletes a whole project, facts, beliefs and subjects included", async () => {
      const { projectId, bibleId } = await createBibleFixture();
      const event = await createDatedEvent(bibleId, "event", 0);
      const character = await createCharacter(bibleId, "fixture character");
      const place = await createPlace(bibleId, "fixture place");
      const fact = await prisma.canonFact.create({
        data: {
          bibleId,
          statement: `fixture statement ${sequence}`,
          isTrue: true,
          validity: "UNTIL_EVENT",
          invalidatedByEventId: event.id,
          source: "USER",
        },
      });
      await prisma.canonFactBelief.create({
        data: { bibleId, factId: fact.id, characterId: character.id, state: "BELIEVES_FALSE" },
      });
      await prisma.canonFactSubject.create({
        data: { bibleId, factId: fact.id, characterId: character.id },
      });
      await prisma.canonFactSubject.create({
        data: { bibleId, factId: fact.id, placeId: place.id },
      });

      await prisma.project.delete({ where: { id: projectId } });

      expect(await prisma.canonFact.count({ where: { bibleId } })).toBe(0);
      expect(await prisma.canonFactBelief.count({ where: { bibleId } })).toBe(0);
      expect(await prisma.canonFactSubject.count({ where: { bibleId } })).toBe(0);
    });

    it("takes a character's beliefs and subject rows with them, and leaves the fact", async () => {
      const { bibleId } = await createBibleFixture();
      const character = await createCharacter(bibleId, "fixture character");
      const fact = await createFactFixture(bibleId);
      await prisma.canonFactBelief.create({
        data: { bibleId, factId: fact.id, characterId: character.id, state: "UNAWARE" },
      });
      await prisma.canonFactSubject.create({
        data: { bibleId, factId: fact.id, characterId: character.id },
      });

      await prisma.character.delete({ where: { id: character.id } });

      expect(await prisma.canonFactBelief.count({ where: { factId: fact.id } })).toBe(0);
      expect(await prisma.canonFactSubject.count({ where: { factId: fact.id } })).toBe(0);
      expect(await prisma.canonFact.count({ where: { id: fact.id } })).toBe(1);
    });
  });
});
