/**
 * What `define-style` is asked and what it is allowed to return (CAL-089, §6).
 *
 * The second section of the bible: the specification's *style* (§5.6), the
 * section a chapter-writing context reads most often, and the one that later
 * prevents the interchangeable prose the specification names as a major risk.
 * The backlog's requirement is not a list of nine fields — it is that **every
 * element be an operational constraint verifiable during drafting, never a
 * decorative adjective** — and that is what this contract is shaped around.
 *
 * **A constraint is a pair, structurally.** Every element of the answer is a
 * `StyleConstraint`: the rule itself, stated of the novel's prose, and the
 * observable feature of **a single passage** that breaches it. A decorative
 * adjective — *une prose élégante et fluide* — cannot fill the `violation`
 * half, because nothing observable breaches it; a rule nobody could break is
 * refused by its own shape, not by a checker reading its wording. This is the
 * same move `thematicAxes` makes against the second theme, and *no score,
 * structurally* makes against the number: the discipline is the schema's, not
 * the prompt's goodwill. It is also what the downstream consumers need in
 * hand: CAL-107's writing context quotes the rules, CAL-139's style checks
 * confront a passage with the violations.
 *
 * **No basis, deliberately.** CAL-088's per-field basis *was* its acceptance
 * criterion — traceability, *sans invention non motivée*. CAL-089's is
 * operationality, and the pair is what carries it; a style rule under an
 * `extend` or `reinterpret` treatment has no verbatim antecedent to quote,
 * so a required quotation here would force weak rules or false citations.
 * The ask still closes the corpus (`sources`) the section must stay
 * answerable to — the direction, the identity, the validated analysis — and
 * the freedom clauses still reach the prompt; what is dropped is the
 * mechanical re-read, not the grounding.
 *
 * **The register reads the audience.** CAL-045 requires the author's declared
 * readership to surface in the style section; `languageRegister` is where it
 * does. The audience arrives in the ask as a constraint the register is
 * derived from — never a field the answer re-decides, `Project.targetAudience`
 * being the first answer (CAL-088's own rule, one field over).
 *
 * **No score, structurally** (cahier des charges 1195–1199), as CAL-075,
 * CAL-076, CAL-079, CAL-081 and CAL-088: no numeric field anywhere in the
 * answer, and `schema.test.ts` pins that shape.
 */

import { FREEDOM_LEVELS } from "@calepin/shared/freedom-level";
import { z } from "zod";

import { ceilingFor } from "../identity/schema";

/**
 * The lengths the prompt asks for, in words — rendered as variables and
 * enforced below as character ceilings, the CAL-055 pattern. Two numbers,
 * because the contract has two kinds of sentence: every rule, whichever
 * element it governs, is one discipline and one number, and so is every
 * violation.
 */
export const STYLE_WORD_TARGETS = {
  /** The constraint itself — declarative French, stated of the prose. */
  rule: 35,
  /** The observable breach — what one passage shows when the rule is broken. */
  violation: 25,
} as const;

/** The character ceilings the schema below enforces. */
export const STYLE_CHAR_CEILINGS = {
  rule: ceilingFor(STYLE_WORD_TARGETS.rule),
  violation: ceilingFor(STYLE_WORD_TARGETS.violation),
} as const;

/**
 * How many entries the two lists carry.
 *
 * Motifs: two at least, because one motif is a coincidence rather than a
 * system; five at most, below the four-to-six every list here settles toward,
 * because a motif is only alive while the author holds it in mind chapter by
 * chapter. Elements to avoid: three at least — the one-token gesture is not a
 * defence of the text — and eight at most, room for the specification's own
 * seven recurring defects of generated prose plus the one this text is
 * specifically threatened by.
 */
export const STYLE_LIST_COUNTS = {
  recurringMotifs: { min: 2, max: 5 },
  elementsToAvoid: { min: 3, max: 8 },
} as const;

/** The author's declared readership is a heading, not a paragraph. */
export const STYLE_AUDIENCE_CHAR_CEILING = 80;

/**
 * How many passages one ask carries — `NOVEL_IDENTITY_SOURCE_COUNTS`'s
 * reasoning, restated for this ask: two at least so the section answers to
 * more than one upstream, and a generous ceiling that refuses a dump (§5.8)
 * without shaping the composer's granularity.
 */
export const STYLE_SOURCE_COUNTS = { min: 2, max: 64 } as const;

/** The longest passage one source entry carries — a section, never a text. */
export const STYLE_SOURCE_CHAR_CEILING = 8_000;

/** The longest key or label the composer may give one source. */
export const STYLE_SOURCE_KEY_CHAR_CEILING = 80;

/**
 * Where a passage of the corpus comes from — the three upstreams a style
 * section answers to. One more than the identity's two: the style is written
 * against the identity the bible opened with — its tone is the nearest
 * upstream a register or a pacing must not contradict — which is also why the
 * mission sits second in the bible stage.
 */
export const STYLE_SOURCE_KINDS = ["direction", "identity", "analysis"] as const;

export type StyleSourceKind = (typeof STYLE_SOURCE_KINDS)[number];

/**
 * One passage the section stays answerable to: where it comes from, how the
 * composer names it, what the model reads it as, and the passage itself.
 * `identitySourceSchema`'s shape with this contract's own vocabulary — the
 * corpus is context here, not a citation vocabulary, since no basis is asked.
 */
export const styleSourceSchema = z.strictObject({
  kind: z.enum(STYLE_SOURCE_KINDS),
  key: z.string().trim().min(1).max(STYLE_SOURCE_KEY_CHAR_CEILING),
  /** French, what the model reads above the passage. */
  label: z.string().trim().min(1).max(STYLE_SOURCE_KEY_CHAR_CEILING),
  text: z.string().trim().min(1).max(STYLE_SOURCE_CHAR_CEILING),
});

