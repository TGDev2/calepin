/**
 * One character's sheet, read for editing and rewritten by hand (CAL-097).
 *
 * `relationship.ts`'s shape, one row deeper: `assertProjectScope`, then
 * `withProjectTransaction`, then `scopedWhere` on the read. This is the first
 * writer to reach `@calepin/shared/bible-lock`'s field-level guard
 * (`isCharacterFieldLocked`) — built by CAL-095, unused by any caller until
 * now.
 *
 * **The sixteen fields travel typed but unvalidated by this layer.** Bounded
 * by `@calepin/bible`'s `characterContentSchema`, and `@calepin/shared` may
 * not import a domain (§3.2) — the caller parses with `parseCharacterContent`
 * before reaching here, `editDirection` and `editRelationship`'s own
 * division. `importance` is the one field this layer may name: the Prisma
 * enum, not a domain contract.
 *
 * **A hand edit is compared field by field against the stored row**, and the
 * set of fields that actually changed is exactly what a lock check and a
 * history entry both need — computed once, used twice. An identical
 * resubmission writes nothing and leaves no trace, `editDirection` and
 * `editRelationship`'s short circuit.
 *
 * **A locked field refuses the whole write.** `Character` and its missions
 * rebuild the whole sheet in one generation (CAL-095's own reasoning), so
 * there is no partial write for a hand edit to make around a locked field
 * either — the same all-or-nothing `editRelationship` already gives a
 * locked row.
 *
 * Every writer must be inside `runWithActor`: no statement here names
 * `updatedById`, and the CAL-022 extension is what fills it on the
 * `Character` row itself. `CharacterEditHistory.editedById` is not an
 * audited column — the table carries no `updatedAt` — so it is set directly
 * from `scope.ownerId`, `AnalysisSectionRevision.createdById`'s own reading
 * of the same scope.
 */

import type { $Enums } from "@prisma/client";

import {
  bibleElementLockedError,
  type CharacterLockField,
  isBibleElementLocked,
  isCharacterFieldLocked,
} from "../bible-lock";
import { getDatabaseClient } from "../database/client";
import { ConflictError, NotFoundError } from "../errors/app-error";
import { fail, type Result, succeed } from "../errors/result";
import { originAfterEdit } from "../provenance";
import { assertProjectScope, type ProjectScope, scopedWhere } from "./scope";
import { withProjectTransaction } from "./transaction";

/** The sixteen own-row fields, in `Character`'s own order. */
export interface CharacterContentInput {
  readonly name: string;
  readonly age: number | null;
  readonly role: string | null;
  readonly importance: $Enums.CharacterImportance;
  readonly appearance: string | null;
  readonly initialSituation: string | null;
  readonly apparentDesire: string | null;
  readonly deepNeed: string | null;
  readonly fear: string | null;
  readonly contradiction: string | null;
  readonly secret: string | null;
  readonly past: string | null;
  readonly plannedArc: string | null;
  readonly speechStyle: string | null;
  readonly heldKnowledge: readonly string[];
  readonly elementsToPreserve: readonly string[];
}

/** One saved edit, as the history screen reads it — the sheet's state before it. */
export interface CharacterEditHistoryEntry extends CharacterContentInput {
  readonly id: string;
  readonly changedFields: readonly $Enums.CharacterField[];
  readonly editedAt: Date;
}

export interface CharacterEditSnapshot extends CharacterContentInput {
  readonly id: string;
  readonly bibleId: string;
  readonly origin: $Enums.ContentOrigin;
  readonly lockedAt: Date | null;
  readonly lockedFields: readonly $Enums.CharacterField[];
  /** Newest first — CAL-097's own reading order. */
  readonly editHistory: readonly CharacterEditHistoryEntry[];
}

const CONTENT_SELECT = {
  name: true,
  age: true,
  role: true,
  importance: true,
  appearance: true,
  initialSituation: true,
  apparentDesire: true,
  deepNeed: true,
  fear: true,
  contradiction: true,
  secret: true,
  past: true,
  plannedArc: true,
  speechStyle: true,
  heldKnowledge: true,
  elementsToPreserve: true,
} as const;

/**
 * One character's sheet, with its edit history — `NOT_FOUND` when it is not
 * there or not theirs (§3.5).
 */
export async function getCharacterForEdit(
  scope: ProjectScope,
  characterId: string,
): Promise<Result<CharacterEditSnapshot>> {
  assertProjectScope(scope);

  const database = getDatabaseClient();

  const character = await database.character.findFirst({
    where: scopedWhere("Character", scope, { id: characterId }),
    select: {
      id: true,
      bibleId: true,
      ...CONTENT_SELECT,
      origin: true,
      lockedAt: true,
      lockedFields: true,
      editHistory: {
        select: { id: true, ...CONTENT_SELECT, changedFields: true, editedAt: true },
        orderBy: { editedAt: "desc" },
      },
    },
  });

  if (character === null) {
    return fail(new NotFoundError({ message: "no such character in this project" }));
  }

  return succeed(character);
}

/**
 * Which of the sixteen fields differ between what is stored and what was
 * submitted — the pure comparison a lock check and a history entry both need.
 */
