-- CAL-075: the dedicated cliché-risk pass over the source text becomes the
-- twelfth mission. Placed beside ANALYZE_SOURCE_TEXT because the enum's order
-- is the display order, and this is an analysis-stage mission.
ALTER TYPE "generation_mission" ADD VALUE 'DETECT_CLICHE_RISKS' AFTER 'ANALYZE_SOURCE_TEXT';
