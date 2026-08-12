/**
 * `@calepin/shared/bible-lock` — the lock on one element of the bible
 * (CAL-095).
 *
 * Pure, like `@calepin/shared/obsolescence` next door: the registry of what can
 * be locked, the table of what each mission would rebuild, the gate that
 * decides whether a generation may start, and the predicates a write path
 * composes so a locked row is never modified silently. Nothing here touches a
 * database, a clock or an environment — reading the locks is
 * `@calepin/shared/repository`'s job, and naming the element on screen is
 * `apps/web`'s.
 *
 * It lives in `shared` rather than in `@calepin/bible` because it decides
 * nothing about narrative meaning (CLAUDE.md §3.3). What it knows is which
 * Prisma models carry a lock and which missions rewrite them; whether a locked
 * fact *contradicts* an instruction is a narrative question, and it is
 * CAL-115's.
 */

export {
  type BibleLockedElement,
  type BibleLockGate,
  type BibleLockGateInput,
  checkBibleLocks,
} from "./gate";
export {
  BIBLE_LOCK_ACTIONS,
  bibleElementLockedError,
  type BibleLockAction,
  blockedGenerationError,
  type FieldLockableRow,
  isBibleElementLocked,
  isCharacterFieldLocked,
  isCharacterPartlyLocked,
  type LockableRow,
} from "./guard";
export {
  BIBLE_LOCK_LABELS,
  BIBLE_LOCKABLE_MODELS,
  type BibleLockableModel,
  type BibleLockLabel,
  CHARACTER_LOCK_FIELD_LABELS,
  CHARACTER_LOCK_FIELDS,
  type CharacterLockField,
  FIELD_LOCKABLE_MODEL,
  isBibleLockableModel,
  isCharacterLockField,
} from "./models";
export {
  isMissionNarrowedToTarget,
  MISSION_LOCK_SCOPE,
  missionLockScope,
  MISSIONS_NARROWED_TO_TARGET,
} from "./scope";
