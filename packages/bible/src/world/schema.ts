/**
 * What `define-world` is asked and what it is allowed to return (CAL-092, §6).
 *
 * The fifth bible mission, and the specification's *Monde* (§5.6): époque,
 * lieux, contexte social, contexte politique éventuel, règles du monde,
 * technologies, institutions, contraintes, éléments surnaturels éventuels et
 * **les limites de ces éléments**.
 *
 * The tenth item is the mission. The backlog's acceptance criterion is that
 * *tout élément surnaturel déclaré porte des limites explicites et
 * vérifiables*, and its reason is downstream: a power with no stated limit,
 * cost or failure condition is exactly what makes a resolution by convenience
 * undetectable later (CAL-114's dramatic audit, CAL-159's *résolution reposant
 * sur une coïncidence*, CAL-131's coherence checks).
 *
 * **The unbounded state is not representable.** The weak way to honour that
 * criterion is a checker that reads the answer and rejects it; the way every
 * sibling section has taken is to leave the bad answer no shape to arrive in —
 * `StyleConstraint` makes a decorative adjective unfillable,
 * `relationshipAsymmetrySchema` makes a fake asymmetry unfillable. Here it is
 * held twice.
 *
 *   1. **The flag is not the model's to write.** There is no `isSupernatural`
 *      boolean beside three optional lists — that is precisely the shape in
 *      which *declared without limits* exists as a value. The answer carries
 *      two arrays with **different shapes**: a `worldRules` entry has no
 *      `limits` field to leave empty, and an `outOfNormCapabilities` entry has
 *      no `false` to write and no way to omit its three bounds, each of which
 *      is a non-empty list. `resolveWorldRules` (`./resolve`) sets
 *      `WorldRule.isSupernatural` from **which array the entry came from** —
 *      §6's *never trust the model with identifiers*, applied to a flag, and
 *      CAL-080's warning that a demand a model can evade by declaration
 *      teaches it to lie in the declaration. `schema.test.ts` states the
 *      criterion as what it now is: a property of the type.
 *   2. **Every rule declares what it forbids.** `forbids` is CAL-089's pair
 *      applied to the world, and it closes the one evasion the split leaves
 *      open — a power written up as an ordinary rule. A rule that forbids
 *      nothing is decor and cannot fill the second half. It is also what the
 *      downstream consumers actually need to read: not what the world *has*,
 *      but what it does not allow, which is what a resolution by convenience
 *      violates.
 *
 * **The tenth item is deliberately not a field.** *Limites de ces éléments* is
 * the shape of the ninth, not a list beside it: a `supernaturalLimits` sibling
 * could be empty while capabilities exist, which is the precise failure this
 * mission exists to prevent. It is written down here because it is the one
 * place a later reader, counting the specification's ten against this
 * contract's nine, would otherwise "restore" a missing field.
 *
 * **The database holds the same line one layer down.**
 * `world_rules_supernatural_bounds_check` refuses a supernatural row whose
 * limits, costs or failure conditions are empty — on insert and on update,
 * including the update that promotes an ordinary rule, and including a raw
 * `INSERT` no client extension can see. CAL-016 wrote the first version of it
 * naming this task; CAL-092 widens it from `limits` alone to all three, which
 * is what the backlog's own wording asks for.
 *
 * **Absences are written, never elided** (CAL-077). `politicalContext` is
 * required-but-nullable because the specification says *éventuel*, and
 * `outOfNormCapabilities` may be empty for the same reason — a contract
 * demanding one would teach the model to invent magic in a realist novel,
 * which is `RELATIONSHIP_LIST_COUNTS.asymmetries`' own argument read the other
 * way round.
 *
 * **No score, structurally** (cahier des charges 1195–1199), as CAL-075,
 * CAL-076, CAL-079, CAL-081, CAL-088, CAL-089, CAL-090 and CAL-091 — with no
 * carve-out: `age` was the sheet's, and nothing in a world measures anything.
 * `schema.test.ts` pins the absence by walking a parsed answer.
 */

