/**
 * What a character holds in mind, typed for the coherence engine (CAL-090).
 *
 * The backlog's requirement — *les connaissances détenues doivent être
 * exploitables par le contrôle de cohérence* — names a consumer: CAL-094
 * derives `CanonFact` and `CanonFactBelief` rows from the sheet, and CAL-131
 * flags a character using information they never learned. What those need is
 * not prose, it is two decisions per entry: what the content is, and how the
 * character stands to it.
 *
 * **The stance is deliberately not `CanonFactBeliefState`.** The canon model
 * stores the world's truth (`CanonFact.isTrue`, beside an always-affirmative
 * `statement`) and the character's belief (`CanonFactBelief.state`) on two
 * axes, and derives knowing (`beliefMatchesWorld`) — `KNOWS` is absent there
 * on purpose. A sheet cannot carry one axis and call itself exploitable: with
 * only a belief, *croit à tort que X* either loses the content of the false
 * belief or leaves the world's truth for CAL-094 to invent. The sheet is the
 * one place both axes are legitimately authored in the same breath — writing
 * a character *is* declaring the world along with the belief — so its
 * vocabulary names the compound cases, and `knowledgeStanceToBelief` decides
 * both axes from one member. That function is what makes the derivation a
 * copy rather than an interpretation, and it ships now so "exploitable" is a
 * committed mapping, not a promise.
 *
 * The `statement` an entry carries is always the affirmative content the
 * stance is about — never a negation, never the stance restated. That is
 * `CanonFact.statement`'s own discipline (*atomic; always-affirmative*),
 * asked one stage earlier.
 */

import type { CanonFactBeliefState } from "../canon-fact";

/**
 * How a character stands to one entry of their sheet. Four compound cases:
 * each fixes the world's truth and the character's belief at once.
 *
 * `denies` is kept apart from `believes-wrongly` deliberately: refusing a
 * truth is only expressible as wrongly believing its contrary when the
 * contrary is affirmatively statable, and the dramatically load-bearing
 * denials — a grief, a guilt — usually are not.
 */
export const CHARACTER_KNOWLEDGE_STANCES = [
  "knows",
  "believes-wrongly",
  "unaware",
  "denies",
] as const;

export type CharacterKnowledgeStance = (typeof CHARACTER_KNOWLEDGE_STANCES)[number];

/**
 * The French gloss the prompt quotes for each stance — in the domain rather
 * than in `@calepin/ai` for `FreedomConstraint`'s reason: the author reads
 * the same words the model was given. Totality is the type's.
 */
export const CHARACTER_KNOWLEDGE_STANCE_LABELS: Readonly<Record<CharacterKnowledgeStance, string>> =
  {
    knows: "le personnage tient ce fait pour vrai, et il l'est",
    "believes-wrongly":
      "le personnage tient l'énoncé pour vrai alors qu'il est faux dans le monde du roman",
    unaware: "le personnage ignore ce fait, qui est vrai — il ne peut pas s'en servir",
    denies: "le personnage refuse ce fait, qui est vrai — il le tient pour faux",
  };

/**
 * The French prefix `resolveCharacterSheet` writes before the statement in
 * the stored `heldKnowledge` text — flattening without erasing, the
 * `STYLE_VIOLATION_CONNECTOR` doctrine: the stance stays visible in the text
 * the author reviews.
 */
export const CHARACTER_KNOWLEDGE_STANCE_PREFIXES: Readonly<
  Record<CharacterKnowledgeStance, string>
> = {
  knows: "Sait :",
  "believes-wrongly": "Croit à tort :",
  unaware: "Ignore :",
  denies: "Nie :",
};

/** Both canon axes, decided by one stance. */
export interface KnowledgeBelief {
  /** Whether the entry's statement is true in the novel's world. */
  readonly isTrue: boolean;
  /** The character's stance on that statement, as `CanonFactBelief` stores it. */
  readonly belief: CanonFactBeliefState;
}

/**
 * The sheet stance as the canon model stores it — total over the union, onto
 * the three belief states, and the whole of what CAL-094 has to decide per
 * entry. `knows` is the derived agreement `beliefMatchesWorld` answers, which
 * is why it maps to a belief and a truth rather than to a stored `KNOWS`.
 */
export function knowledgeStanceToBelief(stance: CharacterKnowledgeStance): KnowledgeBelief {
  switch (stance) {
    case "knows":
      return { isTrue: true, belief: "BELIEVES_TRUE" };
    case "believes-wrongly":
      return { isTrue: false, belief: "BELIEVES_TRUE" };
    case "unaware":
      return { isTrue: true, belief: "UNAWARE" };
    case "denies":
      return { isTrue: true, belief: "BELIEVES_FALSE" };
  }
}
