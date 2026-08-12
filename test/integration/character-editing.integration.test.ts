/**
 * CAL-097's write: rewriting a character sheet's sixteen own-row fields by
 * hand — against a real PostgreSQL.
 *
 * `direction-edit.integration.test.ts`'s shape. Isolated from
 * `owner-access.integration.test.ts` for the reason its own doc comment
 * gives: a locked field, a locked row and a name collision need seeding this
 * file's own fixture is arranged to hold, which the shared graph is not.
 *
 * Cross-owner isolation of `Character` and `CharacterEditHistory` themselves
 * is proved once, table by table, in `owner-access.integration.test.ts`; the
 * negative half is repeated here only for `editCharacter`, whose refusal has
 * its own remedy.
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import {
  type CharacterContentInput,
  createProjectWithSourceText,
  editCharacter,
  getCharacterForEdit,
  lockBibleElement,
  openProjectScope,
  type ProjectScope,
  unlockBibleElement,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

/** Synthetic French written for this file (§8). */
const CONTENT: CharacterContentInput = {
  name: "Corentin Maillard",
  age: 34,
  role: "ancien associé",
  importance: "SECONDARY",
  appearance: "une cicatrice à la tempe",
  initialSituation: "revient dans sa ville natale",
  apparentDesire: "récupérer sa maison",
  deepNeed: "être pardonné",
  fear: "être oublié",
  contradiction: "veut réparer et ne sait que fuir",
  secret: "il a menti sur la date de son retour",
  past: "a quitté la ville sans un mot, quinze ans plus tôt",
  plannedArc: "affronte enfin ce qu'il a fui",
  speechStyle: "phrases courtes, jamais un compliment direct",
  heldKnowledge: ["Sait : la maison a été vendue"],
  elementsToPreserve: ["son silence sur le départ"],
};

const REWRITTEN: CharacterContentInput = {
  ...CONTENT,
  fear: "être remplacé par son frère",
  secret: "il n'a jamais vendu la maison, il l'a rachetée sous un autre nom",
};

