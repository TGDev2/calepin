/**
 * What `create-character-sheet` is asked and what it is allowed to return
 * (CAL-090, §6).
 *
 * The third bible mission: one `Character` — the row that *is* the sheet
 * (CAL-016) — for the seventeen fields of the specification (§Personnages),
 * relations included. The backlog's requirement is not the field list — it is
 * that **no character reduce to a narrative function**, the defect the
 * specification names among those to detect, and four quality bars carry it:
 * the deep need differs from the apparent desire, the contradiction is active
 * and creates difficult choices, the manner of speaking makes dialogue
 * non-interchangeable, and the held knowledge is exploitable by the coherence
 * check. This contract is shaped around those four.
 *
 * **Each quality bar is a shape, not a wish.** The CAL-089 move — the pair
 * whose second half cannot be filled when the first is fake — applied three
 * times, with the column key staying at the top level so persistence stays a
 * copy: `deepNeed.divergence` says what pursuing the desire costs the need
 * and is unwritable when the two coincide; `contradiction.dilemma` is the
 * concrete situation forcing a choice where both branches cost, and a
 * contradiction forcing no choice is a trait; `speechStyle.breach` is what
 * this character would never say, decidable on a single line of dialogue.
 * A knowledge entry is `{ statement, stance }` — the affirmative atomic
 * content plus the character's stance, `./knowledge`'s compound vocabulary,
 * so CAL-094's derivation is a copy. What shape cannot judge — whether a
 * written divergence is genuinely a divergence — is the proof protocol's and
 * the bench's (CAL-059), never a checker reading wording.
 *
 * **Relations are the seventeenth field, closed by the ask.** The sheet
 * declares its *outgoing* edges only, each naming a character the ask offered
 * in `establishedCharacters` — CAL-084/088's device: the model can relate
 * only to a cast it was actually shown, never an id (§6). `description` is
 * the asymmetric side the `Relationship` row stores — what holds from this
 * character's side only. Everything graph-level (reverse edges, asymmetry
 * across the cast, editing, the screen) is CAL-091's.
 *
 * **`importance` is the ask's, never the answer's.** How much novel a
 * character carries is the author's decision, the *told, not trusted*
 * position CAL-088 gives the audience and the length. The union mirrors the
 * `CharacterImportance` enum (§4.2 carve-out, pinned by
 * `prisma/schema.test.ts`), as `relationships[].type` mirrors
 * `RelationshipType`.
 *
 * **No basis, deliberately.** A character sheet invents a person the source
 * text does not fully contain (`missions.ts`, §5.4) — CAL-089's position: a
 * required quotation would force weak fields or false citations. The ask
 * still closes the corpus the sheet answers to, with `style` added to the
 * kinds: a voice must not contradict the register the bible just legislated.
 *
 * **No score, structurally** (cahier des charges 1195–1199), as CAL-075,
 * CAL-076, CAL-079, CAL-081, CAL-088 and CAL-089 — with the first deliberate
 * carve-out: `age` is the one numeric field an answer schema has ever
 * carried, because it measures time in the novel's world (`Character.age`,
 * an `Int?` counted at day 0 of the timeline), never a quality.
 * `schema.test.ts` pins exactly that: no number anywhere but there.
 */

import { FREEDOM_LEVELS } from "@calepin/shared/freedom-level";
import { z } from "zod";

import { ceilingFor } from "../identity/schema";
import { CHARACTER_KNOWLEDGE_STANCES } from "./knowledge";

/**
 * The lengths the prompt asks for, in words — rendered as variables and
 * enforced below as character ceilings, the CAL-055 pattern. One number per
 * concept, whatever field it appears in.
 */
export const CHARACTER_WORD_TARGETS = {
  /** What of the body matters to the story — never a portrait. */
  appearance: 60,
  /** Where the character stands when the novel opens. */
  initialSituation: 60,
  /** What the character says they want and visibly pursues. */
  apparentDesire: 35,
  /** What would actually resolve them — distinct from the desire, structurally. */
  need: 35,
  /** What pursuing the desire costs the need — unwritable if they coincide. */
  divergence: 30,
  /** The fear that governs their refusals. */
  fear: 30,
  /** The two pulls that share the character. */
  tension: 40,
  /** One concrete situation where both options cost — the active half. */
  dilemma: 40,
  /** What they hide, and would pay to keep hidden. */
  secret: 40,
  /** The past that produced them — only what the writing will use. */
  past: 120,
  /** The planned evolution across the novel. */
  plannedArc: 80,
  /** How they speak: register, rhythm, tics, what they reach for. */
  voice: 50,
  /** What they would never say — the test of the voice, on a single line. */
  breach: 25,
  /** One atomic, affirmative, self-contained piece of knowledge. */
  knowledge: 18,
  /** One element proposed as untouchable — what the novel leans on. */
  preserve: 20,
  /** What holds from this character's side of one relationship. */
  relationDescription: 30,
} as const;

