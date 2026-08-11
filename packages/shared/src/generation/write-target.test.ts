import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  GENERATION_WRITE_TARGET_KINDS,
  generationWriteTarget,
  isProjectWideWriteTarget,
  MISSION_WRITE_TARGET_KIND,
  missionsWritingTo,
  PROJECT_WIDE_WRITE_TARGET_KINDS,
  sameWriteTarget,
  WRITE_TARGET_RETRY_DELAY_MS,
} from "./write-target";

const SCHEMA_PATH = fileURLToPath(new URL("../../../../prisma/schema.prisma", import.meta.url));

/**
 * Normalised at the read, so a clone that checked the schema out with CRLF
 * cannot defeat the parsing below (tasks/lessons.md, CAL-044).
 */
function schemaSource(): string {
  return readFileSync(SCHEMA_PATH, "utf8").replaceAll("\r\n", "\n");
}

function enumMembers(source: string, name: string): string[] {
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

describe("MISSION_WRITE_TARGET_KIND", () => {
  it("declares a write target for every mission the schema has, and nothing else", () => {
    // The point of the pin: a mission added later with no write target would
    // otherwise hold no lock at all and be free to run beside anything.
    const missions = enumMembers(schemaSource(), "GenerationMission");

    expect(Object.keys(MISSION_WRITE_TARGET_KIND).sort()).toEqual([...missions].sort());
  });

  it("only ever names a declared kind", () => {
    for (const kind of Object.values(MISSION_WRITE_TARGET_KIND)) {
      expect(GENERATION_WRITE_TARGET_KINDS).toContain(kind);
    }
  });

  it("puts every mission that writes chapter text on the chapter", () => {
    expect(MISSION_WRITE_TARGET_KIND.WRITE_SCENE).toBe("chapter");
    expect(MISSION_WRITE_TARGET_KIND.FIX_ISSUE).toBe("chapter");
    expect(MISSION_WRITE_TARGET_KIND.SUMMARIZE_CHAPTER).toBe("chapter");
  });

  it("puts fact extraction on the bible it writes, not the chapter it reads", () => {
    // The distinction the whole table exists for: EXTRACT_FACTS carries a
    // chapter in `targetId` and writes CanonFact rows into the one bible.
    expect(MISSION_WRITE_TARGET_KIND.EXTRACT_FACTS).toBe("bible");
    expect(MISSION_WRITE_TARGET_KIND.CREATE_CHARACTER_SHEET).toBe("bible");
  });

  it("keeps the coherence audit off every narrative target", () => {
    // An audit reads the novel and writes only QualityIssue rows, so it must
    // not hold a chapter — a check that would block writing while it ran.
    expect(MISSION_WRITE_TARGET_KIND.CHECK_COHERENCE).toBe("audit");
  });
});

describe("PROJECT_WIDE_WRITE_TARGET_KINDS", () => {
  it("holds exactly the kinds a project has one of", () => {
    expect([...PROJECT_WIDE_WRITE_TARGET_KINDS].sort()).toEqual([
      "analysis",
      "audit",
      "bible",
      "directions",
      "outline",
    ]);
  });

  it("leaves the kinds a project has several of keyed by their own id", () => {
    for (const kind of ["chapter", "part", "direction"] as const) {
      expect(isProjectWideWriteTarget(kind)).toBe(false);
    }
  });
});

describe("generationWriteTarget", () => {
  it("drops the target id of a project-wide kind, so two of them still collide", () => {
    const sheet = generationWriteTarget("CREATE_CHARACTER_SHEET", "character-1");
    const facts = generationWriteTarget("EXTRACT_FACTS", "chapter-9");

    expect(sheet).toEqual({ kind: "bible", id: null });
    expect(sameWriteTarget(sheet, facts)).toBe(true);
  });

  it("keeps two chapters apart, so a novel can be written in more than one place", () => {
    const seven = generationWriteTarget("WRITE_SCENE", "chapter-7");
    const eight = generationWriteTarget("WRITE_SCENE", "chapter-8");

    expect(sameWriteTarget(seven, eight)).toBe(false);
  });

  it("collides two missions that write the same chapter through different work", () => {
    const written = generationWriteTarget("WRITE_SCENE", "chapter-7");
    const fixed = generationWriteTarget("FIX_ISSUE", "chapter-7");
    const summarised = generationWriteTarget("SUMMARIZE_CHAPTER", "chapter-7");

    expect(sameWriteTarget(written, fixed)).toBe(true);
    expect(sameWriteTarget(written, summarised)).toBe(true);
  });

  it("never collides two different kinds", () => {
    expect(
      sameWriteTarget(
        generationWriteTarget("WRITE_SCENE", "id-1"),
        generationWriteTarget("SUMMARIZE_PART", "id-1"),
      ),
    ).toBe(false);
  });

  it("treats a targeted mission with no target id as excluding its whole kind", () => {
    // Conservative on purpose: a row missing its target is a defect upstream,
    // and the safe reading of one is to exclude everything rather than nothing.
    const orphan = generationWriteTarget("WRITE_SCENE", null);

    expect(orphan.id).toBeNull();
    expect(sameWriteTarget(orphan, generationWriteTarget("FIX_ISSUE", null))).toBe(true);
  });
});

describe("missionsWritingTo", () => {
  it("lists every mission of a kind and no other", () => {
    expect(missionsWritingTo("chapter").sort()).toEqual([
      "FIX_ISSUE",
      "SUMMARIZE_CHAPTER",
      "WRITE_SCENE",
    ]);
    expect(missionsWritingTo("bible").sort()).toEqual([
      "CREATE_CHARACTER_SHEET",
      "DEFINE_NOVEL_IDENTITY",
      "EXTRACT_FACTS",
    ]);
    expect(missionsWritingTo("directions").sort()).toEqual([
      "COMBINE_DIRECTIONS",
      "PROPOSE_DIRECTIONS",
      "REPLACE_DIRECTION",
    ]);
  });

  it("covers every mission exactly once across the kinds", () => {
    const covered = GENERATION_WRITE_TARGET_KINDS.flatMap((kind) => missionsWritingTo(kind));

    expect(covered.sort()).toEqual(Object.keys(MISSION_WRITE_TARGET_KIND).sort());
  });
});

describe("WRITE_TARGET_RETRY_DELAY_MS", () => {
  it("stays under the sweep's staleness window, which is all it has to beat", () => {
    // GENERATION_STALE_AFTER_MS is two minutes (`../queue/queues.ts`); a
    // deadline past it would make the wait longer than having no deadline.
    expect(WRITE_TARGET_RETRY_DELAY_MS).toBeGreaterThan(0);
    expect(WRITE_TARGET_RETRY_DELAY_MS).toBeLessThan(2 * 60_000);
  });
});
