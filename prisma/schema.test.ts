import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  AUDIT_AUTHOR_FIELD,
  AUDIT_AUTHOR_RELATION,
  AUDIT_UNATTRIBUTED,
  AUDIT_VERSION_FIELD,
  AUDITED_MODEL_NAMES,
  AUDITED_MODELS,
  UNAUDITED_MUTABLE_MODELS,
} from "@calepin/shared/audit";
import {
  DUPLICATED_MODEL_NAMES,
  DUPLICATION_PLAN,
  isUnduplicatedModel,
  NEVER_COPIED_COLUMNS,
  PROJECT_OWNED_MODEL_NAMES,
  PROJECT_OWNED_MODELS,
  PROJECT_OWNER_FIELD,
  UNOWNED_MODELS,
} from "@calepin/shared/repository";
import { describe, expect, it } from "vitest";

/**
 * Read with the line endings normalised, because several helpers below strip a
 * trailing `//` comment with a regex anchored on `$`.
 *
 * JavaScript counts `\r` as a line terminator, so `.` will not cross one and a
 * `$` with no `m` flag will not match before one: on a CRLF working tree —
 * which is what `core.autocrlf=true` hands every Windows clone — the comment
 * survives the strip and sixteen enum assertions read an empty list. The
 * failure names the enums, never the line endings. `tasks/lessons.md` has
 * carried this trap since CAL-017; normalising once here is what stops it
 * depending on how a given clone happened to check the file out.
 */
const schema = readFileSync(
  fileURLToPath(new URL("./schema.prisma", import.meta.url)),
  "utf8",
).replaceAll("\r\n", "\n");

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

