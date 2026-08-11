-- CAL-083: the author writes one proposed direction off, optionally saying
-- why, and it stays consultable afterwards.
--
-- Two nullable columns and no deletion. `discardedAt` is a timestamp rather
-- than a status, Project.archivedAt's shape: a status column would be a second
-- answer able to contradict `origin` and `isCanonical`. Nullable, so no
-- backfill is owed and every existing row reads as *still standing* — which is
-- what it is.
ALTER TABLE "creative_directions" ADD COLUMN     "discardedAt" TIMESTAMP(3);
ALTER TABLE "creative_directions" ADD COLUMN     "discardReason" TEXT;
