/**
 * What `define-novel-identity` is asked and what it is allowed to return
 * (CAL-088, §6).
 *
 * The first section of the bible: the specification's *identité du roman*
 * (§5.6), read off the canonical direction and the validated analysis. The
 * backlog's requirement is not a list of fields — it is that **every field be
 * traceable to an element of the direction or of the analysis, with no
 * unmotivated invention** — and that is what this contract is shaped around.
 *
 * **Nine fields are generated; two are read off the project.** The
 * specification lists eleven, and two of them — *public* and *longueur cible*
 * — are already `Project.targetAudience` and `Project.targetLength`, chosen by
 * the author before any of this ran. `BibleIdentity` (CAL-016) carries no
 * column for either, which is the same decision one layer down. A
 * model-authored copy would be the second answer able to disagree with the
 * first, which is what `Project.status` being derived, `Analysis` having no
 * `isCurrent` and `CanonFactBelief` deriving knowledge all refuse. So the
 * contract carries the nine `BibleIdentity` actually stores, and
 * `resolveNovelIdentity` (`./resolve`) composes the eleven the author reads.
 * *Sans invention non motivée*, read as strictly as it can be: a field nobody
 * asked the model to invent is one it cannot get wrong.
 *
 * **The citable corpus is part of the ask.** Tracing a field to an element of
 * the direction or the analysis wants those domains' own vocabularies —
 * `DIRECTION_ELEMENTS`, `ANALYSIS_SECTIONS` — and a domain may not import a
 * domain (§3.2). The answer is CAL-084's: the vocabulary is **closed by the
 * ask**. `NovelIdentityInput.sources` carries one entry per citable passage,
 * and every named `sourceKey` is verified against the ask's own list
 * (`./basis`). That is stronger than a shared constant would be — the model
 * may cite only what it was actually shown, so a citation to something outside
 * the composed context is impossible by construction rather than merely wrong.
 * It is also what keeps this package's dependencies at `@calepin/shared`.
 *
 * **A counter-theme is paired with the theme it opposes.** `thematicAxes`
 * holds both halves of one opposition; the `themes` and `counterThemes`
 * columns are two projections of one list. A counter-theme that opposes
 * nothing is a second theme, and two independent lists is how it becomes one —
 * the structural fix, not a sentence in the prompt asking for the discipline.
 *
 * **No score, structurally** (cahier des charges 1195–1199), as CAL-075,
 * CAL-076, CAL-079 and CAL-081: no numeric field anywhere in the answer, and
 * `schema.test.ts` pins that shape. What argues is `justification`, in words.
 * The one number in the ask — `targetWordCount` — is the author's own target,
 * and it measures a length rather than a quality.
 */

import { FREEDOM_LEVELS } from "@calepin/shared/freedom-level";
import { z } from "zod";

/**
 * The lengths the prompt asks for, in words — rendered as variables and
 * enforced below as character ceilings, the CAL-055 pattern. One number per
 * concept: every basis, whichever field it belongs to, shares `justification`
 * and `quotation`, because one citation discipline is one number.
 */
export const NOVEL_IDENTITY_WORD_TARGETS = {
  /** The tone — what the reading feels like, not a string of adjectives. */
  tone: 60,
  /** The narrative promise — what the novel commits to giving its reader. */
  narrativePromise: 80,
  /** The central question, asked once. */
  centralQuestion: 30,
  /** The nature of the ending — its kind and its cost, never its scene. */
  endingNature: 50,
  /** One theme or counter-theme: a phrase, not a paragraph. */
  theme: 25,
  /** Why the cited passage motivates this field — the traceability argument. */
  justification: 40,
  /** A supporting quotation — the same number every citing mission states. */
  quotation: 25,
} as const;

/**
 * Roughly how many characters a French word costs, separator included — the
 * constant `@calepin/analysis`, `@calepin/direction` and `@calepin/manuscript`
 * also state, restated here because domains may not import each other (§3.2)
 * and the number is a linguistic observation, not a contract to share.
 */
const CHARS_PER_WORD = 7;