import { FREEDOM_LEVELS } from "@calepin/shared/freedom-level";
import { z } from "zod";

import { ceilingFor } from "../identity/schema";

/**
 * How many entries the world's lists carry.
 *
 * Places: two at least, because a novel with one place has no movement for a
 * scene to mean anything by; twelve at most, past which the ask has become a
 * gazetteer rather than the places the story needs.
 *
 * Rules: two at least — one rule is a premise, and it takes a second before a
 * world has a *system* a later chapter can be held to.
 *
 * Constraints: two at least, for the same reason and a sharper one — a
 * constraint is what makes a resolution cost something, and a world declaring
 * one has declared a plot device.
 *
 * Technologies and institutions are inventory, so one is an honest floor: a
 * novel may legitimately turn on a single institution.
 *
 * Out-of-norm capabilities: **may be empty**, and that is load-bearing. Most
 * novels have none, and a contract demanding one would produce invented magic
 * — the failure mode CAL-076's minimums avoid in the other direction. Six at
 * most: past that the system has stopped being exceptional.
 */
export const WORLD_LIST_COUNTS = {
  places: { min: 2, max: 12 },
  worldRules: { min: 2, max: 12 },
  constraints: { min: 2, max: 8 },
  technologies: { min: 1, max: 8 },
  institutions: { min: 1, max: 8 },
  outOfNormCapabilities: { min: 0, max: 6 },
  /**
   * Each of a capability's three bounds. One is the honest floor per axis:
   * three axes each answered is already three bounds, and demanding two of
   * each buys padding — which is what `duplicate-bound` (`./verify`) exists to
   * catch rather than to reward.
   */
  bounds: { min: 1, max: 4 },
} as const;

/**
 * How many passages one ask carries — `STYLE_SOURCE_COUNTS`'s reasoning: two
 * at least so the world answers to more than one upstream, and a generous
 * ceiling that refuses a dump (§5.8) without shaping the composer's
 * granularity.
 */
export const WORLD_SOURCE_COUNTS = { min: 2, max: 64 } as const;

/** The longest passage one source entry carries — a section, never a text. */
export const WORLD_SOURCE_CHAR_CEILING = 8_000;

/** The longest key or label the composer may give one source. */
export const WORLD_SOURCE_KEY_CHAR_CEILING = 80;

/** A place's name or a rule's handle is a heading, not a paragraph. */
export const WORLD_LABEL_CHAR_CEILING = 80;

/**
 * The lengths the prompt asks for, in words — rendered as variables and
 * enforced below as character ceilings, the CAL-055 pattern.
 *
 * `bound` is one number for all three of a capability's lists, and that is the
 * point rather than an economy: a limit, a cost and a failure condition are
 * three answers to one question — what stops this — and giving them three
 * different lengths would suggest they rank.
 */
export const WORLD_WORD_TARGETS = {
  /** When the novel is set, and what that dates it against. */
  era: 50,
  /** How people live together — class, work, belief, what is ordinary. */
  socialContext: 70,
  /** Who holds power and how it is contested, or null when it does not bear. */
  politicalContext: 70,
  /** One place, described for what the story needs of it. */
  place: 50,
  /** One rule of how the world works, stated of the world. */
  rule: 35,
  /** What that rule makes impossible — the observable half. */
  forbids: 30,
  /** One thing the world makes hard or costly. */
  constraint: 30,
  /** What it costs the character who tries anyway. */
  consequence: 25,
  /** One technology, named for what it changes. */
  technology: 20,
  /** One institution, named for the hold it has. */
  institution: 25,
  /** One out-of-norm capability, stated plainly. */
  capability: 40,
  /** One limit, one cost or one failure condition. */
  bound: 25,
} as const;

