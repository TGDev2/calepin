-- CAL-088: the identity of the novel becomes the seventeenth mission, and the
-- first of the bible stage. Placed after COMBINE_DIRECTIONS because the enum's
-- order is the display order, and the identity section is what the bible opens
-- with once a direction has been chosen.
ALTER TYPE "generation_mission" ADD VALUE 'DEFINE_NOVEL_IDENTITY' AFTER 'COMBINE_DIRECTIONS';
