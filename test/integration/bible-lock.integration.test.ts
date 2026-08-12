/**
 * CAL-095's acceptance criterion, against a real PostgreSQL: *une génération
 * qui contredirait un élément verrouillé est bloquée avant exécution, pas
 * corrigée après*.
 *
 * "Before execution" is the whole of it, so the assertions are about absences —
 * no `Generation` row, no `GenerationAttempt` row, no usage column — and an
 * absence is only worth asserting if the same call succeeds when the lock is
 * lifted. Every blocking test therefore has its unlocked twin.
 *
 * Two gates are proved, because a lock can arrive at two moments. One runs when
 * the ask is opened, which is where the author is standing and where §6.5's
 * *signaler avant la génération* belongs; the other runs inside the claim, on
 * the worker, which is what stops a lock taken after the ask from being
 * overtaken by the job it was meant to stop.
 *
 * Cross-owner isolation is proved entry point by entry point in
 * `owner-access.integration.test.ts`; what is repeated here is only what a
 * generic delegate makes worth repeating — a lock written by name reaches a row
 * by name, and `scopedWhere` is the only thing standing between that and
 * another author's bible.
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import type { GenerationClaim } from "@calepin/shared/generation";
import {
  claimGenerationAttempt,
  deleteRelationship,
  editRelationship,
  type GenerationMission,
  lockBibleElement,
  openProjectScope,
  type ProjectScope,
  readBibleLockGate,
  replayGeneration,
  reserveGeneration,
  unlockBibleElement,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";
import { createProjectGraph, type ProjectGraph } from "./project-graph";

const MODEL = "claude-opus-5";

interface Fixture {
  readonly graph: ProjectGraph;
  readonly scope: ProjectScope;
}

describe("bible element locking (CAL-095)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();
  let sequence = 0;

  beforeAll(() => {
    configureDatabaseClient(seam);
  });

  afterAll(async () => {
    resetDatabaseClient();
    await prisma.$disconnect();
    await seam.$disconnect();
  });

  async function createFixture(): Promise<Fixture> {
    sequence += 1;

    const graph = await createProjectGraph(prisma, setActor, `bible-lock-${sequence}`);
    const opened = await openProjectScope({
      ownerId: graph.ownerId,
      projectId: graph.projectId,
    });

    if (!opened.ok) throw new Error("the fixture scope was refused");

    return { graph, scope: opened.value };
  }

  function asOwner<T>(fixture: Fixture, write: () => Promise<T>): Promise<T> {
    return runWithActor(fixture.graph.ownerId, write);
  }

  function ask(fixture: Fixture, mission: GenerationMission, targetId: string | null = null) {
    return asOwner(fixture, () =>
      reserveGeneration(fixture.scope, { mission, targetId, input: { label: `${sequence}` } }),
    );
  }

  async function claim(fixture: Fixture, generationId: string): Promise<GenerationClaim> {
    const claimed = await claimGenerationAttempt(fixture.scope, { generationId, model: MODEL });

    if (!claimed.ok) throw new Error("a claim failed rather than answering");

    return claimed.value;
  }

  describe("setting and lifting a lock", () => {
    it("writes the timestamp, and reads it back as the state", async () => {
      const fixture = await createFixture();

      const locked = await asOwner(fixture, () =>
        lockBibleElement(fixture.scope, {
          model: "WorldRule",
          id: fixture.graph.rows.WorldRule,
          field: null,
        }),
      );

      expect(locked.ok && locked.value.lockedAt).toBeInstanceOf(Date);

      const row = await prisma.worldRule.findUniqueOrThrow({
        where: { id: fixture.graph.rows.WorldRule },
        select: { lockedAt: true },
      });

      expect(row.lockedAt).not.toBeNull();
    });

    it("refuses to lock what is already locked, rather than writing again", async () => {
      // `discardDirection`'s reading: the author is on a stale screen, and the
      // answer is to look again. Writing again would also move `updatedAt` on a
      // row nothing changed about.
      const fixture = await createFixture();
      const input = { model: "CanonFact", id: fixture.graph.rows.CanonFact, field: null } as const;

      await asOwner(fixture, () => lockBibleElement(fixture.scope, input));
      const again = await asOwner(fixture, () => lockBibleElement(fixture.scope, input));

      expect(again.ok).toBe(false);
      expect(!again.ok && again.error.code).toBe("CONFLICT");
    });

    it("lifts the lock, and refuses to lift it twice", async () => {
      const fixture = await createFixture();
      const input = {
        model: "TimelineEvent",
        id: fixture.graph.rows.TimelineEvent,
        field: null,
      } as const;

      await asOwner(fixture, () => lockBibleElement(fixture.scope, input));

      const lifted = await asOwner(fixture, () => unlockBibleElement(fixture.scope, input));
      expect(lifted.ok && lifted.value.lockedAt).toBeNull();

      const again = await asOwner(fixture, () => unlockBibleElement(fixture.scope, input));
      expect(!again.ok && again.error.code).toBe("CONFLICT");
    });

    it("reaches nothing of another author's bible", async () => {
      const mine = await createFixture();
      const theirs = await createFixture();

      const stolen = await runWithActor(mine.graph.ownerId, () =>
        lockBibleElement(mine.scope, {
          model: "WorldRule",
          id: theirs.graph.rows.WorldRule,
          field: null,
        }),
      );

      expect(!stolen.ok && stolen.error.code).toBe("NOT_FOUND");

      const untouched = await prisma.worldRule.findUniqueOrThrow({
        where: { id: theirs.graph.rows.WorldRule },
        select: { lockedAt: true },
      });

      expect(untouched.lockedAt).toBeNull();
    });
  });

  describe("locking one field of a character sheet", () => {
    it("adds the field, in the column's own order", async () => {
      const fixture = await createFixture();
      const id = fixture.graph.rows.Character;

      await asOwner(fixture, () =>
        lockBibleElement(fixture.scope, { model: "Character", id, field: "SECRET" }),
      );
      const both = await asOwner(fixture, () =>
        lockBibleElement(fixture.scope, { model: "Character", id, field: "AGE" }),
      );

      // AGE before SECRET, which is the order `Character` declares them in —
      // so the column never churns on the order a caller happened to click in.
      expect(both.ok && both.value.lockedFields).toEqual(["AGE", "SECRET"]);
      expect(both.ok && both.value.lockedAt).toBeNull();
    });

    it("refuses a field the sheet already holds, and one it does not", async () => {
      const fixture = await createFixture();
      const id = fixture.graph.rows.Character;

      await asOwner(fixture, () =>
        lockBibleElement(fixture.scope, { model: "Character", id, field: "PAST" }),
      );

      const again = await asOwner(fixture, () =>
        lockBibleElement(fixture.scope, { model: "Character", id, field: "PAST" }),
      );
      expect(!again.ok && again.error.code).toBe("CONFLICT");

      const absent = await asOwner(fixture, () =>
        unlockBibleElement(fixture.scope, { model: "Character", id, field: "FEAR" }),
      );
      expect(!absent.ok && absent.error.code).toBe("CONFLICT");
    });

    it("refuses a field lock under a locked sheet, which would state nothing", async () => {
      const fixture = await createFixture();
      const id = fixture.graph.rows.Character;

      await asOwner(fixture, () =>
        lockBibleElement(fixture.scope, { model: "Character", id, field: null }),
      );

      const field = await asOwner(fixture, () =>
        lockBibleElement(fixture.scope, { model: "Character", id, field: "SECRET" }),
      );

      expect(!field.ok && field.error.code).toBe("CONFLICT");
    });

    it("refuses a field on a model that carries no field lock", async () => {
      const fixture = await createFixture();

      const refused = await asOwner(fixture, () =>
        lockBibleElement(fixture.scope, {
          model: "WorldRule",
          id: fixture.graph.rows.WorldRule,
          // Only a character sheet is locked field by field; the type says so
          // and the statement refuses it anyway, because this arrives from a
          // form.
          field: "SECRET" as never,
        }),
      );

      expect(!refused.ok && refused.error.code).toBe("VALIDATION_FAILED");
      expect(!refused.ok && refused.error.fieldPath).toBe("field");
    });

    it("leaves a field lock standing when the sheet's own lock is lifted", async () => {
      // Two statements about two things. Clearing one from the other would
      // delete a decision nobody revisited.
      const fixture = await createFixture();
      const id = fixture.graph.rows.Character;

      await asOwner(fixture, () =>
        lockBibleElement(fixture.scope, { model: "Character", id, field: "SECRET" }),
      );
      await asOwner(fixture, () =>
        lockBibleElement(fixture.scope, { model: "Character", id, field: null }),
      );
      const lifted = await asOwner(fixture, () =>
        unlockBibleElement(fixture.scope, { model: "Character", id, field: null }),
      );

      expect(lifted.ok && lifted.value).toEqual({ lockedAt: null, lockedFields: ["SECRET"] });
    });
  });

  describe("a generation is refused before it is opened", () => {
    const CASES = [
      { model: "WorldRule", mission: "DEFINE_WORLD" },
      { model: "BibleWorld", mission: "DEFINE_WORLD" },
      { model: "Place", mission: "DEFINE_WORLD" },
      { model: "BibleIdentity", mission: "DEFINE_NOVEL_IDENTITY" },
      { model: "BibleStyle", mission: "DEFINE_STYLE" },
      { model: "TimelineEvent", mission: "BUILD_TIMELINE" },
      { model: "CanonFact", mission: "EXTRACT_INITIAL_FACTS" },
      { model: "Relationship", mission: "RELATE_CHARACTERS" },
    ] as const;

    it.each(CASES)("refuses $mission while a $model is locked", async ({ model, mission }) => {
      const fixture = await createFixture();

      const before = await ask(fixture, mission);
      expect(before.ok).toBe(true);

      // The ask already opened is irrelevant to the next one: the key hashes
      // the input, and this second ask carries a different target.
      await prisma.generation.deleteMany({
        where: { projectId: fixture.graph.projectId, mission },
      });

      await asOwner(fixture, () =>
        lockBibleElement(fixture.scope, { model, id: fixture.graph.rows[model], field: null }),
      );

      const refused = await ask(fixture, mission);

      expect(!refused.ok && refused.error.code).toBe("BIBLE_ELEMENT_LOCKED");
      expect(!refused.ok && refused.error.category).toBe("conflict");

      // The criterion, as an absence: nothing was opened, so nothing was
      // enqueued and nothing could have been spent.
      const opened = await prisma.generation.count({
        where: { projectId: fixture.graph.projectId, mission },
      });

      expect(opened).toBe(0);
    });

    it("lets the same ask through the moment the lock is lifted", async () => {
      const fixture = await createFixture();
      const input = {
        model: "TimelineEvent",
        id: fixture.graph.rows.TimelineEvent,
        field: null,
      } as const;

      await asOwner(fixture, () => lockBibleElement(fixture.scope, input));
      expect((await ask(fixture, "BUILD_TIMELINE")).ok).toBe(false);

      await asOwner(fixture, () => unlockBibleElement(fixture.scope, input));
      expect((await ask(fixture, "BUILD_TIMELINE")).ok).toBe(true);
    });

    it("is blocked by a locked field exactly as by a locked sheet", async () => {
      const fixture = await createFixture();
      const id = fixture.graph.rows.Character;

      await asOwner(fixture, () =>
        lockBibleElement(fixture.scope, { model: "Character", id, field: "DEEP_NEED" }),
      );

      const refused = await ask(fixture, "CREATE_CHARACTER_SHEET", id);

      expect(!refused.ok && refused.error.code).toBe("BIBLE_ELEMENT_LOCKED");
    });
  });

  describe("what a lock deliberately does not block", () => {
    it("never blocks the per-chapter fact extraction, whatever the canon holds", async () => {
      // The omission that keeps the gate from crying wolf: EXTRACT_FACTS
      // proposes rows the author arbitrates, and blocking it would stop the
      // whole writing loop the moment a single fact were locked.
      const fixture = await createFixture();

      await asOwner(fixture, () =>
        lockBibleElement(fixture.scope, {
          model: "CanonFact",
          id: fixture.graph.rows.CanonFact,
          field: null,
        }),
      );

      const reserved = await ask(fixture, "EXTRACT_FACTS", fixture.graph.rows.Chapter);
      expect(reserved.ok).toBe(true);

      if (!reserved.ok) return;

      expect(await claim(fixture, reserved.value.id)).toEqual({ kind: "claimed", attempt: 1 });
    });

    it("never blocks a mission that rebuilds another section", async () => {
      const fixture = await createFixture();

      await asOwner(fixture, () =>
        lockBibleElement(fixture.scope, {
          model: "Character",
          id: fixture.graph.rows.Character,
          field: null,
        }),
      );

      expect((await ask(fixture, "BUILD_TIMELINE")).ok).toBe(true);
    });

    it("never blocks a sheet asked about a different character", async () => {
      const fixture = await createFixture();
      const locked = fixture.graph.rows.Character;

      const other = await prisma.character.create({
        data: { bibleId: fixture.graph.rows.Bible, name: `bible-lock-${sequence}-other` },
        select: { id: true },
      });

      await asOwner(fixture, () =>
        lockBibleElement(fixture.scope, { model: "Character", id: locked, field: null }),
      );

      expect((await ask(fixture, "CREATE_CHARACTER_SHEET", other.id)).ok).toBe(true);
      expect((await ask(fixture, "CREATE_CHARACTER_SHEET", locked)).ok).toBe(false);
    });
  });

  describe("a lock taken after the ask still stops the attempt", () => {
    it("refuses the claim, opens no attempt and closes the row for a decision", async () => {
      const fixture = await createFixture();
      const rule = {
        model: "WorldRule",
        id: fixture.graph.rows.WorldRule,
        field: null,
      } as const;

      const reserved = await ask(fixture, "DEFINE_WORLD");
      if (!reserved.ok) throw new Error("the reservation was refused before any lock existed");

      await asOwner(fixture, () => lockBibleElement(fixture.scope, rule));

      expect(await claim(fixture, reserved.value.id)).toEqual({
        kind: "refused",
        reason: "element-locked",
      });

      // Nothing was asked of a provider, so nothing measured it. That is the
      // same arithmetic GENERATION_INTERRUPTED relies on: a try nobody made
      // sums to nothing.
      const attempts = await prisma.generationAttempt.count({
        where: { generationId: reserved.value.id },
      });
      expect(attempts).toBe(0);

      const row = await prisma.generation.findUniqueOrThrow({
        where: { id: reserved.value.id },
        select: {
          status: true,
          errorCode: true,
          errorCategory: true,
          failureClass: true,
          nextAttemptAt: true,
          completedAt: true,
        },
      });

      expect(row.status).toBe("FAILED");
      expect(row.errorCode).toBe("BIBLE_ELEMENT_LOCKED");
      expect(row.errorCategory).toBe("CONFLICT");
      expect(row.failureClass).toBe("PERMANENT");
      // A stop, not a wait: nothing will bring this row back by itself.
      expect(row.nextAttemptAt).toBeNull();
      expect(row.completedAt).not.toBeNull();
    });

    it("runs once the author has lifted the lock and replayed", async () => {
      const fixture = await createFixture();
      const rule = {
        model: "WorldRule",
        id: fixture.graph.rows.WorldRule,
        field: null,
      } as const;

      const reserved = await ask(fixture, "DEFINE_WORLD");
      if (!reserved.ok) throw new Error("the reservation was refused before any lock existed");

      await asOwner(fixture, () => lockBibleElement(fixture.scope, rule));
      await claim(fixture, reserved.value.id);

      await asOwner(fixture, () => unlockBibleElement(fixture.scope, rule));

      const replayed = await asOwner(fixture, () =>
        replayGeneration(fixture.scope, reserved.value.id),
      );
      expect(replayed.ok).toBe(true);

      expect(await claim(fixture, reserved.value.id)).toEqual({ kind: "claimed", attempt: 1 });
    });
  });

  describe("readBibleLockGate", () => {
    it("answers exactly what the refusal is built from", async () => {
      const fixture = await createFixture();

      const clear = await readBibleLockGate(fixture.scope, { mission: "DEFINE_WORLD" });
      expect(clear.ok && clear.value.blocked).toBe(false);

      await asOwner(fixture, () =>
        lockBibleElement(fixture.scope, {
          model: "WorldRule",
          id: fixture.graph.rows.WorldRule,
          field: null,
        }),
      );

      const blocked = await readBibleLockGate(fixture.scope, { mission: "DEFINE_WORLD" });

      expect(blocked.ok && blocked.value.blocked).toBe(true);
      expect(blocked.ok && blocked.value.blocking).toEqual([
        {
          model: "WorldRule",
          id: fixture.graph.rows.WorldRule,
          fields: [],
          characterId: null,
        },
      ]);
    });

    it("costs no query for a mission that rebuilds nothing", async () => {
      const fixture = await createFixture();

      await asOwner(fixture, () =>
        lockBibleElement(fixture.scope, {
          model: "CanonFact",
          id: fixture.graph.rows.CanonFact,
          field: null,
        }),
      );

      const gate = await readBibleLockGate(fixture.scope, { mission: "WRITE_SCENE" });

      expect(gate.ok && gate.value).toEqual({
        mission: "WRITE_SCENE",
        blocked: false,
        blocking: [],
      });
    });

    it("sees nothing of another author's bible", async () => {
      const mine = await createFixture();
      const theirs = await createFixture();

      await runWithActor(theirs.graph.ownerId, () =>
        lockBibleElement(theirs.scope, {
          model: "WorldRule",
          id: theirs.graph.rows.WorldRule,
          field: null,
        }),
      );

      const gate = await readBibleLockGate(mine.scope, { mission: "DEFINE_WORLD" });

      expect(gate.ok && gate.value.blocked).toBe(false);
    });
  });

  describe("a locked element is never modified silently", () => {
    it("refuses an edit and a deletion under the lock's own code", async () => {
      const fixture = await createFixture();
      const relationshipId = fixture.graph.rows.Relationship;

      await asOwner(fixture, () =>
        lockBibleElement(fixture.scope, {
          model: "Relationship",
          id: relationshipId,
          field: null,
        }),
      );

      const edited = await asOwner(fixture, () =>
        editRelationship(fixture.scope, {
          relationshipId,
          type: "RIVALRY",
          label: "rivale de",
          description: null,
        }),
      );

      expect(!edited.ok && edited.error.code).toBe("BIBLE_ELEMENT_LOCKED");
      expect(!edited.ok && edited.error.userMessage).toBe(
        "Ce lien est verrouillé : déverrouillez-le pour le modifier.",
      );

      const removed = await asOwner(fixture, () =>
        deleteRelationship(fixture.scope, relationshipId),
      );

      expect(!removed.ok && removed.error.code).toBe("BIBLE_ELEMENT_LOCKED");

      const survivor = await prisma.relationship.findUnique({ where: { id: relationshipId } });
      expect(survivor).not.toBeNull();
    });
  });
});
