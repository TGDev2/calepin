-- CAL-084: combining elements of several directions becomes the sixteenth
-- mission. Placed after EVALUATE_DIRECTION because the enum's order is the
-- display order, and combination is the last generative ask of the
-- exploration before a direction is chosen.
ALTER TYPE "generation_mission" ADD VALUE 'COMBINE_DIRECTIONS' AFTER 'EVALUATE_DIRECTION';
