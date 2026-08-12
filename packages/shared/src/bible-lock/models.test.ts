import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PROJECT_OWNED_MODEL_NAMES } from "../repository/owned-models";
import {
  BIBLE_LOCK_LABELS,
  BIBLE_LOCKABLE_MODELS,
  CHARACTER_LOCK_FIELD_LABELS,
  CHARACTER_LOCK_FIELDS,
  FIELD_LOCKABLE_MODEL,
  isBibleLockableModel,
  isCharacterLockField,
} from "./models";

const SCHEMA_PATH = fileURLToPath(new URL("../../../../prisma/schema.prisma", import.meta.url));

/** Normalised at the read, so a CRLF checkout cannot defeat the parsing below. */
function schemaSource(): string {
  return readFileSync(SCHEMA_PATH, "utf8").replaceAll("\r\n", "\n");
}

function modelBlock(name: string): string {
  const block = schemaSource().match(
    new RegExp(`\\nmodel ${name} \\{\\n([\\s\\S]*?)\\n\\}\\n`),
  )?.[1];

  if (block === undefined) {
    throw new Error(`model ${name} not found in schema.prisma`);
  }

  return block;
}

function enumMembers(name: string): string[] {
  const block = schemaSource().match(new RegExp(`enum ${name} \\{\\n([^}]*)\\n\\}`))?.[1];

  if (block === undefined) {
    throw new Error(`enum ${name} not found in schema.prisma`);
  }

  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//") && !line.startsWith("@@"))
    .map((line) => line.split(/\s+/, 1)[0] ?? "");
}

describe("BIBLE_LOCKABLE_MODELS", () => {
  it("names only models the ownership registry knows", () => {
    // Every read and every write of a lock goes through `scopedWhere`, which
    // takes a `ProjectOwnedModelName`. A model outside the registry would have
    // no path to a project, so a lock on it could not be scoped to an owner.
    for (const model of BIBLE_LOCKABLE_MODELS) {
      expect(PROJECT_OWNED_MODEL_NAMES).toContain(model);
    }
  });

  it("names only models that actually carry the column", () => {
    // The pin the whole registry exists for: a model listed here with no
    // `lockedAt` would make every lock query fail at runtime, and a model
    // carrying one but missing here would be silently unlockable.
    for (const model of BIBLE_LOCKABLE_MODELS) {
      expect(modelBlock(model)).toMatch(/^\s*lockedAt\s+DateTime\?/m);
    }
  });

  it("leaves the chapter plan out, which is locked under the same convention elsewhere", () => {
    // `ChapterOutline.lockedAt` exists and is CAL-107's. Including it here
    // would make a bible mission's gate read a lock on the outline.
    expect(modelBlock("ChapterOutline")).toMatch(/^\s*lockedAt\s+DateTime\?/m);
    expect(BIBLE_LOCKABLE_MODELS).not.toContain("ChapterOutline");
  });

  it("holds no duplicate", () => {
    expect(new Set(BIBLE_LOCKABLE_MODELS).size).toBe(BIBLE_LOCKABLE_MODELS.length);
  });

  it("answers the membership question it is read through", () => {
    expect(isBibleLockableModel("CanonFact")).toBe(true);
    expect(isBibleLockableModel("Chapter")).toBe(false);
    expect(isBibleLockableModel("Bible")).toBe(false);
  });
});

describe("CHARACTER_LOCK_FIELDS", () => {
  it("mirrors the CharacterField enum, in order", () => {
    // Same arrangement as `MISSION_LOCK_SCOPE` against `GenerationMission`: the
    // enum is what PostgreSQL stores, and this tuple is what the repository
    // validates a caller's field against.
    expect([...CHARACTER_LOCK_FIELDS]).toEqual(enumMembers("CharacterField"));
  });

  it("answers the membership question it is read through", () => {
    expect(isCharacterLockField("SECRET")).toBe(true);
    expect(isCharacterLockField("secret")).toBe(false);
    expect(isCharacterLockField("LOCKED_AT")).toBe(false);
  });
});

describe("FIELD_LOCKABLE_MODEL", () => {
  it("is the character sheet, the one model the specification asks it of", () => {
    expect(FIELD_LOCKABLE_MODEL).toBe("Character");
    expect(modelBlock("Character")).toMatch(/lockedFields\s+CharacterField\[\]/);
  });

  it("is the only model carrying a field lock", () => {
    for (const model of BIBLE_LOCKABLE_MODELS) {
      if (model === FIELD_LOCKABLE_MODEL) continue;

      expect(modelBlock(model)).not.toMatch(/lockedFields/);
    }
  });
});

describe("CHARACTER_LOCK_FIELD_LABELS", () => {
  it("names every lockable field, and only those", () => {
    expect(Object.keys(CHARACTER_LOCK_FIELD_LABELS).sort()).toEqual(
      [...CHARACTER_LOCK_FIELDS].sort(),
    );
  });
});

describe("BIBLE_LOCK_LABELS", () => {
  it("names every lockable model, and only those", () => {
    expect(Object.keys(BIBLE_LOCK_LABELS).sort()).toEqual([...BIBLE_LOCKABLE_MODELS].sort());
  });

  it("agrees the pronoun with the clause, so the remedy stays grammatical", () => {
    for (const label of Object.values(BIBLE_LOCK_LABELS)) {
      const feminine = label.locked.endsWith("verrouillée");

      expect(label.pronoun).toBe(feminine ? "la" : "le");
    }
  });
});
