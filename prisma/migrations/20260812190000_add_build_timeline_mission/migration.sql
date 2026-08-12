-- CAL-093: the chronology becomes the twenty-first mission, the sixth of the
-- bible stage. Placed after DEFINE_WORLD because the enum's order mirrors the
-- order the novel is built in, and a chronology hangs its events on the world
-- that has just been legislated — the era it is dated against, and the rules
-- that decide what a span of days can hold.
ALTER TYPE "generation_mission" ADD VALUE 'BUILD_TIMELINE' AFTER 'DEFINE_WORLD';
