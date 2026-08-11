/**
 * CAL-091's persistence: the relationship graph of a bible, read whole and
 * written one directed edge at a time — against a real PostgreSQL.
 *
 * What this file exists to prove is the acceptance criterion at the storage
 * level: *une relation asymétrique est représentable*. That is not a property
 * of a screen, it is a property of two rows — one written, its mirror not —
 * surviving a round trip and coming back classified `one-sided` rather than
 * silently completed. A cast of three is the smallest one that can carry the
 * three classifications at once.
 *
 * Cross-owner isolation is proved table by table in
 * `owner-access.integration.test.ts`; it is repeated here for the writers,
 * because a graph write names three foreign keys the caller supplied and
 * `scopedWhere` protects none of them — `requireOwnedRow` does, and a test
 * that never crossed an owner would not notice it missing.
 */

import { describeRelationshipGraph, resolveRelationshipGraph } from "@calepin/bible";
import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import {
  createProjectWithSourceText,
  deleteRelationship,
  editRelationship,
  getRelationshipGraph,
  openProjectScope,
  type ProjectScope,
  writeRelationship,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

/** Synthetic French written for this file (§8). */
const CAST = ["Corentin Maillard", "Élise Fougeray", "Nadia Berthelot"] as const;
const LABEL = "ancien associé de";
const SIDE = "Il lui doit la moitié de ce qu'il n'a jamais remboursé.";

describe("the relationship graph (CAL-091)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();

  let ownerId: string;
  let strangerId: string;

  beforeAll(async () => {
    configureDatabaseClient(seam);

    const [owner, stranger] = await Promise.all([
      prisma.user.create({ data: { email: "relationship-owner@example.test" } }),
      prisma.user.create({ data: { email: "relationship-stranger@example.test" } }),
    ]);

    ownerId = owner.id;
    strangerId = stranger.id;
    setActor(ownerId);
  });

  afterAll(async () => {
    resetDatabaseClient();
    await prisma.$disconnect();
    await seam.$disconnect();
  });

  interface Fixture {
    readonly scope: ProjectScope;
    readonly bibleId: string;
    /** Character ids, in `CAST` order. */
    readonly characters: readonly string[];
  }

  async function seedBible(userId: string, title: string): Promise<Fixture> {
    const project = await runWithActor(userId, async () =>
      createProjectWithSourceText({
        ownerId: userId,
        title,
        sourceText: { content: "Un texte source synthétique pour la fixture." },
      }),
    );

    const scopeResult = await openProjectScope({ ownerId: userId, projectId: project.id });
    if (!scopeResult.ok) throw new Error("the fixture scope was refused");

    // Written directly: nothing in the product creates a bible or a character
    // yet (CLAUDE.md §13), and this file is about the edges between them.
    const bible = await runWithActor(userId, async () =>
      prisma.bible.create({ data: { projectId: project.id }, select: { id: true } }),
    );

    const characters: string[] = [];

    for (const name of CAST) {
      const character = await runWithActor(userId, async () =>
        prisma.character.create({
          data: { bibleId: bible.id, name, importance: "MAIN" },
          select: { id: true },
        }),
      );
      characters.push(character.id);
    }

    return { scope: scopeResult.value, bibleId: bible.id, characters };
  }

  function edge(
    fixture: Fixture,
    from: number,
    to: number,
    type: "FAMILY" | "ALLIANCE" | "RIVALRY" | "PROFESSIONAL" = "PROFESSIONAL",
  ) {
    return {
      bibleId: fixture.bibleId,
      fromCharacterId: fixture.characters[from] ?? "",
      toCharacterId: fixture.characters[to] ?? "",
      type,
      label: LABEL,
      description: SIDE,
    } as const;
  }

  it("reads the whole cast, including characters no edge touches", async () => {
    const fixture = await seedBible(ownerId, "Graphe — casting");

    const graph = await getRelationshipGraph(fixture.scope);

    const names = graph?.cast.map((member) => member.name) ?? [];

    expect([...names].sort()).toEqual([...CAST].sort());
    expect(graph?.relationships).toEqual([]);

    // The read promises a *stable* order, not a particular collation: the
    // screen places nodes by index, so two reads must lay the graph out the
    // same way. Which name PostgreSQL sorts first under its own collation is
    // its business, and asserting a JS `localeCompare` here would only pin
    // this suite to the database's locale.
    const again = await getRelationshipGraph(fixture.scope);

    expect(again?.cast.map((member) => member.name)).toEqual(names);
  });

  it("answers null for a project with no bible", async () => {
    const project = await runWithActor(ownerId, async () =>
      createProjectWithSourceText({
        ownerId,
        title: "Sans bible",
        sourceText: { content: "Un texte source synthétique." },
      }),
    );

    const scope = await openProjectScope({ ownerId, projectId: project.id });
    if (!scope.ok) throw new Error("the fixture scope was refused");

    expect(await getRelationshipGraph(scope.value)).toBeNull();
  });

  it("stores one direction and never its mirror — the acceptance criterion", async () => {
    const fixture = await seedBible(ownerId, "Graphe — sens unique");

    const written = await runWithActor(ownerId, async () =>
      writeRelationship(fixture.scope, edge(fixture, 0, 1, "FAMILY")),
    );

    expect(written.ok).toBe(true);

    const graph = await getRelationshipGraph(fixture.scope);
    const byId = new Map(graph?.cast.map((member) => [member.id, member.name]));
    const pairs = resolveRelationshipGraph(
      (graph?.relationships ?? []).map((relationship) => ({
        fromCharacterName: byId.get(relationship.fromCharacterId) ?? "",
        toCharacterName: byId.get(relationship.toCharacterId) ?? "",
        type: relationship.type,
      })),
    ).pairs;

    expect(graph?.relationships).toHaveLength(1);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.symmetry).toBe("one-sided");
  });

  it("carries both directions of a pair as two rows, and classifies them", async () => {
    const fixture = await seedBible(ownerId, "Graphe — deux sens");

    await runWithActor(ownerId, async () => {
      await writeRelationship(fixture.scope, edge(fixture, 0, 1, "ALLIANCE"));
      await writeRelationship(fixture.scope, edge(fixture, 1, 0, "RIVALRY"));
    });

    const graph = await getRelationshipGraph(fixture.scope);
    const byId = new Map(graph?.cast.map((member) => [member.id, member.name]));
    const described = describeRelationshipGraph(
      (graph?.relationships ?? []).map((relationship) => ({
        fromCharacterName: byId.get(relationship.fromCharacterId) ?? "",
        toCharacterName: byId.get(relationship.toCharacterId) ?? "",
        type: relationship.type,
        label: relationship.label,
        description: relationship.description,
      })),
    );

    expect(graph?.relationships).toHaveLength(2);
    // Both sides declared, different types — the divergence is named, and it
    // is named from rows, not from anything stored beside them.
    expect(described.some((line) => line.includes("alliance") && line.includes("rivalité"))).toBe(
      true,
    );
  });

  it("refuses a second tie of the same type in the same direction", async () => {
    const fixture = await seedBible(ownerId, "Graphe — doublon");

    await runWithActor(ownerId, async () => writeRelationship(fixture.scope, edge(fixture, 0, 1)));
    const again = await runWithActor(ownerId, async () =>
      writeRelationship(fixture.scope, edge(fixture, 0, 1)),
    );

    expect(again.ok).toBe(false);
    if (again.ok) throw new Error("expected a refusal");
    expect(again.error.code).toBe("CONFLICT");
  });

  it("refuses a self-relation before the database check fires", async () => {
    const fixture = await seedBible(ownerId, "Graphe — boucle");

    const written = await runWithActor(ownerId, async () =>
      writeRelationship(fixture.scope, edge(fixture, 0, 0)),
    );

    expect(written.ok).toBe(false);
    if (written.ok) throw new Error("expected a refusal");
    expect(written.error.code).toBe("CONFLICT");
  });

  it("rewrites a tie, and writes nothing for an identical resubmission", async () => {
    const fixture = await seedBible(ownerId, "Graphe — édition");

    const written = await runWithActor(ownerId, async () =>
      writeRelationship(fixture.scope, edge(fixture, 0, 1)),
    );
    if (!written.ok) throw new Error("the fixture edge was refused");

    const unchanged = await runWithActor(ownerId, async () =>
      editRelationship(fixture.scope, {
        relationshipId: written.value.id,
        type: "PROFESSIONAL",
        label: LABEL,
        description: SIDE,
      }),
    );

    expect(unchanged.ok && unchanged.value.updated).toBe(false);

    const changed = await runWithActor(ownerId, async () =>
      editRelationship(fixture.scope, {
        relationshipId: written.value.id,
        type: "MENTORSHIP",
        label: "ancienne élève de",
        description: null,
      }),
    );

    expect(changed.ok && changed.value.updated).toBe(true);

    const graph = await getRelationshipGraph(fixture.scope);
    expect(graph?.relationships[0]).toMatchObject({
      type: "MENTORSHIP",
      label: "ancienne élève de",
      description: null,
    });
  });

  it("refuses to edit or delete a locked tie", async () => {
    const fixture = await seedBible(ownerId, "Graphe — verrou");

    const written = await runWithActor(ownerId, async () =>
      writeRelationship(fixture.scope, edge(fixture, 0, 1)),
    );
    if (!written.ok) throw new Error("the fixture edge was refused");

    await runWithActor(ownerId, async () => {
      await prisma.relationship.update({
        where: { id: written.value.id },
        data: { lockedAt: new Date() },
      });
    });

    const edited = await runWithActor(ownerId, async () =>
      editRelationship(fixture.scope, {
        relationshipId: written.value.id,
        type: "FAMILY",
        label: LABEL,
        description: null,
      }),
    );
    const removed = await runWithActor(ownerId, async () =>
      deleteRelationship(fixture.scope, written.value.id),
    );

    expect(edited.ok).toBe(false);
    expect(removed.ok).toBe(false);
  });

  it("deletes one direction and leaves the other standing", async () => {
    const fixture = await seedBible(ownerId, "Graphe — suppression");

    const forward = await runWithActor(ownerId, async () =>
      writeRelationship(fixture.scope, edge(fixture, 0, 1, "ALLIANCE")),
    );
    await runWithActor(ownerId, async () =>
      writeRelationship(fixture.scope, edge(fixture, 1, 0, "RIVALRY")),
    );
    if (!forward.ok) throw new Error("the fixture edge was refused");

    const removed = await runWithActor(ownerId, async () =>
      deleteRelationship(fixture.scope, forward.value.id),
    );

    expect(removed.ok).toBe(true);

    const graph = await getRelationshipGraph(fixture.scope);
    expect(graph?.relationships).toHaveLength(1);
    expect(graph?.relationships[0]?.type).toBe("RIVALRY");
  });

  describe("across owners", () => {
    it("refuses to write an edge onto another owner's characters", async () => {
      const mine = await seedBible(ownerId, "Graphe — le mien");
      const theirs = await seedBible(strangerId, "Graphe — le leur");

      const written = await runWithActor(ownerId, async () =>
        writeRelationship(mine.scope, {
          bibleId: theirs.bibleId,
          fromCharacterId: theirs.characters[0] ?? "",
          toCharacterId: theirs.characters[1] ?? "",
          type: "FAMILY",
          label: LABEL,
          description: null,
        }),
      );

      expect(written.ok).toBe(false);
      if (written.ok) throw new Error("expected a refusal");
      expect(written.error.code).toBe("NOT_FOUND");
    });

    it("refuses to smuggle one of another owner's characters into an edge", async () => {
      const mine = await seedBible(ownerId, "Graphe — mixte");
      const theirs = await seedBible(strangerId, "Graphe — voisin");

      const written = await runWithActor(ownerId, async () =>
        writeRelationship(mine.scope, {
          bibleId: mine.bibleId,
          fromCharacterId: mine.characters[0] ?? "",
          toCharacterId: theirs.characters[0] ?? "",
          type: "FAMILY",
          label: LABEL,
          description: null,
        }),
      );

      expect(written.ok).toBe(false);
      if (written.ok) throw new Error("expected a refusal");
      expect(written.error.code).toBe("NOT_FOUND");
    });

    it("refuses to edit or delete another owner's edge, and does not say it exists", async () => {
      const mine = await seedBible(ownerId, "Graphe — à moi");
      const theirs = await seedBible(strangerId, "Graphe — à eux");

      const written = await runWithActor(strangerId, async () =>
        writeRelationship(theirs.scope, edge(theirs, 0, 1)),
      );
      if (!written.ok) throw new Error("the fixture edge was refused");

      const edited = await runWithActor(ownerId, async () =>
        editRelationship(mine.scope, {
          relationshipId: written.value.id,
          type: "FAMILY",
          label: LABEL,
          description: null,
        }),
      );
      const removed = await runWithActor(ownerId, async () =>
        deleteRelationship(mine.scope, written.value.id),
      );

      if (edited.ok || removed.ok) throw new Error("expected two refusals");
      expect(edited.error.code).toBe("NOT_FOUND");
      expect(removed.error.code).toBe("NOT_FOUND");

      // And the row is still there, untouched.
      const graph = await getRelationshipGraph(theirs.scope);
      expect(graph?.relationships).toHaveLength(1);
    });
  });
});