export type StyleSource = z.infer<typeof styleSourceSchema>;

/**
 * What one style section was asked — the payload `Generation.input` carries
 * and `generationIdempotencyKey` digests (CAL-058).
 *
 * Content-addressed as the identity's ask is: the corpus travels as text, so
 * editing the direction, rewriting the identity or regenerating a section of
 * the analysis is a different ask, while a job the queue redelivers is the
 * same one. The audience is in because it is the ask — changing the declared
 * readership legitimately reopens the register. The target word count is
 * deliberately absent: no style field reads a length, and an input the answer
 * never uses would make the digest reopen the style question every time the
 * author retunes it.
 */
export const bibleStyleInputSchema = z
  .strictObject({
    /** The source text version the upstreams were produced against. */
    sourceTextVersionId: z.string().trim().min(1),
    /** The canonical direction the style serves. */
    directionId: z.string().trim().min(1),
    /** The author's declared readership — the register is derived from it. */
    targetAudience: z.string().trim().min(1).max(STYLE_AUDIENCE_CHAR_CEILING),
    freedomLevel: z.enum(FREEDOM_LEVELS),
    sources: z.array(styleSourceSchema).min(STYLE_SOURCE_COUNTS.min).max(STYLE_SOURCE_COUNTS.max),
  })
  .check((ctx) => {
    const seen = new Set<string>();

    ctx.value.sources.forEach((source, index) => {
      if (seen.has(source.key)) {
        ctx.issues.push({
          code: "custom",
          message: "one source key offered twice in a style ask",
          path: ["sources", index, "key"],
          input: ctx.value,
        });
      }
      seen.add(source.key);
    });
  });

export type BibleStyleInput = z.infer<typeof bibleStyleInputSchema>;

/**
 * One operational constraint: the rule, and the observable breach of it.
 *
 * Both halves required, never nullable — a rule whose violation cannot be
 * written is a decorative adjective, and *this rule cannot be broken* is not
 * a shape the contract has. The violation is stated of **a single passage**:
 * decidable by reading that passage alone, with no other chapter, no total
 * and no average in hand — which is what makes it a gate a targeted check
 * (CAL-139) can actually hold a paragraph to.
 */
export const styleConstraintSchema = z.strictObject({
  /** The constraint — declarative French, stated of the novel's prose. */
  rule: z.string().trim().min(1).max(STYLE_CHAR_CEILINGS.rule),
  /** What a reader observes in one passage when the rule is broken. */
  violation: z.string().trim().min(1).max(STYLE_CHAR_CEILINGS.violation),
});

export type StyleConstraint = z.infer<typeof styleConstraintSchema>;

/**
 * The answer to `define-style`: the nine fields `BibleStyle` stores, each an
 * operational constraint.
 *
 * Spelled as the `BibleStyle` columns CAL-016 already wrote, so persistence,
 * when its task comes, is a copy and not a translation — `resolveBibleStyle`
 * (`./resolve`) flattens each pair into the column's one text.
 */
export const operationalStyleSchema = z.strictObject({
  pointOfView: styleConstraintSchema,
  focalization: styleConstraintSchema,
  tense: styleConstraintSchema,
  languageRegister: styleConstraintSchema,
  descriptiveDensity: styleConstraintSchema,
  pacing: styleConstraintSchema,
  dialogueBalance: styleConstraintSchema,
  recurringMotifs: z
    .array(styleConstraintSchema)
    .min(STYLE_LIST_COUNTS.recurringMotifs.min)
    .max(STYLE_LIST_COUNTS.recurringMotifs.max),
  elementsToAvoid: z
    .array(styleConstraintSchema)
    .min(STYLE_LIST_COUNTS.elementsToAvoid.min)
    .max(STYLE_LIST_COUNTS.elementsToAvoid.max),
});

export type OperationalStyle = z.infer<typeof operationalStyleSchema>;

/**
 * The nine kinds of element a report can name — the answer's own keys, with a
 * list's entries named in the singular, `NOVEL_IDENTITY_FIELDS`'s shape.
 * Closed, so a later check can say where an element failed without carrying a
 * word of what it said (§9).
 */
export const STYLE_FIELDS = [
  "pointOfView",
  "focalization",
  "tense",
  "languageRegister",
  "descriptiveDensity",
  "pacing",
  "dialogueBalance",
  "recurringMotif",
  "elementToAvoid",
] as const;

export type StyleField = (typeof STYLE_FIELDS)[number];

/** The seven fields of the answer that are one constraint, in contract order. */
export const STYLE_SCALAR_FIELDS = [
  "pointOfView",
  "focalization",
  "tense",
  "languageRegister",
  "descriptiveDensity",
  "pacing",
  "dialogueBalance",
] as const satisfies readonly StyleField[];

export type StyleScalarField = (typeof STYLE_SCALAR_FIELDS)[number];

/**
 * The French noun phrase for each element — in the domain rather than in
 * `@calepin/ai` for `FreedomConstraint`'s reason: the author reads the same
 * words the prompt quotes. Totality is the type's: a field added without a
 * label stops compiling.
 */
export const STYLE_FIELD_LABELS: Readonly<Record<StyleField, string>> = {
  pointOfView: "le point de vue",
  focalization: "la focalisation",
  tense: "le temps verbal",
  languageRegister: "le niveau de langue",
  descriptiveDensity: "la densité descriptive",
  pacing: "le rythme",
  dialogueBalance: "la place du dialogue",
  recurringMotif: "un motif récurrent",
  elementToAvoid: "un élément stylistique à éviter",
};