/** The character ceilings the schemas below enforce. */
export const WORLD_CHAR_CEILINGS = {
  era: ceilingFor(WORLD_WORD_TARGETS.era),
  socialContext: ceilingFor(WORLD_WORD_TARGETS.socialContext),
  politicalContext: ceilingFor(WORLD_WORD_TARGETS.politicalContext),
  place: ceilingFor(WORLD_WORD_TARGETS.place),
  rule: ceilingFor(WORLD_WORD_TARGETS.rule),
  forbids: ceilingFor(WORLD_WORD_TARGETS.forbids),
  constraint: ceilingFor(WORLD_WORD_TARGETS.constraint),
  consequence: ceilingFor(WORLD_WORD_TARGETS.consequence),
  technology: ceilingFor(WORLD_WORD_TARGETS.technology),
  institution: ceilingFor(WORLD_WORD_TARGETS.institution),
  capability: ceilingFor(WORLD_WORD_TARGETS.capability),
  bound: ceilingFor(WORLD_WORD_TARGETS.bound),
} as const;

/**
 * Where a passage of the corpus comes from — the three upstreams a world
 * answers to.
 *
 * The style section's three, not the character sheet's four: a sheet needs
 * `style` because a voice must live under the register the bible legislated,
 * and nothing in an era, a rule or an institution reads a register. Adding it
 * would put a passage in the ask that no field of the answer uses, which
 * `bibleStyleInputSchema` already refuses on the idempotency key's behalf
 * (CAL-058).
 */
export const WORLD_SOURCE_KINDS = ["direction", "identity", "analysis"] as const;

export type WorldSourceKind = (typeof WORLD_SOURCE_KINDS)[number];

const label = z.string().trim().min(1).max(WORLD_LABEL_CHAR_CEILING);

function prose(ceiling: number): z.ZodString {
  return z.string().trim().min(1).max(ceiling);
}

/**
 * One passage the world stays answerable to: where it comes from, how the
 * composer names it, what the model reads it as, and the passage itself.
 * `styleSourceSchema`'s shape with this contract's own vocabulary.
 */
export const worldSourceSchema = z.strictObject({
  kind: z.enum(WORLD_SOURCE_KINDS),
  key: z.string().trim().min(1).max(WORLD_SOURCE_KEY_CHAR_CEILING),
  /** French, what the model reads above the passage. */
  label: z.string().trim().min(1).max(WORLD_SOURCE_KEY_CHAR_CEILING),
  text: z.string().trim().min(1).max(WORLD_SOURCE_CHAR_CEILING),
});

export type WorldSource = z.infer<typeof worldSourceSchema>;

/**
 * One place of the novel: the name a later chapter outline will cite, and what
 * the story needs of it.
 *
 * Two fields because `Place` (CAL-016) has two content columns. The
 * description is required here while the column is nullable, and the asymmetry
 * is deliberate: a generated place that describes nothing is filler, whereas a
 * place the author types by hand may legitimately be a name for now.
 */
export const worldPlaceSchema = z.strictObject({
  /** Unique within the world — `@@unique([bibleId, name])`, held by `./verify`. */
  name: label,
  description: prose(WORLD_CHAR_CEILINGS.place),
});

export type WorldPlace = z.infer<typeof worldPlaceSchema>;

/**
 * One ordinary rule of how the world works: a short handle, the rule itself,
 * and what it forbids.
 *
 * `forbids` is the load-bearing half — CAL-089's `StyleConstraint` device. A
 * rule nobody could break (*le monde est vaste et ancien*) cannot fill it, so
 * decor is refused by shape rather than by a checker reading its wording. It
 * is also the evasion-closing half: a power written up here rather than as a
 * capability must still say what it cannot do, and a reader comparing that
 * against an empty `limits` sees the misfiling at once.
 *
 * The handle exists because `WorldRule.name` does: a locked rule has to be
 * citable by name when it blocks a generation (CAL-095, CAL-115).
 */
export const worldRuleSchema = z.strictObject({
  /** Unique across rules *and* capabilities — one `@@unique([bibleId, name])`. */
  name: label,
  /** The rule, declarative French, stated of the world. */
  statement: prose(WORLD_CHAR_CEILINGS.rule),
  /** What the rule makes impossible — decidable by reading one scene. */
  forbids: prose(WORLD_CHAR_CEILINGS.forbids),
});

