-- CAL-083: replacing one discarded direction becomes the fifteenth mission.
-- Placed after PROPOSE_DIRECTIONS because the enum's order is the display
-- order, and this is the mission that re-asks that one's answer.
ALTER TYPE "generation_mission" ADD VALUE 'REPLACE_DIRECTION' AFTER 'PROPOSE_DIRECTIONS';
