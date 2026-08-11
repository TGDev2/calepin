-- CAL-091: the relationship graph becomes the nineteenth mission, the fourth
-- of the bible stage. Placed after CREATE_CHARACTER_SHEET because the enum's
-- order mirrors the order the novel is built in, and a graph can only be
-- asked of a cast that already has sheets.
ALTER TYPE "generation_mission" ADD VALUE 'RELATE_CHARACTERS' AFTER 'CREATE_CHARACTER_SHEET';
