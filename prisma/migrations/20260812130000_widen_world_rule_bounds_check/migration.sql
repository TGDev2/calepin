-- CAL-092: the supernatural bound widened from limits alone to all three.
--
-- CAL-016 wrote `world_rules_supernatural_limits_check` naming this task, and
-- guarded the one column the model then had: `limits`. CAL-092's own wording
-- asks for more — *des limites explicites, des coûts et des conditions
-- d'échec* — and the three are not interchangeable. A power with a stated
-- ceiling but no cost is free to use, and a power that never fails is one no
-- scene can be lost to. Both are exactly the shape a resolution by convenience
-- takes (CAL-114, CAL-159), so both belong in the constraint rather than in
-- the mission that happens to write the row.
--
-- The mission's contract already refuses a capability with an empty bound
-- list, and cannot represent one. This is the layer beneath that: a nested
-- write and a raw INSERT are the two paths no client extension and no Zod
-- schema can see, and they are the paths a fixture, a seed or an import takes.
--
-- coalesce is load-bearing on all three, not defensive noise, and the reason
-- is recorded in the original constraint's own comment: a CHECK rejects a row
-- only when it evaluates to FALSE, and `cardinality(NULL)` is NULL, so a
-- column never written would slip past an unguarded test. The array columns
-- are NOT NULL, which closes that path too; the guard stays because the
-- constraint must not depend on a nullability declared elsewhere.
ALTER TABLE "world_rules" DROP CONSTRAINT "world_rules_supernatural_limits_check";

ALTER TABLE "world_rules" ADD CONSTRAINT "world_rules_supernatural_bounds_check" CHECK (
    NOT "isSupernatural"
    OR (
        coalesce(cardinality("limits"), 0) > 0
        AND coalesce(cardinality("costs"), 0) > 0
        AND coalesce(cardinality("failureConditions"), 0) > 0
    )
);
