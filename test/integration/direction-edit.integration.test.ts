/**
 * CAL-085's two writes: rewriting a proposed direction by hand, and writing
 * one entirely from scratch — against a real PostgreSQL.
 *
 * The origin-transition rule (`PROPOSED`/`EDITED` → `EDITED`, `USER_WRITTEN`
 * stays `USER_WRITTEN`) and the no-op short circuit are properties of the
 * write, so they are proved here rather than at the domain layer, the same
 * split `direction-discard.integration.test.ts` draws for CAL-083.
 *
 * Cross-owner isolation is proved once, table by table, in
 * `owner-access.integration.test.ts`; the negative half is repeated here only
 * where the refusal has its own remedy — a discarded direction is `CONFLICT`,
 * a stranger's is `NOT_FOUND`.
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import {
  createProjectWithSourceText,
  type DirectionContentInput,
  discardDirection,
  editDirection,
  getDirectionsForComparison,
  openProjectScope,
  type ProjectScope,
  writeUserDirection,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

const NARRATIVE_ENGINE = {
  conflictNature: "interpersonal",
  tensionSource: "pursuit",
  protagonistStake: "life",
  shiftTrigger: "revelation",
  resolutionNature: "victory",
};

/** The same engine, its keys built in a different order — see the "no false positive" test below. */
const NARRATIVE_ENGINE_REORDERED = {
  resolutionNature: "victory",
  shiftTrigger: "revelation",
  protagonistStake: "life",
  tensionSource: "pursuit",
  conflictNature: "interpersonal",
};

/** Synthetic French sentences written for this file (§8). */
const CONTENT: DirectionContentInput = {
  workingTitle: "première",
  developedPremise: "fixture",
  dominantGenre: "fixture",
  mainConflict: "fixture",
  protagonistArc: "fixture",
  newStakes: ["un premier enjeu", "un second enjeu"],
  charactersToIntroduce: [],
  endingNature: "fixture",
  mainRisks: ["un premier risque", "un second risque"],
  elementsKeptFromSource: ["un élément conservé"],
  elementsTransformed: ["un élément transformé"],
  novelPotentialAssessment: "fixture",
  narrativeEngine: NARRATIVE_ENGINE,
};

const REWRITTEN: DirectionContentInput = {
  ...CONTENT,
  workingTitle: "première, réécrite",
  developedPremise: "une prémisse réécrite par l'autrice",
};

