-- CAL-099: an issue gets an identity that outlives the run that produced it.
--
-- A deterministic check recomputes its findings from the rows every time.
-- Without a stable identity the second run would insert a new DETECTED row
-- beside the one the author had already accepted, and the contradiction they
-- ruled on would block the validation forever. `checkId` cannot carry that on
-- its own — one check reports several findings — and `explanation` must not,
-- since rewording a sentence would orphan a decision.
--
-- NOT NULL with no default, deliberately: a row nobody can reconcile is a row
-- whose arbitration is already lost, so the column has no shape for "unknown".
-- The table is empty until this task writes into it.
ALTER TABLE "quality_issues" ADD COLUMN "fingerprint" TEXT NOT NULL;

-- One row per finding, per check, per project. This is what makes a re-run an
-- update rather than a second row, and it is the arbiter rather than a hint:
-- two passes racing one project collide here instead of both inserting.
CREATE UNIQUE INDEX "quality_issues_projectId_checkId_fingerprint_key"
  ON "quality_issues" ("projectId", "checkId", "fingerprint");
