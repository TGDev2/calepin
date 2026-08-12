-- CAL-101: the plan stage opens with its first mission.
-- Placed after DETECT_BIBLE_CONTRADICTIONS because the enum's order mirrors
-- the order the novel is built in, and the parts are decided before any
-- chapter is planned inside one. Not a reuse of BUILD_CHAPTER_OUTLINE: that
-- mission plans one chapter inside a part that already frames it, while this
-- one decides the frame — the whole novel's parts, under a count gate derived
-- from the target length that no chapter plan carries (§5.4).
ALTER TYPE "generation_mission" ADD VALUE 'SPLIT_INTO_PARTS' AFTER 'DETECT_BIBLE_CONTRADICTIONS';
