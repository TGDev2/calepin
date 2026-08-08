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
});
