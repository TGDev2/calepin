import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MISSION_PRIORITY, MISSION_QUEUE } from "./mission-routing";
import { GENERATION_QUEUE_NAMES } from "./queues";

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

describe("MISSION_QUEUE", () => {
  it("routes every mission the schema declares, and nothing else", () => {
    const missions = enumMembers(schemaSource(), "GenerationMission");

    expect(Object.keys(MISSION_QUEUE).sort()).toEqual([...missions].sort());
  });

  it("routes to a queue that is actually declared", () => {
    for (const queue of Object.values(MISSION_QUEUE)) {
      expect(GENERATION_QUEUE_NAMES).toContain(queue);
    }
  });

  it("groups the fast lane exactly as extraction and summaries", () => {
    // The only three on Sonnet at `low` effort with expectedDurationMs ≤ 60s
    // (`@calepin/ai/mission-registry.ts`).
    const fast = Object.entries(MISSION_QUEUE)
      .filter(([, queue]) => queue === "generation-fast")
      .map(([mission]) => mission)
      .sort();

    expect(fast).toEqual(["EXTRACT_FACTS", "SUMMARIZE_CHAPTER", "SUMMARIZE_PART"]);
  });

  it("gives the coherence audit its own lane, alone", () => {
    const audit = Object.entries(MISSION_QUEUE)
      .filter(([, queue]) => queue === "generation-audit")
      .map(([mission]) => mission);

    expect(audit).toEqual(["CHECK_COHERENCE"]);
  });

  it("puts fix-issue beside write-scene, not beside extract-facts", () => {
    // mission-registry.ts's own comment: FIX_ISSUE "stays where write-scene
    // is" rather than following EXTRACT_FACTS.
    expect(MISSION_QUEUE.FIX_ISSUE).toBe(MISSION_QUEUE.WRITE_SCENE);
    expect(MISSION_QUEUE.FIX_ISSUE).not.toBe(MISSION_QUEUE.EXTRACT_FACTS);
  });
});

describe("MISSION_PRIORITY", () => {
  it("is total over the same missions MISSION_QUEUE routes", () => {
    expect(Object.keys(MISSION_PRIORITY).sort()).toEqual(Object.keys(MISSION_QUEUE).sort());
  });

  it("is a valid BullMQ priority for every mission", () => {
    for (const priority of Object.values(MISSION_PRIORITY)) {
      expect(Number.isInteger(priority)).toBe(true);
      expect(priority).toBeGreaterThanOrEqual(1);
    }
  });

  it("declares the fast and audit lanes equally urgent within themselves", () => {
    expect(MISSION_PRIORITY.EXTRACT_FACTS).toBe(MISSION_PRIORITY.SUMMARIZE_CHAPTER);
    expect(MISSION_PRIORITY.EXTRACT_FACTS).toBe(MISSION_PRIORITY.SUMMARIZE_PART);
  });

  it("orders the slow lane by the real downstream chain, upstream first", () => {
    // analysis -> direction -> bible -> outline -> chapters
    // (@calepin/shared/obsolescence's own DOWNSTREAM_STAGES).
    expect(MISSION_PRIORITY.ANALYZE_SOURCE_TEXT).toBeLessThan(MISSION_PRIORITY.PROPOSE_DIRECTIONS);
    expect(MISSION_PRIORITY.PROPOSE_DIRECTIONS).toBe(MISSION_PRIORITY.EVALUATE_DIRECTION);
    expect(MISSION_PRIORITY.EVALUATE_DIRECTION).toBeLessThan(
      MISSION_PRIORITY.CREATE_CHARACTER_SHEET,
    );
    expect(MISSION_PRIORITY.CREATE_CHARACTER_SHEET).toBeLessThan(
      MISSION_PRIORITY.BUILD_CHAPTER_OUTLINE,
    );
    expect(MISSION_PRIORITY.BUILD_CHAPTER_OUTLINE).toBeLessThan(MISSION_PRIORITY.WRITE_SCENE);
    expect(MISSION_PRIORITY.WRITE_SCENE).toBe(MISSION_PRIORITY.FIX_ISSUE);
  });
});