describe("editing and writing a direction by hand (CAL-085)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();

  let ownerId: string;

  beforeAll(async () => {
    configureDatabaseClient(seam);

    const owner = await prisma.user.create({ data: { email: "direction-edit@example.test" } });
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
    readonly projectId: string;
    readonly directionId: string;
  }

  function directionData(
    projectId: string,
    overrides: {
      readonly origin?: "PROPOSED" | "EDITED" | "USER_WRITTEN";
      readonly isCanonical?: boolean;
    } = {},
  ) {
    return {
      projectId,
      workingTitle: CONTENT.workingTitle,
      developedPremise: CONTENT.developedPremise,
      dominantGenre: CONTENT.dominantGenre,
      mainConflict: CONTENT.mainConflict,
      protagonistArc: CONTENT.protagonistArc,
      newStakes: [...CONTENT.newStakes],
      charactersToIntroduce: [...CONTENT.charactersToIntroduce],
      endingNature: CONTENT.endingNature,
      mainRisks: [...CONTENT.mainRisks],
      elementsKeptFromSource: [...CONTENT.elementsKeptFromSource],
      elementsTransformed: [...CONTENT.elementsTransformed],
      novelPotentialAssessment: CONTENT.novelPotentialAssessment,
      narrativeEngine: NARRATIVE_ENGINE,
      origin: overrides.origin ?? ("PROPOSED" as const),
      isCanonical: overrides.isCanonical ?? false,
    };
  }

  async function seedProject(
    label: string,
    overrides?: Parameters<typeof directionData>[1],
  ): Promise<Fixture> {
    setActor(ownerId);

    const project = await runWithActor(ownerId, async () =>
      createProjectWithSourceText({ ownerId, title: label, sourceText: { content: "fixture" } }),
    );

    const opened = await openProjectScope({ ownerId, projectId: project.id });
    if (!opened.ok) throw new Error("the fixture could not open a scope on its own project");

    const direction = await prisma.creativeDirection.create({
      data: directionData(project.id, overrides),
      select: { id: true },
    });

    return { scope: opened.value, projectId: project.id, directionId: direction.id };
  }

  describe("editDirection", () => {
    it("promotes a proposed direction to EDITED on a real change", async () => {
      const fixture = await seedProject("proposed-to-edited");
      setActor(ownerId);

      const edited = await runWithActor(ownerId, async () =>
        editDirection(fixture.scope, { directionId: fixture.directionId, content: REWRITTEN }),
      );

      expect(edited.ok).toBe(true);
      if (!edited.ok) return;

      expect(edited.value).toEqual({ updated: true, origin: "EDITED" });

      const directions = await getDirectionsForComparison(fixture.scope);
      const written = directions.find((direction) => direction.id === fixture.directionId);

      expect(written?.origin).toBe("EDITED");
      expect(written?.workingTitle).toBe("première, réécrite");
    });

    it("writes nothing and keeps the origin on an identical resubmission", async () => {
      const fixture = await seedProject("no-op-resubmit");
      setActor(ownerId);

      const before = await seam.creativeDirection.findUniqueOrThrow({
        where: { id: fixture.directionId },
      });

      const edited = await runWithActor(ownerId, async () =>
        editDirection(fixture.scope, { directionId: fixture.directionId, content: CONTENT }),
      );

      expect(edited.ok).toBe(true);
      if (!edited.ok) return;

      expect(edited.value).toEqual({ updated: false, origin: "PROPOSED" });

      const after = await seam.creativeDirection.findUniqueOrThrow({
        where: { id: fixture.directionId },
      });

      expect(after).toEqual(before);
    });

    // The whole reason `sameNarrativeEngine` sorts entries instead of
    // stringifying the object directly: PostgreSQL's jsonb does not promise
    // to preserve the key order a value was written in, so a submission built
    // with the same axes in a different order must still read as unchanged.
    it("treats a reordered narrative engine as unchanged", async () => {
      const fixture = await seedProject("reordered-engine");
      setActor(ownerId);

      const edited = await runWithActor(ownerId, async () =>
        editDirection(fixture.scope, {
          directionId: fixture.directionId,
          content: { ...CONTENT, narrativeEngine: NARRATIVE_ENGINE_REORDERED },
        }),
      );

      expect(edited.ok).toBe(true);
      if (!edited.ok) return;

      expect(edited.value).toEqual({ updated: false, origin: "PROPOSED" });
    });

    it("keeps EDITED as EDITED across a second edit", async () => {
      const fixture = await seedProject("edited-stays-edited", { origin: "EDITED" });
      setActor(ownerId);

      const edited = await runWithActor(ownerId, async () =>
        editDirection(fixture.scope, { directionId: fixture.directionId, content: REWRITTEN }),
      );

      expect(edited.ok).toBe(true);
      if (!edited.ok) return;

      expect(edited.value.origin).toBe("EDITED");
    });

    it("keeps USER_WRITTEN as USER_WRITTEN across an edit — the origin never reverts", async () => {
      const fixture = await seedProject("user-written-stays", { origin: "USER_WRITTEN" });
      setActor(ownerId);

      const edited = await runWithActor(ownerId, async () =>
        editDirection(fixture.scope, { directionId: fixture.directionId, content: REWRITTEN }),
      );

      expect(edited.ok).toBe(true);
      if (!edited.ok) return;

      expect(edited.value.origin).toBe("USER_WRITTEN");
    });

    // The opposite of discardDirection's own rule: only discarding the
    // canonical direction is blocked, not refining its wording.
    it("allows editing the canonical direction", async () => {
      const fixture = await seedProject("canonical-editable", { isCanonical: true });
      setActor(ownerId);

      const edited = await runWithActor(ownerId, async () =>
        editDirection(fixture.scope, { directionId: fixture.directionId, content: REWRITTEN }),
      );

      expect(edited.ok).toBe(true);
    });

    // Editing a written-off direction would be an implicit un-discard —
    // CAL-083's own doctrine, extended here.
    it("refuses to edit a discarded direction", async () => {
      const fixture = await seedProject("discarded-not-editable");
      setActor(ownerId);

      await runWithActor(ownerId, async () =>
        discardDirection(fixture.scope, { directionId: fixture.directionId, reason: null }),
      );

      const refused = await runWithActor(ownerId, async () =>
        editDirection(fixture.scope, { directionId: fixture.directionId, content: REWRITTEN }),
      );

      expect(refused.ok).toBe(false);
      if (refused.ok) return;

      expect(refused.error.code).toBe("CONFLICT");
    });

    it("answers NOT_FOUND for a direction of another project", async () => {
      const mine = await seedProject("mine");
      const theirs = await seedProject("theirs");
      setActor(ownerId);

      const refused = await runWithActor(ownerId, async () =>
        editDirection(mine.scope, { directionId: theirs.directionId, content: REWRITTEN }),
      );

      expect(refused.ok).toBe(false);
      if (refused.ok) return;

      expect(refused.error.code).toBe("NOT_FOUND");
    });

    it("records who edited it, through the audit extension, only when it actually writes", async () => {
      const fixture = await seedProject("attributed-edit");
      setActor(ownerId);

      await runWithActor(ownerId, async () =>
        editDirection(fixture.scope, { directionId: fixture.directionId, content: CONTENT }),
      );

      const afterNoOp = await seam.creativeDirection.findUniqueOrThrow({
        where: { id: fixture.directionId },
        select: { version: true },
      });

      expect(afterNoOp.version).toBe(1);

      await runWithActor(ownerId, async () =>
        editDirection(fixture.scope, { directionId: fixture.directionId, content: REWRITTEN }),
      );

      const afterEdit = await seam.creativeDirection.findUniqueOrThrow({
        where: { id: fixture.directionId },
        select: { updatedById: true, version: true },
      });

      expect(afterEdit.updatedById).toBe(ownerId);
      expect(afterEdit.version).toBe(2);
    });
  });

  describe("writeUserDirection", () => {
    it("creates a direction with origin USER_WRITTEN, not canonical", async () => {
      const fixture = await seedProject("host-for-user-direction");
      setActor(ownerId);

      const written = await runWithActor(ownerId, async () =>
        writeUserDirection(fixture.scope, {
          content: { ...CONTENT, workingTitle: "ma direction" },
        }),
      );

      expect(written.ok).toBe(true);
      if (!written.ok) return;

      const directions = await getDirectionsForComparison(fixture.scope);
      const created = directions.find((direction) => direction.id === written.value.id);

      expect(created).toBeDefined();
      expect(created?.origin).toBe("USER_WRITTEN");
      expect(created?.isCanonical).toBe(false);
      expect(created?.discardedAt).toBeNull();
      expect(created?.workingTitle).toBe("ma direction");

      // Alongside the proposed one already seeded for the project — a
      // user-written direction adds to the set rather than replacing it.
      expect(directions).toHaveLength(2);
    });

    it("records the author, through the audit extension", async () => {
      const fixture = await seedProject("attributed-write");
      setActor(ownerId);

      const written = await runWithActor(ownerId, async () =>
        writeUserDirection(fixture.scope, { content: CONTENT }),
      );

      expect(written.ok).toBe(true);
      if (!written.ok) return;

      const row = await seam.creativeDirection.findUniqueOrThrow({
        where: { id: written.value.id },
        select: { updatedById: true, version: true },
      });

      expect(row.updatedById).toBe(ownerId);
      expect(row.version).toBe(1);
    });

    it("answers NOT_FOUND for a scope that does not name a real project", async () => {
      setActor(ownerId);

      const forged = {
        [Symbol.for("calepin.ProjectScope")]: true,
        projectId: "does-not-exist",
        ownerId,
      } as unknown as ProjectScope;

      const written = await runWithActor(ownerId, async () =>
        writeUserDirection(forged, { content: CONTENT }),
      );

      expect(written.ok).toBe(false);
      if (written.ok) return;

      expect(written.error.code).toBe("NOT_FOUND");
    });
  });
});