export type WorldRuleDeclaration = z.infer<typeof worldRuleSchema>;

/**
 * One out-of-norm capability, with its bounds — the mission's whole point.
 *
 * *Élément surnaturel ou capacité hors norme*, in the backlog's own words:
 * anything a person or a thing can do that ordinary reality does not allow,
 * whatever its fictional dressing — a magic, a technology, an institution's
 * impossible reach, a talent no training explains.
 *
 * All three bound lists are required and non-empty. There is no
 * `isSupernatural: false` to write here and no optional field to omit, so
 * *declared without limits* has no representation: the acceptance criterion is
 * a property of this type rather than a check somebody has to remember to run.
 *
 * The three are distinct questions and the prompt keeps them so — what it
 * cannot do, what it takes from whoever uses it, and when it fails outright.
 * A model padding one from another is caught mechanically by `duplicate-bound`
 * (`./verify`), which is why the floors stay at one.
 */
export const outOfNormCapabilitySchema = z.strictObject({
  /** Unique across rules *and* capabilities — one `@@unique([bibleId, name])`. */
  name: label,
  /** What it lets someone do, stated plainly and without hedging. */
  statement: prose(WORLD_CHAR_CEILINGS.capability),
  /** What it cannot do, however much is spent on it. */
  limits: z
    .array(prose(WORLD_CHAR_CEILINGS.bound))
    .min(WORLD_LIST_COUNTS.bounds.min)
    .max(WORLD_LIST_COUNTS.bounds.max),
  /** What using it takes from whoever uses it. */
  costs: z
    .array(prose(WORLD_CHAR_CEILINGS.bound))
    .min(WORLD_LIST_COUNTS.bounds.min)
    .max(WORLD_LIST_COUNTS.bounds.max),
  /** The circumstances in which it fails outright. */
  failureConditions: z
    .array(prose(WORLD_CHAR_CEILINGS.bound))
    .min(WORLD_LIST_COUNTS.bounds.min)
    .max(WORLD_LIST_COUNTS.bounds.max),
});

export type OutOfNormCapability = z.infer<typeof outOfNormCapabilitySchema>;

/**
 * One thing the world makes hard, and what it costs to ignore.
 *
 * `StyleConstraint`'s pair a third time: a constraint with no consequence is a
 * decorative difficulty, and a story can walk straight through it. The
 * consequence is what CAL-159 reads when it asks whether a resolution paid for
 * itself.
 */
export const worldConstraintSchema = z.strictObject({
  /** What the world makes hard or impossible, stated of the world. */
  statement: prose(WORLD_CHAR_CEILINGS.constraint),
  /** What it costs the character who tries anyway. */
  consequence: prose(WORLD_CHAR_CEILINGS.consequence),
});

export type WorldConstraint = z.infer<typeof worldConstraintSchema>;

/**
 * The answer to `define-world`: nine fields covering the specification's ten,
 * the tenth being the shape of the ninth.
 *
 * Six of them are spelled as the `BibleWorld` columns, so persistence is a
 * copy and not a translation (`resolveBibleWorld`); `places` and the two rule
 * arrays become `Place` and `WorldRule` rows, which is why they are lists of
 * named things rather than prose.
 */