function changedFields(
  current: CharacterContentInput,
  next: CharacterContentInput,
): CharacterLockField[] {
  const changed: CharacterLockField[] = [];

  function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  if (current.name !== next.name) changed.push("NAME");
  if (current.age !== next.age) changed.push("AGE");
  if (current.role !== next.role) changed.push("ROLE");
  if (current.importance !== next.importance) changed.push("IMPORTANCE");
  if (current.appearance !== next.appearance) changed.push("APPEARANCE");
  if (current.initialSituation !== next.initialSituation) changed.push("INITIAL_SITUATION");
  if (current.apparentDesire !== next.apparentDesire) changed.push("APPARENT_DESIRE");
  if (current.deepNeed !== next.deepNeed) changed.push("DEEP_NEED");
  if (current.fear !== next.fear) changed.push("FEAR");
  if (current.contradiction !== next.contradiction) changed.push("CONTRADICTION");
  if (current.secret !== next.secret) changed.push("SECRET");
  if (current.past !== next.past) changed.push("PAST");
  if (current.plannedArc !== next.plannedArc) changed.push("PLANNED_ARC");
  if (current.speechStyle !== next.speechStyle) changed.push("SPEECH_STYLE");
  if (!sameStringArray(current.heldKnowledge, next.heldKnowledge)) changed.push("HELD_KNOWLEDGE");
  if (!sameStringArray(current.elementsToPreserve, next.elementsToPreserve)) {
    changed.push("ELEMENTS_TO_PRESERVE");
  }

  return changed;
}

export interface EditCharacterInput {
  readonly characterId: string;
  /** Already parsed by `parseCharacterContent` in `@calepin/bible`. */
  readonly content: CharacterContentInput;
}

export interface CharacterEdited {
  /** `false` when the submission was identical to what stood; nothing was written. */
  readonly updated: boolean;
  readonly origin: $Enums.ContentOrigin;
}

/**
 * Rewrites a sheet's sixteen own-row fields, by hand.
 *
 * **A locked field, or a locked row, refuses the whole write.** `Character`
 * is the one model a lock can be taken on field by field (CAL-095); a row
 * lock covers every field the same way.
 *
 * **A renamed sheet cannot collide with another of the same bible.**
 * `@@unique([bibleId, name])` would refuse the statement anyway, but reading
 * first is what turns a constraint name into a sentence the author can act
 * on — `writeRelationship`'s reason for the same read-then-refuse shape.
 *
 * **history, then the row, in the one transaction the edit opens.** The
 * history row is the sheet's state *before* this write — `changedFields`
 * says what an author reading it later actually needs to look at.
 */
export async function editCharacter(
  scope: ProjectScope,
  input: EditCharacterInput,
): Promise<Result<CharacterEdited>> {
  assertProjectScope(scope);

  return withProjectTransaction<CharacterEdited>(scope, async (tx) => {
    const character = await tx.character.findFirst({
      where: scopedWhere("Character", scope, { id: input.characterId }),
      select: {
        id: true,
        bibleId: true,
        ...CONTENT_SELECT,
        origin: true,
        lockedAt: true,
        lockedFields: true,
      },
    });

    if (character === null) {
      return fail(new NotFoundError({ message: "no such character in this project" }));
    }

    const changed = changedFields(character, input.content);

    if (changed.length === 0) {
      return succeed({ updated: false, origin: character.origin });
    }

    if (
      isBibleElementLocked(character) ||
      changed.some((field) => isCharacterFieldLocked(character, field))
    ) {
      return fail(bibleElementLockedError("Character", "modify"));
    }

    if (changed.includes("NAME")) {
      const clash = await tx.character.findFirst({
        where: scopedWhere("Character", scope, {
          bibleId: character.bibleId,
          name: input.content.name,
          NOT: { id: character.id },
        }),
        select: { id: true },
      });

      if (clash !== null) {
        return fail(
          new ConflictError({
            message: "another character of this bible already carries this name",
            userMessage: "Un autre personnage de cette bible porte déjà ce nom.",
          }),
        );
      }
    }

    await tx.characterEditHistory.create({
      data: {
        characterId: character.id,
        name: character.name,
        age: character.age,
        role: character.role,
        importance: character.importance,
        appearance: character.appearance,
        initialSituation: character.initialSituation,
        apparentDesire: character.apparentDesire,
        deepNeed: character.deepNeed,
        fear: character.fear,
        contradiction: character.contradiction,
        secret: character.secret,
        past: character.past,
        plannedArc: character.plannedArc,
        speechStyle: character.speechStyle,
        heldKnowledge: [...character.heldKnowledge],
        elementsToPreserve: [...character.elementsToPreserve],
        changedFields: changed,
        editedById: scope.ownerId,
      },
    });

    const nextOrigin = originAfterEdit(character.origin, true);

    await tx.character.update({
      where: { id: character.id },
      data: {
        name: input.content.name,
        age: input.content.age,
        role: input.content.role,
        importance: input.content.importance,
        appearance: input.content.appearance,
        initialSituation: input.content.initialSituation,
        apparentDesire: input.content.apparentDesire,
        deepNeed: input.content.deepNeed,
        fear: input.content.fear,
        contradiction: input.content.contradiction,
        secret: input.content.secret,
        past: input.content.past,
        plannedArc: input.content.plannedArc,
        speechStyle: input.content.speechStyle,
        heldKnowledge: [...input.content.heldKnowledge],
        elementsToPreserve: [...input.content.elementsToPreserve],
        origin: nextOrigin,
      },
    });

    return succeed({ updated: true, origin: nextOrigin });
  });
}
