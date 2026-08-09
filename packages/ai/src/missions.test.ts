import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MISSION_IDS } from "./missions";

const SCHEMA_PATH = fileURLToPath(new URL("../../../prisma/schema.prisma", import.meta.url));

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

describe("the mission identifiers", () => {
  // CLAUDE.md §4.2: mission ids are kebab-case verbs; the Prisma enum mirrors
  // them in SCREAMING_SNAKE. Same ten, same order — order matters because the
  // list is also how screens will present the missions.
  it("mirror the GenerationMission Prisma enum, in order", () => {
    const fromSchema = enumMembers(schemaSource(), "GenerationMission");
    const fromIds = MISSION_IDS.map((id) => id.replaceAll("-", "_").toUpperCase());

    expect(fromIds).toEqual(fromSchema);
  });

  it("are kebab-case verbs, unique", () => {
    for (const id of MISSION_IDS) {
      expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }

    expect(new Set(MISSION_IDS).size).toBe(MISSION_IDS.length);
  });
});
