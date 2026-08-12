/**
 * Reads a world back against itself before anything is persisted (CAL-092).
 *
 * Mechanical questions only, and fewer than a graph's, because a world names
 * nothing outside itself: the ask offers no cast and no vocabulary an answer
 * has to land in, so there is no *unknown reference* to catch. What is left is
 * the two things that would make a verified world unstorable or unbounded.
 *
 * **A world that verifies is a world that inserts.** `Place` and `WorldRule`
 * each carry `@@unique([bibleId, name])`, and the two rule arrays become rows
 * in **one** table — so the name check runs across `worldRules` *and*
 * `outOfNormCapabilities` together. Deduplicating them separately would leave
 * an answer that passes here and fails at the second `INSERT`, which is the
 * failure `verifyCharacterRelations` mirrors its own dedup key to avoid.
 *
 * **The drop regime feeds back into the imperative.** A capability's bounds
 * are deduplicated too, because padding one list from another is how a model
 * satisfies three floors with one idea. If that leaves a bound list empty, the
 * **whole capability** drops rather than being kept half-bounded: there is no
 * path by which a verified world holds a capability with an empty `limits`,
 * `costs` or `failureConditions`, which is the same line
 * `world_rules_supernatural_bounds_check` holds in PostgreSQL. Dropping a
 * capability is safe where dropping a rule would not be — the contract lets
 * `outOfNormCapabilities` be empty, so no floor can be broken by removing one.
 *
 * **What refuses the answer whole** is a list falling below its own floor —
 * `empty-graph` one section over, stated for floors above one. `relations`
 * had a minimum of one, so *empty* and *below the floor* were the same
 * sentence there; `places` and `worldRules` ask for two, so they are not, and
 * refusing only on empty would leave `mint` re-parsing a world the contract
 * rejects and throwing where a caller expected an outcome. Capabilities need
 * no such guard, and that is the reason dropping one is safe at all: their
 * floor is zero.
 *
 * Comparison is `sameWords`', not string equality: typography is what a model
 * retypes wrong, and two spellings of one place are one place. The spelling
 * written back is the answer's own — there is no ask spelling to prefer here,
 * unlike a cast name, because the world invents its own vocabulary.
 *
 * **The result is branded, because this function rewrites.** Drops make the
 * verified world a different value from the answer, so downstream code must be
 * unable to take the unverified one.
 *
 * Every reported field is an index, a count or a closed reason — never a name,
 * a statement or a bound, all of which are literary content (§9).
 */

import { sameWords } from "@calepin/shared/text";

import {
  type OutOfNormCapability,
  WORLD_LIST_COUNTS,
  type WorldBible,
  worldBibleSchema,
  type WorldPlace,
  type WorldRuleDeclaration,
} from "./schema";

/**
 * Why an answer is refused whole: a list the drops took below the floor the
 * contract set for it. A world that legislates nothing is not a world, and a
 * world with one place has lost the movement a scene means anything by — both
 * are the contract's own minimums, restated here as the only condition under
 * which nothing can be salvaged.
 *
 * Both can fire at once, which is why the outcome carries an array.
 */
export const WORLD_BIBLE_REFUSALS = ["places-below-floor", "rules-below-floor"] as const;

export type WorldBibleRefusal = (typeof WORLD_BIBLE_REFUSALS)[number];

/**
 * Why one entry was dropped rather than kept.
 *
 * `duplicate-rule-name` covers both arrays: they share one unique index, so
 * they share one reason. `unbounded-after-dedup` is the imperative's own —
 * a capability whose three bounds collapsed to fewer than three answers.
 */
export const WORLD_BIBLE_DROP_REASONS = [
  "duplicate-place-name",
  "duplicate-rule-name",
  "duplicate-bound",
  "unbounded-after-dedup",
] as const;

export type WorldBibleDropReason = (typeof WORLD_BIBLE_DROP_REASONS)[number];

/** Which list an entry was dropped from. */
export const WORLD_BIBLE_DROP_LISTS = [
  "places",
  "worldRules",
  "outOfNormCapabilities",
  "limits",
  "costs",
  "failureConditions",
] as const;

export type WorldBibleDropList = (typeof WORLD_BIBLE_DROP_LISTS)[number];

/**
 * One entry the verified world no longer holds: which list, the position in
 * the *answer* — what a log line or a re-ask needs — and why.
 *
 * `boundIndex` is required-but-nullable (CAL-077's discipline: an absence
 * written, never elided). Null says the whole entry went; a number says the
 * capability stands and lost one of its bounds.
 */
export interface WorldBibleDroppedEntry {
  readonly list: WorldBibleDropList;
  /** Position in the answer's own top-level list. */
  readonly index: number;
  /** Position within that capability's bound list, or null for a whole entry. */
  readonly boundIndex: number | null;
  readonly reason: WorldBibleDropReason;
}

/**
 * The brand on `globalThis`'s shared symbol registry via `Symbol.for`, for the
 * reason `VerifiedCharacterRelations` uses one: the packages are compiled from
 * source into more than one chunk graph (§12), and a `unique symbol` per chunk
 * would be several brands pretending to be one.
 */
export const VERIFIED_WORLD_BIBLE_BRAND: unique symbol = Symbol.for("calepin.VerifiedWorldBible");

/**
 * A world that went through `verifyWorldBible` — minted only there, never
 * serialised: a value that crossed JSON has lost the brand and must be
 * re-verified, not trusted. The three `resolve*` functions take this and not a
 * `WorldBible`, which is what makes an unbounded capability unresolvable as
 * well as unrepresentable.
 */
export type VerifiedWorldBible = WorldBible & {
  readonly [VERIFIED_WORLD_BIBLE_BRAND]: true;
};