/**
 * How far past its target an answer may run before it stops being an identity.
 * Twice, as everywhere: what this refuses is the answer an order of magnitude
 * out, never the one that ran long.
 */
const OVERRUN_FACTOR = 2;

/** Package-internal, never on `index.ts` — the rule stated once, as elsewhere. */
export function ceilingFor(wordTarget: number): number {
  return Math.ceil(wordTarget * CHARS_PER_WORD * OVERRUN_FACTOR);
}

/** The character ceilings the schema below enforces. */
export const NOVEL_IDENTITY_CHAR_CEILINGS = {
  tone: ceilingFor(NOVEL_IDENTITY_WORD_TARGETS.tone),
  narrativePromise: ceilingFor(NOVEL_IDENTITY_WORD_TARGETS.narrativePromise),
  centralQuestion: ceilingFor(NOVEL_IDENTITY_WORD_TARGETS.centralQuestion),
  endingNature: ceilingFor(NOVEL_IDENTITY_WORD_TARGETS.endingNature),
  theme: ceilingFor(NOVEL_IDENTITY_WORD_TARGETS.theme),
  justification: ceilingFor(NOVEL_IDENTITY_WORD_TARGETS.justification),
  quotation: ceilingFor(NOVEL_IDENTITY_WORD_TARGETS.quotation),
} as const;

/** A title, a genre or a sub-genre is a heading, not a paragraph. */
export const NOVEL_IDENTITY_LABEL_CHAR_CEILING = 80;

/**
 * How many thematic axes the identity declares.
 *
 * Two at least: a novel carried by one theme is a thesis, and the axis a bible
 * exists to hold is the tension between several. Four at most, and lower than
 * the six every list in this codebase settles on — past four the author no
 * longer holds the set in mind while writing a chapter, which is the only
 * thing this list is for.
 */
export const NOVEL_IDENTITY_THEME_COUNTS = { min: 2, max: 4 } as const;

/**
 * How many citable passages one ask carries.
 *
 * Two at least, because a corpus of one passage would make traceability a
 * formality. The ceiling is generous on purpose: the composer decides the
 * granularity — the direction field by field, the analysis section by section
 * — and this bound exists to refuse a corpus that has become a dump (§5.8),
 * not to shape one.
 */
export const NOVEL_IDENTITY_SOURCE_COUNTS = { min: 2, max: 64 } as const;

/**
 * The longest passage one source entry carries. Wider than any single answer
 * field, because a source is a *section of the analysis* rather than a
 * sentence; narrow enough that a whole source text cannot be posted through
 * one entry, which is what would turn the composed corpus back into a dump.
 */
export const NOVEL_IDENTITY_SOURCE_CHAR_CEILING = 8_000;

/** The longest key or label the composer may give one source. */
export const NOVEL_IDENTITY_SOURCE_KEY_CHAR_CEILING = 80;

/**
 * Where a citable passage comes from — the two upstreams the backlog names.
 *
 * A closed vocabulary rather than free text, so `checkNovelIdentityBasis` can
 * report *which upstreams the answer actually drew on* without reading a word
 * of any of them (§9). Which element of that upstream is the `key`, and the
 * ask is what closes that half.
 */
export const IDENTITY_SOURCE_KINDS = ["direction", "analysis"] as const;

export type IdentitySourceKind = (typeof IDENTITY_SOURCE_KINDS)[number];

/**
 * One passage the answer may cite: where it comes from, how the answer names
 * it, what the model reads it as, and the passage itself.
 *
 * `key` is the composer's own — `mainConflict`, `themes`, whatever names the
 * element in the upstream it came from. It is not validated against a
 * vocabulary here for the reason the header gives: this package cannot see
 * either upstream's, and closing it by the ask is the stronger rule anyway.
 * What *is* enforced is that the ask stays canonical — no key twice, so one
 * ask digests once (CAL-058).
 */
