-- CAL-092: the world becomes the twentieth mission, the fifth of the bible
-- stage. Placed after RELATE_CHARACTERS because the enum's order mirrors the
-- order the novel is built in, and the world is the last section of the bible
-- the backlog asks for before the chronology hangs its events on it.
ALTER TYPE "generation_mission" ADD VALUE 'DEFINE_WORLD' AFTER 'RELATE_CHARACTERS';