describe("editing a character sheet by hand (CAL-097)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();

  let ownerId: string;

  beforeAll(async () => {
    configureDatabaseClient(seam);

    const owner = await prisma.user.create({ data: { email: "character-edit@example.test" } });
    ownerId = owner.id;
    setActor(ownerId);
  });

  afterAll(async () => {
    resetDatabaseClient();
    await prisma.$disconnect();
    await seam.$disconnect();
  });

  interface Fixture {
    readonly scope: ProjectScope;
    readonly characterId: string;
  }

  async function seedProject(
    label: string,
    overrides: { readonly origin?: "GENERATED" | "USER_WRITTEN" } = {},
  ): Promise<Fixture> {
    setActor(ownerId);

    const project = await runWithActor(ownerId, async () =>
      createProjectWithSourceText({ ownerId, title: label, sourceText: { content: "fixture" } }),
    );

    const opened = await openProjectScope({ ownerId, projectId: project.id });
    if (!opened.ok) throw new Error("the fixture could not open a scope on its own project");

    const bible = await prisma.bible.create({ data: { projectId: project.id } });
    const character = await prisma.character.create({
      data: {
        bibleId: bible.id,
        name: CONTENT.name,
        age: CONTENT.age,
        role: CONTENT.role,
        importance: CONTENT.importance,
        appearance: CONTENT.appearance,
        initialSituation: CONTENT.initialSituation,
        apparentDesire: CONTENT.apparentDesire,
        deepNeed: CONTENT.deepNeed,
        fear: CONTENT.fear,
        contradiction: CONTENT.contradiction,
        secret: CONTENT.secret,
        past: CONTENT.past,
        plannedArc: CONTENT.plannedArc,
        speechStyle: CONTENT.speechStyle,
        heldKnowledge: [...CONTENT.heldKnowledge],
        elementsToPreserve: [...CONTENT.elementsToPreserve],
        origin: overrides.origin ?? "GENERATED",
      },
      select: { id: true },
    });

    return { scope: opened.value, characterId: character.id };
  }

  describe("editCharacter", () => {
    it("changes the given fields and moves origin to EDITED", async () => {
      const fixture = await seedProject("changed-fields");
      setActor(ownerId);

      const edited = await runWithActor(ownerId, async () =>
        editCharacter(fixture.scope, { characterId: fixture.characterId, content: REWRITTEN }),
      );

      expect(edited.ok).toBe(true);
      if (!edited.ok) return;

      expect(edited.value).toEqual({ updated: true, origin: "EDITED" });

      const snapshot = await getCharacterForEdit(fixture.scope, fixture.characterId);
      expect(snapshot.ok).toBe(true);
      if (!snapshot.ok) return;

      expect(snapshot.value.fear).toBe(REWRITTEN.fear);
      expect(snapshot.value.secret).toBe(REWRITTEN.secret);
    });

    it("writes one history row carrying the pre-edit snapshot and the changed fields", async () => {
      const fixture = await seedProject("history-row");
      setActor(ownerId);

      await runWithActor(ownerId, async () =>
        editCharacter(fixture.scope, { characterId: fixture.characterId, content: REWRITTEN }),
      );

      const snapshot = await getCharacterForEdit(fixture.scope, fixture.characterId);
      expect(snapshot.ok).toBe(true);
      if (!snapshot.ok) return;

      expect(snapshot.value.editHistory).toHaveLength(1);
      const entry = snapshot.value.editHistory[0];

      expect(entry?.fear).toBe(CONTENT.fear);
      expect(entry?.secret).toBe(CONTENT.secret);
      expect([...(entry?.changedFields ?? [])].sort()).toEqual(["FEAR", "SECRET"]);
    });

    it("writes nothing and leaves no history row on an identical resubmission", async () => {
      const fixture = await seedProject("no-op-resubmit");
      setActor(ownerId);

      const before = await seam.character.findUniqueOrThrow({
        where: { id: fixture.characterId },
      });

      const edited = await runWithActor(ownerId, async () =>
        editCharacter(fixture.scope, { characterId: fixture.characterId, content: CONTENT }),
      );

      expect(edited.ok).toBe(true);
      if (!edited.ok) return;

      expect(edited.value).toEqual({ updated: false, origin: "GENERATED" });

      const after = await seam.character.findUniqueOrThrow({ where: { id: fixture.characterId } });
      expect(after).toEqual(before);

      const history = await seam.characterEditHistory.findMany({
        where: { characterId: fixture.characterId },
      });
      expect(history).toHaveLength(0);
    });

    it("keeps USER_WRITTEN as USER_WRITTEN across an edit — the origin never reverts", async () => {
      const fixture = await seedProject("user-written-stays", { origin: "USER_WRITTEN" });
      setActor(ownerId);

      const edited = await runWithActor(ownerId, async () =>
        editCharacter(fixture.scope, { characterId: fixture.characterId, content: REWRITTEN }),
      );

      expect(edited.ok).toBe(true);
      if (!edited.ok) return;

      expect(edited.value.origin).toBe("USER_WRITTEN");
    });

    it("refuses to edit a field locked on the whole row", async () => {
      const fixture = await seedProject("row-locked");
      setActor(ownerId);

      await runWithActor(ownerId, async () =>
        lockBibleElement(fixture.scope, {
          model: "Character",
          id: fixture.characterId,
          field: null,
        }),
      );

      const refused = await runWithActor(ownerId, async () =>
        editCharacter(fixture.scope, { characterId: fixture.characterId, content: REWRITTEN }),
      );

      expect(refused.ok).toBe(false);
      if (refused.ok) return;
      expect(refused.error.code).toBe("BIBLE_ELEMENT_LOCKED");
    });

    it("refuses to edit a field locked on its own", async () => {
      const fixture = await seedProject("field-locked");
      setActor(ownerId);

      await runWithActor(ownerId, async () =>
        lockBibleElement(fixture.scope, {
          model: "Character",
          id: fixture.characterId,
          field: "FEAR",
        }),
      );

      const refused = await runWithActor(ownerId, async () =>
        editCharacter(fixture.scope, { characterId: fixture.characterId, content: REWRITTEN }),
      );

      expect(refused.ok).toBe(false);
      if (refused.ok) return;
      expect(refused.error.code).toBe("BIBLE_ELEMENT_LOCKED");
    });

    it("allows the edit once the field's lock is explicitly lifted", async () => {
      const fixture = await seedProject("field-unlocked");
      setActor(ownerId);

      await runWithActor(ownerId, async () =>
        lockBibleElement(fixture.scope, {
          model: "Character",
          id: fixture.characterId,
          field: "FEAR",
        }),
      );
      await runWithActor(ownerId, async () =>
        unlockBibleElement(fixture.scope, {
          model: "Character",
          id: fixture.characterId,
          field: "FEAR",
        }),
      );

      const edited = await runWithActor(ownerId, async () =>
        editCharacter(fixture.scope, { characterId: fixture.characterId, content: REWRITTEN }),
      );

      expect(edited.ok).toBe(true);
      if (!edited.ok) return;
      expect(edited.value.updated).toBe(true);
    });

    it("does not refuse a locked field the edit leaves unchanged", async () => {
      const fixture = await seedProject("unrelated-field-locked");
      setActor(ownerId);

      // A different sheet field is locked than the ones REWRITTEN changes.
      await runWithActor(ownerId, async () =>
        lockBibleElement(fixture.scope, {
          model: "Character",
          id: fixture.characterId,
          field: "PAST",
        }),
      );

      const edited = await runWithActor(ownerId, async () =>
        editCharacter(fixture.scope, { characterId: fixture.characterId, content: REWRITTEN }),
      );

      expect(edited.ok).toBe(true);
    });

    it("refuses to rename onto a name another character of the same bible already carries", async () => {
      const fixture = await seedProject("rename-collision");
      setActor(ownerId);

      const snapshot = await getCharacterForEdit(fixture.scope, fixture.characterId);
      if (!snapshot.ok) throw new Error("fixture character not found");

      const bible = await seam.character.findUniqueOrThrow({
        where: { id: fixture.characterId },
        select: { bibleId: true },
      });
      const other = await prisma.character.create({
        data: { bibleId: bible.bibleId, name: "Élise Fougeray", origin: "GENERATED" },
      });

      const refused = await runWithActor(ownerId, async () =>
        editCharacter(fixture.scope, {
          characterId: fixture.characterId,
          content: { ...CONTENT, name: other.name },
        }),
      );

      expect(refused.ok).toBe(false);
      if (refused.ok) return;
      expect(refused.error.code).toBe("CONFLICT");
    });

    it("answers NOT_FOUND for a character of another project", async () => {
      const mine = await seedProject("mine");
      const theirs = await seedProject("theirs");
      setActor(ownerId);

      const refused = await runWithActor(ownerId, async () =>
        editCharacter(mine.scope, { characterId: theirs.characterId, content: REWRITTEN }),
      );

      expect(refused.ok).toBe(false);
      if (refused.ok) return;
      expect(refused.error.code).toBe("NOT_FOUND");
    });

    it("records who edited it, through the audit extension, only when it actually writes", async () => {
      const fixture = await seedProject("attributed-edit");
      setActor(ownerId);

      await runWithActor(ownerId, async () =>
        editCharacter(fixture.scope, { characterId: fixture.characterId, content: CONTENT }),
      );

      const afterNoOp = await seam.character.findUniqueOrThrow({
        where: { id: fixture.characterId },
        select: { version: true },
      });
      expect(afterNoOp.version).toBe(1);

      await runWithActor(ownerId, async () =>
        editCharacter(fixture.scope, { characterId: fixture.characterId, content: REWRITTEN }),
      );

      const afterEdit = await seam.character.findUniqueOrThrow({
        where: { id: fixture.characterId },
        select: { updatedById: true, version: true },
      });

      expect(afterEdit.updatedById).toBe(ownerId);
      expect(afterEdit.version).toBe(2);
    });
  });
});
