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

  return (
    block[1]
      .split("\n")
      // A member may carry a trailing `//` comment — AnalysisSection keeps the
      // specification's French wording beside each identifier — so the comment is
      // dropped before the member is recognised.
      .map((line) => line.replace(/\/\/.*$/, "").trim())
      .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line))
  );
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

  describe("narrative analysis", () => {
    // CAL-014's first acceptance criterion: every section of the specification
    // is represented. The enum is that representation, so the list is pinned
    // here in the specification's own order, with its wording beside each
    // identifier — the same treatment ProjectStatus gets above.
    it("declares the seventeen sections of the specification, in order", () => {
      expect(enumMembers("AnalysisSection")).toEqual([
        "FACTUAL_SUMMARY", // résumé factuel
        "PREMISE", // prémisse
        "MAIN_CONFLICT", // conflit principal
        "NARRATIVE_PROMISE", // promesse du récit
        "THEMES", // thèmes
        "CHARACTERS", // personnages identifiés
        "RELATIONSHIPS", // relations
        "POINT_OF_VIEW", // point de vue
        "TENSE", // temps verbal
        "TONE", // tonalité
        "SINGULAR_ELEMENTS", // éléments singuliers
        "AMBIGUITIES", // ambiguïtés
        "OPEN_QUESTIONS", // questions non résolues
        "ELEMENTS_TO_PRESERVE", // éléments à préserver
        "WEAKNESSES", // fragilités
        "CLICHE_RISKS", // risques de clichés
        "DEVELOPMENT_POTENTIAL", // potentiel de développement
      ]);
    });

    // CAL-014's second acceptance criterion, and the glossary's own naming.
    it("declares the two element markers of the glossary", () => {
      expect(enumMembers("AnalysisElementKind")).toEqual([
        "FACTUAL", // fait explicite
        "INTERPRETATION", // interprétation
      ]);
    });

    it("distinguishes a generated revision from an edited one", () => {
      expect(enumMembers("AnalysisRevisionOrigin")).toEqual(["GENERATED", "EDITED"]);
    });

    it("marks every element, since the column admits no null", () => {
      expect(modelBlock("AnalysisElement")).toMatch(/kind\s+AnalysisElementKind(?!\?)/);
    });

    it("versions by section, so one section can be regenerated alone", () => {
      const revision = modelBlock("AnalysisSectionRevision");

      expect(revision).toMatch(/section\s+AnalysisSection(?!\?)/);
      expect(revision).toMatch(/@@unique\(\[analysisId, section, revisionNumber\]\)/);
    });

    // The current revision is the highest-numbered one, by definition of an
    // append-only table. A flag beside it could point at revision 2 while
    // revision 3 exists, and no constraint could forbid that.
    it("keeps no denormalised marker of the current revision", () => {
      expect(modelBlock("AnalysisSectionRevision")).not.toMatch(/^\s*(isCurrent|supersededAt)\s/m);
    });

    // The validation status is the timestamp. An enum beside it could only
    // contradict it — the lesson CAL-012 recorded on targetWordCount.
    it("carries the validation as a timestamp and its author, and nothing else", () => {
      const analysis = modelBlock("Analysis");

      expect(analysis).toMatch(/validatedAt\s+DateTime\?/);
      expect(analysis).toMatch(/validatedById\s+String\?/);
      expect(analysis).not.toMatch(/^\s*status\s/m);
    });

    it("holds one analysis per project", () => {
      expect(modelBlock("Analysis")).toMatch(/projectId\s+String\s+@unique/);
    });

    // Revisions and elements are immutable, so an updatedAt on either could
    // only be a copy of the revision's createdAt, free to drift from it.
    it("timestamps the mutable rows only", () => {
      expect(modelBlock("AnalysisSectionRevision")).not.toMatch(/^\s*updatedAt\s/m);
      expect(modelBlock("AnalysisElement")).not.toMatch(/^\s*(updatedAt|createdAt)\s/m);
      expect(modelBlock("AnalysisAnnotation")).toMatch(/^\s*updatedAt\s/m);
    });

    it("maps to snake_case plural tables, as every model does", () => {
      expect(modelBlock("Analysis")).toMatch(/@@map\("analyses"\)/);
      expect(modelBlock("AnalysisSectionRevision")).toMatch(
        /@@map\("analysis_section_revisions"\)/,
      );
      expect(modelBlock("AnalysisElement")).toMatch(/@@map\("analysis_elements"\)/);
      expect(modelBlock("AnalysisAnnotation")).toMatch(/@@map\("analysis_annotations"\)/);
    });
  });

  describe("creative direction", () => {
    // CAL-015's content line: the twelve attributes of the specification.
    it("carries the twelve attributes of the specification", () => {
      const direction = modelBlock("CreativeDirection");

      for (const field of [
        "workingTitle",
        "developedPremise",
        "dominantGenre",
        "mainConflict",
        "protagonistArc",
        "newStakes",
        "charactersToIntroduce",
        "endingNature",
        "mainRisks",
        "elementsKeptFromSource",
        "elementsTransformed",
        "novelPotentialAssessment",
      ]) {
        expect(direction).toMatch(new RegExp(`^\\s*${field}\\s+\\S`, "m"));
      }
    });

    it("distinguishes a proposal, an edit and a user-written direction", () => {
      expect(enumMembers("DirectionOrigin")).toEqual(["PROPOSED", "EDITED", "USER_WRITTEN"]);
    });

    it("marks every direction with its origin, since the column admits no null", () => {
      expect(modelBlock("CreativeDirection")).toMatch(/origin\s+DirectionOrigin(?!\?)/);
    });

    // The predicate CLAUDE.md §4.2 gives as its own example of boolean naming,
    // defaulted off: a freshly proposed direction is not canonical until chosen.
    it("marks the canonical direction with a boolean, defaulted to false", () => {
      expect(modelBlock("CreativeDirection")).toMatch(/isCanonical\s+Boolean\s+@default\(false\)/);
    });

    // At most one canonical direction per project is a partial unique index,
    // not a column, since Prisma's schema DSL has no syntax for it — see the
    // add_creative_direction migration and its integration test.
    it("keeps no per-project canonical uniqueness in the schema DSL itself", () => {
      expect(modelBlock("CreativeDirection")).not.toMatch(/@@unique\(\[projectId\]\)/);
    });

    it("indexes the per-project listing", () => {
      expect(modelBlock("CreativeDirection")).toMatch(/@@index\(\[projectId\]\)/);
    });

    it("maps to a snake_case plural table", () => {
      expect(modelBlock("CreativeDirection")).toMatch(/@@map\("creative_directions"\)/);
    });
  });
});
