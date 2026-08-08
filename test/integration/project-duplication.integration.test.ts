/**
 * CAL-035's acceptance criterion, against a real PostgreSQL: **the duplication
 * copies the whole narrative tree, and no row of the copy references a row of
 * the original.**
 *
 * The criterion is asserted the widest way there is. Every identifier of the
 * source graph is collected — thirty-four tables' worth, plus the project's own
 * — and then every row of the copy is serialised and searched for every one of
 * them. That catches a foreign key the plan forgot, a composite key half
 * remapped, and a soft reference no constraint protects, all with the same
 * assertion, because it never asks *which* column might point back.
 *
 * The negative would pass over an empty copy, so it never stands alone: each
 * table's row count in the copy is compared to the source's first, and the
 * source graph is required to have seeded all of them. The last suite is the
 * behavioural form of the same criterion — deleting the copy leaves the
 * original whole, which no amount of shared rows would survive.
 *
 * Every string written here is technical (CLAUDE.md §9). What is under test is
 * the topology of a graph; it needs no prose.
 */

import { runWithActor } from "@calepin/shared/audit";
import { configureDatabaseClient, resetDatabaseClient } from "@calepin/shared/database";
import {
  computeProjectAggregates,
  delegateName,
  deleteProject,
  DUPLICATED_MODEL_NAMES,
  duplicateProject,
  openProjectScope,
  PROJECT_OWNED_MODEL_NAMES,
  type ProjectOwnedModelName,
  type ProjectScope,
  scopedWhere,
  UNDUPLICATED_MODELS,
} from "@calepin/shared/repository";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";
import { createProjectGraph, type ProjectGraph } from "./project-graph";

const UNDUPLICATED_MODEL_NAMES = Object.keys(UNDUPLICATED_MODELS) as ProjectOwnedModelName[];

interface ReadingDelegate {
  findMany: (args: { where: object }) => Promise<Record<string, unknown>[]>;
  count: (args: { where: object }) => Promise<number>;
}

