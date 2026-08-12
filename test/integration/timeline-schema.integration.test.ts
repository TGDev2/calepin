import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type AuditedClient, createAuditedClient } from "./audited-client";

const PLACEMENT_CHECK = /timeline_events_placement_check/;
const ABSOLUTE_DATE_CHECK = /timeline_events_absolute_date_check/;
const RELATIVE_DATE_CHECK = /timeline_events_relative_date_check/;
const DURATION_SIGN_CHECK = /timeline_events_duration_sign_check/;
const DISTINCT_PRECEDING_CHECK = /timeline_events_distinct_preceding_check/;
const DECLARED_AGE_CHECK = /timeline_event_participants_declared_age_check/;

/**
 * Every fixture string here is technical. CLAUDE.md §9 forbids literary content
 * in any committed artefact, and a chronology suite needs none: what is under
 * test is where an event may be placed, never what happens in it.
 */
describe("timeline schema", () => {
  let prisma: AuditedClient;
  let setActor: (id: string) => void;
  let sequence = 0;

  async function createBibleFixture() {
    sequence += 1;
    const user = await prisma.user.create({
      data: { email: `timeline-schema-${sequence}@example.test`, name: "Test User" },
    });
    setActor(user.id);
    const project = await prisma.project.create({
      data: { title: `timeline-schema-${sequence}`, userId: user.id },
    });
    const bible = await prisma.bible.create({ data: { projectId: project.id } });

    return { userId: user.id, projectId: project.id, bibleId: bible.id };
  }

  /** A dated event, the shape most of the assertions below build on. */
  async function createDatedEvent(bibleId: string, name: string, absoluteDay: number) {
    return prisma.timelineEvent.create({
      data: {
        bibleId,
        name,
        category: "NARRATED",
        absoluteDay,
        datePrecision: "DAY",
        origin: "GENERATED",
      },
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
    ({ prisma, setActor } = createAuditedClient());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("the two placements", () => {
    it("stores an absolute date with the precision it is known to", async () => {
      const { bibleId } = await createBibleFixture();

      const created = await prisma.timelineEvent.create({
        data: {
          bibleId,
          name: "dated",
          summary: "fixture summary",
          category: "BACKSTORY",
          absoluteDay: -7000,
          datePrecision: "YEAR",
          dateLabel: "fixture date label",
          origin: "GENERATED",
        },
      });

      expect(created.absoluteDay).toBe(-7000);
      expect(created.datePrecision).toBe("YEAR");
      expect(created.dateLabel).toBe("fixture date label");
      expect(created.precedingEventId).toBeNull();
    });

    it("stores a duration since another event", async () => {
      const { bibleId } = await createBibleFixture();
      const root = await createDatedEvent(bibleId, "root", 0);

      const created = await prisma.timelineEvent.create({
        data: {
          bibleId,
          name: "later",
          category: "NARRATED",
          precedingEventId: root.id,
          daysAfterPreceding: 180,
          durationPrecision: "MONTH",
          origin: "GENERATED",
        },
      });

      expect(created.precedingEventId).toBe(root.id);
      expect(created.daysAfterPreceding).toBe(180);
      expect(created.absoluteDay).toBeNull();
    });

    // The backlog's own case: an event with no date at all, placed only by
    // coming after another one.
    it("stores an anchor with no duration — order without a date", async () => {
      const { bibleId } = await createBibleFixture();
      const root = await createDatedEvent(bibleId, "root", 0);

      const created = await prisma.timelineEvent.create({
        data: {
          bibleId,
          name: "after",
          category: "PLANNED",
          precedingEventId: root.id,
          origin: "GENERATED",
        },
      });

      expect(created.daysAfterPreceding).toBeNull();
      expect(created.durationPrecision).toBeNull();
      expect(created.absoluteDay).toBeNull();
    });

    // Both at once is the point, not an oversight: the two disagreeing is the
    // inconsistent duration CAL-093 has to detect, and a schema that refused
    // the pair would delete the evidence before the detector could read it.
    it("stores a date and a chain on the same event, disagreement included", async () => {
      const { bibleId } = await createBibleFixture();
      const root = await createDatedEvent(bibleId, "root", 0);

      const created = await prisma.timelineEvent.create({
        data: {
          bibleId,
          name: "contradictory",
          category: "NARRATED",
          absoluteDay: 20,
          datePrecision: "DAY",
          precedingEventId: root.id,
          daysAfterPreceding: 500,
          durationPrecision: "DAY",
          origin: "GENERATED",
        },
      });

      expect(created.absoluteDay).toBe(20);
      expect(created.daysAfterPreceding).toBe(500);
    });

    it("locks an event like every other bible element", async () => {
      const { bibleId } = await createBibleFixture();
      const created = await createDatedEvent(bibleId, "lockable", 0);

      const locked = await prisma.timelineEvent.update({
        where: { id: created.id },
        data: { lockedAt: new Date() },
      });

      expect(locked.lockedAt).toBeInstanceOf(Date);
    });
  });

  describe("the constraints Prisma cannot express", () => {
    describe("timeline_events_placement_check", () => {
      it("refuses an event placed by neither a date nor an anchor", async () => {
        const { bibleId } = await createBibleFixture();

        await expect(
          prisma.timelineEvent.create({
            data: { bibleId, name: "unplaced", category: "NARRATED", origin: "GENERATED" },
          }),
        ).rejects.toThrow(PLACEMENT_CHECK);
      });

      // The update path, which is where add_narrative_bible's own check was
      // found to be wrong: an event may be un-placed after the fact.
      it("refuses an update that removes the last placement", async () => {
        const { bibleId } = await createBibleFixture();
        const created = await createDatedEvent(bibleId, "dated", 10);

        await expect(
          prisma.timelineEvent.update({
            where: { id: created.id },
            data: { absoluteDay: null, datePrecision: null },
          }),
        ).rejects.toThrow(PLACEMENT_CHECK);
      });

      it("accepts an update that swaps one placement for the other", async () => {
        const { bibleId } = await createBibleFixture();
        const root = await createDatedEvent(bibleId, "root", 0);
        const created = await createDatedEvent(bibleId, "dated", 10);

        const updated = await prisma.timelineEvent.update({
          where: { id: created.id },
          data: { absoluteDay: null, datePrecision: null, precedingEventId: root.id },
        });

        expect(updated.absoluteDay).toBeNull();
        expect(updated.precedingEventId).toBe(root.id);
      });
    });

    describe("timeline_events_absolute_date_check", () => {
      it("refuses a date whose precision is unknown", async () => {
        const { bibleId } = await createBibleFixture();

        await expect(
          prisma.timelineEvent.create({
            data: {
              bibleId,
              name: "imprecise",
              category: "NARRATED",
              absoluteDay: 5,
              origin: "GENERATED",
            },
          }),
        ).rejects.toThrow(ABSOLUTE_DATE_CHECK);
      });

      it("refuses a precision that dates nothing", async () => {
        const { bibleId } = await createBibleFixture();
        const root = await createDatedEvent(bibleId, "root", 0);

        await expect(
          prisma.timelineEvent.create({
            data: {
              bibleId,
              name: "precision-only",
              category: "NARRATED",
              precedingEventId: root.id,
              datePrecision: "YEAR",
              origin: "GENERATED",
            },
          }),
        ).rejects.toThrow(ABSOLUTE_DATE_CHECK);
      });

      // The trap add_narrative_bible fell into: a CHECK rejects a row only when
      // it evaluates to FALSE, so a column left unwritten by the client must be
      // rejected exactly like one written as NULL.
      it("refuses a raw insert that writes the day and leaves the precision out", async () => {
        const { bibleId } = await createBibleFixture();

        await expect(
          rawQuery(
            // `updatedById` is NOT NULL since CAL-022, and a raw insert is one
            // of the two paths the extension cannot see.
            `INSERT INTO "timeline_events" ("id", "bibleId", "name", "category", "absoluteDay", "updatedAt", "updatedById")
             VALUES ($1, $2, $3, 'NARRATED', 5, now(),
                     (SELECT p."userId" FROM "projects" p JOIN "bibles" b ON b."projectId" = p."id" WHERE b."id" = $2))`,
            [`raw-${sequence}`, bibleId, "raw-imprecise"],
          ),
        ).rejects.toThrow(ABSOLUTE_DATE_CHECK);
      });
    });

    describe("timeline_events_relative_date_check", () => {
      it("refuses a duration measured from nothing", async () => {
        const { bibleId } = await createBibleFixture();

        await expect(
          prisma.timelineEvent.create({
            data: {
              bibleId,
              name: "anchorless",
              category: "NARRATED",
              absoluteDay: 0,
              datePrecision: "DAY",
              daysAfterPreceding: 10,
              durationPrecision: "DAY",
              origin: "GENERATED",
            },
          }),
        ).rejects.toThrow(RELATIVE_DATE_CHECK);
      });

      it("refuses a duration whose precision is unknown", async () => {
        const { bibleId } = await createBibleFixture();
        const root = await createDatedEvent(bibleId, "root", 0);

        await expect(
          prisma.timelineEvent.create({
            data: {
              bibleId,
              name: "imprecise-duration",
              category: "NARRATED",
              precedingEventId: root.id,
              daysAfterPreceding: 10,
              origin: "GENERATED",
            },
          }),
        ).rejects.toThrow(RELATIVE_DATE_CHECK);
      });

      // Detaching an anchor must take the duration with it, or the row keeps a
      // number measured from an event it no longer names.
      it("refuses an update that drops the anchor and keeps the duration", async () => {
        const { bibleId } = await createBibleFixture();
        const root = await createDatedEvent(bibleId, "root", 0);
        const created = await prisma.timelineEvent.create({
          data: {
            bibleId,
            name: "chained",
            category: "NARRATED",
            absoluteDay: 0,
            datePrecision: "DAY",
            precedingEventId: root.id,
            daysAfterPreceding: 10,
            durationPrecision: "DAY",
            origin: "GENERATED",
          },
        });

        await expect(
          prisma.timelineEvent.update({
            where: { id: created.id },
            data: { precedingEventId: null },
          }),
        ).rejects.toThrow(RELATIVE_DATE_CHECK);
      });
    });

    describe("timeline_events_duration_sign_check", () => {
      it("refuses a duration that runs backwards", async () => {
        const { bibleId } = await createBibleFixture();
        const root = await createDatedEvent(bibleId, "root", 0);

        await expect(
          prisma.timelineEvent.create({
            data: {
              bibleId,
              name: "backwards",
              category: "NARRATED",
              precedingEventId: root.id,
              daysAfterPreceding: -1,
              durationPrecision: "DAY",
              origin: "GENERATED",
            },
          }),
        ).rejects.toThrow(DURATION_SIGN_CHECK);
      });

      // Two events may be simultaneous, so zero is a duration like any other.
      it("accepts a duration of zero", async () => {
        const { bibleId } = await createBibleFixture();
        const root = await createDatedEvent(bibleId, "root", 0);

        const created = await prisma.timelineEvent.create({
          data: {
            bibleId,
            name: "simultaneous",
            category: "NARRATED",
            precedingEventId: root.id,
            daysAfterPreceding: 0,
            durationPrecision: "DAY",
            origin: "GENERATED",
          },
        });

        expect(created.daysAfterPreceding).toBe(0);
      });
    });

    describe("timeline_events_distinct_preceding_check", () => {
      // The composite foreign key is satisfied by a row pointing at its own
      // (bibleId, id), so without the check the shortest cycle would be
      // storable.
      it("refuses an event anchored to itself", async () => {
        const { bibleId } = await createBibleFixture();
        const created = await createDatedEvent(bibleId, "self", 0);

        await expect(
          prisma.timelineEvent.update({
            where: { id: created.id },
            data: { precedingEventId: created.id },
          }),
        ).rejects.toThrow(DISTINCT_PRECEDING_CHECK);
      });
    });

    describe("timeline_event_participants_declared_age_check", () => {
      it("refuses a negative declared age", async () => {
        const { bibleId } = await createBibleFixture();
        const event = await createDatedEvent(bibleId, "event", 0);
        const character = await prisma.character.create({
          data: { bibleId, name: "fixture character", origin: "GENERATED" },
        });

        await expect(
          prisma.timelineEventParticipant.create({
            data: { bibleId, eventId: event.id, characterId: character.id, declaredAge: -1 },
          }),
        ).rejects.toThrow(DECLARED_AGE_CHECK);
      });

      it("accepts an unknown age, a newborn and a very old character", async () => {
        const { bibleId } = await createBibleFixture();
        const event = await createDatedEvent(bibleId, "event", 0);

        for (const [index, declaredAge] of [null, 0, 800].entries()) {
          const character = await prisma.character.create({
            data: { bibleId, name: `fixture character ${index}`, origin: "GENERATED" },
          });
          const participant = await prisma.timelineEventParticipant.create({
            data: { bibleId, eventId: event.id, characterId: character.id, declaredAge },
          });

          expect(participant.declaredAge).toBe(declaredAge);
        }
      });
    });
  });

  describe("a chronology stays inside one bible", () => {
    it("refuses an anchor belonging to another bible", async () => {
      const first = await createBibleFixture();
      const second = await createBibleFixture();
      const foreignRoot = await createDatedEvent(second.bibleId, "foreign-root", 0);

      await expect(
        prisma.timelineEvent.create({
          data: {
            bibleId: first.bibleId,
            name: "cross-bible",
            category: "NARRATED",
            precedingEventId: foreignRoot.id,
            origin: "GENERATED",
          },
        }),
      ).rejects.toThrow(/Foreign key constraint|P2003/);
    });

    it("refuses a participation tying an event and a character of two bibles", async () => {
      const first = await createBibleFixture();
      const second = await createBibleFixture();
      const event = await createDatedEvent(first.bibleId, "event", 0);
      const foreignCharacter = await prisma.character.create({
        data: { bibleId: second.bibleId, name: "fixture character", origin: "GENERATED" },
      });

      await expect(
        prisma.timelineEventParticipant.create({
          data: {
            bibleId: first.bibleId,
            eventId: event.id,
            characterId: foreignCharacter.id,
          },
        }),
      ).rejects.toThrow(/Foreign key constraint|P2003/);
    });

    it("frees the same event name across two bibles and holds it inside one", async () => {
      const first = await createBibleFixture();
      const second = await createBibleFixture();

      await createDatedEvent(first.bibleId, "shared name", 0);
      await createDatedEvent(second.bibleId, "shared name", 0);

      await expect(createDatedEvent(first.bibleId, "shared name", 5)).rejects.toThrow(
        /Unique constraint|P2002/,
      );
    });

    it("holds one presence per character per event", async () => {
      const { bibleId } = await createBibleFixture();
      const event = await createDatedEvent(bibleId, "event", 0);
      const character = await prisma.character.create({
        data: { bibleId, name: "fixture character", origin: "GENERATED" },
      });

      await prisma.timelineEventParticipant.create({
        data: { bibleId, eventId: event.id, characterId: character.id },
      });

      await expect(
        prisma.timelineEventParticipant.create({
          data: { bibleId, eventId: event.id, characterId: character.id, declaredAge: 12 },
        }),
      ).rejects.toThrow(/Unique constraint|P2002/);
    });
  });

  describe("reading and deleting a chronology", () => {
    // CAL-017's acceptance criterion, in the part a query can answer: the dated
    // events of a bible come back in order, in one read.
    it("reads the chronology of a bible in order, in one query", async () => {
      const { bibleId } = await createBibleFixture();
      await createDatedEvent(bibleId, "third", 400);
      await createDatedEvent(bibleId, "first", -7000);
      await createDatedEvent(bibleId, "second", 0);

      const chronology = await prisma.timelineEvent.findMany({
        where: { bibleId },
        orderBy: { absoluteDay: "asc" },
        include: { participants: true },
      });

      expect(chronology.map((event) => event.name)).toEqual(["first", "second", "third"]);
      expect(chronology.map((event) => event.absoluteDay)).toEqual([-7000, 0, 400]);
    });

    it("reads the characters present at an event, and their sheet with them", async () => {
      const { bibleId } = await createBibleFixture();
      const event = await createDatedEvent(bibleId, "event", 730);
      const character = await prisma.character.create({
        data: { bibleId, name: "fixture character", age: 30, origin: "GENERATED" },
      });
      await prisma.timelineEventParticipant.create({
        data: { bibleId, eventId: event.id, characterId: character.id, declaredAge: 32 },
      });

      const read = await prisma.timelineEvent.findUniqueOrThrow({
        where: { id: event.id },
        include: { participants: { include: { character: true } } },
      });

      // The age at the event is computed from these two values by
      // @calepin/bible's ageRangeAt; the row stores what the text asserts, and
      // the sheet stores the age at day 0. Nothing here stores their difference.
      expect(read.participants[0]?.character.age).toBe(30);
      expect(read.participants[0]?.declaredAge).toBe(32);
      expect(read.absoluteDay).toBe(730);
    });

    // Deleting an anchor would silently un-place everything hanging off it, so
    // the database refuses. This is what NoAction buys, and the next assertion
    // is what it costs nothing.
    it("refuses to delete an event another one is anchored to", async () => {
      const { bibleId } = await createBibleFixture();
      const root = await createDatedEvent(bibleId, "root", 0);
      await prisma.timelineEvent.create({
        data: {
          bibleId,
          name: "anchored",
          category: "NARRATED",
          precedingEventId: root.id,
          origin: "GENERATED",
        },
      });

      await expect(prisma.timelineEvent.delete({ where: { id: root.id } })).rejects.toThrow(
        /Foreign key constraint|P2003/,
      );
    });

    // The reason the chain is NoAction and not Restrict: PostgreSQL checks
    // RESTRICT row by row, so a bible holding a chain would become undeletable.
    it("still deletes a whole project, chain and participants included", async () => {
      const { projectId, bibleId } = await createBibleFixture();
      const root = await createDatedEvent(bibleId, "root", 0);
      const middle = await prisma.timelineEvent.create({
        data: {
          bibleId,
          name: "middle",
          category: "NARRATED",
          precedingEventId: root.id,
          origin: "GENERATED",
        },
      });
      await prisma.timelineEvent.create({
        data: {
          bibleId,
          name: "leaf",
          category: "PLANNED",
          precedingEventId: middle.id,
          origin: "GENERATED",
        },
      });
      const character = await prisma.character.create({
        data: { bibleId, name: "fixture character", origin: "GENERATED" },
      });
      await prisma.timelineEventParticipant.create({
        data: { bibleId, eventId: root.id, characterId: character.id },
      });

      await prisma.project.delete({ where: { id: projectId } });

      expect(await prisma.timelineEvent.count({ where: { bibleId } })).toBe(0);
      expect(await prisma.timelineEventParticipant.count({ where: { bibleId } })).toBe(0);
    });

    it("takes a character's participations with them when the sheet is deleted", async () => {
      const { bibleId } = await createBibleFixture();
      const event = await createDatedEvent(bibleId, "event", 0);
      const character = await prisma.character.create({
        data: { bibleId, name: "fixture character", origin: "GENERATED" },
      });
      await prisma.timelineEventParticipant.create({
        data: { bibleId, eventId: event.id, characterId: character.id },
      });

      await prisma.character.delete({ where: { id: character.id } });

      expect(await prisma.timelineEventParticipant.count({ where: { eventId: event.id } })).toBe(0);
      expect(await prisma.timelineEvent.count({ where: { id: event.id } })).toBe(1);
    });
  });
});
