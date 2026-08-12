import { describe, expect, it } from "vitest";

import {
  BIBLE_LOCK_ACTIONS,
  bibleElementLockedError,
  isBibleElementLocked,
  isCharacterFieldLocked,
  isCharacterPartlyLocked,
} from "./guard";
import { BIBLE_LOCKABLE_MODELS } from "./models";

const LOCKED_AT = new Date("2026-08-12T09:00:00.000Z");

describe("isBibleElementLocked", () => {
  it("reads the timestamp as the state, with nothing beside it", () => {
    expect(isBibleElementLocked({ lockedAt: LOCKED_AT })).toBe(true);
    expect(isBibleElementLocked({ lockedAt: null })).toBe(false);
  });
});

describe("isCharacterFieldLocked", () => {
  it("locks a field the sheet lists", () => {
    expect(isCharacterFieldLocked({ lockedAt: null, lockedFields: ["SECRET"] }, "SECRET")).toBe(
      true,
    );
  });

  it("leaves a field the sheet does not list", () => {
    expect(isCharacterFieldLocked({ lockedAt: null, lockedFields: ["SECRET"] }, "PAST")).toBe(
      false,
    );
  });

  it("locks every field when the whole row is locked", () => {
    // The derivation `Character.lockedFields`' own doc comment states, kept in
    // one place so no caller can answer it differently.
    expect(isCharacterFieldLocked({ lockedAt: LOCKED_AT, lockedFields: [] }, "PAST")).toBe(true);
  });
});

describe("isCharacterPartlyLocked", () => {
  it("is true for a row lock and for a field lock alike", () => {
    expect(isCharacterPartlyLocked({ lockedAt: LOCKED_AT, lockedFields: [] })).toBe(true);
    expect(isCharacterPartlyLocked({ lockedAt: null, lockedFields: ["FEAR"] })).toBe(true);
  });

  it("is false for a sheet nobody has settled", () => {
    expect(isCharacterPartlyLocked({ lockedAt: null, lockedFields: [] })).toBe(false);
  });
});

describe("bibleElementLockedError", () => {
  it("carries its own code, in the conflict category", () => {
    const error = bibleElementLockedError("CanonFact", "modify");

    expect(error.code).toBe("BIBLE_ELEMENT_LOCKED");
    expect(error.category).toBe("conflict");
    expect(error.retryable).toBe(false);
  });

  it("names the model in fieldPath, which is the loggable half", () => {
    // §9: a model name is an identifier, so it may be logged. The element's own
    // name, statement or label never leaves the database for a log line.
    expect(bibleElementLockedError("WorldRule", "generate").fieldPath).toBe("WorldRule");
  });

  it("keeps the English message free of interpolated data", () => {
    // §7: the message is the first line of `error.stack`.
    for (const model of BIBLE_LOCKABLE_MODELS) {
      for (const action of BIBLE_LOCK_ACTIONS) {
        expect(bibleElementLockedError(model, action).message).not.toContain(model);
      }
    }
  });

  it("agrees the French with the element it is about", () => {
    expect(bibleElementLockedError("Relationship", "modify").userMessage).toBe(
      "Ce lien est verrouillé : déverrouillez-le pour le modifier.",
    );
    expect(bibleElementLockedError("WorldRule", "modify").userMessage).toBe(
      "Cette règle du monde est verrouillée : déverrouillez-la pour la modifier.",
    );
    expect(bibleElementLockedError("Relationship", "delete").userMessage).toBe(
      "Ce lien est verrouillé : déverrouillez-le pour le supprimer.",
    );
  });

  it("offers the generation's two remedies, which the other two actions do not have", () => {
    expect(bibleElementLockedError("CanonFact", "generate").userMessage).toBe(
      "Ce fait canonique est verrouillé : levez le verrou pour relancer cette génération, " +
        "ou laissez-le en place.",
    );
  });

  it("has a French sentence for every model and every action", () => {
    for (const model of BIBLE_LOCKABLE_MODELS) {
      for (const action of BIBLE_LOCK_ACTIONS) {
        const { userMessage } = bibleElementLockedError(model, action);

        expect(userMessage).toMatch(/^[A-ZÀ-Ý].*\.$/u);
        expect(userMessage).toContain("verrou");
      }
    }
  });
});
