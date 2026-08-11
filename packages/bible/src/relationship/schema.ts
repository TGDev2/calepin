/**
 * What `relate-characters` is asked and what it is allowed to return
 * (CAL-091, §6).
 *
 * The fourth bible mission, and the one CAL-090 could not be. A character
 * sheet declares its *outgoing* edges only, from an ask that shows it one
 * character: a model that sees one side cannot state that **A holds something
 * about B that B does not hold** — the asymmetry is a property of the pair,
 * and nothing in a single sheet's contract has a place to put it. This mission
 * sees the whole cast and answers with the graph.
 *
 * **The asymmetry is structural, not prose.** `Relationship.description`'s own
 * doc comment settled where the checkable form lives: *"The asymmetry is
 * written here; its checkable form is CAL-018's per-character knowledge of an
 * atomic fact."* So there is no new column and no free-text "asymmetry" field.
 * An edge carries `asymmetries`, each one an affirmative atomic statement plus
 * **two stances on it** — the holder's (the edge's source) and the subject's
 * (its target) — drawn from `CHARACTER_KNOWLEDGE_STANCES`, the compound
 * vocabulary CAL-090 already committed. `resolveRelationshipAsymmetries`
 * (`./resolve`) projects each one through `knowledgeStanceToBelief` into the
 * `CanonFact` + `CanonFactBelief` shape CAL-094 writes and CAL-099 reads, so
 * *exploitable par le contrôle de cohérence* is a committed mapping rather
 * than a promise — CAL-090's device, applied to the pair.
 *
 * **A fake asymmetry is unfillable, by shape** — the `StyleConstraint`
 * discipline. Two `.check`s, and both are arithmetic on the existing mapping
 * rather than a second rule:
 *
 *   1. the two stances must decide the **same** world. `knowledgeStanceToBelief`
 *      fixes `isTrue` per stance, and two stances on one affirmative statement
 *      cannot disagree about whether it holds — that is not an asymmetry, it
 *      is a contradiction, and storing it would hand CAL-094 a fact whose
 *      truth value depends on who is asked;
 *   2. their `belief` must **differ**. Two characters standing identically to
 *      one statement is symmetric knowledge, whatever prose is wrapped round
 *      it.
 *
 * Together they leave exactly `knows` / `unaware` / `denies` admissible, and
 * make `believes-wrongly` unusable in an asymmetry — a consequence, not a
 * carve-out, and `schema.test.ts` pins it. It is the right consequence: a
 * false statement has one stance in this vocabulary, so an asymmetry over one
 * is unstatable, and the author must name the world's truth affirmatively
 * instead. That is `CanonFact.statement`'s own discipline (*atomic; always
 * affirmative*), asked one stage earlier — « A croit à tort que B l'a trahi »
 * is written as the true statement « B est resté loyal envers A », which A
 * `denies` and B `knows`.
 *
 * **The cast is closed by the ask**, CAL-084/088's device, as it is for a
 * sheet: an edge may name only a character the ask offered, never an id (§6).
 * `verifyCharacterRelations` holds the answer to it mechanically.
 *
 * **The mirror edge is never implied.** One row per direction is CAL-016's
 * decision, and a decision rather than an omission: CAL-099 has to *detect a
 * missing symmetric relation*, and a contract that completed the pair itself
 * could never produce one to detect. `resolveRelationshipGraph` (`./graph`)
 * therefore *classifies* what was declared; it never adds to it.
 *
 * **No score, structurally** (cahier des charges 1195–1199), as CAL-075,
 * CAL-076, CAL-079, CAL-081, CAL-088, CAL-089 and CAL-090 — and here with no
 * carve-out at all: `age` was the sheet's, and nothing in a tie measures
 * anything. `schema.test.ts` pins the absence.
 *
 * **Nothing is restated.** The type vocabulary, the label ceiling, the
 * one-sided description's ceiling, the cast entry and the corpus entry are all
 * `../character/schema`'s, imported. An asymmetry's statement is bounded by
 * `CHARACTER_CHAR_CEILINGS.knowledge` for the same reason: it *is* a knowledge
 * statement — atomic, affirmative, self-contained — and one number lives in
 * one place (CAL-055).
 */

import { FREEDOM_LEVELS } from "@calepin/shared/freedom-level";
import { z } from "zod";

