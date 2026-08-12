-- CAL-106: the plan stage gains the one mission that re-cuts what it already
-- holds.
-- Placed after BUILD_CHAPTER_OUTLINE because the enum's order mirrors the order
-- the novel is built in, and a chapter is planned before it is split in two.
-- Not a reuse of BUILD_CHAPTER_OUTLINE: that mission plans a whole part against
-- a frame no chapter exists under yet, while this one is handed one chapter
-- that already exists and asked where to cut it — under a constraint no batch
-- ask can state, that everything the chapter carried comes out the other side
-- (§5.4).
ALTER TYPE "generation_mission" ADD VALUE 'SPLIT_CHAPTER_OUTLINE' AFTER 'BUILD_CHAPTER_OUTLINE';
