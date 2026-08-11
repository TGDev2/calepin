-- CAL-077: the targeted regeneration of one analysis section becomes the
-- fourteenth mission. Placed after ASSESS_NOVEL_POTENTIAL because the enum's
-- order is the display order, and this is the fourth analysis-stage mission.
ALTER TYPE "generation_mission" ADD VALUE 'REGENERATE_ANALYSIS_SECTION' AFTER 'ASSESS_NOVEL_POTENTIAL';