import { CHARACTER_KNOWLEDGE_STANCES, knowledgeStanceToBelief } from "../character/knowledge";
import {
  CHARACTER_CHAR_CEILINGS,
  CHARACTER_LABEL_CHAR_CEILING,
  CHARACTER_RELATIONSHIP_TYPES,
  CHARACTER_SOURCE_COUNTS,
  CHARACTER_WORD_TARGETS,
  characterSourceSchema,
  establishedCharacterSchema,
} from "../character/schema";

/**
 * How many entries the graph's lists carry.
 *
 * Relations: one at least — an answer declaring no tie is not a graph, and the
 * mission is not asked of a cast of one — and forty at most, which is a dense
 * graph over the cast ceiling without being a dump.
 *
 * Asymmetries per edge: **may be empty**, and that is the load-bearing
 * permission. Most ties carry none, and a contract demanding one per edge
 * would teach the model to invent secrets — the failure mode CAL-076's
 * minimums are shaped to avoid in the other direction. Three at most: past
 * that, what one character holds about another has stopped being the tie and
 * become their sheet.
 */
export const RELATIONSHIP_LIST_COUNTS = {
  relations: { min: 1, max: 40 },
  asymmetries: { min: 0, max: 3 },
} as const;

/**
 * How many characters one ask offers. **Two at least**, structurally: a tie
 * needs two ends, and a cast of one makes every possible answer a
 * self-relation. The ceiling is `CHARACTER_ESTABLISHED_COUNTS`'s, the same
 * cast seen from the other side.
 */
export const RELATIONSHIP_CAST_COUNTS = { min: 2, max: 40 } as const;

/**
 * The lengths the prompt asks for, in words, and the character ceilings the
 * schemas below enforce — the CAL-055 pattern, one number rendered as a
 * variable *and* bounding the contract.
 *
 * Both numbers are the character section's own, imported rather than chosen: a
 * tie's one-sided description and a knowledge statement do not become
 * different lengths for being asked by a different mission.
 */
export const RELATIONSHIP_WORD_TARGETS = {
  /** What holds from the source character's side of one tie. */
  description: CHARACTER_WORD_TARGETS.relationDescription,
  /** One atomic, affirmative, self-contained statement an asymmetry is about. */
  asymmetryStatement: CHARACTER_WORD_TARGETS.knowledge,
} as const;

export const RELATIONSHIP_CHAR_CEILINGS = {
  description: CHARACTER_CHAR_CEILINGS.relationDescription,
  asymmetryStatement: CHARACTER_CHAR_CEILINGS.knowledge,
} as const;

const label = z.string().trim().min(1).max(CHARACTER_LABEL_CHAR_CEILING);

function prose(ceiling: number): z.ZodString {
  return z.string().trim().min(1).max(ceiling);
}

/**
 * One thing the edge's source holds about its target, and the target's own
 * stance on the same statement.
 *
 * `statement` is always the affirmative content both stances are about —
 * never a negation, never a stance restated — because it becomes
 * `CanonFact.statement`, whose discipline that is. `holderStance` is the
 * source character's, `subjectStance` the target's; the pair is what makes
 * « A sait de B ce que B ignore » a thing a machine can read.
 *
 * The two checks are the header's, expressed as arithmetic on
 * `knowledgeStanceToBelief` rather than as a second table — which is what
 * stops this contract and CAL-094's derivation ever disagreeing about which
 * pairs mean something.
 */
export const relationshipAsymmetrySchema = z
  .strictObject({
    /** The affirmative statement, atomic and self-contained. */
    statement: prose(RELATIONSHIP_CHAR_CEILINGS.asymmetryStatement),
    /** How the edge's source stands to it. */
    holderStance: z.enum(CHARACTER_KNOWLEDGE_STANCES),
    /** How the edge's target stands to the same statement. */
    subjectStance: z.enum(CHARACTER_KNOWLEDGE_STANCES),
  })
  .check((ctx) => {
    const holder = knowledgeStanceToBelief(ctx.value.holderStance);
    const subject = knowledgeStanceToBelief(ctx.value.subjectStance);

    if (holder.isTrue !== subject.isTrue) {
      ctx.issues.push({
        code: "custom",
        message: "the two stances disagree about whether the statement holds in the world",
        path: ["subjectStance"],
        input: ctx.value,
      });
    }

    if (holder.belief === subject.belief) {
      ctx.issues.push({
        code: "custom",
        message: "an asymmetry needs the two characters to stand differently",
        path: ["subjectStance"],
        input: ctx.value,
      });
    }
  });

