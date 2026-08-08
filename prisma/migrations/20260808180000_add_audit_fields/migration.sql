-- CAL-022 — generic audit fields on every mutable entity.
--
-- Twenty-six tables gain `updatedById` (who last modified the row) and
-- `version` (a counter over its states). The set is not hand-picked: it is
-- every table whose model carries `updatedAt`, minus `users`, whose author is
-- the account holder. Append-only tables — revisions, join rows, generation
-- attempts — are absent on purpose: they have one state and one author, and
-- both are already recorded.
--
-- `updatedById` is added nullable, backfilled, and only then made NOT NULL.
-- Adding it NOT NULL in one statement, which is what `migrate diff` generates,
-- would fail on any table holding a row.
--
-- It then takes the sentinel default `'unattributed'`. That default exists to
-- keep the column out of the *caller's* contract: without one, Prisma makes
-- `updatedById` a required member of every create input, and an extension that
-- fills a field the compiler already demands is decoration. The sentinel can
-- never be stored — the foreign key refuses it, and `users_id_attributable_check`
-- keeps a user with that id from existing — so a write that escapes the
-- extension fails naming the sentinel rather than merely naming a missing value.
--
-- The backfill credits the project's owner, the only attribution that is true
-- of a row written before this migration existed. Two tables know better and
-- say so: an annotation was written by its author, an export by its requester.
--
-- The foreign keys are NO ACTION **and DEFERRABLE INITIALLY DEFERRED**. Probed
-- on PostgreSQL 16, and the first two answers were wrong:
--
--   * RESTRICT is checked immediately. Deleting an account failed on rows the
--     account's own `projects` cascade was about to remove anyway.
--   * NO ACTION defers to the end of the *statement*, which is enough at one
--     level of cascade and not at two. `users` → `projects` → `bibles` still
--     failed: the second-level cascade is queued behind the check that reads
--     the rows it is about to delete.
--
-- Deferring to COMMIT is the only form that holds at any depth, and it is the
-- honest one: "no row may name an author who does not exist" is an invariant of
-- the transaction, not of one statement inside it. A row written by another
-- user inside someone else's project is still refused at commit — the trail is
-- protected in the one case where protecting it means something.
--
-- Prisma cannot express deferrability, so these statements are hand-written.
-- Introspection ignores it, so there is no drift (the same shape CAL-019 used
-- for a column-list SET NULL).

-- AlterTable — the columns, nullable for the moment.
ALTER TABLE "projects" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "source_texts" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "analyses" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "analysis_annotations" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "creative_directions" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "bibles" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "bible_identities" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "bible_styles" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "characters" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "relationships" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "places" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "world_rules" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "timeline_events" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "timeline_event_participants" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "canon_facts" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "canon_fact_beliefs" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "canon_fact_subjects" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "outlines" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "parts" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "chapters" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "chapter_outlines" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "threads" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "generations" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "quality_issues" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "exports" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "publications" ADD COLUMN "updatedById" TEXT, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Backfill — one hop from the project, and the project knows its owner.
UPDATE "projects" SET "updatedById" = "userId";

UPDATE "source_texts" t SET "updatedById" = p."userId" FROM "projects" p WHERE p."id" = t."projectId";
UPDATE "analyses" t SET "updatedById" = p."userId" FROM "projects" p WHERE p."id" = t."projectId";
UPDATE "creative_directions" t SET "updatedById" = p."userId" FROM "projects" p WHERE p."id" = t."projectId";
UPDATE "bibles" t SET "updatedById" = p."userId" FROM "projects" p WHERE p."id" = t."projectId";
UPDATE "outlines" t SET "updatedById" = p."userId" FROM "projects" p WHERE p."id" = t."projectId";
UPDATE "generations" t SET "updatedById" = p."userId" FROM "projects" p WHERE p."id" = t."projectId";
UPDATE "quality_issues" t SET "updatedById" = p."userId" FROM "projects" p WHERE p."id" = t."projectId";
UPDATE "publications" t SET "updatedById" = p."userId" FROM "projects" p WHERE p."id" = t."projectId";

-- Two rows already name their author. Use it rather than the project's owner:
-- an annotation is somebody's note and an export is somebody's request.
UPDATE "analysis_annotations" SET "updatedById" = "authorId";
UPDATE "exports" SET "updatedById" = "requestedById";

