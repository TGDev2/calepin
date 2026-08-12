/**
 * The ordering of the plan (CAL-019).
 *
 * Four layers: the key algebra (`key.ts`), placing a row among its siblings
 * (`position.ts`), moving one chapter to where a gesture pointed (`move.ts`,
 * CAL-105), and reading the plan in order with the numbering it derives
 * (`resolve.ts`).
 */

export {
  compareOrderKeys,
  isOrderKey,
  ORDER_KEY_ALPHABET,
  orderKeyBetween,
  orderKeysBetween,
} from "./key";
export {
  type ChapterMovePlan,
  type ChapterMoveRequest,
  chapterMoveRequestSchema,
  parseChapterMoveRequest,
  planChapterMove,
} from "./move";
export { moveOrderKey, orderKeyAt, STALE_PLAN_MESSAGE } from "./position";
export { resolveOutline } from "./resolve";
export type {
  NumberedChapter,
  OrderedChapter,
  OrderedPart,
  ResolvedOutline,
  ResolvedPart,
} from "./types";
