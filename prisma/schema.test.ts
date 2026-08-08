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

/**
 * The names of a model's fields, scalars and relations alike, in declaration
 * order. Doc comments (`///`), plain comments and block attributes (`@@`) are
 * not fields and never start with a lowercase letter, so the shape of the line
 * is enough to recognise one.
 */
function modelFields(name: string): string[] {
  return modelBlock(name)
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .map((line) => /^([a-z][A-Za-z0-9]*)\s+\S/.exec(line)?.[1])
    .filter((field): field is string => field !== undefined);
}

function toScreamingSnake(field: string): string {
  return field.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
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
        const required = modelBlock("ChapterOutline")
          .split("\n")
          .map((line) => /^\s*([a-z][A-Za-z0-9]*)\s+(String|Int|Boolean)(?!\?)/.exec(line)?.[1])
          .filter((field): field is string => field !== undefined);

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
      const required = modelBlock("Thread")
        .split("\n")
        .map((line) => /^\s*([a-z][A-Za-z0-9]*)\s+(String|Int|Boolean)(?!\?)/.exec(line)?.[1])
        .filter((field): field is string => field !== undefined);

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
});
