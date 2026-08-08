/**
 * CAL-022's acceptance criterion, against a real PostgreSQL: **no important
 * entity can be written without an author of the modification.**
 *
 * It is asserted twice, because one mechanism would not be enough. The Prisma
 * extension refuses the write before it leaves the process — readable, early,
 * and the same failure whichever model is being written. The `NOT NULL` column
 * refuses it at the database — unconditional, and reached by the two paths no
 * client extension can see: a nested write and raw SQL.
 */

import {
  AUDIT_AUTHOR_COLUMN,
  AUDIT_UNATTRIBUTED,
  AUDITED_MODEL_NAMES,
  AUDITED_MODELS,
  auditExtension,
  runWithActor,
} from "@calepin/shared/audit";
import { PrismaClient } from "@prisma/client";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuditedClient } from "./audited-client";

/**
 * The client delegate for a model, reached by name.
 *
 * A cast, deliberately and only here: the point of this suite is to iterate the
 * registry rather than to name twenty-six delegates by hand, and a list written
 * by hand is exactly the coverage gap the task exists to close.
 */
function delegateOf(client: object, model: string) {
  const property = model.charAt(0).toLowerCase() + model.slice(1);
  const delegate = (
    client as unknown as Record<string, { create: (args: unknown) => Promise<unknown> } | undefined>
  )[property];

  // A registry entry naming a model the client does not expose is a drift the
  // schema test would already have caught; failing here says so out loud rather
  // than reporting an unhelpful "cannot read property of undefined".
  if (!delegate) throw new Error(`no Prisma delegate for the audited model ${model}`);

  return delegate;
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

describe("audit fields", () => {
  const { prisma, setActor } = createAuditedClient();
  /** A second client with no actor anywhere: neither injected nor ambient. */
  const unattributed = new PrismaClient().$extends(auditExtension());

  let authorId = "";
  let secondAuthorId = "";
  let projectId = "";

  beforeAll(async () => {
    const author = await prisma.user.create({
      data: { email: "audit-fields@example.test", name: "Test User" },
    });
    authorId = author.id;
    setActor(author.id);

    const second = await prisma.user.create({
      data: { email: "audit-fields-second@example.test", name: "Second User" },
    });
    secondAuthorId = second.id;

    const project = await prisma.project.create({
      data: { title: "audit-fields", userId: author.id },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await unattributed.$disconnect();
  });

  describe("no important entity is writable without an author", () => {
    // The criterion, model by model. The write never reaches the database: the
    // extension refuses it while composing the arguments, which is why no
    // fixture row is needed to prove it for a model this suite never populates.
    it.each(AUDITED_MODEL_NAMES)("refuses a create on %s", async (model) => {
      await expect(delegateOf(unattributed, model).create({ data: {} })).rejects.toMatchObject({
        code: "AUDIT_ACTOR_REQUIRED",
        category: "internal",
        fieldPath: `${model}.create`,
      });
    });

    it("refuses it inside an actor scope that names nobody, not just outside one", async () => {
      await expect(
        runWithActor("", () =>
          unattributed.project.create({ data: { title: "x", userId: authorId } }),
        ),
      ).rejects.toMatchObject({ code: "AUDIT_ACTOR_REQUIRED" });
    });

    // The half the extension cannot cover. `updatedById` is NOT NULL on every
    // audited table, so a nested write and a raw INSERT are refused by
    // PostgreSQL rather than by a rule someone has to remember to apply.
    it("declares the column NOT NULL on every audited table", async () => {
      const { rows } = await rawQuery(
        `SELECT table_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public' AND column_name = $1`,
        [AUDIT_AUTHOR_COLUMN],
      );

      const nullability = new Map(
        rows.map((row: { table_name: string; is_nullable: string }) => [
          row.table_name,
          row.is_nullable,
        ]),
      );
      const expected = AUDITED_MODEL_NAMES.map((model) => AUDITED_MODELS[model].table);

      expect([...nullability.keys()].sort()).toEqual([...expected].sort());
      expect([...new Set(nullability.values())]).toEqual(["NO"]);
    });

    // The sentinel default takes the column out of the caller's contract — see
    // the schema header. What matters is that it is a value nothing can keep:
    // the write lands on the foreign key, which names it.
    it("is refused by PostgreSQL when the write goes around Prisma altogether", async () => {
      await expect(
        rawQuery(
          `INSERT INTO "projects" ("id", "userId", "title", "updatedAt")
           VALUES ('audit_raw_insert', $1, 'raw', now())`,
          [authorId],
        ),
      ).rejects.toThrow(new RegExp(`projects_updatedById_fkey|${AUDIT_UNATTRIBUTED}`));
    });

    it("keeps the sentinel from ever becoming a real author", async () => {
      await expect(
        rawQuery(
          `INSERT INTO "users" ("id", "email", "name", "updatedAt")
                  VALUES ($1, 'sentinel@example.test', 'Sentinel', now())`,
          [AUDIT_UNATTRIBUTED],
        ),
      ).rejects.toThrow(/users_id_attributable_check/);
    });

    it("is refused by PostgreSQL when the author is nulled after the fact", async () => {
      await expect(
        rawQuery(`UPDATE "projects" SET "updatedById" = NULL WHERE "id" = $1`, [projectId]),
      ).rejects.toThrow(/null value in column "updatedById"/);
    });
  });

  describe("what the extension writes", () => {
    it("credits the actor and starts the count at one", async () => {
      const created = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

      expect(created.updatedById).toBe(authorId);
      expect(created.version).toBe(1);
      expect(created.createdAt).toBeInstanceOf(Date);
    });

    it("re-credits and counts on every modification", async () => {
      const project = await prisma.project.create({
        data: { title: "counted", userId: authorId },
      });

      setActor(secondAuthorId);
      const once = await prisma.project.update({
        where: { id: project.id },
        data: { title: "counted twice" },
      });
      const twice = await prisma.project.update({
        where: { id: project.id },
        data: { title: "counted three times" },
      });
      setActor(authorId);

      expect(project.updatedById).toBe(authorId);
      expect(once.updatedById).toBe(secondAuthorId);
      expect(once.version).toBe(2);
      expect(twice.version).toBe(3);
      // The timestamps move with it, which is what makes the counter a second
      // reading of the same fact rather than an independent one.
      expect(twice.updatedAt.getTime()).toBeGreaterThanOrEqual(project.updatedAt.getTime());
    });

    it("takes the ambient scope when no resolver was injected", async () => {
      const project = await runWithActor(secondAuthorId, async () =>
        unattributed.project.create({ data: { title: "ambient", userId: authorId } }),
      );

      expect(project.updatedById).toBe(secondAuthorId);
    });

    // A Prisma call is a lazy promise: handing it out of the scope unawaited
    // executes it outside. The write is refused rather than written to the
    // wrong author, which is the failure mode this design has to have.
    it("refuses, rather than misattributes, a write awaited outside its scope", async () => {
      const pending = runWithActor(secondAuthorId, () =>
        unattributed.project.create({ data: { title: "escaped", userId: authorId } }),
      );

      await expect(pending).rejects.toMatchObject({ code: "AUDIT_ACTOR_REQUIRED" });
    });

    it("lets a caller name the author itself — the replay and restore path", async () => {
      const project = await prisma.project.create({
        data: { title: "explicit", userId: authorId, updatedById: secondAuthorId },
      });

      expect(project.updatedById).toBe(secondAuthorId);
    });

    it("stamps a model nobody has written by hand, through the same registry", async () => {
      const bible = await prisma.bible.create({ data: { projectId } });
      const identity = await prisma.bibleIdentity.create({
        data: {
          bibleId: bible.id,
          workingTitle: "fixture",
          genre: "fixture",
          subGenre: "fixture",
          tone: "fixture",
          narrativePromise: "fixture",
          centralQuestion: "fixture",
          endingNature: "fixture",
        },
      });

      expect(bible.updatedById).toBe(authorId);
      expect(identity.updatedById).toBe(authorId);
      expect(identity.version).toBe(1);
    });
  });

  describe("the trail survives what the schema does to it", () => {
    // The property that makes the delete below work at any cascade depth.
    // Asserted rather than described, because it is invisible in schema.prisma:
    // Prisma cannot express deferrability, so the migration writes these
    // foreign keys by hand and nothing else would notice their loss.
    it("defers every audit foreign key to commit", async () => {
      const { rows } = await rawQuery(
        `SELECT conrelid::regclass::text AS table_name, condeferrable, condeferred
           FROM pg_constraint
          WHERE contype = 'f' AND conname LIKE '%_updatedById_fkey'`,
      );

      const expected = AUDITED_MODEL_NAMES.map((model) => AUDITED_MODELS[model].table);

      expect(rows).toHaveLength(expected.length);
      expect(
        rows.every(
          (row: { condeferrable: boolean; condeferred: boolean }) =>
            row.condeferrable && row.condeferred,
        ),
      ).toBe(true);
    });

    // Probed before the referential action was chosen, and asserted here so the
    // justification in the schema header stays true: RESTRICT refused this
    // delete outright, NO ACTION alone refused it at the second level of
    // cascade, and only deferring to commit holds.
    it("lets an account be deleted, cascade and all", async () => {
      const owner = await prisma.user.create({
        data: { email: "audit-fields-owner@example.test", name: "Owner" },
      });
      setActor(owner.id);
      const project = await prisma.project.create({
        data: { title: "owned", userId: owner.id },
      });
      await prisma.bible.create({ data: { projectId: project.id } });
      setActor(authorId);

      await expect(prisma.user.delete({ where: { id: owner.id } })).resolves.toMatchObject({
        id: owner.id,
      });
    });

    it("refuses to delete an account that authored a row in someone else's project", async () => {
      const intruder = await prisma.user.create({
        data: { email: "audit-fields-intruder@example.test", name: "Intruder" },
      });

      setActor(intruder.id);
      await prisma.project.update({ where: { id: projectId }, data: { title: "touched" } });
      setActor(authorId);

      // P2003: the audit trail is not silently orphaned. Removing the account
      // is a decision about those rows, and the database makes it one.
      await expect(prisma.user.delete({ where: { id: intruder.id } })).rejects.toMatchObject({
        code: "P2003",
      });
    });
  });
});
