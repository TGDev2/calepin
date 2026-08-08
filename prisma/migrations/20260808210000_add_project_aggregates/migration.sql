-- The two project aggregates the dashboard reads (CAL-033): how many chapters
-- carry text, and how many words that text amounts to. Denormalised on purpose,
-- and maintained by the write rather than recomputed by the read.
--
-- Both default to 0, so the columns cost no caller anything: `withProjectAggregates`
-- rewrites them from the rows themselves in the same transaction as the write
-- that moved them, and the backfill below does the same once, for every project
-- that already exists.

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "totalWordCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "writtenChapterCount" INTEGER NOT NULL DEFAULT 0;

-- A counter is a count: it is never negative. Prisma cannot express a CHECK, so
-- it is written here. The maintenance path recomputes from truth and could not
-- produce a negative value, which is exactly why the constraint is worth having
-- — it is the day someone replaces the recomputation with delta arithmetic that
-- it has something to say.
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_aggregates_non_negative_check"
  CHECK ("writtenChapterCount" >= 0 AND "totalWordCount" >= 0);

-- The backfill, and the definition of both counters in one statement: a chapter
-- is written when it has at least one revision (the INNER LATERAL join drops the
-- others), and its contribution is its latest revision alone — never the sum of
-- every draft it went through.
UPDATE "projects" AS p
SET "writtenChapterCount" = aggregates.written,
    "totalWordCount" = aggregates.words
FROM (
  SELECT o."projectId" AS project_id,
         COUNT(*)::int AS written,
         COALESCE(SUM(latest."wordCount"), 0)::int AS words
  FROM "chapters" c
  JOIN "outlines" o ON o."id" = c."outlineId"
  JOIN LATERAL (
    SELECT r."wordCount"
    FROM "chapter_revisions" r
    WHERE r."chapterId" = c."id"
    ORDER BY r."revisionNumber" DESC
    LIMIT 1
  ) latest ON TRUE
  GROUP BY o."projectId"
) AS aggregates
WHERE p."id" = aggregates.project_id;
