/**
 * The ordering of the plan (CAL-019).
 *
 * Three layers: the key algebra (`key.ts`), placing a row among its siblings
 * (`position.ts`), and reading the plan in order with the numbering it derives
 * (`resolve.ts`).
 */

export {
  compareOrderKeys,
  isOrderKey,
  ORDER_KEY_ALPHABET,
  orderKeyBetween,
  orderKeysBetween,
} from "./key";
export { moveOrderKey, orderKeyAt } from "./position";
export { resolveOutline } from "./resolve";
export type {
  NumberedChapter,
  OrderedChapter,
  OrderedPart,
  ResolvedOutline,
  ResolvedPart,
} from "./types";