export const identitySourceSchema = z.strictObject({
  kind: z.enum(IDENTITY_SOURCE_KINDS),
  key: z.string().trim().min(1).max(NOVEL_IDENTITY_SOURCE_KEY_CHAR_CEILING),
  /** French, what the model reads above the passage. */
  label: z.string().trim().min(1).max(NOVEL_IDENTITY_SOURCE_KEY_CHAR_CEILING),
  text: z.string().trim().min(1).max(NOVEL_IDENTITY_SOURCE_CHAR_CEILING),
});

export type IdentitySource = z.infer<typeof identitySourceSchema>;

/**
 * What one identity was asked — the payload `Generation.input` carries and
 * `generationIdempotencyKey` digests (CAL-058).
 *
 * **Content-addressed where it matters.** The corpus travels as text rather
 * than as ids, so the digest moves exactly when an upstream moves: editing the
 * canonical direction, or regenerating a section of the analysis, is a
 * different ask, while a job the queue redelivers is the same one. The two ids
 * beside it name the rows the ask was built on, which is what a later reader
 * needs and what no digest can give back.
 *
 * The two project settings are here because they are the ask: an identity for
 * a 40 000-word young-adult novel is not the same ask as one for a 100 000-word
 * literary novel, and the author changing either should re-open the question.
 */
export const novelIdentityInputSchema = z
  .strictObject({
    /** The source text version the upstreams were produced against. */
    sourceTextVersionId: z.string().trim().min(1),
    /** The canonical direction the identity transposes. */
    directionId: z.string().trim().min(1),
    /** The author's declared readership — never the model's to choose. */
    targetAudience: z.string().trim().min(1).max(NOVEL_IDENTITY_LABEL_CHAR_CEILING),
    /** The novel's target length in words, resolved from the project. */
    targetWordCount: z.int().positive(),
    freedomLevel: z.enum(FREEDOM_LEVELS),
    sources: z
      .array(identitySourceSchema)
      .min(NOVEL_IDENTITY_SOURCE_COUNTS.min)
      .max(NOVEL_IDENTITY_SOURCE_COUNTS.max),
  })
  .check((ctx) => {
    const seen = new Set<string>();

    ctx.value.sources.forEach((source, index) => {
      if (seen.has(source.key)) {
        ctx.issues.push({
          code: "custom",
          message: "one source key offered twice in an identity ask",
          path: ["sources", index, "key"],
          input: ctx.value,
        });
      }
      seen.add(source.key);
    });
  });

export type NovelIdentityInput = z.infer<typeof novelIdentityInputSchema>;

/**
 * Where one field of the identity comes from: the passage it rests on, and why
 * that passage motivates it.
 *
 * Required, never nullable — the whole point of the mission. CAL-076 and
 * CAL-081 could make a quotation optional because an appraisal's standing is
 * its argument; here the requirement is the acceptance criterion itself, so
 * *this field is traceable to nothing* is not an answer the contract has a
 * shape for.
 */
const basisSchema = z.strictObject({
  /** One of the keys the ask offered — verified by `checkNovelIdentityBasis`. */
  sourceKey: z.string().trim().min(1).max(NOVEL_IDENTITY_SOURCE_KEY_CHAR_CEILING),
  /** Copied from that passage, word for word. */
  quotation: z.string().trim().min(1).max(NOVEL_IDENTITY_CHAR_CEILINGS.quotation),
  /** Why that passage motivates this field — the argument, never a score. */
  justification: z.string().trim().min(1).max(NOVEL_IDENTITY_CHAR_CEILINGS.justification),
});

export type NovelIdentityBasis = z.infer<typeof basisSchema>;

/** One field of the identity: what it says, and what it rests on. */
function traced(value: z.ZodString) {
  return z.strictObject({ value, basis: basisSchema });
}

const label = z.string().trim().min(1).max(NOVEL_IDENTITY_LABEL_CHAR_CEILING);

function prose(ceiling: number): z.ZodString {
  return z.string().trim().min(1).max(ceiling);
}

const themeSchema = traced(prose(NOVEL_IDENTITY_CHAR_CEILINGS.theme));

/**
 * A theme and the counter-theme that opposes it — one axis of the novel's
 * thematic tension, both halves traced independently.
 */
const thematicAxisSchema = z.strictObject({
  theme: themeSchema,
  counterTheme: themeSchema,
});