describe("project duplication (CAL-035)", () => {
  const { prisma, setActor } = createAuditedClient();
  const seam = new PrismaClient();

  let source: ProjectGraph;
  let sourceScope: ProjectScope;
  let copyScope: ProjectScope;
  let copyId: string;
  /** Every identifier the original owns — what the copy must not hold. */
  let sourceIds: string[];

  function delegateOf(model: ProjectOwnedModelName): ReadingDelegate {
    const client: unknown = seam;

    return (client as Record<string, ReadingDelegate>)[delegateName(model)] as ReadingDelegate;
  }

  async function rowsOf(
    model: ProjectOwnedModelName,
    scope: ProjectScope,
  ): Promise<Record<string, unknown>[]> {
    return delegateOf(model).findMany({ where: scopedWhere(model, scope) });
  }

  async function countOf(model: ProjectOwnedModelName, scope: ProjectScope): Promise<number> {
    return delegateOf(model).count({ where: scopedWhere(model, scope) });
  }

  async function openScope(projectId: string): Promise<ProjectScope> {
    const opened = await openProjectScope({ ownerId: source.ownerId, projectId });
    if (!opened.ok) throw opened.error;

    return opened.value;
  }

  /**
   * The links `createProjectGraph` does not draw, added here because each is a
   * remapping the copier could get wrong on its own:
   *
   *   - an event anchored to another event — a model referencing *itself*,
   *     which is the case that has to resolve inside one insert;
   *   - a fact ended by an event, a chapter outline pointing at a character and
   *     a place, a thread closing on a chapter — references that cross from one
   *     branch of the graph into another rather than running down it;
   *   - an analysis revision produced by a generation, and a second chapter
   *     revision produced by the same one — the two columns pointing at a model
   *     the copy leaves behind, which must come out null rather than pointing
   *     at the original's generation.
   */
  async function drawTheHardEdges(graph: ProjectGraph): Promise<void> {
    setActor(graph.ownerId);

    await prisma.timelineEvent.create({
      data: {
        bibleId: graph.rows.Bible,
        name: "duplication-following-event",
        category: "NARRATED",
        precedingEventId: graph.rows.TimelineEvent,
        daysAfterPreceding: 3,
        durationPrecision: "DAY",
      },
    });

    await prisma.canonFact.update({
      where: { id: graph.rows.CanonFact },
      data: { validity: "UNTIL_EVENT", invalidatedByEventId: graph.rows.TimelineEvent },
    });

    await prisma.chapterOutline.update({
      where: { id: graph.rows.ChapterOutline },
      data: { focalCharacterId: graph.rows.Character, placeId: graph.rows.Place },
    });

    const closing = await prisma.chapter.findFirstOrThrow({
      where: { outlineId: graph.rows.Outline, id: { not: graph.rows.Chapter } },
    });
    await prisma.thread.update({
      where: { id: graph.rows.Thread },
      data: { closingChapterId: closing.id },
    });

    await prisma.analysisSectionRevision.update({
      where: { id: graph.rows.AnalysisSectionRevision },
      data: { generationId: graph.rows.Generation },
    });

    await prisma.chapterRevision.create({
      data: {
        chapterId: graph.rows.Chapter,
        revisionNumber: 2,
        origin: "EDITED",
        content: "fixture fixture",
        wordCount: 2,
        createdById: graph.ownerId,
        generationId: graph.rows.Generation,
      },
    });
  }

  /** Every identifier of every row the source project owns, its own included. */
  async function collectSourceIds(): Promise<string[]> {
    const collected = [source.projectId];

    for (const model of PROJECT_OWNED_MODEL_NAMES) {
      if (model === "Project") continue;

      for (const row of await rowsOf(model, sourceScope)) {
        const id: unknown = row["id"];
        if (typeof id === "string") collected.push(id);
      }
    }

    return collected;
  }

  beforeAll(async () => {
    configureDatabaseClient(seam);

    source = await createProjectGraph(prisma, setActor, "duplication-source");
    await drawTheHardEdges(source);

    sourceScope = await openScope(source.projectId);
    sourceIds = await collectSourceIds();

    const duplicated = await runWithActor(source.ownerId, async () =>
      duplicateProject(sourceScope, { title: "duplication-copy" }),
    );
    if (!duplicated.ok) throw duplicated.error;

    copyId = duplicated.value.id;
    copyScope = await openScope(copyId);
  });

  afterAll(async () => {
    resetDatabaseClient();
    await prisma.$disconnect();
    await seam.$disconnect();
  });

  describe("the graph the criterion is asserted against", () => {
    // Without this, "the copy holds no identifier of the original" would be
    // true of a copy that is empty, and of a source that is.
    it.each(PROJECT_OWNED_MODEL_NAMES)("seeded a row of %s in the original", async (model) => {
      expect(await countOf(model, sourceScope)).toBeGreaterThan(0);
    });

    it("collected every identifier the original owns", () => {
      // Thirty-four tables plus the project, plus the six rows the hard edges
      // added — the count is asserted so a fixture that stops seeding a table
      // cannot quietly shrink what the criterion is checked against.
      expect(sourceIds.length).toBeGreaterThanOrEqual(PROJECT_OWNED_MODEL_NAMES.length);
      expect(new Set(sourceIds).size).toBe(sourceIds.length);
    });
  });

  describe("the criterion — no reference to the original, anywhere", () => {
    it.each(DUPLICATED_MODEL_NAMES)("holds no identifier of the original in %s", async (model) => {
      const rows = await rowsOf(model, copyScope);
      expect(rows.length).toBeGreaterThan(0);

      for (const row of rows) {
        // Every column at once, whatever its type: a foreign key, a composite
        // key's discriminator, a soft reference no constraint declares. What is
        // searched is the serialised row, so a column added later is covered
        // the day it is added.
        const serialised = JSON.stringify(row);

        for (const id of sourceIds) {
          expect(serialised.includes(id), `${model} references ${id}`).toBe(false);
        }
      }
    });

    it("holds no identifier of the original on the project row itself", async () => {
      const copy = await seam.project.findUniqueOrThrow({ where: { id: copyId } });

      for (const id of sourceIds) {
        expect(JSON.stringify(copy).includes(id)).toBe(false);
      }
    });

    it("nulls the two columns that named a generation", async () => {
      const [revision] = await rowsOf("AnalysisSectionRevision", copyScope);
      const chapterRevisions = await rowsOf("ChapterRevision", copyScope);

      expect(revision?.["generationId"]).toBeNull();
      expect(chapterRevisions.map((row) => row["generationId"])).toEqual([null, null]);
    });
  });

  describe("the copy is complete", () => {
    it.each(DUPLICATED_MODEL_NAMES)("copied every row of %s", async (model) => {
      expect(await countOf(model, copyScope)).toBe(await countOf(model, sourceScope));
    });

    it.each(UNDUPLICATED_MODEL_NAMES)("left every row of %s behind", async (model) => {
      expect(await countOf(model, sourceScope)).toBeGreaterThan(0);
      expect(await countOf(model, copyScope)).toBe(0);
    });

    it("keeps the narrative content of every copied row", async () => {
      const [character] = await rowsOf("Character", copyScope);
      const [rule] = await rowsOf("WorldRule", copyScope);

      expect(character?.["name"]).toBe("duplication-source-first");
      expect(rule?.["name"]).toBe("duplication-source-rule");
    });

    it("keeps the project's own attributes, under the title it was given", async () => {
      const original = await seam.project.findUniqueOrThrow({ where: { id: source.projectId } });
      const copy = await seam.project.findUniqueOrThrow({ where: { id: copyId } });

      expect(copy.title).toBe("duplication-copy");
      expect(copy.userId).toBe(original.userId);
      expect(copy.language).toBe(original.language);
      expect(copy.targetLength).toBe(original.targetLength);
      expect(copy.targetAudience).toBe(original.targetAudience);
      expect(copy.freedomLevel).toBe(original.freedomLevel);
    });
  });

  describe("the references inside the copy point at the copy", () => {
    it("links a relationship to the two copied characters", async () => {
      const characters = await rowsOf("Character", copyScope);
      const [relationship] = await rowsOf("Relationship", copyScope);
      const ids = characters.map((row) => row["id"]);

      expect(ids).toContain(relationship?.["fromCharacterId"]);
      expect(ids).toContain(relationship?.["toCharacterId"]);
      expect(relationship?.["fromCharacterId"]).not.toBe(relationship?.["toCharacterId"]);
    });

    it("anchors the copied event chain to the copied event", async () => {
      const events = await rowsOf("TimelineEvent", copyScope);
      const anchor = events.find((row) => row["name"] === "duplication-source-event");
      const follower = events.find((row) => row["name"] === "duplication-following-event");

      expect(anchor?.["id"]).toBeTruthy();
      expect(follower?.["precedingEventId"]).toBe(anchor?.["id"]);
    });

    it("keeps a fact's boundary event inside the copy", async () => {
      const [fact] = await rowsOf("CanonFact", copyScope);
      const anchor = (await rowsOf("TimelineEvent", copyScope)).find(
        (row) => row["name"] === "duplication-source-event",
      );

      expect(fact?.["invalidatedByEventId"]).toBe(anchor?.["id"]);
    });

    it("keeps the chapter outline's focal character and place inside the copy", async () => {
      const [outline] = await rowsOf("ChapterOutline", copyScope);
      const [character] = await rowsOf("Character", copyScope);
      const [place] = await rowsOf("Place", copyScope);

      expect(outline?.["focalCharacterId"]).toBe(character?.["id"]);
      expect(outline?.["placeId"]).toBe(place?.["id"]);
    });

    it("opens and closes the copied thread on copied chapters", async () => {
      const chapters = (await rowsOf("Chapter", copyScope)).map((row) => row["id"]);
      const [thread] = await rowsOf("Thread", copyScope);

      expect(chapters).toContain(thread?.["openingChapterId"]);
      expect(chapters).toContain(thread?.["closingChapterId"]);
      expect(thread?.["openingChapterId"]).not.toBe(thread?.["closingChapterId"]);
    });
  });

  describe("the copy's own life starts now", () => {
    it("credits every copied row to whoever asked for the duplication", async () => {
      const [character] = await rowsOf("Character", copyScope);

      expect(character?.["updatedById"]).toBe(source.ownerId);
      // A new row, at its first state — never the original's state counter.
      expect(character?.["version"]).toBe(1);
    });

    it("reconciles the copy's derived state against the rows it received", async () => {
      const computed = await computeProjectAggregates(copyScope);
      if (!computed.ok) throw computed.error;

      const copy = await seam.project.findUniqueOrThrow({ where: { id: copyId } });

      expect(copy.writtenChapterCount).toBe(computed.value.writtenChapterCount);
      expect(copy.totalWordCount).toBe(computed.value.totalWordCount);
      // One chapter carrying revisions, of two planned: *rédaction en cours*,
      // read off the rows rather than copied from the original's column.
      expect(copy.writtenChapterCount).toBe(1);
      expect(copy.status).toBe("WRITING_IN_PROGRESS");
    });

    it("never carries the original's archived state", async () => {
      const copy = await seam.project.findUniqueOrThrow({ where: { id: copyId } });

      expect(copy.archivedAt).toBeNull();
    });
  });

  describe("the two projects are independent", () => {
    it("duplicates the same project again without colliding", async () => {
      const second = await runWithActor(source.ownerId, async () =>
        duplicateProject(sourceScope, { title: "duplication-copy-again" }),
      );
      if (!second.ok) throw second.error;

      const secondScope = await openScope(second.value.id);

      expect(second.value.id).not.toBe(copyId);
      expect(await countOf("Character", secondScope)).toBe(await countOf("Character", sourceScope));
    });

    it("defaults the copy's title to the original's", async () => {
      const untitled = await runWithActor(source.ownerId, async () =>
        duplicateProject(sourceScope),
      );
      if (!untitled.ok) throw untitled.error;

      expect(untitled.value.title).toBe("duplication-source");
    });

    it("leaves the original whole when the copy is deleted", async () => {
      // The behavioural form of the criterion. A shared row would be dragged
      // out of the original by the copy's cascade, and the counts below are
      // what would notice.
      const before = await Promise.all(
        PROJECT_OWNED_MODEL_NAMES.map(async (model) => countOf(model, sourceScope)),
      );

      const disposable = await runWithActor(source.ownerId, async () =>
        duplicateProject(sourceScope, { title: "duplication-disposable" }),
      );
      if (!disposable.ok) throw disposable.error;

      const removed = await deleteProject(await openScope(disposable.value.id));
      expect(removed.ok).toBe(true);

      const after = await Promise.all(
        PROJECT_OWNED_MODEL_NAMES.map(async (model) => countOf(model, sourceScope)),
      );

      expect(after).toEqual(before);
    });
  });
});