/** The character ceilings the schemas below enforce. */
export const CHARACTER_CHAR_CEILINGS = {
  appearance: ceilingFor(CHARACTER_WORD_TARGETS.appearance),
  initialSituation: ceilingFor(CHARACTER_WORD_TARGETS.initialSituation),
  apparentDesire: ceilingFor(CHARACTER_WORD_TARGETS.apparentDesire),
  need: ceilingFor(CHARACTER_WORD_TARGETS.need),
  divergence: ceilingFor(CHARACTER_WORD_TARGETS.divergence),
  fear: ceilingFor(CHARACTER_WORD_TARGETS.fear),
  tension: ceilingFor(CHARACTER_WORD_TARGETS.tension),
  dilemma: ceilingFor(CHARACTER_WORD_TARGETS.dilemma),
  secret: ceilingFor(CHARACTER_WORD_TARGETS.secret),
  past: ceilingFor(CHARACTER_WORD_TARGETS.past),
  plannedArc: ceilingFor(CHARACTER_WORD_TARGETS.plannedArc),
  voice: ceilingFor(CHARACTER_WORD_TARGETS.voice),
  breach: ceilingFor(CHARACTER_WORD_TARGETS.breach),
  knowledge: ceilingFor(CHARACTER_WORD_TARGETS.knowledge),
  preserve: ceilingFor(CHARACTER_WORD_TARGETS.preserve),
  relationDescription: ceilingFor(CHARACTER_WORD_TARGETS.relationDescription),
} as const;

/** A name, a role or a relationship label is a heading, not a paragraph. */
export const CHARACTER_LABEL_CHAR_CEILING = 80;

/**
 * How many entries the three lists carry.
 *
 * Knowledge: one at least — a character who knows nothing asymmetric holds no
 * scene — and eight at most, past which the entries stop being what the
 * author holds in mind. Elements to preserve: one at least, because a sheet
 * with nothing untouchable has no spine, and six at most. Relationships: may
 * be empty — the first character sheeted has nobody to relate to, and an
 * absence is meaningful — and twelve at most.
 */
export const CHARACTER_LIST_COUNTS = {
  heldKnowledge: { min: 1, max: 8 },
  elementsToPreserve: { min: 1, max: 6 },
  relationships: { min: 0, max: 12 },
} as const;

/**
 * How many established characters one ask offers — zero for the first sheet
 * of a project, and a ceiling that refuses a cast dump without shaping the
 * composer's cut.
 */
export const CHARACTER_ESTABLISHED_COUNTS = { min: 0, max: 40 } as const;

/** One established character's summary is a line, not their sheet. */
export const CHARACTER_ESTABLISHED_SUMMARY_CHAR_CEILING = 600;

/** The author's word about who to sheet — a brief, not a draft of the sheet. */
export const CHARACTER_BRIEF_CHAR_CEILING = 2_000;

/**
 * How many passages one ask carries — `NOVEL_IDENTITY_SOURCE_COUNTS`'s
 * reasoning: two at least so the sheet answers to more than one upstream, and
 * a generous ceiling that refuses a dump (§5.8).
 */
export const CHARACTER_SOURCE_COUNTS = { min: 2, max: 64 } as const;

/** The longest passage one source entry carries — a section, never a text. */
export const CHARACTER_SOURCE_CHAR_CEILING = 8_000;

/** The longest key or label the composer may give one source. */
export const CHARACTER_SOURCE_KEY_CHAR_CEILING = 80;

/**
 * Where a passage of the corpus comes from — the four upstreams a sheet
 * answers to. One more than the style's three: the sheet is written against
 * the identity *and* the style the bible opened with, its voice being prose
 * the register has already legislated — which is also why the mission sits
 * third in the bible stage.
 */