/**
 * The answer to `define-novel-identity`: the nine fields `BibleIdentity`
 * stores, each carrying what it rests on.
 *
 * Spelled as the `BibleIdentity` columns CAL-016 already wrote, so persistence,
 * when its task comes, is a copy and not a translation — the discipline
 * `directionProposalSchema` uses against `CreativeDirection`. `thematicAxes` is
 * the one field that is not one column: it projects onto `themes` and
 * `counterThemes`, which is what pairing them costs and it is worth it.
 */
export const tracedNovelIdentitySchema = z
  .strictObject({
    workingTitle: traced(label),
    genre: traced(label),
    subGenre: traced(label),
    tone: traced(prose(NOVEL_IDENTITY_CHAR_CEILINGS.tone)),
    narrativePromise: traced(prose(NOVEL_IDENTITY_CHAR_CEILINGS.narrativePromise)),
    thematicAxes: z
      .array(thematicAxisSchema)
      .min(NOVEL_IDENTITY_THEME_COUNTS.min)
      .max(NOVEL_IDENTITY_THEME_COUNTS.max),
    centralQuestion: traced(prose(NOVEL_IDENTITY_CHAR_CEILINGS.centralQuestion)),
    endingNature: traced(prose(NOVEL_IDENTITY_CHAR_CEILINGS.endingNature)),
  })
  .check((ctx) => {
    // The central question is a question. A `.check` rather than a `.regex`,
    // so no `pattern` keyword enters the JSON Schema the structured-output
    // subset has to accept — the same care `directionCombinationInputSchema`
    // takes with its own cross-field rules.
    if (!ctx.value.centralQuestion.value.endsWith("?")) {
      ctx.issues.push({
        code: "custom",
        message: "the central question is not written as a question",
        path: ["centralQuestion", "value"],
        input: ctx.value,
      });
    }
  });

export type TracedNovelIdentity = z.infer<typeof tracedNovelIdentitySchema>;

export type NovelIdentityThematicAxis = TracedNovelIdentity["thematicAxes"][number];

/**
 * The nine kinds of field a basis can be attached to — the answer's own keys,
 * with the two halves of a thematic axis named apart.
 *
 * Closed, so a verification report can say where a field failed to trace
 * without carrying a word of what it said (§9). Written out rather than
 * derived so nothing is cast; `schema.test.ts` pins them against
 * `tracedNovelIdentitySchema`'s own shape.
 */
export const NOVEL_IDENTITY_FIELDS = [
  "workingTitle",
  "genre",
  "subGenre",
  "tone",
  "narrativePromise",
  "theme",
  "counterTheme",
  "centralQuestion",
  "endingNature",
] as const;

export type NovelIdentityField = (typeof NOVEL_IDENTITY_FIELDS)[number];

/**
 * The seven fields of the answer that are one traced value — the six scalars
 * plus the central question — in contract order. `thematicAxes` is walked
 * separately, since each of its entries carries two.
 */
export const NOVEL_IDENTITY_SCALAR_FIELDS = [
  "workingTitle",
  "genre",
  "subGenre",
  "tone",
  "narrativePromise",
  "centralQuestion",
  "endingNature",
] as const satisfies readonly NovelIdentityField[];

export type NovelIdentityScalarField = (typeof NOVEL_IDENTITY_SCALAR_FIELDS)[number];

/**
 * The French noun phrase for each field — in the domain rather than in
 * `@calepin/ai` for `FreedomConstraint`'s reason: the author reads the same
 * words the prompt quotes. Totality is the type's: a field added without a
 * label stops compiling.
 */
export const NOVEL_IDENTITY_FIELD_LABELS: Readonly<Record<NovelIdentityField, string>> = {
  workingTitle: "le titre provisoire",
  genre: "le genre",
  subGenre: "le sous-genre",
  tone: "la tonalité",
  narrativePromise: "la promesse narrative",
  theme: "un thème",
  counterTheme: "un contre-thème",
  centralQuestion: "la question centrale",
  endingNature: "le type de fin envisagé",
};
