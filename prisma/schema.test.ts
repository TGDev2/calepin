import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const schema = readFileSync(fileURLToPath(new URL("./schema.prisma", import.meta.url)), "utf8");

/**
 * The members of a Prisma enum, in declaration order.
 *
 * Reading the schema file rather than the generated client is deliberate: this
 * suite runs in the `unit` project, which must stay free of a database and of
 * `prisma generate`. The schema file is also the artefact under review.
 */
function enumMembers(name: string): string[] {
  const block = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(schema);
  if (!block?.[1]) throw new Error(`enum ${name} is not declared in schema.prisma`);

  return block[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line));
}

function modelBlock(name: string): string {
  const block = new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (!block?.[1]) throw new Error(`model ${name} is not declared in schema.prisma`);

  return block[1];
}

describe("prisma schema", () => {
  // The specification fixes this list and CAL-012's acceptance criterion is that
  // the schema matches it exactly. The French labels are the specification's own
  // wording, kept beside each identifier so a later edit has to confront the
  // mapping rather than guess at it.
  it("declares the ten project statuses of the specification, and only those", () => {
    expect(enumMembers("ProjectStatus")).toEqual([
      "DRAFT", // brouillon
      "ANALYSIS_IN_PROGRESS", // analyse en cours
      "DIRECTION_TO_CHOOSE", // direction à choisir
      "BIBLE_TO_VALIDATE", // bible à valider
      "OUTLINE_IN_PROGRESS", // plan en construction
      "WRITING_IN_PROGRESS", // rédaction en cours
      "REVISION", // révision
      "COMPLETED", // terminé
      "PUBLISHED", // publié
      "ARCHIVED", // archivé
    ]);
  });

  it("declares the four target lengths, the fourth being the custom one", () => {
    expect(enumMembers("TargetLength")).toEqual([
      "SHORT", // roman court, 30-45k (CAL-043)
      "STANDARD", // roman standard, 50-80k
      "LONG", // roman long, 80-110k
      "CUSTOM", // longueur personnalisée, value in Project.targetWordCount
    ]);
  });

  it("declares the three freedom levels of the glossary", () => {
    expect(enumMembers("FreedomLevel")).toEqual([
      "LOW", // faible
      "BALANCED", // équilibré
      "HIGH", // élevé
    ]);
  });

  describe("project", () => {
    it("carries the attributes the specification names", () => {
      const project = modelBlock("Project");

      for (const field of [
        "title",
        "language",
        "targetLength",
        "targetWordCount",
        "targetAudience",
        "freedomLevel",
        "status",
      ]) {
        expect(project).toMatch(new RegExp(`^\\s*${field}\\s+\\S`, "m"));
      }
    });

    it("holds the custom word count as optional, since only CUSTOM sets it", () => {
      expect(modelBlock("Project")).toMatch(/targetWordCount\s+Int\?/);
    });

    it("indexes the dashboard listing by user, and never by user alone", () => {
      const project = modelBlock("Project");

      expect(project).toMatch(/@@index\(\[userId, updatedAt\]\)/);
      expect(project).toMatch(/@@index\(\[userId, status\]\)/);
      expect(project).not.toMatch(/@@index\(\[userId\]\)/);
    });

    it("maps to a snake_case plural table, as every model does", () => {
      expect(modelBlock("Project")).toMatch(/@@map\("projects"\)/);
      expect(modelBlock("User")).toMatch(/@@map\("users"\)/);
    });
  });
});
