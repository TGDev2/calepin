import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MISSION_WRITE_TARGET_KIND, missionsWritingTo } from "../generation/write-target";
import { BIBLE_LOCKABLE_MODELS } from "./models";
import {
  isMissionNarrowedToTarget,
  MISSION_LOCK_SCOPE,
  missionLockScope,
  MISSIONS_NARROWED_TO_TARGET,
} from "./scope";

const SCHEMA_PATH = fileURLToPath(new URL("../../../../prisma/schema.prisma", import.meta.url));

function enumMembers(name: string): string[] {
  const source = readFileSync(SCHEMA_PATH, "utf8").replaceAll("\r\n", "\n");
  const block = source.match(new RegExp(`enum ${name} \\{\\n([^}]*)\\n\\}`))?.[1];

  if (block === undefined) {
    throw new Error(`enum ${name} not found in schema.prisma`);
  }

  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//") && !line.startsWith("@@"))
    .map((line) => line.split(/\s+/, 1)[0] ?? "");
}

describe("MISSION_LOCK_SCOPE", () => {
  it("declares a scope for every mission the schema has, and nothing else", () => {
    // The point of the pin: a mission added later with no entry would be free
    // to rebuild a locked section, and nothing would say so.
    expect(Object.keys(MISSION_LOCK_SCOPE).sort()).toEqual(
      [...enumMembers("GenerationMission")].sort(),
    );
  });

  it("only ever names a lockable model", () => {
    for (const models of Object.values(MISSION_LOCK_SCOPE)) {
      for (const model of models) {
        expect(BIBLE_LOCKABLE_MODELS).toContain(model);
      }
    }
  });

  it("names a model at most once per mission", () => {
    for (const models of Object.values(MISSION_LOCK_SCOPE)) {
      expect(new Set(models).size).toBe(models.length);
    }
  });

  it("leaves every mission that writes outside the bible with nothing to block", () => {
    // A lock is a bible element, so a mission writing into the analysis, the
    // directions, the outline, a chapter, a part or the audit cannot meet one.
    for (const mission of Object.keys(MISSION_LOCK_SCOPE) as (keyof typeof MISSION_LOCK_SCOPE)[]) {
      if (MISSION_WRITE_TARGET_KIND[mission] === "bible") continue;

      expect(missionLockScope(mission)).toEqual([]);
    }
  });

  it("gives every bible mission but one the models it rebuilds", () => {
    const bible = missionsWritingTo("bible");
    const scoped = bible.filter((mission) => MISSION_LOCK_SCOPE[mission].length > 0);

    expect(scoped.sort()).toEqual([
      "BUILD_TIMELINE",
      "CREATE_CHARACTER_SHEET",
      "DEFINE_NOVEL_IDENTITY",
      "DEFINE_STYLE",
      "DEFINE_WORLD",
      "EXTRACT_INITIAL_FACTS",
      "RELATE_CHARACTERS",
    ]);
  });

  it("never blocks the per-chapter fact extraction, whatever is locked", () => {
    // The load-bearing omission. EXTRACT_FACTS proposes PROPOSED rows from one
    // written chapter for the author to arbitrate (CAL-128); it rewrites
    // nothing. Naming CanonFact here would stop the whole writing loop the
    // moment an author locked a single fact — the detector that cries wolf, and
    // then the requirement is lost rather than met.
    expect(MISSION_LOCK_SCOPE.EXTRACT_FACTS).toEqual([]);
  });

  it("covers each bible section exactly once across the missions", () => {
    // Two missions rebuilding one model would each be gated on the other's
    // locks, and a model no mission names could never block anything.
    const named = Object.values(MISSION_LOCK_SCOPE).flat();

    expect([...new Set(named)].sort()).toEqual([...BIBLE_LOCKABLE_MODELS].sort());
    // `Relationship` is the one model two missions rebuild, and legitimately:
    // a sheet declares the edges leaving its own character (CAL-090), the graph
    // mission declares all of them (CAL-091).
    expect(named.filter((model) => model === "Relationship")).toHaveLength(2);
  });
});

describe("MISSIONS_NARROWED_TO_TARGET", () => {
  it("holds the one mission asked about a single character", () => {
    expect([...MISSIONS_NARROWED_TO_TARGET]).toEqual(["CREATE_CHARACTER_SHEET"]);
  });

  it("narrows nothing that rebuilds a section whole", () => {
    for (const mission of ["DEFINE_WORLD", "BUILD_TIMELINE", "RELATE_CHARACTERS"] as const) {
      expect(isMissionNarrowedToTarget(mission)).toBe(false);
    }
  });

  it("only ever narrows a mission that has a scope to narrow", () => {
    for (const mission of MISSIONS_NARROWED_TO_TARGET) {
      expect(MISSION_LOCK_SCOPE[mission].length).toBeGreaterThan(0);
    }
  });
});