export const CHARACTER_SOURCE_KINDS = ["direction", "identity", "style", "analysis"] as const;

export type CharacterSourceKind = (typeof CHARACTER_SOURCE_KINDS)[number];

/**
 * The `CharacterImportance` members, spelled as the enum spells them — the
 * §4.2 carve-out, `PROJECT_STATUSES`'s reason: the list follows the column.
 * `prisma/schema.test.ts` pins the pair.
 */
export const CHARACTER_IMPORTANCES = ["MAIN", "SECONDARY", "MINOR"] as const;

export type CharacterImportanceInput = (typeof CHARACTER_IMPORTANCES)[number];

/** The French noun phrase the prompt receives for each importance. */
export const CHARACTER_IMPORTANCE_LABELS: Readonly<Record<CharacterImportanceInput, string>> = {
  MAIN: "personnage principal",
  SECONDARY: "personnage secondaire",
  MINOR: "personnage mineur",
};

/**
 * The `RelationshipType` members, spelled as the enum spells them — the same
 * carve-out and the same pin as `CHARACTER_IMPORTANCES`.
 */
export const CHARACTER_RELATIONSHIP_TYPES = [
  "FAMILY",
  "ROMANTIC",
  "FRIENDSHIP",
  "PROFESSIONAL",
  "MENTORSHIP",
  "ALLIANCE",
  "RIVALRY",
  "HOSTILITY",
  "OTHER",
] as const;

export type CharacterRelationshipType = (typeof CHARACTER_RELATIONSHIP_TYPES)[number];

/** The French gloss the prompt quotes beside each relationship type. */
export const CHARACTER_RELATIONSHIP_TYPE_LABELS: Readonly<
  Record<CharacterRelationshipType, string>
> = {
  FAMILY: "famille",
  ROMANTIC: "amour",
  FRIENDSHIP: "amitié",
  PROFESSIONAL: "travail",
  MENTORSHIP: "mentorat",
  ALLIANCE: "alliance",
  RIVALRY: "rivalité",
  HOSTILITY: "hostilité",
  OTHER: "autre, précisé par le libellé",
};

/**
 * One passage the sheet stays answerable to — `styleSourceSchema`'s shape
 * with this contract's own vocabulary. Context, not a citation vocabulary:
 * no basis is asked of the answer.
 */
export const characterSourceSchema = z.strictObject({
  kind: z.enum(CHARACTER_SOURCE_KINDS),
  key: z.string().trim().min(1).max(CHARACTER_SOURCE_KEY_CHAR_CEILING),
  /** French, what the model reads above the passage. */
  label: z.string().trim().min(1).max(CHARACTER_SOURCE_KEY_CHAR_CEILING),
  text: z.string().trim().min(1).max(CHARACTER_SOURCE_CHAR_CEILING),
});

export type CharacterSource = z.infer<typeof characterSourceSchema>;

/**
 * One character already in the bible, as the ask offers it: the name the
 * answer's relationships may use, and one line of who they are. The closed
 * vocabulary of `relationships[].characterName` — and the cast the prompt
 * holds the new voice apart from.
 */
export const establishedCharacterSchema = z.strictObject({
  name: z.string().trim().min(1).max(CHARACTER_LABEL_CHAR_CEILING),
  summary: z.string().trim().min(1).max(CHARACTER_ESTABLISHED_SUMMARY_CHAR_CEILING),
});

export type EstablishedCharacter = z.infer<typeof establishedCharacterSchema>;

/**
 * What one sheet was asked — the payload `Generation.input` carries and
 * `generationIdempotencyKey` digests (CAL-058).
 *
 * Content-addressed as the identity's and the style's asks are: the corpus,
 * the brief and the established cast travel as text, so editing an upstream
 * or sheeting a new neighbour first is a different ask, while a job the queue
 * redelivers is the same one. No audience and no length: no sheet field reads
 * either — the register the voice lives under is the style section's, already
 * in the corpus — and an input the answer never uses would make the digest
 * reopen every sheet on every retune.
 *
 * `characterName` is required-but-nullable, CAL-077's discipline: null says
 * *propose the name*, a string says *this name is imposed* — and
 * `verifyCharacterSheet` holds the answer to it mechanically. `brief` is
 * nullable the same way: an author may ask for a character the direction
 * names with no further word.
 *
 * The checks below run **before** any generation (principle 6.5): an ask
 * whose imposed name already names an established character, or which offers
 * one name twice, is refused with no model asked. Exact comparison is enough
 * here — both spellings come from rows `@@unique([bibleId, name])` already
 * keeps distinct; the typographic reduction belongs to the answer side,
 * where a model retypes.
 */
