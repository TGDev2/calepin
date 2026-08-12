import { describe, expect, it } from "vitest";

import { type BibleLockedElement, checkBibleLocks } from "./gate";
import type { BibleLockableModel } from "./models";

function lock(
  model: BibleLockableModel,
  id: string,
  extra: Partial<BibleLockedElement> = {},
): BibleLockedElement {
  return { model, id, fields: [], characterId: null, ...extra };
}

describe("checkBibleLocks", () => {
  it("lets a mission through when the bible holds no lock at all", () => {
    const gate = checkBibleLocks({ mission: "DEFINE_WORLD", targetId: null, locks: [] });

    expect(gate.blocked).toBe(false);
    expect(gate.blocking).toEqual([]);
    expect(gate.mission).toBe("DEFINE_WORLD");
  });

  it("blocks a mission that would rebuild the section holding the lock", () => {
    const gate = checkBibleLocks({
      mission: "DEFINE_WORLD",
      targetId: null,
      locks: [lock("WorldRule", "rule-1")],
    });

    expect(gate.blocked).toBe(true);
    expect(gate.blocking).toEqual([lock("WorldRule", "rule-1")]);
  });

  it("names every lock in the way, not the first one found", () => {
    // The author has to lift all of them, so a report naming one would send
    // them round the loop once per lock.
    const gate = checkBibleLocks({
      mission: "DEFINE_WORLD",
      targetId: null,
      locks: [lock("WorldRule", "rule-1"), lock("Place", "place-1"), lock("BibleWorld", "world-1")],
    });

    expect(gate.blocking.map((element) => element.id)).toEqual(["rule-1", "place-1", "world-1"]);
  });

  it("ignores a lock on a section the mission does not rebuild", () => {
    // A locked character must not stop the chronology. This is the whole
    // reason the scope table is finer than MISSION_WRITE_TARGET_KIND, which
    // would have called both of these "the bible".
    const gate = checkBibleLocks({
      mission: "BUILD_TIMELINE",
      targetId: null,
      locks: [lock("Character", "character-1"), lock("CanonFact", "fact-1")],
    });

    expect(gate.blocked).toBe(false);
  });

  it("never blocks a mission that rebuilds nothing, whatever is locked", () => {
    const everything: BibleLockedElement[] = [
      lock("BibleIdentity", "identity-1"),
      lock("BibleStyle", "style-1"),
      lock("BibleWorld", "world-1"),
      lock("Character", "character-1", { characterId: "character-1" }),
      lock("Relationship", "edge-1", { characterId: "character-1" }),
      lock("Place", "place-1"),
      lock("WorldRule", "rule-1"),
      lock("TimelineEvent", "event-1"),
      lock("CanonFact", "fact-1"),
    ];

    for (const mission of ["EXTRACT_FACTS", "WRITE_SCENE", "CHECK_COHERENCE"] as const) {
      expect(checkBibleLocks({ mission, targetId: "chapter-1", locks: everything }).blocked).toBe(
        false,
      );
    }
  });

  describe("a mission narrowed to the character it names", () => {
    const locks = [
      lock("Character", "character-1", { characterId: "character-1" }),
      lock("Relationship", "edge-1", { characterId: "character-1" }),
      lock("Character", "character-2", { characterId: "character-2" }),
      lock("Relationship", "edge-2", { characterId: "character-2" }),
    ];

    it("is blocked by its own sheet's lock", () => {
      const gate = checkBibleLocks({
        mission: "CREATE_CHARACTER_SHEET",
        targetId: "character-1",
        locks,
      });

      expect(gate.blocking.map((element) => element.id)).toEqual(["character-1", "edge-1"]);
    });

    it("is not blocked by another character's", () => {
      const gate = checkBibleLocks({
        mission: "CREATE_CHARACTER_SHEET",
        targetId: "character-3",
        locks,
      });

      expect(gate.blocked).toBe(false);
    });

    it("keeps every lock of its models when its row names no target", () => {
      // Conservative on purpose, `generationWriteTarget`'s reading of the same
      // defect: a row missing its target is a defect upstream, and the safe
      // reading of one is to block on everything rather than on nothing.
      const gate = checkBibleLocks({ mission: "CREATE_CHARACTER_SHEET", targetId: null, locks });

      expect(gate.blocking).toHaveLength(4);
    });

    it("blocks the graph mission on every edge, since it rebuilds them all", () => {
      const gate = checkBibleLocks({
        mission: "RELATE_CHARACTERS",
        targetId: "character-1",
        locks,
      });

      expect(gate.blocking.map((element) => element.id)).toEqual(["edge-1", "edge-2"]);
    });
  });

  it("treats a field lock exactly as a row lock, since the sheet is rebuilt whole", () => {
    const gate = checkBibleLocks({
      mission: "CREATE_CHARACTER_SHEET",
      targetId: "character-1",
      locks: [lock("Character", "character-1", { characterId: "character-1", fields: ["SECRET"] })],
    });

    expect(gate.blocked).toBe(true);
    expect(gate.blocking[0]?.fields).toEqual(["SECRET"]);
  });

  it("reports identifiers only, so the report is safe to log", () => {
    // §9. A gate report is exactly the kind of value that ends up in a log
    // line; a name, a statement or a label would be literary content.
    const gate = checkBibleLocks({
      mission: "EXTRACT_INITIAL_FACTS",
      targetId: null,
      locks: [lock("CanonFact", "fact-1")],
    });

    expect(Object.keys(gate).sort()).toEqual(["blocked", "blocking", "mission"]);

    for (const element of gate.blocking) {
      expect(Object.keys(element).sort()).toEqual(["characterId", "fields", "id", "model"]);
    }
  });
});
