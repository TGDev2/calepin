/**
 * What a freedom level actually governs (CAL-044): the ten dimensions along
 * which a novel can stay faithful to its source text or depart from it, and
 * the three treatments a level assigns to each.
 *
 * Ten dimensions rather than free-form prose because a constraint has to be
 * *checkable*: "reste fidèle au texte source" cannot be verified, "la fin est
 * conservée alors que le cadre peut être réinterprété" can. The list is drawn
 * from what the analysis mission already produces (CAL-070) and from the
 * twelve attributes a direction carries (CAL-079), so a mission has something
 * to declare against rather than a vocabulary invented beside it.
 *
 * This file holds no French: the labels a reader sees live in `./copy`, and
 * the vocabulary here is the identifier layer the whole policy is built on.
 */

export const SOURCE_DIMENSIONS = [
  "premise", // la prémisse
  "main-conflict", // le conflit principal
  "narrative-promise", // la promesse du récit
  "themes", // les thèmes
  "protagonist", // le protagoniste
  "secondary-characters", // les personnages secondaires
  "setting", // le cadre, lieu et époque
  "tone", // la tonalité et le registre
  "point-of-view", // le point de vue et le temps verbal
  "ending", // la nature de la fin
] as const;

export type SourceDimension = (typeof SOURCE_DIMENSIONS)[number];

export function isSourceDimension(value: unknown): value is SourceDimension {
  return typeof value === "string" && (SOURCE_DIMENSIONS as readonly string[]).includes(value);
}

/**
 * What a level allows to happen to a dimension, from the most binding to the
 * most permissive. The order carries the meaning — `treatmentRank` is its
 * index, and "permitted" is defined as "no further along this list than what
 * the policy allows".
 *
 * - `preserve` — what the source establishes is kept; nothing added modifies
 *   it and nothing is dropped.
 * - `extend` — what the source establishes is the seed and is developed;
 *   nothing in the source is contradicted.
 * - `reinterpret` — the novel may depart from the source, provided no
 *   preserved dimension is contradicted.
 *
 * Lowercase members, unlike `FREEDOM_LEVELS`: this union is one
 * `@calepin/shared` owns outright, with no Prisma enum to mirror (§4.2).
 */
export const DIMENSION_TREATMENTS = ["preserve", "extend", "reinterpret"] as const;

export type DimensionTreatment = (typeof DIMENSION_TREATMENTS)[number];

export function isDimensionTreatment(value: unknown): value is DimensionTreatment {
  return typeof value === "string" && (DIMENSION_TREATMENTS as readonly string[]).includes(value);
}

/** How permissive a treatment is: 0 for `preserve`, 2 for `reinterpret`. */
export function treatmentRank(treatment: DimensionTreatment): number {
  return DIMENSION_TREATMENTS.indexOf(treatment);
}

/**
 * Whether a declared treatment stays within an allowed one.
 *
 * Deliberately one-sided: declaring *less* than allowed always passes. A
 * direction that preserves the setting under `HIGH` has not broken a rule —
 * a freedom level is a ceiling on how far the novel may travel from its
 * source, never a floor obliging it to travel at all.
 */
export function permitsTreatment(
  allowed: DimensionTreatment,
  declared: DimensionTreatment,
): boolean {
  return treatmentRank(declared) <= treatmentRank(allowed);
}