export const characterSheetInputSchema = z
  .strictObject({
    /** The source text version the upstreams were produced against. */
    sourceTextVersionId: z.string().trim().min(1),
    /** The canonical direction the sheet serves. */
    directionId: z.string().trim().min(1),
    /** The imposed name, or null for the model to propose one. */
    characterName: z.string().trim().min(1).max(CHARACTER_LABEL_CHAR_CEILING).nullable(),
    /** How much novel this character carries — the author's decision. */
    importance: z.enum(CHARACTER_IMPORTANCES),
    /** The author's word about who to sheet, or null when the corpus says it all. */
    brief: z.string().trim().min(1).max(CHARACTER_BRIEF_CHAR_CEILING).nullable(),
    freedomLevel: z.enum(FREEDOM_LEVELS),
    establishedCharacters: z
      .array(establishedCharacterSchema)
      .min(CHARACTER_ESTABLISHED_COUNTS.min)
      .max(CHARACTER_ESTABLISHED_COUNTS.max),
    sources: z
      .array(characterSourceSchema)
      .min(CHARACTER_SOURCE_COUNTS.min)
      .max(CHARACTER_SOURCE_COUNTS.max),
  })
  .check((ctx) => {
    const seenKeys = new Set<string>();

    ctx.value.sources.forEach((source, index) => {
      if (seenKeys.has(source.key)) {
        ctx.issues.push({
          code: "custom",
          message: "one source key offered twice in a character ask",
          path: ["sources", index, "key"],
          input: ctx.value,
        });
      }
      seenKeys.add(source.key);
    });

    const seenNames = new Set<string>();

    ctx.value.establishedCharacters.forEach((character, index) => {
      if (seenNames.has(character.name)) {
        ctx.issues.push({
          code: "custom",
          message: "one established character offered twice in a character ask",
          path: ["establishedCharacters", index, "name"],
          input: ctx.value,
        });
      }
      seenNames.add(character.name);
    });

    if (ctx.value.characterName !== null && seenNames.has(ctx.value.characterName)) {
      ctx.issues.push({
        code: "custom",
        message: "the imposed name already names an established character",
        path: ["characterName"],
        input: ctx.value,
      });
    }
  });

export type CharacterSheetInput = z.infer<typeof characterSheetInputSchema>;

const label = z.string().trim().min(1).max(CHARACTER_LABEL_CHAR_CEILING);

function prose(ceiling: number): z.ZodString {
  return z.string().trim().min(1).max(ceiling);
}

/**
 * One piece of knowledge: the affirmative, atomic, self-contained content,
 * and the character's stance on it — `./knowledge`'s compound vocabulary,
 * which decides the world's truth and the belief at once.
 */
export const heldKnowledgeEntrySchema = z.strictObject({
  /** Always the affirmative content the stance is about — never a negation. */
  statement: prose(CHARACTER_CHAR_CEILINGS.knowledge),
  stance: z.enum(CHARACTER_KNOWLEDGE_STANCES),
});

export type HeldKnowledgeEntry = z.infer<typeof heldKnowledgeEntrySchema>;

/**
 * One outgoing edge of the sheet: who it reaches — a name the ask offered,
 * verified by `verifyCharacterSheet`, never an id (§6) — the typed tie, its
 * label written from this character's side, and the asymmetric description:
 * what holds from this side only, or null when the label says it all.
 */
export const characterRelationshipSchema = z.strictObject({
  /** One of the established characters the ask offered. */
  characterName: label,
  type: z.enum(CHARACTER_RELATIONSHIP_TYPES),
  /** The tie from this character's side: « père de », « ancienne associée de ». */
  label,
  /** What this character believes, knows or feels about the other — one-sided. */
  description: prose(CHARACTER_CHAR_CEILINGS.relationDescription).nullable(),
});

export type CharacterRelationship = z.infer<typeof characterRelationshipSchema>;

