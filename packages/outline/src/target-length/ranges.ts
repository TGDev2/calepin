/**
 * The preset ranges, re-exported.
 *
 * The numbers themselves live in `@calepin/shared/target-length` since CAL-210
 * — three domains state the novel's target length and a domain may not import a
 * domain (§3.2). This file stays so that nothing importing `./ranges` inside the
 * package had to move, and so the package's own surface still lists them.
 */

export {
  CUSTOM_TARGET_WORD_COUNT_RANGE,
  TARGET_LENGTH_RANGES,
} from "@calepin/shared/target-length";