export function isVerifiedWorldBible(value: unknown): value is VerifiedWorldBible {
  return typeof value === "object" && value !== null && VERIFIED_WORLD_BIBLE_BRAND in value;
}

/**
 * What verification decided. Refused: no rule survived, and the remedy — re-ask
 * or show the author — is the caller's. Verified: the world to keep, with the
 * dropped entries listed.
 */
export type WorldBibleVerification =
  | {
      readonly outcome: "refused";
      readonly refusals: readonly WorldBibleRefusal[];
      readonly dropped: readonly WorldBibleDroppedEntry[];
    }
  | {
      readonly outcome: "verified";
      readonly world: VerifiedWorldBible;
      readonly dropped: readonly WorldBibleDroppedEntry[];
    };

/**
 * Reads a parsed answer back against itself.
 *
 * The answer has already been parsed by `worldBibleSchema` (§6), so every
 * capability arrived with three non-empty bound lists and every string is
 * within its ceiling. What is left is what parsing cannot see: two entries
 * that are the same entry.
 */
export function verifyWorldBible(answer: WorldBible): WorldBibleVerification {
  const dropped: WorldBibleDroppedEntry[] = [];

  const places: WorldPlace[] = [];

  answer.places.forEach((place, index) => {
    if (places.some((kept) => sameWords(place.name, kept.name))) {
      dropped.push({
        list: "places",
        index,
        boundIndex: null,
        reason: "duplicate-place-name",
      });
      return;
    }

    places.push(place);
  });

  // One namespace across both arrays, because both become `WorldRule` rows
  // under one `@@unique([bibleId, name])`. Rules are walked first, so an
  // ordinary rule wins a collision with a capability — the conservative
  // direction: the world keeps its rule and loses the ambiguous power, rather
  // than keeping a power whose name the world already meant otherwise.
  const takenNames: string[] = [];
  const worldRules: WorldRuleDeclaration[] = [];

  answer.worldRules.forEach((rule, index) => {
    if (takenNames.some((taken) => sameWords(rule.name, taken))) {
      dropped.push({
        list: "worldRules",
        index,
        boundIndex: null,
        reason: "duplicate-rule-name",
      });
      return;
    }

    takenNames.push(rule.name);
    worldRules.push(rule);
  });

  const outOfNormCapabilities: OutOfNormCapability[] = [];

  answer.outOfNormCapabilities.forEach((capability, index) => {
    if (takenNames.some((taken) => sameWords(capability.name, taken))) {
      dropped.push({
        list: "outOfNormCapabilities",
        index,
        boundIndex: null,
        reason: "duplicate-rule-name",
      });
      return;
    }

    const bounded = boundCapability(capability, index, dropped);

    if (bounded === null) {
      dropped.push({
        list: "outOfNormCapabilities",
        index,
        boundIndex: null,
        reason: "unbounded-after-dedup",
      });
      return;
    }

    takenNames.push(capability.name);
    outOfNormCapabilities.push(bounded);
  });

  // Checked against the contract's own minimums rather than against zero, so
  // `mint` below can never be handed a world `worldBibleSchema` would reject.
  // Nothing is topped up to reach a floor: inventing a place or a rule to
  // rescue an answer would be this layer writing the world.
  const refusals: WorldBibleRefusal[] = [];

  if (places.length < WORLD_LIST_COUNTS.places.min) {
    refusals.push("places-below-floor");
  }

  if (worldRules.length < WORLD_LIST_COUNTS.worldRules.min) {
    refusals.push("rules-below-floor");
  }

  if (refusals.length > 0) {
    return { outcome: "refused", refusals, dropped };
  }

  return {
    outcome: "verified",
    world: mint({ ...answer, places, worldRules, outOfNormCapabilities }),
    dropped,
  };
}

/**
 * The three bound lists, deduplicated **against each other** — one statement
 * cannot be a limit and a cost, because the two answer different questions and
 * a model that writes it twice has answered one of them with padding.
 *
 * Returns null when that leaves a list empty, which is the caller's signal to
 * drop the capability whole. Nothing is topped up: inventing a bound to
 * restore a floor would be this layer deciding what the world can do.
 */
function boundCapability(
  capability: OutOfNormCapability,
  index: number,
  dropped: WorldBibleDroppedEntry[],
): OutOfNormCapability | null {
  const seen: string[] = [];

  const keep = (bounds: readonly string[], list: WorldBibleDropList): string[] => {
    const kept: string[] = [];

    bounds.forEach((bound, boundIndex) => {
      if (seen.some((taken) => sameWords(bound, taken))) {
        dropped.push({
          list,
          index,
          boundIndex,
          reason: "duplicate-bound",
        });
        return;
      }

      seen.push(bound);
      kept.push(bound);
    });

    return kept;
  };

  const limits = keep(capability.limits, "limits");
  const costs = keep(capability.costs, "costs");
  const failureConditions = keep(capability.failureConditions, "failureConditions");

  if (limits.length === 0 || costs.length === 0 || failureConditions.length === 0) {
    return null;
  }

  return { ...capability, limits, costs, failureConditions };
}

/**
 * Re-parsed before the brand goes on, `verifyCharacterRelations`' discipline:
 * the value was reassembled here, and the schema is the only authority on
 * whether what was reassembled is still a world.
 */
function mint(world: WorldBible): VerifiedWorldBible {
  const parsed = worldBibleSchema.safeParse(world);

  if (!parsed.success) {
    throw new Error("a verified world bible no longer parses", { cause: parsed.error });
  }

  return { ...parsed.data, [VERIFIED_WORLD_BIBLE_BRAND]: true };
}
