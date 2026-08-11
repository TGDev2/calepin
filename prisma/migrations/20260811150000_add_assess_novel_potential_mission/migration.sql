-- CAL-076: the novel-potential assessment becomes the thirteenth mission.
-- Placed beside DETECT_CLICHE_RISKS because the enum's order is the display
-- order, and this is the third analysis-stage mission.
ALTER TYPE "generation_mission" ADD VALUE 'ASSESS_NOVEL_POTENTIAL' AFTER 'DETECT_CLICHE_RISKS';