/**
 * The answer to `create-character-sheet`: the fifteen sheet columns
 * `Character` stores, plus `relationships` — the backlog's own seventeenth
 * field, held by the `Relationship` table rather than a column.
 *
 * Spelled as the `Character` columns CAL-016 already wrote, so persistence,
 * when its task comes, is a copy and not a translation. Three columns hold a
 * pair rather than a string — `deepNeed`, `contradiction`, `speechStyle` —
 * and `resolveCharacterSheet` (`./resolve`) flattens each into the column's
 * one text, the breach staying visible. The type is `ConflictedCharacterSheet`
 * rather than `CharacterSheet`: CAL-016 amended the glossary so `Character`
 * names the row, and the qualified name carries the acceptance criterion the
 * way `tracedNovelIdentitySchema` and `operationalStyleSchema` carry theirs.
 *
 * `importance` is deliberately absent — the ask fixes it. `age` is nullable
 * (a tale's wolf has no age worth asserting) and its lower bound is a
 * `.check()` rather than `.min()`, so no untested `minimum` keyword enters
 * the JSON Schema the structured-output subset has to accept — the same move
 * the central question makes against `pattern`. No upper bound: the column
 * has none, deliberately (a character can be eight hundred).
 */
export const conflictedCharacterSheetSchema = z
  .strictObject({
    name: label,
    /** Age at day 0 of the timeline (CAL-017), or null when age is not a fact. */
    age: z.int().nullable(),
    /** The narrative function, named — what the sheet must exceed, never all it is. */
    role: label,
    appearance: prose(CHARACTER_CHAR_CEILINGS.appearance),
    initialSituation: prose(CHARACTER_CHAR_CEILINGS.initialSituation),
    apparentDesire: prose(CHARACTER_CHAR_CEILINGS.apparentDesire),
    deepNeed: z.strictObject({
      /** What would actually resolve the character. */
      need: prose(CHARACTER_CHAR_CEILINGS.need),
      /** What pursuing the desire costs the need — unwritable if they coincide. */
      divergence: prose(CHARACTER_CHAR_CEILINGS.divergence),
    }),
    fear: prose(CHARACTER_CHAR_CEILINGS.fear),
    contradiction: z.strictObject({
      /** The two pulls that share the character. */
      tension: prose(CHARACTER_CHAR_CEILINGS.tension),
      /** One concrete situation forcing a choice where both branches cost. */
      dilemma: prose(CHARACTER_CHAR_CEILINGS.dilemma),
    }),
    secret: prose(CHARACTER_CHAR_CEILINGS.secret),
    past: prose(CHARACTER_CHAR_CEILINGS.past),
    plannedArc: prose(CHARACTER_CHAR_CEILINGS.plannedArc),
    speechStyle: z.strictObject({
      /** How they speak — register, rhythm, tics, what they reach for. */
      voice: prose(CHARACTER_CHAR_CEILINGS.voice),
      /** What they would never say — decidable on a single line of dialogue. */
      breach: prose(CHARACTER_CHAR_CEILINGS.breach),
    }),
    heldKnowledge: z
      .array(heldKnowledgeEntrySchema)
      .min(CHARACTER_LIST_COUNTS.heldKnowledge.min)
      .max(CHARACTER_LIST_COUNTS.heldKnowledge.max),
    elementsToPreserve: z
      .array(prose(CHARACTER_CHAR_CEILINGS.preserve))
      .min(CHARACTER_LIST_COUNTS.elementsToPreserve.min)
      .max(CHARACTER_LIST_COUNTS.elementsToPreserve.max),
    relationships: z
      .array(characterRelationshipSchema)
      .min(CHARACTER_LIST_COUNTS.relationships.min)
      .max(CHARACTER_LIST_COUNTS.relationships.max),
  })
  .check((ctx) => {
    // The lower bound as a `.check` rather than a `.min`, so no `minimum`
    // keyword enters the derived JSON Schema — see the header. PostgreSQL's
    // `characters_age_check` backstops the same bound at the row.
    if (ctx.value.age !== null && ctx.value.age < 0) {
      ctx.issues.push({
        code: "custom",
        message: "a character's age cannot be negative",
        path: ["age"],
        input: ctx.value,
      });
    }
  });

export type ConflictedCharacterSheet = z.infer<typeof conflictedCharacterSheetSchema>;