export type RelationshipAsymmetry = z.infer<typeof relationshipAsymmetrySchema>;

/**
 * One directed edge: who it leaves, who it reaches — both names the ask
 * offered, verified by `verifyCharacterRelations`, never an id (§6) — the
 * typed tie, its label written from the source's side, what holds from that
 * side only, and the asymmetries the tie carries.
 *
 * It is the sheet's `characterRelationshipSchema` with its source named
 * instead of implied, and `asymmetries` added. Not a reuse of that schema:
 * there the source *is* the sheet, so naming it would be a second answer able
 * to disagree with `name`.
 */
export const directedRelationshipSchema = z.strictObject({
  /** One of the cast the ask offered — the side the tie is written from. */
  fromCharacterName: label,
  /** Another of the cast — never the same one. */
  toCharacterName: label,
  type: z.enum(CHARACTER_RELATIONSHIP_TYPES),
  /** The tie from the source's side: « père de », « ancienne associée de ». */
  label,
  /** What holds from the source's side only, or null when the label says it all. */
  description: prose(RELATIONSHIP_CHAR_CEILINGS.description).nullable(),
  asymmetries: z
    .array(relationshipAsymmetrySchema)
    .min(RELATIONSHIP_LIST_COUNTS.asymmetries.min)
    .max(RELATIONSHIP_LIST_COUNTS.asymmetries.max),
});

export type DirectedRelationship = z.infer<typeof directedRelationshipSchema>;

/**
 * The answer to `relate-characters`: the directed edges of one bible's cast.
 *
 * An object rather than a bare array, because a root array is not a shape the
 * structured-output subset accepts — the same reason `directionCombination`'s
 * two branches sit under one strict object.
 *
 * Deliberately **not** a per-pair structure. The pair is a *reading* of the
 * edges (`./graph`), and a contract that asked for pairs would make the mirror
 * edge implied, which CAL-016 refused on CAL-099's behalf.
 */
export const characterRelationsSchema = z.strictObject({
  relations: z
    .array(directedRelationshipSchema)
    .min(RELATIONSHIP_LIST_COUNTS.relations.min)
    .max(RELATIONSHIP_LIST_COUNTS.relations.max),
});

export type CharacterRelations = z.infer<typeof characterRelationsSchema>;

/**
 * What one graph was asked — the payload `Generation.input` carries and
 * `generationIdempotencyKey` digests (CAL-058).
 *
 * Content-addressed as every bible ask is: the cast and the corpus travel as
 * text, so sheeting one more character, or editing an upstream, is a different
 * ask, while a job the queue redelivers is the same one.
 *
 * No audience and no length, `bibleStyleInputSchema`'s reasoning: no field of
 * an edge reads either, and an unused input would reopen the graph ask on
 * every retune. The checks run **before** any generation (principle 6.5).
 */
export const characterRelationsInputSchema = z
  .strictObject({
    /** The source text version the upstreams were produced against. */
    sourceTextVersionId: z.string().trim().min(1),
    /** The canonical direction the graph serves. */
    directionId: z.string().trim().min(1),
    freedomLevel: z.enum(FREEDOM_LEVELS),
    /** The closed vocabulary an edge may name, both ends. */
    cast: z
      .array(establishedCharacterSchema)
      .min(RELATIONSHIP_CAST_COUNTS.min)
      .max(RELATIONSHIP_CAST_COUNTS.max),
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
          message: "one source key offered twice in a relations ask",
          path: ["sources", index, "key"],
          input: ctx.value,
        });
      }
      seenKeys.add(source.key);
    });

    const seenNames = new Set<string>();

    ctx.value.cast.forEach((character, index) => {
      if (seenNames.has(character.name)) {
        ctx.issues.push({
          code: "custom",
          message: "one character offered twice in a relations ask",
          path: ["cast", index, "name"],
          input: ctx.value,
        });
      }
      seenNames.add(character.name);
    });
  });

export type CharacterRelationsInput = z.infer<typeof characterRelationsInputSchema>;
