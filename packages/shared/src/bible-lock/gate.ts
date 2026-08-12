/**
 * Would this generation rewrite something the author has locked? (CAL-095)
 *
 * The specification asks for the lock to act **before** the generation, not as
 * a correction after it: *lorsqu'une instruction utilisateur contredit un
 * élément verrouillé, l'application doit le signaler avant la génération ou
 * demander si le verrou doit être levé* (§6.5). This is the half of that
 * decidable with no model call — a mission asked to rebuild a section that
 * holds a locked element is refused, whatever it would have written.
 *
 * The other half — an instruction in French contradicting a fact it never names
 * — is CAL-115's, and it is a mission with a schema of its own. It plugs into
 * the refusal this file produces rather than inventing a second one.
 *
 * Nothing here reads a database, a clock or an environment: this is the rule,
 * and CLAUDE.md §8 asks that a rule be runnable without any of the three.
 * Gathering the locks is `@calepin/shared/repository`'s job.
 *
 * **The report carries identifiers and nothing else** — a model name, a row id,
 * field members of a closed enum. Never a character's name, a fact's statement
 * or a rule's wording: those are literary content, and a gate report is exactly
 * the kind of thing that ends up in a log line (§9). Saying *which* element in
 * French is the screen's, from rows it has already read.
 */

import type { $Enums } from "@prisma/client";

import type { BibleLockableModel, CharacterLockField } from "./models";
import { isMissionNarrowedToTarget, missionLockScope } from "./scope";

type Mission = $Enums.GenerationMission;

/** One locked element, as a gate needs to see it. */
export interface BibleLockedElement {
  readonly model: BibleLockableModel;
  readonly id: string;
  /**
   * The fields locked individually. Empty when the whole row is locked, which
   * is the only state the eight models without a `lockedFields` column have.
   */
  readonly fields: readonly CharacterLockField[];
  /**
   * The character this row hangs off, so a narrowed mission can tell its own
   * from the rest: the row's own id for a `Character`, `fromCharacterId` for a
   * `Relationship` — the end a sheet declares its edges from — and null for the
   * seven models that belong to no character.
   */
  readonly characterId: string | null;
}

export interface BibleLockGateInput {
  readonly mission: Mission;
  /** `Generation.targetId`, which for a narrowed mission names a character. */
  readonly targetId: string | null;
  /** Every locked element of the project's bible the caller read. */
  readonly locks: readonly BibleLockedElement[];
}

export interface BibleLockGate {
  readonly mission: Mission;
  /** True when at least one lock stands in the mission's way. */
  readonly blocked: boolean;
  /** The locks that block it — the complete list the author has to lift. */
  readonly blocking: readonly BibleLockedElement[];
}

/**
 * The locks that stand between this mission and its own output.
 *
 * Two filters and no third. A lock counts when its model is one the mission
 * rebuilds, and — for a mission narrowed to its target — when the element
 * belongs to the character named. A narrowed mission carrying no target keeps
 * every lock of its models, which is `generationWriteTarget`'s conservative
 * reading of the same defect: a row missing its target excludes everything
 * rather than quietly excluding nothing.
 *
 * A locked *field* blocks exactly as a locked row does, and deliberately: the
 * missions that name `Character` rebuild the whole sheet, so there is no
 * partial answer for them to write around a field.
 */
export function checkBibleLocks(input: BibleLockGateInput): BibleLockGate {
  const scope = new Set<BibleLockableModel>(missionLockScope(input.mission));
  const narrowed = isMissionNarrowedToTarget(input.mission) && input.targetId !== null;

  const blocking = input.locks.filter((lock) => {
    if (!scope.has(lock.model)) return false;

    return !narrowed || lock.characterId === input.targetId;
  });

  return { mission: input.mission, blocked: blocking.length > 0, blocking };
}
