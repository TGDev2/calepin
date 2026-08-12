/**
 * The world section as its three tables store it (CAL-092).
 *
 * `resolveBibleStyle`'s role, over three destinations instead of one, because
 * CAL-016 spread the world across a section row and two element tables: the
 * six scalars are `BibleWorld`'s columns, the places are `Place` rows, and
 * **both** rule arrays are `WorldRule` rows.
 *
 * **`isSupernatural` is written here, from provenance.** It is not a field of
 * the answer and never was: a `worldRules` entry resolves to `false` and an
 * `outOfNormCapabilities` entry to `true`, decided by which array the entry
 * came out of rather than by anything the model declared. That is §6's *never
 * trust the model with identifiers* applied to a flag, and it is what makes
 * the acceptance criterion hold at the row: the only entries that can carry
 * `isSupernatural: true` are the ones whose schema required three non-empty
 * bounds, so `world_rules_supernatural_bounds_check` can never be the thing
 * that discovers a problem.
 *
 * **An ordinary rule's bounds are empty, and that is not a hole.** `limits`,
 * `costs` and `failureConditions` are `String[] @default([])`; a rule that is
 * not a capability has nothing to bound, and writing its `forbids` into
 * `limits` would put a sentence about the world in the column that means *what
 * this power cannot do*. It goes into the statement instead, behind a
 * connector — flattening without erasing, exactly as a style pair does.
 *
 * The connectors are domain-owned French copy, `NARRATIVE_ENGINE_COPY`'s
 * reason: the author reads on screen the same clause the writing context will
 * quote.
 *
 * **Nothing here resolves a name to an id.** The rows are name-keyed; turning
 * a place's name into a `Place.id` is business code's, with a live scope in
 * hand (§6). And every function takes a `VerifiedWorldBible`, so an unverified
 * answer is not merely discouraged — it does not typecheck.
 */

import type {
  OutOfNormCapability,
  WorldBible,
  WorldConstraint,
  WorldRuleDeclaration,
} from "./schema";
import type { VerifiedWorldBible } from "./verify";

/**
 * What separates a rule from what it forbids in the stored statement. A
 * clause, not a bare colon, so the resolved sentence still says what the
 * second half *is* — `STYLE_VIOLATION_CONNECTOR`'s shape.
 */
export const WORLD_FORBIDS_CONNECTOR = "Rend impossible :";

/** What separates a constraint from the price of ignoring it. */
export const WORLD_CONSEQUENCE_CONNECTOR = "Prix à payer :";

/**
 * The world section as `BibleWorld` stores it: three texts and three lists,
 * under the columns' own names.
 */
export interface ResolvedBibleWorld {
  readonly era: string;
  readonly socialContext: string;
  readonly politicalContext: string | null;
  readonly technologies: readonly string[];
  readonly institutions: readonly string[];
  readonly constraints: readonly string[];
}

/** One `Place` row's column values, name-keyed. */
export interface ResolvedPlaceRow {
  readonly name: string;
  readonly description: string;
}

/**
 * One `WorldRule` row's column values, name-keyed.
 *
 * The three bound lists are always present and always empty for an ordinary
 * rule — the column's own default, stated rather than omitted so a caller
 * cannot write a supernatural row by forgetting a field.
 */
export interface ResolvedWorldRuleRow {
  readonly name: string;
  readonly statement: string;
  readonly isSupernatural: boolean;
  readonly limits: readonly string[];
  readonly costs: readonly string[];
  readonly failureConditions: readonly string[];
}

/** One constraint pair, flattened into the column's one text. */
function resolvedConstraint(constraint: WorldConstraint): string {
  return `${constraint.statement} ${WORLD_CONSEQUENCE_CONNECTOR} ${constraint.consequence}`;
}

/** The six `BibleWorld` column values, in the answer's own order. */
export function resolveBibleWorld(world: VerifiedWorldBible): ResolvedBibleWorld {
  return {
    era: world.era,
    socialContext: world.socialContext,
    politicalContext: world.politicalContext,
    technologies: world.technologies,
    institutions: world.institutions,
    constraints: world.constraints.map(resolvedConstraint),
  };
}

/** One `Place` row per declared place, in the answer's own order. */
export function resolveWorldPlaces(world: VerifiedWorldBible): readonly ResolvedPlaceRow[] {
  return world.places.map((place) => ({ name: place.name, description: place.description }));
}

/**
 * One `WorldRule` row per rule *and* per capability, ordinary rules first.
 *
 * The order is the answer's within each array and rules before capabilities
 * across them, which mirrors `verifyWorldBible`'s own walk — so the index a
 * drop report names and the row a caller writes stay in the same relation.
 */
export function resolveWorldRules(world: VerifiedWorldBible): readonly ResolvedWorldRuleRow[] {
  return [
    ...world.worldRules.map(resolvedRule),
    ...world.outOfNormCapabilities.map(resolvedCapability),
  ];
}

function resolvedRule(rule: WorldRuleDeclaration): ResolvedWorldRuleRow {
  return {
    name: rule.name,
    statement: `${rule.statement} ${WORLD_FORBIDS_CONNECTOR} ${rule.forbids}`,
    isSupernatural: false,
    limits: [],
    costs: [],
    failureConditions: [],
  };
}

function resolvedCapability(capability: OutOfNormCapability): ResolvedWorldRuleRow {
  return {
    name: capability.name,
    statement: capability.statement,
    isSupernatural: true,
    limits: capability.limits,
    costs: capability.costs,
    failureConditions: capability.failureConditions,
  };
}

/**
 * The count a caller logs, and the only shape of this module's output that is
 * safe to put in a log line (§9): how many rows each destination takes.
 *
 * Typed on `WorldBible` rather than on the branded value because counting is
 * not a write — a caller sizing an operation before verification is asking a
 * legitimate question.
 */
export function countWorldRows(world: WorldBible): {
  readonly places: number;
  readonly worldRules: number;
  readonly outOfNormCapabilities: number;
} {
  return {
    places: world.places.length,
    worldRules: world.worldRules.length,
    outOfNormCapabilities: world.outOfNormCapabilities.length,
  };
}