/** Every model declared in the schema, in declaration order. */
function declaredModels(): string[] {
  return [...schema.matchAll(/^model (\w+) \{/gm)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);
}

function modelBlock(name: string): string {
  const block = new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (!block?.[1]) throw new Error(`model ${name} is not declared in schema.prisma`);

  return block[1];
}

/**
 * The names of a model's fields, scalars and relations alike, in declaration
 * order. Doc comments (`///`), plain comments and block attributes (`@@`) are
 * not fields and never start with a lowercase letter, so the shape of the line
 * is enough to recognise one.
 *
 * The underscore in the pattern is for `Account` alone (CAL-024): the Auth.js
 * adapter's field names are the provider's, not §4.2's. Without it those seven
 * fields are invisible to every assertion here — which is how they were found.
 */
function modelFields(name: string): string[] {
  return modelBlock(name)
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .map((line) => /^([a-z][A-Za-z0-9_]*)\s+\S/.exec(line)?.[1])
    .filter((field): field is string => field !== undefined);
}

/**
 * A model's mandatory scalar fields — what a caller must supply to write a row,
 * which is what "required" means in the assertions below.
 *
 * The audit block (CAL-022) is excluded. `updatedById` and `version` are NOT
 * NULL, but they are bookkeeping the extension and the column default fill in;
 * counting them among a model's narrative requirements would say that a chapter
 * plan has five mandatory attributes when the product says it has three.
 */
function requiredScalarFields(name: string): string[] {
  return modelBlock(name)
    .split("\n")
    .map((line) => /^\s*([a-z][A-Za-z0-9]*)\s+(String|Int|Boolean)(?!\?)/.exec(line)?.[1])
    .filter((field): field is string => field !== undefined)
    .filter((field) => field !== AUDIT_AUTHOR_FIELD && field !== AUDIT_VERSION_FIELD);
}

function toScreamingSnake(field: string): string {
  return field.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

/**
 * A lowercase string-union constant exported by @calepin/shared, in
 * `SCREAMING_SNAKE`, ready to compare against a Prisma enum.
 *
 * Read from the package's source rather than imported. The `unit` project has
 * no workspace dependency on `@calepin/shared`, and reading the file is what
 * makes the pin real: the two lists are the same list, so a member added to one
 * and not to the other fails here instead of surfacing as a write error months
 * later.
 */
function sharedStringUnion(path: string, name: string): string[] {
  const source = readFileSync(
    fileURLToPath(new URL(`../packages/shared/src/${path}`, import.meta.url)),
    "utf8",
  );
  const block = new RegExp(`export const ${name} = \\[([^\\]]*)\\]`).exec(source);
  if (!block?.[1]) throw new Error(`${name} is not declared in ${path}`);

  // Both spellings, because the direction of the mirroring differs by case. A
  // union `@calepin/shared` owns is lowercase and the Prisma enum copies it
  // (`ERROR_CATEGORIES`); a union that copies a Prisma enum keeps that enum's
  // SCREAMING_SNAKE (`PROJECT_STATUSES`, `LIVE_GENERATION_STATUSES`). Uppercasing
  // afterwards makes one comparison serve both.
  return [...block[1].matchAll(/"([A-Za-z_]+)"/g)]
    .map((member) => member[1])
    .filter((member): member is string => member !== undefined)
    .map((member) => member.toUpperCase());
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

  // CAL-034. The state machine walks its own copy of this list — it has to, to
  // stay runnable without a generated client — so the two are pinned against
  // each other here as well as at compile time in
  // `repository/project-status.ts`. The *order* matters as much as the members:
  // it is what "one step forward" means in the transition table.
  it("mirrors the status order the state machine walks", () => {
    expect(enumMembers("ProjectStatus")).toEqual(
      sharedStringUnion("project-status/statuses.ts", "PROJECT_STATUSES"),
    );
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

  // CAL-044, the same pinning `ProjectStatus` gets above and for the same
  // reason: the policy walks its own copy of this list so it stays runnable
  // without a generated client, and the order carries meaning — it is what
  // "no dimension tightens as the level rises" is stated against.
  it("mirrors the freedom levels the policy is written over", () => {
    expect(enumMembers("FreedomLevel")).toEqual(
      sharedStringUnion("freedom-level/levels.ts", "FREEDOM_LEVELS"),
    );
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

    // CAL-033. Both counters are NOT NULL with a zero default, so no caller has
    // to know they exist: a project starts with nothing written, and the write
    // paths maintain them from there.
    it("stores the two aggregates the dashboard reads, defaulted to zero", () => {
      const project = modelBlock("Project");

      expect(project).toMatch(/writtenChapterCount\s+Int\s+@default\(0\)/);
      expect(project).toMatch(/totalWordCount\s+Int\s+@default\(0\)/);
    });

    // CAL-034. Archiving is the one status no narrative evidence can produce,
    // so it is written down as a timestamp — the shape every other decision of
    // its kind takes in this schema — and never as a status able to contradict
    // one. Nullable, because most projects have never been archived.
    it("records archiving as a timestamp, which is what makes the status derived", () => {
      expect(modelBlock("Project")).toMatch(/^\s*archivedAt\s+DateTime\?/m);
    });

    // The third dashboard number stays computed, deliberately: a chapter is
    // created by the outline domain (E10), which has no write path yet, and a
    // denormalised counter nothing maintains is wrong silently.
    it("stores no counter for the planned chapters", () => {
      expect(modelBlock("Project")).not.toMatch(/^\s*plannedChapterCount\s/m);
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

  describe("narrative bible", () => {
    // Everything about a bible element other than its own content: what
    // identifies it, what owns it, its lock, its timestamps and its relations.
    // Whatever a model holds beyond this list is one of its content fields.
    const NON_SHEET_CHARACTER_FIELDS = [
      "id",
      "bibleId",
      "lockedAt",
      "lockedFields",
      "createdAt",
      "updatedAt",
      // The audit block (CAL-022). Bookkeeping, not the sheet: nobody locks
      // "who last saved this", and a lockable field the author cannot write is
      // a member of CharacterField that means nothing.
      AUDIT_AUTHOR_FIELD,
      AUDIT_AUTHOR_RELATION,
      AUDIT_VERSION_FIELD,
      "bible",
      "outgoingRelationships",
      "incomingRelationships",
      // Where the character appears on the chronology (CAL-017). A back-relation,
      // not a sheet field: it is written on the event, not on the sheet, and
      // nothing about it is lockable on its own.
      "timelineAppearances",
      // The character's stance on each canonical fact and the facts they are a
      // subject of (CAL-018). Back-relations too, written on the fact's rows:
      // the sheet's own free-text form of the first is heldKnowledge above.
      "factBeliefs",
      "factSubjects",
      // The chapters the character focalises and the ones they appear in
      // (CAL-019). Back-relations again, written on the chapter outline: a
      // chapter names its cast, a sheet does not name its chapters.
      "chapterOutlinesFocal",
      "chapterAppearances",
    ];

    const characterSheetFields = modelFields("Character").filter(
      (field) => !NON_SHEET_CHARACTER_FIELDS.includes(field),
    );

    describe("identity and style", () => {
      // CAL-088's eleven fields, less the two that already live on Project.
      it("carries the identity fields of the specification", () => {
        const identity = modelBlock("BibleIdentity");

        for (const field of [
          "workingTitle",
          "genre",
          "subGenre",
          "tone",
          "narrativePromise",
          "themes",
          "counterThemes",
          "centralQuestion",
          "endingNature",
        ]) {
          expect(identity).toMatch(new RegExp(`^\\s*${field}\\s+\\S`, "m"));
        }
      });

      // CAL-012's lesson: a second column able to contradict the first becomes
      // the one consumers trust. The target length and the audience are the
      // author's, chosen on the project before any generation runs.
      it("does not restate the target length or the audience the project holds", () => {
        const identity = modelBlock("BibleIdentity");

        expect(identity).not.toMatch(/^\s*(targetLength|targetWordCount|targetAudience)\s/m);
        expect(modelBlock("Project")).toMatch(/^\s*targetLength\s/m);
      });

      it("carries the nine style fields of the specification", () => {
        const style = modelBlock("BibleStyle");

        for (const field of [
          "pointOfView",
          "focalization",
          "tense",
          "languageRegister",
          "descriptiveDensity",
          "pacing",
          "dialogueBalance",
          "recurringMotifs",
          "elementsToAvoid",
        ]) {
          expect(style).toMatch(new RegExp(`^\\s*${field}\\s+\\S`, "m"));
        }
      });

      // Two sections, two missions (CAL-088, CAL-089), two rows: a section that
      // has not been produced has no row, which is what lets its columns be
      // non-null instead of nine nulls each reader has to interpret.
      it("holds each section in its own row, one per bible", () => {
        expect(modelBlock("BibleIdentity")).toMatch(/bibleId\s+String\s+@unique/);
        expect(modelBlock("BibleStyle")).toMatch(/bibleId\s+String\s+@unique/);
        expect(modelBlock("Bible")).not.toMatch(/^\s*(workingTitle|pointOfView)\s/m);
      });

      // The same shape Analysis uses: the timestamp is the status, and the pair
      // moves together under bibles_validation_check.
      it("carries the validation as a timestamp and its author, and no status enum", () => {
        const bible = modelBlock("Bible");

        expect(bible).toMatch(/validatedAt\s+DateTime\?/);
        expect(bible).toMatch(/validatedById\s+String\?/);
        expect(bible).not.toMatch(/^\s*status\s/m);
      });
    });

    describe("the character sheet", () => {
      it("carries every field the specification names", () => {
        const character = modelBlock("Character");

        for (const field of [
          "name", // nom
          "age", // âge
          "role", // rôle
          "appearance", // apparence utile au récit
          "initialSituation", // situation initiale
          "apparentDesire", // désir apparent
          "deepNeed", // besoin profond
          "fear", // peur
          "contradiction", // contradiction
          "secret", // secret
          "past", // passé
          "plannedArc", // évolution prévue
          "speechStyle", // manière de parler
          "heldKnowledge", // connaissances détenues
          "elementsToPreserve", // éléments à ne pas modifier
        ]) {
          expect(character).toMatch(new RegExp(`^\\s*${field}\\s+\\S`, "m"));
        }
      });

      // CAL-090's acceptance criterion is about *main* characters, so which
      // characters are principal has to be a typed marker and not a reading of
      // the free-text role.
      it("marks importance with an enum, distinct from the free-text role", () => {
        expect(enumMembers("CharacterImportance")).toEqual([
          "MAIN", // personnage principal
          "SECONDARY", // personnage secondaire
          "MINOR", // personnage mineur
        ]);
        expect(modelBlock("Character")).toMatch(
          /importance\s+CharacterImportance\s+@default\(SECONDARY\)/,
        );
        expect(modelBlock("Character")).toMatch(/^\s*role\s+String\?/m);
      });

      // The age is numeric so CAL-093 can reject an impossible chronology and
      // CAL-017 can compute an age at an event.
      it("holds the age as a nullable integer", () => {
        expect(modelBlock("Character")).toMatch(/^\s*age\s+Int\?/m);
      });

      // The lock mechanism and the sheet field that declares an intent are two
      // different things, and the specification asks for both.
      it("keeps the declared elements to preserve beside the lock that enforces them", () => {
        const character = modelBlock("Character");

        expect(character).toMatch(/^\s*elementsToPreserve\s+String\[\]/m);
        expect(character).toMatch(/^\s*lockedFields\s+CharacterField\[\]/m);
      });
    });

    // The drift guard. A column added to the sheet without a matching enum
    // member — or an enum member naming a field no column answers to — fails
    // here, so "every sheet field is individually lockable" stays true by
    // construction rather than by care.
    describe("field-level locking", () => {
      it("declares exactly one lockable field per sheet field, in the same order", () => {
        expect(enumMembers("CharacterField")).toEqual(
          characterSheetFields.map((field) => toScreamingSnake(field)),
        );
      });

      it("locks by an enum, so a field name no column answers to is unstorable", () => {
        expect(modelBlock("Character")).toMatch(/lockedFields\s+CharacterField\[\]/);
        expect(modelBlock("Character")).not.toMatch(/lockedFields\s+String\[\]/);
      });
    });

    // A timestamp is the lock state. A boolean beside it could disagree with
    // it, which is the same reason Analysis has no status enum and
    // AnalysisSectionRevision has no isCurrent flag.
    describe("element-level locking", () => {
      const LOCKABLE_MODELS = [
        "BibleIdentity",
        "BibleStyle",
        "Character",
        "Relationship",
        "Place",
        "WorldRule",
        // CAL-095 names a timeline event among the elements a lock must stop a
        // generation from contradicting, so it follows the same convention
        // (CAL-017).
        "TimelineEvent",
        // The backlog's own words for CAL-018: a lock preventing any automatic
        // modification. Same convention; CAL-095 makes it bite.
        "CanonFact",
      ];

      it("makes every bible element lockable on its own row", () => {
        for (const model of LOCKABLE_MODELS) {
          expect(modelBlock(model)).toMatch(/^\s*lockedAt\s+DateTime\?/m);
        }
      });

      it("keeps no boolean able to disagree with the lock timestamp", () => {
        for (const model of LOCKABLE_MODELS) {
          expect(modelBlock(model)).not.toMatch(/^\s*(isLocked|locked)\s/m);
        }
      });
    });

    describe("relationships", () => {
      it("types the tie with a closed list", () => {
        expect(enumMembers("RelationshipType")).toEqual([
          "FAMILY",
          "ROMANTIC",
          "FRIENDSHIP",
          "PROFESSIONAL",
          "MENTORSHIP",
          "ALLIANCE",
          "RIVALRY",
          "HOSTILITY",
          "OTHER",
        ]);
        expect(modelBlock("Relationship")).toMatch(/type\s+RelationshipType(?!\?)/);
      });

      // Oriented: one row per direction, and the reverse is another row that may
      // say something else. Nothing marks a row as the mirror of another,
      // because no row is generated from another.
      it("is a directed edge with both ends named", () => {
        const relationship = modelBlock("Relationship");

        expect(relationship).toMatch(/^\s*fromCharacterId\s+String/m);
        expect(relationship).toMatch(/^\s*toCharacterId\s+String/m);
        expect(relationship).not.toMatch(/^\s*(mirrorOf|reciprocal|inverseOf)\w*\s/m);
      });

      // Both foreign keys carry the bible, so a row whose two characters come
      // from different bibles cannot exist and bibleId cannot contradict them.
      it("references its characters through the bible, not by id alone", () => {
        const references = modelBlock("Relationship").match(/references: \[bibleId, id\]/g);

        expect(references).toHaveLength(2);
        expect(modelBlock("Character")).toMatch(/@@unique\(\[bibleId, id\]\)/);
      });

      it("allows several ties between the same two characters, one per type", () => {
        expect(modelBlock("Relationship")).toMatch(
          /@@unique\(\[fromCharacterId, toCharacterId, type\]\)/,
        );
      });

      it("indexes the relations pointing at a character, and the graph of a bible", () => {
        const relationship = modelBlock("Relationship");

        expect(relationship).toMatch(/@@index\(\[toCharacterId\]\)/);
        expect(relationship).toMatch(/@@index\(\[bibleId\]\)/);
        // Outgoing relations are served by the leading column of the unique
        // index above, so a second index on it would be dead weight — the rule
        // Project already follows for userId.
        expect(relationship).not.toMatch(/@@index\(\[fromCharacterId\]\)/);
      });
    });

    describe("places and world rules", () => {
      // A model may name a place or a character; business code resolves the
      // primary key (CLAUDE.md §6). That resolution needs the name to be unique
      // inside the bible.
      it("makes a name resolvable inside its bible", () => {
        expect(modelBlock("Character")).toMatch(/@@unique\(\[bibleId, name\]\)/);
        expect(modelBlock("Place")).toMatch(/@@unique\(\[bibleId, name\]\)/);
        expect(modelBlock("WorldRule")).toMatch(/@@unique\(\[bibleId, name\]\)/);
      });

      // CAL-092's imperative. The column exists here; the constraint that makes
      // a supernatural rule without limits unstorable is hand-written in the
      // add_narrative_bible migration and asserted by the integration suite.
      it("gives a world rule its limits, costs and failure conditions", () => {
        const rule = modelBlock("WorldRule");

        expect(rule).toMatch(/^\s*isSupernatural\s+Boolean\s+@default\(false\)/m);
        expect(rule).toMatch(/^\s*limits\s+String\[\]/m);
        expect(rule).toMatch(/^\s*costs\s+String\[\]/m);
        expect(rule).toMatch(/^\s*failureConditions\s+String\[\]/m);
      });
    });

    it("maps to snake_case plural tables, as every model does", () => {
      expect(modelBlock("Bible")).toMatch(/@@map\("bibles"\)/);
      expect(modelBlock("BibleIdentity")).toMatch(/@@map\("bible_identities"\)/);
      expect(modelBlock("BibleStyle")).toMatch(/@@map\("bible_styles"\)/);
      expect(modelBlock("Character")).toMatch(/@@map\("characters"\)/);
      expect(modelBlock("Relationship")).toMatch(/@@map\("relationships"\)/);
      expect(modelBlock("Place")).toMatch(/@@map\("places"\)/);
      expect(modelBlock("WorldRule")).toMatch(/@@map\("world_rules"\)/);
    });
  });

  describe("chronology", () => {
    // The specification's three kinds of moment. Closed, and pinned here: a
    // fourth one is a decision about the product, and every reader of the
    // timeline branches on this list.
    it("distinguishes the three categories of the specification, and only those", () => {
      expect(enumMembers("TimelineEventCategory")).toEqual(["BACKSTORY", "NARRATED", "PLANNED"]);
      expect(modelBlock("TimelineEvent")).toMatch(/^\s*category\s+TimelineEventCategory(?!\?)/m);
    });

    // The enum that keeps the later detector from crying wolf: "spring 1892"
    // is not a day, and an age computed from it is known to within six months.
    it("records how finely a date and a duration are known", () => {
      expect(enumMembers("TimelinePrecision")).toEqual([
        "DAY",
        "MONTH",
        "SEASON",
        "YEAR",
        "DECADE",
      ]);
    });

    describe("the two placements", () => {
      // The axis is an integer count of days, not a DateTime: a fictional
      // calendar does not map to the Gregorian one, and an age is computed by
      // subtracting two positions.
      it("dates an event on a signed day axis, never on a calendar date", () => {
        const timelineEvent = modelBlock("TimelineEvent");

        expect(timelineEvent).toMatch(/^\s*absoluteDay\s+Int\?/m);
        // The only DateTime columns are the row's own lifecycle. Narrative time
        // is never one: a DateTime commits the product to the Gregorian
        // calendar and to a precision "spring 1892" does not have.
        const dateTimeFields = timelineEvent
          .split("\n")
          .map((line) => /^\s*([a-z][A-Za-z0-9]*)\s+DateTime/.exec(line)?.[1])
          .filter((field): field is string => field !== undefined);

        expect(dateTimeFields).toEqual(["lockedAt", "createdAt", "updatedAt"]);
      });

      it("keeps the author's own wording beside the number, not instead of it", () => {
        expect(modelBlock("TimelineEvent")).toMatch(/^\s*dateLabel\s+String\?/m);
      });

      // The case the backlog names: events with no absolute date but a known
      // order. The duration is optional, the anchor is what places the event.
      it("orders an event after another, with or without a duration", () => {
        const timelineEvent = modelBlock("TimelineEvent");

        expect(timelineEvent).toMatch(/^\s*precedingEventId\s+String\?/m);
        expect(timelineEvent).toMatch(/^\s*daysAfterPreceding\s+Int\?/m);
      });

      // Both placements are optional at the column level; that at least one is
      // present is timeline_events_placement_check, hand-written in the
      // add_timeline migration and asserted by the integration suite — a
      // requirement Prisma cannot express.
      it("pairs each placement with the precision it is known to", () => {
        const timelineEvent = modelBlock("TimelineEvent");

        expect(timelineEvent).toMatch(/^\s*datePrecision\s+TimelinePrecision\?/m);
        expect(timelineEvent).toMatch(/^\s*durationPrecision\s+TimelinePrecision\?/m);
      });

      // A third ordering would become the one consumers trust, and it could
      // contradict both others — CAL-012's recorded lesson. The order is
      // reconstructed from the data by resolveTimeline.
      it("keeps no manual ordering column able to contradict the data", () => {
        expect(modelBlock("TimelineEvent")).not.toMatch(
          /^\s*(position|order|sequence|rank|sortIndex)\s/m,
        );
      });
    });

    describe("the characters present", () => {
      it("is one row per presence, resolvable to a character", () => {
        const participant = modelBlock("TimelineEventParticipant");

        expect(participant).toMatch(/^\s*eventId\s+String/m);
        expect(participant).toMatch(/^\s*characterId\s+String/m);
        expect(participant).toMatch(/@@unique\(\[eventId, characterId\]\)/);
      });

      // The age at an event follows from Character.age and the event's day, so
      // a column here would be the copy able to drift. declaredAge is the other
      // thing entirely: what the text asserts, which is what the computed value
      // is compared *against*.
      it("stores the age the text asserts, and never the computed one", () => {
        const participant = modelBlock("TimelineEventParticipant");

        expect(participant).toMatch(/^\s*declaredAge\s+Int\?/m);
        expect(participant).not.toMatch(/^\s*(age|computedAge|ageAtEvent)\s/m);
      });

      // The read CAL-093 makes to check one character's ages across the whole
      // chronology. PostgreSQL does not index a foreign key on its own.
      it("indexes the events a character appears in", () => {
        expect(modelBlock("TimelineEventParticipant")).toMatch(/@@index\(\[characterId\]\)/);
      });
    });

    describe("staying inside one bible", () => {
      // The same shape Relationship uses, applied to a self-reference: an event
      // of another bible cannot be the anchor, and bibleId cannot contradict
      // the row it points at because it is part of the key.
      it("anchors an event through the bible, not by id alone", () => {
        const timelineEvent = modelBlock("TimelineEvent");

        expect(timelineEvent).toMatch(/references: \[bibleId, id\]/);
        expect(timelineEvent).toMatch(/@@unique\(\[bibleId, id\]\)/);
      });

      it("ties a participation to an event and a character of the same bible", () => {
        const references = modelBlock("TimelineEventParticipant").match(
          /references: \[bibleId, id\]/g,
        );

        expect(references).toHaveLength(2);
      });

      // Deleting an anchor would silently un-place everything hanging off it,
      // so the chain refuses it. Never SetNull, which is Prisma's default for
      // an optional relation and which nulls every column of a composite key —
      // bibleId included, where it hits a NOT NULL and fails without naming the
      // cause. The integration suite runs both paths.
      it("refuses to delete an anchored event, and never nulls the key", () => {
        const chain = /precedingEvent\s+TimelineEvent\?\s+@relation\(([^)]*)\)/.exec(
          modelBlock("TimelineEvent"),
        );

        expect(chain?.[1]).toContain("onDelete: NoAction");
      });

      // A model may name an event; business code resolves the primary key
      // (CLAUDE.md §6), the rule Character, Place and WorldRule already follow.
      it("makes an event name resolvable inside its bible", () => {
        expect(modelBlock("TimelineEvent")).toMatch(/@@unique\(\[bibleId, name\]\)/);
      });

      it("hangs the chronology off the bible", () => {
        expect(modelBlock("Bible")).toMatch(/^\s*timeline\s+TimelineEvent\[\]/m);
      });
    });

    // The query this table exists for: the chronology of a bible, in order.
    it("indexes the chronology of a bible and the chain that resolves it", () => {
      const timelineEvent = modelBlock("TimelineEvent");

      expect(timelineEvent).toMatch(/@@index\(\[bibleId, absoluteDay\]\)/);
      expect(timelineEvent).toMatch(/@@index\(\[bibleId, precedingEventId\]\)/);
    });

    it("maps to snake_case plural tables, as every model does", () => {
      expect(modelBlock("TimelineEvent")).toMatch(/@@map\("timeline_events"\)/);
      expect(modelBlock("TimelineEventParticipant")).toMatch(
        /@@map\("timeline_event_participants"\)/,
      );
    });
  });

  describe("canonical facts", () => {
    // The specification's three temporal cases, closed and in its own order.
    // PERMANENT is the default: most facts are, and the other two modes each
    // require columns of their own, checked by the migration.
    it("declares the three temporal shapes of the specification, and only those", () => {
      expect(enumMembers("CanonFactValidity")).toEqual([
        "PERMANENT", // permanent
        "DURING_PERIOD", // vrai pendant une période
        "UNTIL_EVENT", // faux après un événement donné
      ]);
      expect(modelBlock("CanonFact")).toMatch(
        /validity\s+CanonFactValidity\s+@default\(PERMANENT\)/,
      );
    });

    it("declares the four provenances and the three lifecycle states", () => {
      expect(enumMembers("CanonFactSource")).toEqual([
        "SOURCE_TEXT", // extrait du texte source
        "BIBLE", // dérivé d'une fiche de la bible (CAL-094)
        "CHAPTER", // extrait d'un chapitre rédigé (E13)
        "USER", // saisi par l'auteur
      ]);
      expect(enumMembers("CanonFactStatus")).toEqual([
        "PROPOSED", // proposé
        "CONFIRMED", // confirmé
        "REJECTED", // rejeté, conservé pour la déduplication
      ]);
      expect(modelBlock("CanonFact")).toMatch(/source\s+CanonFactSource(?!\?)/);
      expect(modelBlock("CanonFact")).toMatch(/status\s+CanonFactStatus\s+@default\(PROPOSED\)/);
    });

    // The truth value in the world, beside an always-affirmative statement.
    // Required and undefaulted: a defaulted truth value is a decision the
    // author never made, stored as if they had.
    it("requires the truth value and defaults it to nothing", () => {
      const fact = modelBlock("CanonFact");

      expect(fact).toMatch(/^\s*isTrue\s+Boolean\s*$/m);
      expect(fact).not.toMatch(/isTrue\s+Boolean\?/);
      expect(fact).not.toMatch(/isTrue\s+Boolean\s+@default/);
    });

    // No status timestamp beside the enum. Analysis' validatedAt pattern
    // encodes a dated, authored, two-state validation; a fact's lifecycle is
    // tri-state and no backlog line asks when or by whom — one column, one
    // source of truth, the same lesson read from the other side.
    it("keeps no timestamp able to contradict the status", () => {
      expect(modelBlock("CanonFact")).not.toMatch(
        /^\s*(validatedAt|confirmedAt|rejectedAt|proposedAt)\s/m,
      );
    });

    describe("temporal validity", () => {
      it("pairs each bound with the precision it is known to, words beside numbers", () => {
        const fact = modelBlock("CanonFact");

        for (const field of [
          "validFromDay",
          "validFromLabel",
          "validUntilDay",
          "validUntilLabel",
          "invalidatedByEventId",
        ]) {
          expect(fact).toMatch(new RegExp(`^\\s*${field}\\s+\\S+\\?`, "m"));
        }
        expect(fact).toMatch(/^\s*validFromPrecision\s+TimelinePrecision\?/m);
        expect(fact).toMatch(/^\s*validUntilPrecision\s+TimelinePrecision\?/m);
      });

      // Narrative time is the day axis, never a calendar date — the rule
      // TimelineEvent established, for the same three reasons.
      it("bounds validity on the day axis, never on a calendar date", () => {
        const dateTimeFields = modelBlock("CanonFact")
          .split("\n")
          .map((line) => /^\s*([a-z][A-Za-z0-9]*)\s+DateTime/.exec(line)?.[1])
          .filter((field): field is string => field !== undefined);

        expect(dateTimeFields).toEqual(["lockedAt", "createdAt", "updatedAt"]);
      });
    });

    describe("per-character knowledge", () => {
      // The stance is deliberately independent of isTrue, and KNOWS is
      // absent: knowing is derived by comparing the two dimensions
      // (beliefMatchesWorld in @calepin/bible), and a stored KNOWS would be a
      // second column able to contradict the first — CAL-012's lesson applied
      // to epistemics.
      it("declares the three belief states, and no KNOWS able to contradict isTrue", () => {
        expect(enumMembers("CanonFactBeliefState")).toEqual([
          "BELIEVES_TRUE", // croit l'énoncé vrai
          "BELIEVES_FALSE", // croit l'énoncé faux
          "UNAWARE", // ignore la question
        ]);
        expect(modelBlock("CanonFactBelief")).toMatch(/state\s+CanonFactBeliefState(?!\?)/);
        expect(modelBlock("CanonFactBelief")).not.toMatch(/^\s*(knows|isAccurate|isKnown)\w*\s/m);
      });

      it("holds one stance per character per fact, and indexes a point of view", () => {
        expect(modelBlock("CanonFactBelief")).toMatch(/@@unique\(\[factId, characterId\]\)/);
        expect(modelBlock("CanonFactBelief")).toMatch(/@@index\(\[characterId\]\)/);
      });
    });

    describe("subjects", () => {
      // §5.8's selection marker: a character or a place, exactly one — the
      // exactly-one check and the duplicate guard are both hand-written in
      // the add_canon_facts migration, which is why no @@unique appears here.
      it("names what a fact concerns, without a duplicate guard the DSL could express", () => {
        const subject = modelBlock("CanonFactSubject");

        expect(subject).toMatch(/^\s*characterId\s+String\?/m);
        expect(subject).toMatch(/^\s*placeId\s+String\?/m);
        expect(subject).toMatch(/@@index\(\[characterId\]\)/);
        expect(subject).toMatch(/@@index\(\[placeId\]\)/);
        expect(subject).not.toMatch(/@@unique/);
      });
    });

    describe("staying inside one bible", () => {
      it("ends a fact through an event of its own bible", () => {
        expect(modelBlock("CanonFact")).toMatch(/references: \[bibleId, id\]/);
        expect(modelBlock("CanonFact")).toMatch(/@@unique\(\[bibleId, id\]\)/);
      });

      it("ties a belief to a fact and a character of the same bible", () => {
        expect(modelBlock("CanonFactBelief").match(/references: \[bibleId, id\]/g)).toHaveLength(2);
      });

      it("ties a subject to its fact and its entity through the bible too", () => {
        expect(modelBlock("CanonFactSubject").match(/references: \[bibleId, id\]/g)).toHaveLength(
          3,
        );
        expect(modelBlock("Place")).toMatch(/@@unique\(\[bibleId, id\]\)/);
      });

      // Deleting the event that ends a fact would silently strip the boundary
      // that gives the fact its meaning — refused, the same NoAction the
      // timeline chain uses, and never SetNull on a composite key.
      it("refuses to delete the invalidating event, and never nulls the key", () => {
        const relation = /invalidatedByEvent\s+TimelineEvent\?\s+@relation\(([^)]*)\)/.exec(
          modelBlock("CanonFact"),
        );

        expect(relation?.[1]).toContain("onDelete: NoAction");
      });

      it("hangs the canon off the bible", () => {
        expect(modelBlock("Bible")).toMatch(/^\s*canonFacts\s+CanonFact\[\]/m);
      });
    });

    // The read the composer and the checker make most — the canon of a bible
    // by status — and the facts an event ends, which the NO ACTION check on
    // event deletion walks.
    it("indexes the canon of a bible and the facts an event ends", () => {
      expect(modelBlock("CanonFact")).toMatch(/@@index\(\[bibleId, status\]\)/);
      expect(modelBlock("CanonFact")).toMatch(/@@index\(\[bibleId, invalidatedByEventId\]\)/);
    });

    it("maps to snake_case plural tables, as every model does", () => {
      expect(modelBlock("CanonFact")).toMatch(/@@map\("canon_facts"\)/);
      expect(modelBlock("CanonFactBelief")).toMatch(/@@map\("canon_fact_beliefs"\)/);
      expect(modelBlock("CanonFactSubject")).toMatch(/@@map\("canon_fact_subjects"\)/);
    });
  });

  describe("the plan and the manuscript", () => {
    it("declares the seven chapter statuses of the specification, in order", () => {
      expect(enumMembers("ChapterStatus")).toEqual([
        "PLANNED", // planifié
        "TO_WRITE", // à rédiger
        "GENERATING", // génération en cours
        "FIRST_DRAFT", // premier jet
        "TO_REVISE", // à corriger
        "VALIDATED", // validé
        "LOCKED", // verrouillé
      ]);
    });

    describe("stable ordering", () => {
      // The decision the whole task turns on. A stored number is rewritten by
      // every insertion and every move, and anything citing "chapter 7" follows
      // it to the wrong chapter; the number is derived from orderKey by
      // resolveOutline in @calepin/outline. Same absence, same reason, as
      // TimelineEvent's missing `position` — CAL-012's lesson.
      it("carries an order key on a part and a chapter, and no number", () => {
        for (const model of ["Part", "Chapter"]) {
          expect(modelBlock(model)).toMatch(/^\s*orderKey\s+String(?!\?)/m);
          expect(modelBlock(model)).not.toMatch(/^\s*(number|position|rank|index|sortOrder)\s/m);
        }
      });

      // The reading order is (part.orderKey, chapter.orderKey), which is what
      // makes the chapters of a part contiguous by construction.
      it("scopes a chapter's place to its part and a part's to the plan", () => {
        expect(modelBlock("Chapter")).toMatch(/@@unique\(\[partId, orderKey\]\)/);
        expect(modelBlock("Part")).toMatch(/@@unique\(\[outlineId, orderKey\]\)/);
      });

      // The shape of a key — the alphabet, and the ban on a trailing zero that
      // makes the midpoint exist — is a CHECK Prisma cannot express, so it is
      // hand-written in the add_outline_and_manuscript migration.
      it("leaves the key's shape to the migration, where a CHECK can hold it", () => {
        expect(schema).not.toMatch(/orderKey\s+String\s+@db\./);
      });
    });

    describe("the chapter outline", () => {
      // The sixteen attributes of CAL-102, minus the number, which is derived,
      // and minus the narrative threads, which are CAL-020's own table.
      it("carries the planning attributes the specification names", () => {
        const outline = modelBlock("ChapterOutline");

        for (const field of [
          "workingTitle",
          "targetWordCount",
          "focalCharacterId",
          "placeId",
          "periodStartDay",
          "periodEndDay",
          "periodPrecision",
          "periodLabel",
          "dramaticFunction",
          "immediateGoal",
          "obstacle",
          "decision",
          "revelation",
          "consequence",
          "detailedSummary",
        ]) {
          expect(outline).toMatch(new RegExp(`^\\s*${field}\\s+\\S+\\?`, "m"));
        }

        expect(outline).toMatch(/^\s*characters\s+ChapterOutlineCharacter\[\]/m);
        expect(outline).toMatch(/^\s*facts\s+ChapterOutlineFact\[\]/m);
      });

      // A complete plan must be persistable, not compulsory: CAL-110's audit
      // reports a chapter with no dramatic function, and a NOT NULL would make
      // the finding unstorable instead of visible.
      it("makes every planning attribute optional", () => {
        const required = requiredScalarFields("ChapterOutline");

        expect(required).toEqual(["id", "bibleId", "chapterId"]);
      });

      // Narrative time is the day axis, never a calendar date — the rule
      // TimelineEvent established and CanonFact followed.
      it("places a chapter on the day axis, never on a calendar date", () => {
        const dateTimeFields = modelBlock("ChapterOutline")
          .split("\n")
          .map((line) => /^\s*([a-z][A-Za-z0-9]*)\s+DateTime/.exec(line)?.[1])
          .filter((field): field is string => field !== undefined);

        expect(dateTimeFields).toEqual(["lockedAt", "createdAt", "updatedAt"]);
        expect(modelBlock("ChapterOutline")).toMatch(/periodPrecision\s+TimelinePrecision\?/);
      });

      // Two locks, and they are not the same lock: this one freezes the plan of
      // a chapter (CAL-107, CAL-111), Chapter.status = LOCKED freezes the text.
      it("locks the plan of a chapter with the bible's timestamp convention", () => {
        expect(modelBlock("ChapterOutline")).toMatch(/^\s*lockedAt\s+DateTime\?/m);
        expect(modelBlock("Chapter")).not.toMatch(/^\s*lockedAt\s/m);
      });
    });

    describe("non-destructive versions", () => {
      // Append-only, like AnalysisSectionRevision: the current revision is the
      // highest revisionNumber, and no isCurrent flag can point at revision 2
      // while revision 3 exists.
      it("appends a numbered revision and keeps no current-version flag", () => {
        const revision = modelBlock("ChapterRevision");

        expect(revision).toMatch(/^\s*revisionNumber\s+Int(?!\?)/m);
        expect(revision).toMatch(/^\s*origin\s+ChapterRevisionOrigin(?!\?)/m);
        expect(revision).toMatch(/@@unique\(\[chapterId, revisionNumber\]\)/);
        expect(revision).not.toMatch(/^\s*(isCurrent|current|isLatest)\s/m);
        expect(revision).not.toMatch(/^\s*updatedAt\s/m);
        expect(modelBlock("Chapter")).not.toMatch(/^\s*(content|currentRevisionId)\s/m);
      });

      it("names the origin the history has to show, and nothing more", () => {
        expect(enumMembers("ChapterRevisionOrigin")).toEqual(["GENERATED", "EDITED"]);
      });

      // The audit trail of who asked for a version must not be silently
      // orphaned — SourceTextVersion.editedBy's rule.
      it("refuses to orphan the author of a revision", () => {
        expect(modelBlock("ChapterRevision")).toMatch(
          /createdBy\s+User\s+@relation\([^)]*Restrict/,
        );
      });
    });

    describe("staying inside one project", () => {
      it("ties a chapter to an outline written against its own bible", () => {
        expect(modelBlock("Chapter")).toMatch(/references: \[bibleId, id\]/);
        expect(modelBlock("Outline")).toMatch(/@@unique\(\[bibleId, id\]\)/);
      });

      it("ties a chapter outline to a chapter, a character and a place of one bible", () => {
        expect(modelBlock("ChapterOutline").match(/references: \[bibleId, id\]/g)).toHaveLength(3);
      });

      it("ties both link tables to the plan and the entity through the bible", () => {
        for (const model of ["ChapterOutlineCharacter", "ChapterOutlineFact"]) {
          expect(modelBlock(model).match(/references: \[bibleId, id\]/g)).toHaveLength(2);
        }
      });

      // Deleting a part that still holds chapters would take the manuscript
      // with it without saying so. Deleting a character un-focalises instead —
      // and that SET NULL applies to one column, which only the migration can
      // say; NoAction there breaks the project cascade, as the probe showed.
      it("refuses to delete a part still holding chapters, and un-focalises rather than refusing", () => {
        expect(modelBlock("Chapter")).toMatch(/part\s+Part\s+@relation\([^)]*onDelete: NoAction/);

        const chapterOutline = modelBlock("ChapterOutline");
        expect(chapterOutline).toMatch(
          /focalCharacter\s+Character\?\s+@relation\([^)]*onDelete: SetNull/,
        );
        expect(chapterOutline).toMatch(/place\s+Place\?\s+@relation\([^)]*onDelete: SetNull/);
      });

      it("hangs the plan off the project and off the bible", () => {
        expect(modelBlock("Project")).toMatch(/^\s*outline\s+Outline\?/m);
        expect(modelBlock("Bible")).toMatch(/^\s*outline\s+Outline\?/m);
      });
    });

    it("maps to snake_case plural tables, as every model does", () => {
      const tables: [string, string][] = [
        ["Outline", "outlines"],
        ["Part", "parts"],
        ["Chapter", "chapters"],
        ["ChapterOutline", "chapter_outlines"],
        ["ChapterOutlineCharacter", "chapter_outline_characters"],
        ["ChapterOutlineFact", "chapter_outline_facts"],
        ["ChapterRevision", "chapter_revisions"],
      ];

      for (const [model, table] of tables) {
        expect(modelBlock(model)).toMatch(new RegExp(`@@map\\("${table}"\\)`));
      }
    });
  });

  describe("narrative threads", () => {
    // The command's own order: opened, then carried forward, then paid off.
    it("declares the three states of the command, in order", () => {
      expect(enumMembers("ThreadStatus")).toEqual([
        "OPEN", // ouvert
        "CONTINUED", // poursuivi
        "CLOSED", // fermé
      ]);
      expect(modelBlock("Thread")).toMatch(/status\s+ThreadStatus\s+@default\(OPEN\)/);
    });

    it("carries the four attributes the command names", () => {
      const thread = modelBlock("Thread");

      expect(thread).toMatch(/^\s*label\s+String(?!\?)/m);
      expect(thread).toMatch(/^\s*narrativePromise\s+String(?!\?)/m);
      expect(thread).toMatch(/^\s*openingChapterId\s+String(?!\?)/m);
      expect(thread).toMatch(/^\s*closingChapterId\s+String\?/m);
    });

    // A thread cannot exist without the chapter it was raised in; it may well
    // never be paid off, so only the opening reference is required.
    it("requires the opening chapter and nothing else", () => {
      const required = requiredScalarFields("Thread");

      expect(required).toEqual([
        "id",
        "outlineId",
        "bibleId",
        "label",
        "narrativePromise",
        "openingChapterId",
      ]);
    });

    // "Chapitres de poursuite" is plural in the command: several rows, the
    // shape ChapterOutlineCharacter and ChapterOutlineFact already use for a
    // planned one-to-many, not a column on Thread.
    it("carries the continuing chapters as a join table, not a column", () => {
      expect(modelBlock("Thread")).toMatch(/^\s*continuations\s+ThreadContinuation\[\]/m);
      expect(modelBlock("Thread")).not.toMatch(
        /^\s*(continuingChapters|continuationChapterIds)\s/m,
      );
    });

    // No CHECK pairs status with closingChapterId — CAL-109's own wording
    // asks to flag a thread closed with no closing chapter, which is only a
    // finding to surface if the schema can hold it, the reading
    // ChapterOutline's optional planning attributes already establish.
    it("keeps no pairing between the status and the closing chapter", () => {
      expect(schema).not.toMatch(/threads_(status|closing)[a-zA-Z_]*_check/);
    });

    it("references its outline and both its chapters through the bible", () => {
      const references = modelBlock("Thread").match(/references: \[bibleId, id\]/g);

      expect(references).toHaveLength(3);
      expect(modelBlock("Thread")).toMatch(/@@unique\(\[bibleId, id\]\)/);
    });

    // A model may name a thread; business code resolves the primary key
    // (CLAUDE.md §6), the rule Character, Place, WorldRule, TimelineEvent and
    // Part already follow.
    it("makes a thread name resolvable inside its plan", () => {
      expect(modelBlock("Thread")).toMatch(/@@unique\(\[outlineId, label\]\)/);
    });

    // The read this task exists to serve.
    it("indexes the still-open threads of a plan", () => {
      expect(modelBlock("Thread")).toMatch(/@@index\(\[outlineId, status\]\)/);
    });

    // Deleting a single chapter that a thread still opens at is refused, the
    // same protection chapters_outlineId_partId_fkey gives a part still
    // holding chapters — never CASCADE, which would take the thread with it
    // without saying so.
    it("refuses to delete the opening chapter of a thread, and never cascades to it", () => {
      const opening = /openingChapter\s+Chapter\s+@relation\(([^)]*)\)/.exec(modelBlock("Thread"));

      expect(opening?.[1]).toContain("onDelete: NoAction");
    });

    it("un-references the closing chapter when it goes, on that column alone", () => {
      const closing = /closingChapter\s+Chapter\?\s+@relation\(([^)]*)\)/.exec(
        modelBlock("Thread"),
      );

      expect(closing?.[1]).toContain("onDelete: SetNull");
    });

    describe("the continuation join table", () => {
      it("is one row per chapter per thread, resolvable to both", () => {
        const continuation = modelBlock("ThreadContinuation");

        expect(continuation).toMatch(/^\s*threadId\s+String/m);
        expect(continuation).toMatch(/^\s*chapterId\s+String/m);
        expect(continuation).toMatch(/@@unique\(\[threadId, chapterId\]\)/);
      });

      it("ties a continuation to its thread and its chapter through the bible", () => {
        expect(modelBlock("ThreadContinuation").match(/references: \[bibleId, id\]/g)).toHaveLength(
          2,
        );
      });

      it("indexes the threads a chapter carries forward", () => {
        expect(modelBlock("ThreadContinuation")).toMatch(/@@index\(\[chapterId\]\)/);
      });

      // Added or removed, never edited, the same reasoning
      // ChapterOutlineCharacter and ChapterOutlineFact already carry.
      it("carries no updatedAt", () => {
        expect(modelBlock("ThreadContinuation")).not.toMatch(/^\s*updatedAt\s/m);
      });
    });

    it("hangs the threads off the plan", () => {
      expect(modelBlock("Outline")).toMatch(/^\s*threads\s+Thread\[\]/m);
    });

    it("maps to snake_case plural tables", () => {
      expect(modelBlock("Thread")).toMatch(/@@map\("threads"\)/);
      expect(modelBlock("ThreadContinuation")).toMatch(/@@map\("thread_continuations"\)/);
    });
  });

  // CAL-021. The operational layer: what was asked of a model, what it cost,
  // what it found wrong, and what left the product as a file or a public page.
  describe("operations", () => {
    describe("the generation", () => {
      // The ten of CLAUDE.md §4.2, whose kebab-case identifiers CAL-051's
      // registry owns. An enum and not free text because every §17 indicator
      // touching generation is a group-by on this column.
      it("declares the ten missions of the registry, and only those", () => {
        expect(enumMembers("GenerationMission")).toEqual([
          "ANALYZE_SOURCE_TEXT",
          "PROPOSE_DIRECTIONS",
          "EVALUATE_DIRECTION",
          "CREATE_CHARACTER_SHEET",
          "BUILD_CHAPTER_OUTLINE",
          "WRITE_SCENE",
          "EXTRACT_FACTS",
          "CHECK_COHERENCE",
          "FIX_ISSUE",
          "SUMMARIZE_CHAPTER",
        ]);
      });

      // CAL-060's own five: en attente, en cours, réussie, échouée, annulée.
      it("declares the five states of a queued generation", () => {
        expect(enumMembers("GenerationStatus")).toEqual([
          "QUEUED",
          "RUNNING",
          "SUCCEEDED",
          "FAILED",
          "CANCELLED",
        ]);
      });

      it("mirrors the attempt statuses @calepin/shared already writes against", () => {
        expect(enumMembers("GenerationAttemptStatus")).toEqual(
          sharedStringUnion("generation/outcome.ts", "GENERATION_STATUSES"),
        );
      });

      it("mirrors the eight error categories of @calepin/shared", () => {
        expect(enumMembers("ErrorCategory")).toEqual(
          sharedStringUnion("errors/categories.ts", "ERROR_CATEGORIES"),
        );
      });

      it("carries the mission, its target and the replay payload", () => {
        const generation = modelBlock("Generation");

        expect(generation).toMatch(/^\s*mission\s+GenerationMission/m);
        expect(generation).toMatch(/^\s*targetId\s+String\?/m);
        expect(generation).toMatch(/^\s*input\s+Json/m);
        expect(generation).toMatch(/^\s*status\s+GenerationStatus\s+@default\(QUEUED\)/m);
      });

      // The payload is the whole acceptance criterion: a generation with no
      // input cannot be replayed, so the column admits no null.
      it("makes the replay payload mandatory", () => {
        expect(modelBlock("Generation")).not.toMatch(/^\s*input\s+Json\?/m);
      });

      // A generation that failed twice before succeeding spent tokens three
      // times, on possibly three different models. Those columns are true of an
      // attempt and would be a lie here; the count and the cost are aggregates.
      it("keeps no model, no token count, no cost and no attempt counter", () => {
        const generation = modelBlock("Generation");

        expect(generation).not.toMatch(/^\s*model\s+String/m);
        expect(generation).not.toMatch(/^\s*inputTokens\s/m);
        expect(generation).not.toMatch(/^\s*outputTokens\s/m);
        expect(generation).not.toMatch(/^\s*estimatedCostUsd\s/m);
        expect(generation).not.toMatch(/^\s*attemptCount\s/m);
        expect(generation).not.toMatch(/^\s*durationMs\s/m);
      });

      // An accounting record has to survive the deletion of what it produced,
      // or a project's cost changes retroactively when a chapter is deleted.
      it("references its target by id alone, with no foreign key", () => {
        expect(modelBlock("Generation")).not.toMatch(/^\s*target\s+\w+\s+@relation/m);
      });

      // §9: a failure is classified, never described. The technical message and
      // the provider payload stay out of the database entirely.
      it("classifies a failure by code and category, and stores no message", () => {
        const generation = modelBlock("Generation");

        expect(generation).toMatch(/^\s*errorCode\s+String\?/m);
        expect(generation).toMatch(/^\s*errorCategory\s+ErrorCategory\?/m);
        expect(generation).not.toMatch(/^\s*errorMessage\s/m);
      });

      it("indexes cost-per-mission, the project listing and the reconciliation sweep", () => {
        const generation = modelBlock("Generation");

        expect(generation).toMatch(/@@index\(\[projectId, mission, targetId\]\)/);
        expect(generation).toMatch(/@@index\(\[projectId, createdAt\]\)/);
        expect(generation).toMatch(/@@index\(\[status, createdAt\]\)/);
      });
    });

    describe("the attempt", () => {
      // The constraint the shared port's contract asks for in words: succeed
      // and fail are idempotent for a given (generationId, attempt). A BullMQ
      // redelivery collides here instead of writing a second cost line.
      it("is unique per generation and attempt number", () => {
        expect(modelBlock("GenerationAttempt")).toMatch(/@@unique\(\[generationId, attempt\]\)/);
      });

      it("records what actually ran: the model, the usage, the cost and the duration", () => {
        const attempt = modelBlock("GenerationAttempt");

        expect(attempt).toMatch(/^\s*attempt\s+Int/m);
        expect(attempt).toMatch(/^\s*model\s+String/m);
        expect(attempt).toMatch(/^\s*inputTokens\s+Int\?/m);
        expect(attempt).toMatch(/^\s*outputTokens\s+Int\?/m);
        expect(attempt).toMatch(/^\s*durationMs\s+Int\?/m);
      });

      // Money summed in binary floating point stops adding up, and indicator
      // §17.8 is a sum over every attempt of every generation of a project.
      it("prices in decimal, never in a float", () => {
        expect(modelBlock("GenerationAttempt")).toMatch(
          /^\s*estimatedCostUsd\s+Decimal\?\s+@db\.Decimal\(12, 6\)/m,
        );
      });

      // ADR-001: a generation records its prompt version and its model, so an
      // output can be traced to what produced it. Both live here because a
      // fallback runs attempt 2 on another model.
      it("records the prompt version beside the model", () => {
        expect(modelBlock("GenerationAttempt")).toMatch(/^\s*promptVersion\s+Int\?/m);
      });

      // Derived from errorCode by @calepin/shared, never stored: a second
      // column able to disagree with the code's own category.
      it("keeps no retryable flag able to disagree with the error code", () => {
        expect(modelBlock("GenerationAttempt")).not.toMatch(/^\s*retryable\s/m);
      });
    });

    describe("the quality issue", () => {
      // CAL-135 names them one by one, in this order.
      it("declares the five families of check of the specification", () => {
        expect(enumMembers("QualityIssueCategory")).toEqual([
          "FACTUAL_CONTINUITY",
          "PSYCHOLOGICAL_CONTINUITY",
          "STRUCTURE",
          "STYLE",
          "ORIGINALITY",
        ]);
      });

      // The acceptance criterion of CAL-021, verbatim: détecté, accepté,
      // à corriger, corrigé, ignoré.
      it("carries the five statuses of the specification, and starts detected", () => {
        expect(enumMembers("QualityIssueStatus")).toEqual([
          "DETECTED",
          "ACCEPTED",
          "TO_FIX",
          "FIXED",
          "IGNORED",
        ]);
        expect(modelBlock("QualityIssue")).toMatch(
          /^\s*status\s+QualityIssueStatus\s+@default\(DETECTED\)/m,
        );
      });

      // A rank, in decreasing order — never a score. The specification forbids
      // presenting a computed number as a measure of quality or originality.
      it("ranks severity in decreasing order", () => {
        expect(enumMembers("QualityIssueSeverity")).toEqual(["CRITICAL", "MAJOR", "MINOR"]);
      });

      it("carries the explanation, the proposed fix and the check that found it", () => {
        const issue = modelBlock("QualityIssue");

        expect(issue).toMatch(/^\s*explanation\s+String\s*$/m);
        expect(issue).toMatch(/^\s*proposedFix\s+String\?/m);
        expect(issue).toMatch(/^\s*checkId\s+String\s*$/m);
        expect(issue).toMatch(/^\s*detectedByGenerationId\s+String\?/m);
      });

      // Structure and originality judge the manuscript as a whole, and CAL-099
      // checks the bible before a chapter exists. What an issue is about is its
      // passages, which may be none.
      it("hangs off the project, never off a chapter", () => {
        const issue = modelBlock("QualityIssue");

        expect(issue).toMatch(/^\s*projectId\s+String\s*$/m);
        expect(issue).not.toMatch(/^\s*chapterId\s/m);
      });

      it("indexes the filters the issues screen offers", () => {
        const issue = modelBlock("QualityIssue");

        expect(issue).toMatch(/@@index\(\[projectId, status, severity\]\)/);
        expect(issue).toMatch(/@@index\(\[projectId, category\]\)/);
      });

      describe("a passage", () => {
        // An anchor into an append-only revision, so the text the check read is
        // still there after the author edits.
        it("anchors into a revision through its chapter", () => {
          const passage = modelBlock("QualityIssuePassage");

          expect(passage).toMatch(/^\s*chapterId\s+String\s*$/m);
          expect(passage).toMatch(/^\s*chapterRevisionId\s+String\?/m);
          expect(passage).toMatch(/references: \[chapterId, id\]/);
        });

        it("locates by offsets, storing no copy of the prose", () => {
          const passage = modelBlock("QualityIssuePassage");

          expect(passage).toMatch(/^\s*startOffset\s+Int\?/m);
          expect(passage).toMatch(/^\s*endOffset\s+Int\?/m);
          expect(passage).not.toMatch(/^\s*(excerpt|quote|content|text)\s/m);
        });

        // Added or removed with its issue, never edited — the reasoning
        // ChapterOutlineCharacter and ThreadContinuation already carry.
        it("carries no updatedAt", () => {
          expect(modelBlock("QualityIssuePassage")).not.toMatch(/^\s*updatedAt\s/m);
        });

        it("indexes the issues attached to a chapter", () => {
          expect(modelBlock("QualityIssuePassage")).toMatch(/@@index\(\[chapterId\]\)/);
        });
      });
    });

    describe("the export", () => {
      // Markdown and DOCX are the MVP; the four others are named now because
      // CAL-154's design constraint is that adding a format costs a renderer.
      it("declares the six formats the engine is designed for", () => {
        expect(enumMembers("ExportFormat")).toEqual([
          "MARKDOWN",
          "DOCX",
          "PDF",
          "EPUB",
          "HTML",
          "PLAIN_TEXT",
        ]);
      });

      // Expiry is expiresAt compared to the current time. A status able to
      // disagree with that timestamp would become the one consumers trust.
      it("declares no expired status, since expiry is a timestamp", () => {
        expect(enumMembers("ExportStatus")).toEqual(["QUEUED", "RUNNING", "READY", "FAILED"]);
        expect(modelBlock("Export")).toMatch(/^\s*expiresAt\s+DateTime\?/m);
      });

      it("carries the options, the stored object and its measurements", () => {
        const exported = modelBlock("Export");

        expect(exported).toMatch(/^\s*options\s+Json\s+@default\("\{\}"\)/m);
        expect(exported).toMatch(/^\s*storageKey\s+String\?/m);
        expect(exported).toMatch(/^\s*byteSize\s+Int\?/m);
        expect(exported).toMatch(/^\s*wordCount\s+Int\?/m);
      });

      // Who asked for a copy of the manuscript is the audit trail, as every
      // other author column in this schema is.
      it("refuses to orphan the user who asked for it", () => {
        expect(
          /requestedBy\s+User\s+@relation\(([^)]*)\)/.exec(modelBlock("Export"))?.[1],
        ).toContain("onDelete: Restrict");
      });

      it("indexes the export history and the export-rate indicator", () => {
        const exported = modelBlock("Export");

        expect(exported).toMatch(/@@index\(\[projectId, createdAt\]\)/);
        expect(exported).toMatch(/@@index\(\[projectId, status\]\)/);
      });
    });

    describe("the publication", () => {
      // PRIVATE by default is what makes "la publication n'est jamais
      // automatique" the schema's own state rather than a rule to remember.
      it("declares the three visibilities and starts private", () => {
        expect(enumMembers("PublicationVisibility")).toEqual(["PRIVATE", "UNLISTED", "PUBLIC"]);
        expect(modelBlock("Publication")).toMatch(
          /^\s*visibility\s+PublicationVisibility\s+@default\(PRIVATE\)/m,
        );
      });

      // One stable public address per novel, and the presentation the reader
      // sees — held here rather than read from the project, so renaming a
      // working project cannot rename a novel that is already public.
      it("holds one address and its presentation per project", () => {
        const publication = modelBlock("Publication");

        expect(publication).toMatch(/^\s*projectId\s+String\s+@unique/m);
        expect(publication).toMatch(/^\s*slug\s+String\s+@unique/m);
        expect(publication).toMatch(/^\s*title\s+String\s*$/m);
        expect(publication).toMatch(/^\s*authorName\s+String\s*$/m);
        expect(publication).toMatch(/^\s*firstPublishedAt\s+DateTime\?/m);
        expect(publication).toMatch(/^\s*unpublishedAt\s+DateTime\?/m);
      });
    });

    // ADR-001: a successful generation appends a Revision linked to its
    // Generation. These two columns are that link.
    describe("what a generation produced", () => {
      it("links a chapter revision back to the generation that wrote it", () => {
        const revision = modelBlock("ChapterRevision");

        expect(revision).toMatch(/^\s*generationId\s+String\?/m);
        expect(/generation\s+Generation\?\s+@relation\(([^)]*)\)/.exec(revision)?.[1]).toContain(
          "onDelete: SetNull",
        );
      });

      it("links an analysis section revision back the same way", () => {
        expect(modelBlock("AnalysisSectionRevision")).toMatch(/^\s*generationId\s+String\?/m);
      });

      // What lets a passage reference a revision through its chapter, so the
      // chapter it names cannot disagree with the revision it anchors into.
      it("exposes a chapter revision through its chapter", () => {
        expect(modelBlock("ChapterRevision")).toMatch(/@@unique\(\[chapterId, id\]\)/);
      });
    });

    it("maps to snake_case plural tables, as every model does", () => {
      expect(modelBlock("Generation")).toMatch(/@@map\("generations"\)/);
      expect(modelBlock("GenerationAttempt")).toMatch(/@@map\("generation_attempts"\)/);
      expect(modelBlock("QualityIssue")).toMatch(/@@map\("quality_issues"\)/);
      expect(modelBlock("QualityIssuePassage")).toMatch(/@@map\("quality_issue_passages"\)/);
      expect(modelBlock("Export")).toMatch(/@@map\("exports"\)/);
      expect(modelBlock("Publication")).toMatch(/@@map\("publications"\)/);
    });
  });
});

/**
 * CAL-022 — traceability, and above all its coverage.
 *
 * The hard part of this task is not the stamping logic, it is not missing a
 * table. So the rule is mechanical and asserted rather than hand-kept: a model
 * carrying `updatedAt` is a model that can be modified, and a model that can be
 * modified carries the audit block. A model added later with `updatedAt` and no
 * block fails here, in the `unit` project, without a database.
 */
describe("audit fields (CAL-022)", () => {
  const mutableModels = declaredModels().filter((name) => modelFields(name).includes("updatedAt"));

  it("registers every model that can be modified, and nothing else", () => {
    expect([...mutableModels].sort()).toEqual(
      [...AUDITED_MODEL_NAMES, ...UNAUDITED_MUTABLE_MODELS].sort(),
    );
  });

  it("keeps User outside the set, deliberately", () => {
    // The author of a change to an account is the account holder, which is the
    // row's own id. A self-referencing column would add a cycle and no
    // information — so the exception is asserted rather than tolerated.
    expect(UNAUDITED_MUTABLE_MODELS).toEqual(["User"]);
    expect(modelFields("User")).not.toContain(AUDIT_AUTHOR_FIELD);
  });

  // An append-only row is written once: its author is its creator and there is
  // no second state to count. Naming them here is what keeps "no updatedAt"
  // from being an oversight nobody notices.
  it.each([
    "SourceTextVersion",
    "AnalysisSectionRevision",
    "AnalysisElement",
    "ChapterOutlineCharacter",
    "ChapterOutlineFact",
    "ChapterRevision",
    "ThreadContinuation",
    "GenerationAttempt",
    "QualityIssuePassage",
  ])("leaves the append-only %s alone", (model) => {
    const fields = modelFields(model);

    expect(fields).not.toContain("updatedAt");
    expect(fields).not.toContain(AUDIT_AUTHOR_FIELD);
    expect(fields).not.toContain(AUDIT_VERSION_FIELD);
  });

  describe.each(AUDITED_MODEL_NAMES)("%s", (model) => {
    const fields = modelFields(model);
    const block = modelBlock(model);

    it("carries the identifier and both timestamps", () => {
      expect(block).toMatch(/^\s*id\s+String\s+@id @default\(cuid\(\)\)/m);
      expect(fields).toContain("createdAt");
      expect(fields).toContain("updatedAt");
    });

    it("carries the author of the last modification, and it is mandatory", () => {
      // `String`, not `String?`. The column is what makes an unattributed row
      // unwritable even through raw SQL, which no client extension can police.
      //
      // The sentinel default is what keeps the column out of the caller's
      // contract: without one Prisma would demand it in every create input, and
      // an extension filling a field the compiler already demands is
      // decoration. It is never storable — the foreign key refuses it.
      expect(block).toMatch(
        new RegExp(
          `^\\s*${AUDIT_AUTHOR_FIELD}\\s+String\\s+@default\\("${AUDIT_UNATTRIBUTED}"\\)`,
          "m",
        ),
      );
      expect(block).not.toMatch(new RegExp(`^\\s*${AUDIT_AUTHOR_FIELD}\\s+String\\?`, "m"));
    });

    it("points that author at a user, without orphaning the trail", () => {
      const relation = new RegExp(
        `^\\s*${AUDIT_AUTHOR_RELATION}\\s+User\\s+@relation\\(([^)]*)\\)`,
        "m",
      ).exec(block);

      expect(relation?.[1]).toContain(`"${model}UpdatedBy"`);
      expect(relation?.[1]).toContain("fields: [updatedById]");
      // NoAction rather than Restrict — probed, and recorded in the schema
      // header: RESTRICT is checked immediately and refuses the deletion of an
      // account over rows the account's own cascade is about to remove.
      expect(relation?.[1]).toContain("onDelete: NoAction");
    });

    it("counts its states from one", () => {
      expect(block).toMatch(
        new RegExp(`^\\s*${AUDIT_VERSION_FIELD}\\s+Int\\s+@default\\(1\\)`, "m"),
      );
    });

    it("maps to the table the registry names", () => {
      expect(block).toMatch(new RegExp(`@@map\\("${AUDITED_MODELS[model].table}"\\)`));
    });

    it("declares its status field, or declares that it has none", () => {
      const { status, statusKind, statusless } = AUDITED_MODELS[model];

      if (status === null) {
        // CAL-022 does not invent a lifecycle the product has not defined. What
        // it refuses is an undeclared gap: a model with no status says why.
        expect(statusKind).toBeNull();
        expect(statusless).toBeTruthy();
        return;
      }

      expect(statusless).toBeNull();
      expect(fields).toContain(status);
      // A timestamp-as-status is nullable by construction: the state is whether
      // it is set. An enum status carries a default, so a row is never in no
      // state at all.
      const declaration = new RegExp(`^\\s*${status}\\s+(\\S+)`, "m").exec(block)?.[1];
      expect(declaration).toBeDefined();
      expect(declaration?.endsWith("?")).toBe(statusKind === "timestamp");
    });
  });

  it("gives the back-relation on User one field per audited model", () => {
    const user = modelBlock("User");

    for (const model of AUDITED_MODEL_NAMES) {
      expect(user).toContain(`@relation("${model}UpdatedBy")`);
    }
  });
});

/**
 * The owner access policy's registry, pinned against the schema (CAL-023).
 *
 * `PROJECT_OWNED_MODELS` says how every model reaches the one row that names an
 * owner. The filter builder trusts it blindly — a path that is wrong, stale or
 * missing produces a `where` that constrains the wrong thing, and the query
 * still looks right. So the path is checked here, segment by segment, against
 * the schema itself.
 */
describe("the project ownership graph", () => {
  /**
   * The declared type of one field, relation fields included — `Character` for
   * `bible Bible @relation(...)`, with the list and optional markers dropped so
   * `Bible`, `Bible?` and `Bible[]` all answer `Bible`.
   */
  function fieldType(model: string, field: string): string | undefined {
    const declaration = new RegExp(`^\\s*${field}\\s+(\\S+)`, "m").exec(modelBlock(model))?.[1];

    return declaration?.replace(/[?[\]]/g, "");
  }

  it("classifies every model in the schema, with nothing left over", () => {
    expect([...PROJECT_OWNED_MODEL_NAMES, ...UNOWNED_MODELS].sort()).toEqual(
      declaredModels().sort(),
    );
  });

  it("names the owner column on Project, and nowhere else", () => {
    expect(fieldType("Project", PROJECT_OWNER_FIELD)).toBe("String");
    expect(modelBlock("Project")).toMatch(
      new RegExp(
        `user\\s+User\\s+@relation\\("ProjectOwner", fields: \\[${PROJECT_OWNER_FIELD}\\]`,
      ),
    );

    // Any second column called userId would be a second answer to "whose is
    // this", and the filter builder would keep using the first.
    const elsewhere = PROJECT_OWNED_MODEL_NAMES.filter(
      (model) => model !== "Project" && fieldType(model, PROJECT_OWNER_FIELD) !== undefined,
    );
    expect(elsewhere).toEqual([]);
  });

  describe.each(PROJECT_OWNED_MODEL_NAMES)("%s", (model) => {
    const { table, path } = PROJECT_OWNED_MODELS[model];

    it("maps to the table the registry names", () => {
      expect(modelBlock(model)).toMatch(new RegExp(`@@map\\("${table}"\\)`));
    });

    // The assertion the whole layer rests on: walking the registry's path from
    // this model, one declared relation at a time, arrives at Project.
    it("reaches Project through declared relations only", () => {
      const arrival = path.reduce<string>((current, segment) => {
        const target = fieldType(current, segment);

        expect(target, `${current}.${segment} is not a declared field`).toBeDefined();
        expect(modelBlock(current)).toMatch(
          new RegExp(`^\\s*${segment}\\s+\\S+\\s+@relation`, "m"),
        );

        return target ?? current;
      }, model);

      expect(arrival).toBe("Project");
    });

    it("walks the mandatory side of every relation", () => {
      // An optional segment would mean a row can exist attached to no project
      // at all: invisible to the owner the filter looks for, and belonging to
      // nobody. Requiring the mandatory side is what makes "every row belongs
      // to exactly one project" a property of the schema rather than a habit.
      // `Place?` fails this pattern, `Place` passes it.
      path.reduce<string>((current, segment) => {
        expect(modelBlock(current)).toMatch(new RegExp(`^\\s*${segment}\\s+\\w+\\s`, "m"));

        return fieldType(current, segment) ?? current;
      }, model);
    });
  });
});

/**
 * CAL-035 — the duplication plan against the schema.
 *
 * The plan is what a deep copy of a project reads: which models it walks, in
 * what order, and what every foreign-key column of each of them points at. A
 * column the plan does not know about is copied verbatim, so a reference the
 * plan misses becomes a row of the copy pointing at the original — the one
 * outcome CAL-035 exists to make impossible.
 *
 * That makes the schema, not the plan, the authority. Everything below derives
 * the answer from `schema.prisma` and compares: the columns, the model each one
 * resolves to, and the nullability the two treatments depend on. A model added
 * later with a new relation fails here rather than shipping half-copied.
 */
describe("the duplication plan (CAL-035)", () => {
  interface DeclaredRelation {
    readonly target: string;
    /** The scalar columns on this model that carry the reference. */
    readonly fields: readonly string[];
    /** The columns they point at, positionally, on the target. */
    readonly references: readonly string[];
  }

  function argumentList(args: string, name: string): string[] {
    const list = new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`).exec(args)?.[1];

    return list === undefined ? [] : list.split(",").map((entry) => entry.trim());
  }

  /**
   * Every relation a model *holds the key of* — the side carrying `fields:`.
   * The other side declares no column and copies nothing.
   */
  function declaredRelations(model: string): DeclaredRelation[] {
    return [...modelBlock(model).matchAll(/^\s*\w+\s+(\w+)[?[\]]*\s+@relation\(([^)]*)\)/gm)]
      .map((match) => ({
        target: match[1] ?? "",
        fields: argumentList(match[2] ?? "", "fields"),
        references: argumentList(match[2] ?? "", "references"),
      }))
      .filter((relation) => relation.fields.length > 0);
  }

  /** Every scalar column of a model that carries a foreign key. */
  function referenceColumns(model: string): string[] {
    return [...new Set(declaredRelations(model).flatMap((relation) => relation.fields))];
  }

  /**
   * The model a reference column names, resolved the way a copier has to
   * resolve it.
   *
   * A column pointing at the target's `id` names that target. A column pointing
   * at another of the target's columns — every composite relation in this
   * schema is keyed on `[bibleId, id]` or `[outlineId, id]`, so the
   * discriminator half is exactly that — names whatever *that* column names,
   * which is why this recurses. `TimelineEventParticipant.bibleId` reaches
   * `Bible` through `TimelineEvent` and never declares a relation to it.
   *
   * A candidate that walks back onto the pair being resolved is dropped rather
   * than followed: `TimelineEvent.bibleId` appears both in its own relation to
   * `Bible` and in the self-relation `precedingEvent`, and the second is a
   * cycle, not an answer.
   */
  function resolveReferenceTarget(
    model: string,
    column: string,
    seen: ReadonlySet<string> = new Set(),
  ): string | undefined {
    const key = `${model}.${column}`;
    if (seen.has(key)) return undefined;

    const walked = new Set(seen).add(key);
    const resolved = new Set<string>();

    for (const relation of declaredRelations(model)) {
      const index = relation.fields.indexOf(column);
      const referenced = index === -1 ? undefined : relation.references[index];
      if (referenced === undefined) continue;

      if (referenced === "id") {
        resolved.add(relation.target);
        continue;
      }

      const deeper = resolveReferenceTarget(relation.target, referenced, walked);
      if (deeper !== undefined) resolved.add(deeper);
    }

    if (resolved.size > 1) {
      throw new Error(`${key} resolves to more than one model: ${[...resolved].join(", ")}`);
    }

    return [...resolved][0];
  }

  function isOptional(model: string, field: string): boolean {
    return new RegExp(`^\\s*${field}\\s+\\S+\\?`, "m").test(modelBlock(model));
  }

  it("resolves a composite discriminator through the model it borrows it from", () => {
    // The resolver above is the assertion's own machinery, so it is checked
    // against the two cases it exists for before it is trusted with thirty-four
    // models: a column with no relation of its own, and a self-relation.
    expect(resolveReferenceTarget("TimelineEventParticipant", "bibleId")).toBe("Bible");
    expect(resolveReferenceTarget("TimelineEvent", "bibleId")).toBe("Bible");
    expect(resolveReferenceTarget("TimelineEvent", "precedingEventId")).toBe("TimelineEvent");
  });

  describe.each(DUPLICATION_PLAN)("$model", ({ model, references }) => {
    it("declares exactly the reference columns the schema gives the model", () => {
      // The audit author column is a reference too, and it is never copied: the
      // extension fills it from the actor who asked for the duplication.
      const expected = referenceColumns(model).filter(
        (column) => !(NEVER_COPIED_COLUMNS as readonly string[]).includes(column),
      );

      expect(Object.keys(references).sort()).toEqual(expected.sort());
    });

    it("names, for each of them, the model the schema says it points at", () => {
      for (const [column, target] of Object.entries(references)) {
        expect(resolveReferenceTarget(model, column), `${model}.${column}`).toBe(target);
      }
    });

    it("only leaves behind what a copied row may be missing", () => {
      // A reference to a model the copy does not carry is nulled. A mandatory
      // column could not be, and the copy would fail on the insert — late, and
      // after a long transaction. It fails here instead.
      for (const [column, target] of Object.entries(references)) {
        if (!isUnduplicatedModel(target)) continue;

        expect(isOptional(model, column), `${model}.${column} → ${target}`).toBe(true);
      }
    });

    it("can omit every column the copy does not carry", () => {
      // `id` is supplied by the copier; the other four are dropped from the
      // payload, so each must be a column the database can fill on its own.
      expect(modelBlock(model)).toMatch(/^\s*id\s+String\s+@id @default\(cuid\(\)\)/m);

      for (const column of NEVER_COPIED_COLUMNS) {
        if (column === "id") continue;

        const declaration = new RegExp(`^\\s*${column}\\s+.*$`, "m").exec(modelBlock(model))?.[0];
        if (declaration === undefined) continue;

        expect(declaration, `${model}.${column}`).toMatch(/@default\(|@updatedAt/);
      }
    });
  });

  it("leaves nothing a copied row is required to name", () => {
    // The direction that matters. A left-behind model *pointing at* a copied one
    // is ordinary — an export names a project, a quality issue anchors into a
    // chapter — and none of it constrains the copy. The reverse would: a copied
    // row required to name a row the copy does not hold cannot be written at
    // all. Asserted here over the whole plan, and not only per model, so a
    // model moved out of the plan is caught by the rows that still need it.
    const copied = new Set<string>([...DUPLICATED_MODEL_NAMES, "Project", "User"]);
    const leftBehind = new Set<string>(
      PROJECT_OWNED_MODEL_NAMES.filter((model) => !copied.has(model)),
    );

    for (const step of DUPLICATION_PLAN) {
      for (const column of Object.keys(step.references)) {
        const target = resolveReferenceTarget(step.model, column);
        if (target === undefined || !leftBehind.has(target)) continue;

        expect(isOptional(step.model, column), `${step.model}.${column} → ${target}`).toBe(true);
      }
    }
  });
});

/**
 * CAL-024 — the Auth.js tables.
 *
 * Their shape is the adapter's contract, so what is worth asserting is not that
 * the schema is pretty but that it still matches what `@auth/prisma-adapter`
 * reads and writes. A field renamed to satisfy §4.2, a compound key changed,
 * a column made mandatory — each of those is a sign-in that fails at runtime
 * with a Prisma error, and each of them fails here first.
 *
 * The second half pins the two rules this schema bends for them, so bending
 * them stays a decision rather than a precedent.
 */
describe("the Auth.js tables (CAL-024)", () => {
  const AUTH_MODELS = ["Account", "Session", "VerificationToken"] as const;

  it("maps to snake_case plural tables, as every model does", () => {
    expect(modelBlock("Account")).toMatch(/@@map\("accounts"\)/);
    expect(modelBlock("Session")).toMatch(/@@map\("sessions"\)/);
    expect(modelBlock("VerificationToken")).toMatch(/@@map\("verification_tokens"\)/);
  });

  describe("Account", () => {
    // Exactly the properties of `AdapterAccount`, in the spelling the adapter
    // hands to `prisma.account.create({ data })`. Any other spelling and the
    // provider's token response is written to nothing.
    it("carries the adapter's field set, snake_case spellings included", () => {
      expect(modelFields("Account")).toEqual([
        "userId",
        "type",
        "provider",
        "providerAccountId",
        "refresh_token",
        "access_token",
        "expires_at",
        "token_type",
        "scope",
        "id_token",
        "session_state",
        "user",
      ]);
    });

    it("holds every provider-supplied token as optional", () => {
      // The provider decides what it returns: an OIDC identity carries an
      // `id_token` and no `refresh_token`, an OAuth2 one the reverse. A
      // mandatory column here would refuse half the providers of E02.
      for (const field of [
        "refresh_token",
        "access_token",
        "expires_at",
        "token_type",
        "scope",
        "id_token",
        "session_state",
      ]) {
        expect(modelBlock("Account")).toMatch(new RegExp(`^\\s*${field}\\s+\\S+\\?`, "m"));
      }
    });

    it("deduplicates an identity by provider and provider account id", () => {
      // The key the adapter looks an identity up by is derived from this
      // compound id — `provider_providerAccountId`. It is also what keeps a
      // second sign-in with the same Google account from creating a second row.
      expect(modelBlock("Account")).toMatch(/@@id\(\[provider, providerAccountId\]\)/);
    });
  });

  describe("Session", () => {
    it("is keyed by the token the browser presents", () => {
      expect(modelBlock("Session")).toMatch(/^\s*sessionToken\s+String\s+@id/m);
    });

    it("carries its own expiry, and nothing that could disagree with it", () => {
      // A boolean beside the date would be a second answer to "is this session
      // still valid", and the one that goes stale is the boolean.
      expect(modelFields("Session")).toEqual(["sessionToken", "userId", "expires", "user"]);
      expect(modelBlock("Session")).toMatch(/^\s*expires\s+DateTime\s*$/m);
    });

    it("indexes the two scans that exist: by account, and by expiry", () => {
      expect(modelBlock("Session")).toMatch(/@@index\(\[userId\]\)/);
      expect(modelBlock("Session")).toMatch(/@@index\(\[expires\]\)/);
    });
  });

  it("gives a verification token a single-use compound key", () => {
    // The adapter deletes by `identifier_token` and treats a missing row as an
    // already-used link. That is only single-use if the pair is the key.
    expect(modelBlock("VerificationToken")).toMatch(/@@id\(\[identifier, token\]\)/);
    expect(modelFields("VerificationToken")).toEqual(["identifier", "token", "expires"]);
  });

  it("deletes an account's identities and sessions with the account", () => {
    for (const model of ["Account", "Session"]) {
      expect(modelBlock(model)).toMatch(
        /^\s*user\s+User\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/m,
      );
    }
  });

  // The first bent rule, asserted: §4.3 says a row that can be modified records
  // who modified it, and none of these three does. `Session.expires` is the
  // only field that ever changes, extended by the framework on behalf of the
  // account the row already names — the `User` exception, one level down.
  it.each(AUTH_MODELS)("keeps %s outside the audit block, deliberately", (model) => {
    const fields = modelFields(model);

    expect(fields).not.toContain("updatedAt");
    expect(fields).not.toContain(AUDIT_AUTHOR_FIELD);
    expect(fields).not.toContain(AUDIT_VERSION_FIELD);
  });

  // The second: they are not project data, so they are classified as unowned
  // rather than given a path to `Project` they could not honestly have.
  it.each(AUTH_MODELS)("classifies %s as unowned, beside User", (model) => {
    expect(UNOWNED_MODELS).toContain(model);
    expect(PROJECT_OWNED_MODEL_NAMES).not.toContain(model);
  });

  describe("User, after authentication", () => {
    it("lets an account exist before it has a name", () => {
      // An email link knows an address and nothing else. A mandatory `name`
      // would make the very first sign-in fail inside the adapter.
      expect(modelBlock("User")).toMatch(/^\s*name\s+String\?/m);
    });

    it("records the address as proven by a timestamp, not by a boolean", () => {
      expect(modelBlock("User")).toMatch(/^\s*emailVerified\s+DateTime\?/m);
    });

    it("keeps the address unique, since it is what identifies an account", () => {
      // CAL-026 and CAL-027 attach a second and a third identity to an existing
      // account by matching this column. Two rows with the same address would
      // make that attachment pick one of them.
      expect(modelBlock("User")).toMatch(/^\s*email\s+String\s+@unique/m);
    });

    it("owns both sides of the two new relations", () => {
      expect(modelFields("User")).toContain("accounts");
      expect(modelFields("User")).toContain("sessions");
    });
  });
});
