-- CAL-034. The one lifecycle fact the narrative graph cannot carry.
--
-- Nine of the ten project statuses are readable off the rows a project already
-- holds. ARCHIVED is not: it is a decision about the project itself, with
-- nothing anywhere to prove it. It is recorded here as a timestamp rather than
-- left to the status column, which is the shape this schema already uses for
-- every decision of that kind (analyses.validatedAt, bibles.validatedAt,
-- publications.firstPublishedAt) — and it is what makes projects.status a pure
-- function of the rows, maintained by @calepin/shared/repository and never set
-- by a caller.
--
-- No CHECK ties this column to projects.status. Archiving writes the two in one
-- transaction but in two statements — this one audited, so the act keeps its
-- author, and the derived status raw, so it moves neither version nor
-- updatedById — and PostgreSQL cannot defer a CHECK to the end of a
-- transaction.

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "archivedAt" TIMESTAMP(3);