-- Through the bible.
UPDATE "bible_identities" t SET "updatedById" = p."userId" FROM "bibles" b JOIN "projects" p ON p."id" = b."projectId" WHERE b."id" = t."bibleId";
UPDATE "bible_styles" t SET "updatedById" = p."userId" FROM "bibles" b JOIN "projects" p ON p."id" = b."projectId" WHERE b."id" = t."bibleId";
UPDATE "characters" t SET "updatedById" = p."userId" FROM "bibles" b JOIN "projects" p ON p."id" = b."projectId" WHERE b."id" = t."bibleId";
UPDATE "relationships" t SET "updatedById" = p."userId" FROM "bibles" b JOIN "projects" p ON p."id" = b."projectId" WHERE b."id" = t."bibleId";
UPDATE "places" t SET "updatedById" = p."userId" FROM "bibles" b JOIN "projects" p ON p."id" = b."projectId" WHERE b."id" = t."bibleId";
UPDATE "world_rules" t SET "updatedById" = p."userId" FROM "bibles" b JOIN "projects" p ON p."id" = b."projectId" WHERE b."id" = t."bibleId";
UPDATE "timeline_events" t SET "updatedById" = p."userId" FROM "bibles" b JOIN "projects" p ON p."id" = b."projectId" WHERE b."id" = t."bibleId";
UPDATE "timeline_event_participants" t SET "updatedById" = p."userId" FROM "bibles" b JOIN "projects" p ON p."id" = b."projectId" WHERE b."id" = t."bibleId";
UPDATE "canon_facts" t SET "updatedById" = p."userId" FROM "bibles" b JOIN "projects" p ON p."id" = b."projectId" WHERE b."id" = t."bibleId";
UPDATE "canon_fact_beliefs" t SET "updatedById" = p."userId" FROM "bibles" b JOIN "projects" p ON p."id" = b."projectId" WHERE b."id" = t."bibleId";
UPDATE "canon_fact_subjects" t SET "updatedById" = p."userId" FROM "bibles" b JOIN "projects" p ON p."id" = b."projectId" WHERE b."id" = t."bibleId";
UPDATE "chapters" t SET "updatedById" = p."userId" FROM "bibles" b JOIN "projects" p ON p."id" = b."projectId" WHERE b."id" = t."bibleId";
UPDATE "chapter_outlines" t SET "updatedById" = p."userId" FROM "bibles" b JOIN "projects" p ON p."id" = b."projectId" WHERE b."id" = t."bibleId";
UPDATE "threads" t SET "updatedById" = p."userId" FROM "bibles" b JOIN "projects" p ON p."id" = b."projectId" WHERE b."id" = t."bibleId";

-- Through the outline, the only table with neither a project nor a bible.
UPDATE "parts" t SET "updatedById" = p."userId" FROM "outlines" o JOIN "projects" p ON p."id" = o."projectId" WHERE o."id" = t."outlineId";

-- The constraint the whole task exists for.
ALTER TABLE "projects" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "projects" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "source_texts" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "source_texts" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "analyses" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "analyses" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "analysis_annotations" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "analysis_annotations" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "creative_directions" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "creative_directions" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "bibles" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "bibles" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "bible_identities" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "bible_identities" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "bible_styles" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "bible_styles" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "characters" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "characters" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "relationships" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "relationships" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "places" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "places" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "world_rules" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "world_rules" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "timeline_events" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "timeline_events" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "timeline_event_participants" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "timeline_event_participants" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "canon_facts" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "canon_facts" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "canon_fact_beliefs" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "canon_fact_beliefs" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "canon_fact_subjects" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "canon_fact_subjects" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "outlines" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "outlines" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "parts" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "parts" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "chapters" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "chapters" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "chapter_outlines" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "chapter_outlines" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "threads" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "threads" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "generations" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "generations" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "quality_issues" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "quality_issues" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "exports" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "exports" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';
ALTER TABLE "publications" ALTER COLUMN "updatedById" SET NOT NULL;
ALTER TABLE "publications" ALTER COLUMN "updatedById" SET DEFAULT 'unattributed';

-- The sentinel default keeps the column out of the caller’s contract; this
-- check keeps it from ever becoming a real author.
ALTER TABLE "users" ADD CONSTRAINT "users_id_attributable_check" CHECK ("id" <> 'unattributed');

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "source_texts" ADD CONSTRAINT "source_texts_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "analysis_annotations" ADD CONSTRAINT "analysis_annotations_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "creative_directions" ADD CONSTRAINT "creative_directions_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "bibles" ADD CONSTRAINT "bibles_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "bible_identities" ADD CONSTRAINT "bible_identities_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "bible_styles" ADD CONSTRAINT "bible_styles_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "characters" ADD CONSTRAINT "characters_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "places" ADD CONSTRAINT "places_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "world_rules" ADD CONSTRAINT "world_rules_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "timeline_event_participants" ADD CONSTRAINT "timeline_event_participants_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "canon_facts" ADD CONSTRAINT "canon_facts_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "canon_fact_beliefs" ADD CONSTRAINT "canon_fact_beliefs_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "canon_fact_subjects" ADD CONSTRAINT "canon_fact_subjects_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "outlines" ADD CONSTRAINT "outlines_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "parts" ADD CONSTRAINT "parts_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "chapter_outlines" ADD CONSTRAINT "chapter_outlines_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "threads" ADD CONSTRAINT "threads_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "generations" ADD CONSTRAINT "generations_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "quality_issues" ADD CONSTRAINT "quality_issues_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "exports" ADD CONSTRAINT "exports_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "publications" ADD CONSTRAINT "publications_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