export const worldBibleSchema = z.strictObject({
  /** époque */
  era: prose(WORLD_CHAR_CEILINGS.era),
  /** contexte social */
  socialContext: prose(WORLD_CHAR_CEILINGS.socialContext),
  /** contexte politique **éventuel** — null when the novel does not turn on it. */
  politicalContext: prose(WORLD_CHAR_CEILINGS.politicalContext).nullable(),
  /** technologies */
  technologies: z
    .array(prose(WORLD_CHAR_CEILINGS.technology))
    .min(WORLD_LIST_COUNTS.technologies.min)
    .max(WORLD_LIST_COUNTS.technologies.max),
  /** institutions */
  institutions: z
    .array(prose(WORLD_CHAR_CEILINGS.institution))
    .min(WORLD_LIST_COUNTS.institutions.min)
    .max(WORLD_LIST_COUNTS.institutions.max),
  /** contraintes */
  constraints: z
    .array(worldConstraintSchema)
    .min(WORLD_LIST_COUNTS.constraints.min)
    .max(WORLD_LIST_COUNTS.constraints.max),
  /** lieux */
  places: z
    .array(worldPlaceSchema)
    .min(WORLD_LIST_COUNTS.places.min)
    .max(WORLD_LIST_COUNTS.places.max),
  /** règles du monde */
  worldRules: z
    .array(worldRuleSchema)
    .min(WORLD_LIST_COUNTS.worldRules.min)
    .max(WORLD_LIST_COUNTS.worldRules.max),
  /** éléments surnaturels **éventuels**, each carrying its own limits. */
  outOfNormCapabilities: z
    .array(outOfNormCapabilitySchema)
    .min(WORLD_LIST_COUNTS.outOfNormCapabilities.min)
    .max(WORLD_LIST_COUNTS.outOfNormCapabilities.max),
});

export type WorldBible = z.infer<typeof worldBibleSchema>;

/**
 * What one world was asked — the payload `Generation.input` carries and
 * `generationIdempotencyKey` digests (CAL-058).
 *
 * Content-addressed as every bible ask is: the corpus travels as text, so
 * editing the direction or regenerating a section of the analysis is a
 * different ask, while a job the queue redelivers is the same one.
 *
 * No audience, no target length and no cast, `bibleStyleInputSchema`'s
 * reasoning: no field of a world reads any of them, and an unused input would
 * reopen the world question on every retune. The cast is the sharper absence —
 * the world precedes the people in it, and a mission that took the sheets
 * would produce a world shaped to the cast it happened to be shown. The check
 * runs **before** any generation (principle 6.5).
 */
export const worldBibleInputSchema = z
  .strictObject({
    /** The source text version the upstreams were produced against. */
    sourceTextVersionId: z.string().trim().min(1),
    /** The canonical direction the world serves. */
    directionId: z.string().trim().min(1),
    freedomLevel: z.enum(FREEDOM_LEVELS),
    sources: z
      .array(worldSourceSchema)
      .min(WORLD_SOURCE_COUNTS.min)
      .max(WORLD_SOURCE_COUNTS.max),
  })
  .check((ctx) => {
    const seenKeys = new Set<string>();

    ctx.value.sources.forEach((source, index) => {
      if (seenKeys.has(source.key)) {
        ctx.issues.push({
          code: "custom",
          message: "one source key offered twice in a world ask",
          path: ["sources", index, "key"],
          input: ctx.value,
        });
      }
      seenKeys.add(source.key);
    });
  });

export type WorldBibleInput = z.infer<typeof worldBibleInputSchema>;

/**
 * The nine fields of the answer, in contract order — with a list's entries
 * named in the singular, `STYLE_FIELDS`' shape. Closed, so a report can say
 * where something failed without carrying a word of what it said (§9).
 */
export const WORLD_FIELDS = [
  "era",
  "socialContext",
  "politicalContext",
  "technology",
  "institution",
  "constraint",
  "place",
  "worldRule",
  "outOfNormCapability",
] as const;

export type WorldField = (typeof WORLD_FIELDS)[number];

/**
 * The French noun phrase for each field — in the domain rather than in
 * `@calepin/ai` for `FreedomConstraint`'s reason: the author reads on screen
 * the same words the prompt quotes. Totality is the type's, so a field added
 * without a label stops compiling.
 */
export const WORLD_FIELD_LABELS: Readonly<Record<WorldField, string>> = {
  era: "l'époque",
  socialContext: "le contexte social",
  politicalContext: "le contexte politique",
  technology: "une technologie",
  institution: "une institution",
  constraint: "une contrainte du monde",
  place: "un lieu",
  worldRule: "une règle du monde",
  outOfNormCapability: "un élément hors norme",
};
