-- CAL-089: the style section becomes the eighteenth mission, the second of
-- the bible stage. Placed after DEFINE_NOVEL_IDENTITY because the enum's
-- order mirrors the order the novel is built in, and the style section is
-- written against the identity the bible opened with.
ALTER TYPE "generation_mission" ADD VALUE 'DEFINE_STYLE' AFTER 'DEFINE_NOVEL_IDENTITY';
