/**
 * CAL-098's writes: adding, rewriting, retiring and deleting one canonical
 * fact by hand — against a real PostgreSQL.
 *
 * `character-editing.integration.test.ts`'s shape. Isolated from
 * `owner-access.integration.test.ts` for the reason its own doc comment gives:
 * the three temporal shapes, a timeline event to end a fact, an extracted fact
 * beside a hand-written one and a chapter plan citing one all need seeding this
 * file's fixture is arranged to hold.
 *
 * **The point of running these against a real database rather than a mock** is
 * the four hand-written CHECK constraints on `canon_facts`. `@calepin/bible`'s
 * `canonFactContentSchema` mirrors them so an author reads a French sentence
 * instead of a constraint name; the mirror is only worth having if what it
 * accepts is what PostgreSQL accepts, which is what the three writes below
 * prove one shape at a time.
 *
 * Cross-owner isolation of `CanonFact`, `CanonFactBelief` and
 * `CanonFactSubject` themselves is proved table by table in
 * `owner-access.integration.test.ts`; repeated here only for the four writers,
 * whose refusals have their own remedies.
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import {
  type CanonFactContentInput,
  createProjectWithSourceText,
  deleteCanonFact,
  editCanonFact,
  getBibleOverview,
  lockBibleElement,
  openProjectScope,
  type ProjectScope,
  setCanonFactStatus,
  unlockBibleElement,
  writeCanonFact,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

/** Synthetic French written for this file (§8). */
const STATEMENT = "Le père de Nora est vivant.";

interface Fixture {
  readonly scope: ProjectScope;
  readonly bibleId: string;
  readonly noraId: string;
  readonly claireId: string;
  readonly houseId: string;
  readonly eventId: string;
}

function permanentFact(overrides: Partial<CanonFactContentInput> = {}): CanonFactContentInput {
  return {
    statement: STATEMENT,
    isTrue: true,
    validity: "PERMANENT",
    validFrom: null,
    validUntil: null,
    invalidatedByEventId: null,
    beliefs: [],
    subjects: [],
    ...overrides,
  };
}

describe("editing canonical facts by hand (CAL-098)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();

  let ownerId: string;
  let intruderId: string;

  beforeAll(async () => {
    configureDatabaseClient(seam);

    const owner = await prisma.user.create({ data: { email: "canon-fact-edit@example.test" } });
    ownerId = owner.id;

    const intruder = await prisma.user.create({
      data: { email: "canon-fact-intruder@example.test" },
    });
    intruderId = intruder.id;

    setActor(ownerId);
  });

  afterAll(async () => {
    resetDatabaseClient();
    await prisma.$disconnect();
    await seam.$disconnect();
  });

  async function seedProject(label: string): Promise<Fixture> {
    setActor(ownerId);

    const project = await runWithActor(ownerId, async () =>
      createProjectWithSourceText({ ownerId, title: label, sourceText: { content: "fixture" } }),
    );

    const opened = await openProjectScope({ ownerId, projectId: project.id });
    if (!opened.ok) throw new Error("the fixture could not open a scope on its own project");

    const bible = await prisma.bible.create({ data: { projectId: project.id } });

    const nora = await prisma.character.create({
      data: { bibleId: bible.id, name: "Nora Fauvel", origin: "USER_WRITTEN" },
      select: { id: true },
    });
    const claire = await prisma.character.create({
      data: { bibleId: bible.id, name: "Claire Fauvel", origin: "USER_WRITTEN" },
      select: { id: true },
    });
    const house = await prisma.place.create({
      data: { bibleId: bible.id, name: "La maison du quai", origin: "USER_WRITTEN" },
      select: { id: true },
    });
    const event = await prisma.timelineEvent.create({
      data: {
        bibleId: bible.id,
        name: "Le retour du père",
        category: "PLANNED",
        absoluteDay: 240,
        datePrecision: "DAY",
        origin: "USER_WRITTEN",
      },
      select: { id: true },
    });

    return {
      scope: opened.value,
      bibleId: bible.id,
      noraId: nora.id,
      claireId: claire.id,
      houseId: house.id,
      eventId: event.id,
    };
  }

  function write(
    fixture: Fixture,
    content: CanonFactContentInput,
  ): ReturnType<typeof writeCanonFact> {
    return runWithActor(ownerId, async () =>
      writeCanonFact(fixture.scope, { bibleId: fixture.bibleId, ...content }),
    );
  }

  describe("writeCanonFact", () => {
    it("stores the specification's own example across its three dimensions", async () => {
      const fixture = await seedProject("nora-example");

      const written = await write(
        fixture,
        permanentFact({
          beliefs: [{ characterId: fixture.noraId, state: "UNAWARE" }],
          subjects: [{ kind: "character", id: fixture.claireId }],
        }),
      );

      expect(written.ok).toBe(true);
      if (!written.ok) return;

      const stored = await prisma.canonFact.findUniqueOrThrow({
        where: { id: written.value.id },
        select: {
          statement: true,
          isTrue: true,
          validity: true,
          source: true,
          status: true,
          lockedAt: true,
          updatedById: true,
          beliefs: { select: { characterId: true, state: true, bibleId: true } },
          subjects: { select: { characterId: true, placeId: true, bibleId: true } },
        },
      });

      expect(stored.statement).toBe(STATEMENT);
      expect(stored.isTrue).toBe(true);
      expect(stored.validity).toBe("PERMANENT");
      // Written by the statement, never chosen by the caller.
      expect(stored.source).toBe("USER");
      expect(stored.status).toBe("CONFIRMED");
      expect(stored.lockedAt).toBeNull();
      expect(stored.beliefs).toEqual([
        { characterId: fixture.noraId, state: "UNAWARE", bibleId: fixture.bibleId },
      ]);
      expect(stored.subjects).toEqual([
        { characterId: fixture.claireId, placeId: null, bibleId: fixture.bibleId },
      ]);
    });

    it("stamps the children too — createMany is a top-level write", async () => {
      const fixture = await seedProject("stamped-children");

      const written = await write(
        fixture,
        permanentFact({
          beliefs: [{ characterId: fixture.noraId, state: "BELIEVES_FALSE" }],
          subjects: [{ kind: "place", id: fixture.houseId }],
        }),
      );

      expect(written.ok).toBe(true);
      if (!written.ok) return;

      const beliefs = await prisma.canonFactBelief.findMany({
        where: { factId: written.value.id },
        select: { updatedById: true },
      });
      const subjects = await prisma.canonFactSubject.findMany({
        where: { factId: written.value.id },
        select: { updatedById: true },
      });

      expect(beliefs).toEqual([{ updatedById: ownerId }]);
      expect(subjects).toEqual([{ updatedById: ownerId }]);
    });

    it("stores a fact true during a period placed by one bound", async () => {
      const fixture = await seedProject("period-fact");

      const written = await write(
        fixture,
        permanentFact({
          validity: "DURING_PERIOD",
          validFrom: { day: -3_650, precision: "MONTH", label: "novembre 1998" },
        }),
      );

      expect(written.ok).toBe(true);
      if (!written.ok) return;

      const stored = await prisma.canonFact.findUniqueOrThrow({
        where: { id: written.value.id },
        select: { validity: true, validFromDay: true, validFromPrecision: true, validUntilDay: true },
      });

      expect(stored.validity).toBe("DURING_PERIOD");
      expect(stored.validFromDay).toBe(-3_650);
      expect(stored.validFromPrecision).toBe("MONTH");
      expect(stored.validUntilDay).toBeNull();
    });

    it("stores a bound the author placed in words alone", async () => {
      const fixture = await seedProject("worded-bound");

      const written = await write(
        fixture,
        permanentFact({
          validity: "DURING_PERIOD",
          validFrom: { day: null, precision: null, label: "l'hiver de l'accident" },
        }),
      );

      expect(written.ok).toBe(true);
    });

    it("stores a fact ended by a timeline event", async () => {
      const fixture = await seedProject("ended-fact");

      const written = await write(
        fixture,
        permanentFact({ validity: "UNTIL_EVENT", invalidatedByEventId: fixture.eventId }),
      );

      expect(written.ok).toBe(true);
      if (!written.ok) return;

      const stored = await prisma.canonFact.findUniqueOrThrow({
        where: { id: written.value.id },
        select: { validity: true, invalidatedByEventId: true },
      });

      expect(stored.validity).toBe("UNTIL_EVENT");
      expect(stored.invalidatedByEventId).toBe(fixture.eventId);
    });

    it("refuses a character from another project's bible", async () => {
      const fixture = await seedProject("foreign-character");
      const other = await seedProject("other-bible");

      const written = await write(
        fixture,
        permanentFact({ beliefs: [{ characterId: other.noraId, state: "UNAWARE" }] }),
      );

      expect(written.ok).toBe(false);
      if (written.ok) return;
      expect(written.error.code).toBe("NOT_FOUND");

      const count = await prisma.canonFact.count({ where: { bibleId: fixture.bibleId } });
      expect(count).toBe(0);
    });

    it("refuses an ending event from another project's bible", async () => {
      const fixture = await seedProject("foreign-event");
      const other = await seedProject("other-timeline");

      const written = await write(
        fixture,
        permanentFact({ validity: "UNTIL_EVENT", invalidatedByEventId: other.eventId }),
      );

      expect(written.ok).toBe(false);
      if (written.ok) return;
      expect(written.error.code).toBe("NOT_FOUND");
    });

    it("refuses a scope naming another owner, and writes nothing", async () => {
      const fixture = await seedProject("cross-owner-write");

      const forged = {
        ...fixture.scope,
        ownerId: intruderId,
      } as ProjectScope;

      const written = await runWithActor(intruderId, async () =>
        writeCanonFact(forged, { bibleId: fixture.bibleId, ...permanentFact() }),
      );

      expect(written.ok).toBe(false);
      if (written.ok) return;
      expect(written.error.code).toBe("NOT_FOUND");

      const count = await prisma.canonFact.count({ where: { bibleId: fixture.bibleId } });
      expect(count).toBe(0);
    });
  });

  describe("editCanonFact", () => {
    it("rewrites the statement and reconciles the stances", async () => {
      const fixture = await seedProject("edit-stances");
      const written = await write(
        fixture,
        permanentFact({
          beliefs: [
            { characterId: fixture.noraId, state: "UNAWARE" },
            { characterId: fixture.claireId, state: "BELIEVES_TRUE" },
          ],
        }),
      );
      if (!written.ok) throw new Error("the fixture fact was refused");

      const edited = await runWithActor(ownerId, async () =>
        editCanonFact(fixture.scope, {
          factId: written.value.id,
          ...permanentFact({
            statement: "Le père de Nora vit à Sète.",
            beliefs: [{ characterId: fixture.claireId, state: "BELIEVES_FALSE" }],
          }),
        }),
      );

      expect(edited.ok).toBe(true);
      if (!edited.ok) return;
      expect(edited.value.updated).toBe(true);

      const stored = await prisma.canonFact.findUniqueOrThrow({
        where: { id: written.value.id },
        select: {
          statement: true,
          beliefs: { select: { characterId: true, state: true } },
        },
      });

      expect(stored.statement).toBe("Le père de Nora vit à Sète.");
      expect(stored.beliefs).toEqual([
        { characterId: fixture.claireId, state: "BELIEVES_FALSE" },
      ]);
    });

    it("keeps the row of a stance that did not move", async () => {
      const fixture = await seedProject("kept-stance");
      const written = await write(
        fixture,
        permanentFact({ beliefs: [{ characterId: fixture.noraId, state: "UNAWARE" }] }),
      );
      if (!written.ok) throw new Error("the fixture fact was refused");

      const before = await prisma.canonFactBelief.findFirstOrThrow({
        where: { factId: written.value.id },
        select: { id: true, version: true },
      });

      const edited = await runWithActor(ownerId, async () =>
        editCanonFact(fixture.scope, {
          factId: written.value.id,
          ...permanentFact({
            statement: "Le père de Nora a quitté le pays.",
            beliefs: [{ characterId: fixture.noraId, state: "UNAWARE" }],
          }),
        }),
      );

      expect(edited.ok).toBe(true);

      const after = await prisma.canonFactBelief.findFirstOrThrow({
        where: { factId: written.value.id },
        select: { id: true, version: true },
      });

      expect(after).toEqual(before);
    });

    it("writes nothing when the submission says exactly what the row says", async () => {
      const fixture = await seedProject("identical-submission");
      const content = permanentFact({
        beliefs: [
          { characterId: fixture.noraId, state: "UNAWARE" },
          { characterId: fixture.claireId, state: "BELIEVES_TRUE" },
        ],
        subjects: [{ kind: "place", id: fixture.houseId }],
      });
      const written = await write(fixture, content);
      if (!written.ok) throw new Error("the fixture fact was refused");

      const before = await prisma.canonFact.findUniqueOrThrow({
        where: { id: written.value.id },
        select: { version: true, updatedAt: true },
      });

      // The stances arrive in the opposite order: the lists are compared as
      // sets, so a screen reordering the cast is not an edit.
      const edited = await runWithActor(ownerId, async () =>
        editCanonFact(fixture.scope, {
          factId: written.value.id,
          ...content,
          beliefs: [...content.beliefs].reverse(),
        }),
      );

      expect(edited.ok).toBe(true);
      if (!edited.ok) return;
      expect(edited.value.updated).toBe(false);

      const after = await prisma.canonFact.findUniqueOrThrow({
        where: { id: written.value.id },
        select: { version: true, updatedAt: true },
      });

      expect(after).toEqual(before);
    });

    it("moves a fact from permanent to ended by an event", async () => {
      const fixture = await seedProject("becomes-ended");
      const written = await write(fixture, permanentFact());
      if (!written.ok) throw new Error("the fixture fact was refused");

      const edited = await runWithActor(ownerId, async () =>
        editCanonFact(fixture.scope, {
          factId: written.value.id,
          ...permanentFact({
            validity: "UNTIL_EVENT",
            invalidatedByEventId: fixture.eventId,
          }),
        }),
      );

      expect(edited.ok).toBe(true);

      const stored = await prisma.canonFact.findUniqueOrThrow({
        where: { id: written.value.id },
        select: { validity: true, invalidatedByEventId: true },
      });

      expect(stored).toEqual({ validity: "UNTIL_EVENT", invalidatedByEventId: fixture.eventId });
    });

    it("refuses a locked fact until the lock is lifted", async () => {
      const fixture = await seedProject("locked-fact");
      const written = await write(fixture, permanentFact());
      if (!written.ok) throw new Error("the fixture fact was refused");

      const locked = await runWithActor(ownerId, async () =>
        lockBibleElement(fixture.scope, {
          model: "CanonFact",
          id: written.value.id,
          field: null,
        }),
      );
      expect(locked.ok).toBe(true);

      const refused = await runWithActor(ownerId, async () =>
        editCanonFact(fixture.scope, {
          factId: written.value.id,
          ...permanentFact({ statement: "Le père de Nora est mort." }),
        }),
      );

      expect(refused.ok).toBe(false);
      if (refused.ok) return;
      expect(refused.error.code).toBe("BIBLE_ELEMENT_LOCKED");

      const untouched = await prisma.canonFact.findUniqueOrThrow({
        where: { id: written.value.id },
        select: { statement: true },
      });
      expect(untouched.statement).toBe(STATEMENT);

      const lifted = await runWithActor(ownerId, async () =>
        unlockBibleElement(fixture.scope, {
          model: "CanonFact",
          id: written.value.id,
          field: null,
        }),
      );
      expect(lifted.ok).toBe(true);

      const edited = await runWithActor(ownerId, async () =>
        editCanonFact(fixture.scope, {
          factId: written.value.id,
          ...permanentFact({ statement: "Le père de Nora est mort." }),
        }),
      );

      expect(edited.ok).toBe(true);
    });

    it("refuses a fact that is not there, and one that is not theirs", async () => {
      const fixture = await seedProject("edit-cross-owner");
      const written = await write(fixture, permanentFact());
      if (!written.ok) throw new Error("the fixture fact was refused");

      const forged = { ...fixture.scope, ownerId: intruderId } as ProjectScope;

      const theirs = await runWithActor(intruderId, async () =>
        editCanonFact(forged, {
          factId: written.value.id,
          ...permanentFact({ statement: "Un énoncé qui n'est pas le leur." }),
        }),
      );

      expect(theirs.ok).toBe(false);
      if (theirs.ok) return;
      expect(theirs.error.code).toBe("NOT_FOUND");

      const untouched = await prisma.canonFact.findUniqueOrThrow({
        where: { id: written.value.id },
        select: { statement: true },
      });
      expect(untouched.statement).toBe(STATEMENT);
    });
  });

  describe("setCanonFactStatus", () => {
    it("retires a fact without deleting its row", async () => {
      const fixture = await seedProject("retire-fact");
      const written = await write(fixture, permanentFact());
      if (!written.ok) throw new Error("the fixture fact was refused");

      const retired = await runWithActor(ownerId, async () =>
        setCanonFactStatus(fixture.scope, { factId: written.value.id, status: "REJECTED" }),
      );

      expect(retired.ok).toBe(true);

      const stored = await prisma.canonFact.findUniqueOrThrow({
        where: { id: written.value.id },
        select: { status: true, statement: true },
      });

      expect(stored.status).toBe("REJECTED");
      expect(stored.statement).toBe(STATEMENT);
    });

    it("refuses the status the fact already holds", async () => {
      const fixture = await seedProject("same-status");
      const written = await write(fixture, permanentFact());
      if (!written.ok) throw new Error("the fixture fact was refused");

      const refused = await runWithActor(ownerId, async () =>
        setCanonFactStatus(fixture.scope, { factId: written.value.id, status: "CONFIRMED" }),
      );

      expect(refused.ok).toBe(false);
      if (refused.ok) return;
      expect(refused.error.category).toBe("conflict");
    });

    it("refuses a locked fact", async () => {
      const fixture = await seedProject("locked-status");
      const written = await write(fixture, permanentFact());
      if (!written.ok) throw new Error("the fixture fact was refused");

      await runWithActor(ownerId, async () =>
        lockBibleElement(fixture.scope, { model: "CanonFact", id: written.value.id, field: null }),
      );

      const refused = await runWithActor(ownerId, async () =>
        setCanonFactStatus(fixture.scope, { factId: written.value.id, status: "REJECTED" }),
      );

      expect(refused.ok).toBe(false);
      if (refused.ok) return;
      expect(refused.error.code).toBe("BIBLE_ELEMENT_LOCKED");
    });

    it("refuses a scope naming another owner", async () => {
      const fixture = await seedProject("status-cross-owner");
      const written = await write(fixture, permanentFact());
      if (!written.ok) throw new Error("the fixture fact was refused");

      const forged = { ...fixture.scope, ownerId: intruderId } as ProjectScope;

      const theirs = await runWithActor(intruderId, async () =>
        setCanonFactStatus(forged, { factId: written.value.id, status: "REJECTED" }),
      );

      expect(theirs.ok).toBe(false);
      if (theirs.ok) return;
      expect(theirs.error.code).toBe("NOT_FOUND");
    });
  });

  describe("deleteCanonFact", () => {
    it("removes a hand-written fact and its children", async () => {
      const fixture = await seedProject("delete-user-fact");
      const written = await write(
        fixture,
        permanentFact({
          beliefs: [{ characterId: fixture.noraId, state: "UNAWARE" }],
          subjects: [{ kind: "place", id: fixture.houseId }],
        }),
      );
      if (!written.ok) throw new Error("the fixture fact was refused");

      const removed = await runWithActor(ownerId, async () =>
        deleteCanonFact(fixture.scope, written.value.id),
      );

      expect(removed.ok).toBe(true);

      expect(await prisma.canonFact.count({ where: { id: written.value.id } })).toBe(0);
      expect(await prisma.canonFactBelief.count({ where: { factId: written.value.id } })).toBe(0);
      expect(await prisma.canonFactSubject.count({ where: { factId: written.value.id } })).toBe(0);
    });

    it("refuses a fact the product extracted, and says to retire it instead", async () => {
      const fixture = await seedProject("delete-extracted");

      const extracted = await prisma.canonFact.create({
        data: {
          bibleId: fixture.bibleId,
          statement: "La maison possède une cave.",
          isTrue: false,
          source: "SOURCE_TEXT",
        },
        select: { id: true },
      });

      const refused = await runWithActor(ownerId, async () =>
        deleteCanonFact(fixture.scope, extracted.id),
      );

      expect(refused.ok).toBe(false);
      if (refused.ok) return;
      expect(refused.error.category).toBe("conflict");
      expect(refused.error.userMessage).toContain("écartez-le");

      expect(await prisma.canonFact.count({ where: { id: extracted.id } })).toBe(1);
    });

    it("refuses a locked fact", async () => {
      const fixture = await seedProject("delete-locked");
      const written = await write(fixture, permanentFact());
      if (!written.ok) throw new Error("the fixture fact was refused");

      await runWithActor(ownerId, async () =>
        lockBibleElement(fixture.scope, { model: "CanonFact", id: written.value.id, field: null }),
      );

      const refused = await runWithActor(ownerId, async () =>
        deleteCanonFact(fixture.scope, written.value.id),
      );

      expect(refused.ok).toBe(false);
      if (refused.ok) return;
      expect(refused.error.code).toBe("BIBLE_ELEMENT_LOCKED");
      expect(await prisma.canonFact.count({ where: { id: written.value.id } })).toBe(1);
    });

    it("refuses a scope naming another owner", async () => {
      const fixture = await seedProject("delete-cross-owner");
      const written = await write(fixture, permanentFact());
      if (!written.ok) throw new Error("the fixture fact was refused");

      const forged = { ...fixture.scope, ownerId: intruderId } as ProjectScope;

      const theirs = await runWithActor(intruderId, async () =>
        deleteCanonFact(forged, written.value.id),
      );

      expect(theirs.ok).toBe(false);
      if (theirs.ok) return;
      expect(theirs.error.code).toBe("NOT_FOUND");
      expect(await prisma.canonFact.count({ where: { id: written.value.id } })).toBe(1);
    });
  });

  describe("what the editor reads back", () => {
    it("comes back through getBibleOverview with its three dimensions intact", async () => {
      const fixture = await seedProject("read-back");
      const written = await write(
        fixture,
        permanentFact({
          beliefs: [{ characterId: fixture.noraId, state: "UNAWARE" }],
          subjects: [{ kind: "character", id: fixture.claireId }],
        }),
      );
      if (!written.ok) throw new Error("the fixture fact was refused");

      const overview = await getBibleOverview(fixture.scope);

      expect(overview).not.toBeNull();
      if (overview === null) return;

      const fact = overview.canonFacts.find((row) => row.id === written.value.id);

      expect(fact).toBeDefined();
      expect(fact?.isTrue).toBe(true);
      expect(fact?.validity).toBe("PERMANENT");
      expect(fact?.beliefs).toEqual([{ characterId: fixture.noraId, state: "UNAWARE" }]);
      expect(fact?.subjects).toEqual([{ characterId: fixture.claireId, placeId: null }]);
    });
  });
});
