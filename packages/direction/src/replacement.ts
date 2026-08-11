/**
 * Replacing one discarded direction, and nothing else (CAL-083).
 *
 * The author reads three proposals, writes one of them off — optionally saying
 * why — and asks for another. The specification's principle 4.1 again: they
 * stay in control of what the product produces for them, and the two
 * directions they kept are not disturbed by the one they rejected.
 *
 * **The exclusion is the whole feature, and it is mechanical.** A replacement
 * that reproduces the rejected direction's engine is the rejected direction
 * with a new décor — the failure CAL-080 gave an operational definition to.
 * So the ask carries the engines of all three directions, the discarded one
 * *and* the two kept ones, and the answer is checked against every one of them
 * with `compareNarrativeEngines`: the same function the divergence gate uses,
 * reached rather than restated. Excluding the two kept engines is not
 * politeness — a replacement colliding with a direction still on screen would
 * leave the author with two proposals and three cards.
 *
 * **A report, never a `Result`** — `checkDirectionDivergence`'s doctrine. "The
 * replacement reuses an excluded engine" is the answer to a question, and the
 * remedy is a re-ask the caller decides on, not an error thrown at it. Every
 * field is safe to log (§9): indexes into the exclusion list, axis identifiers
 * and booleans, never a member the model chose and never a word of a direction.
 *
 * **Nothing here is branded.** `verifyDirectionEvaluationEvidence` brands its
 * result because a domain-side writer could demand one; the writer for this
 * path is in `@calepin/shared/repository`, which may not import a domain
 * (§3.2) and so could never read a brand. A receipt nobody can check is a
 * comment — CAL-077's arrangement, for CAL-077's reason.
 *
 * **The ask is a value, not a rendering.** `directionReplacementInputSchema` is
 * what `Generation.input` stores and `generationIdempotencyKey` digests. It
 * names the source text version it is built on and the direction being
 * replaced, so asking again after editing the reason is a different ask while a
 * job the queue redelivers is the same one. That the column is a digest is also
 * what lets it carry the author's own words at all: the reason is never
 * rendered into a log, a report or an artefact (§9).
 */

import { fail, type Result, succeed, ValidationError } from "@calepin/shared/errors";
import { z } from "zod";

import { compareNarrativeEngines, type NarrativeEngineComparison } from "./divergence";
import { type NarrativeEngine, narrativeEngineSchema } from "./narrative-engine";
import { directionProposalSchema } from "./proposals";

/**
 * The longest reason a discard accepts.
 *
 * Its own number rather than a share of
 * `ANALYSIS_REGENERATION_INSTRUCTION_CHAR_CEILING`'s, for the reason CAL-055
 * states about targets: the two bound different things, and one of them moving
 * is no reason for the other to. Half of it, because they are different things
 * — a regeneration instruction is a directive about how to redo a section,
 * while this is the ground of a refusal: *le protagoniste ne m'intéresse pas*,
 * *c'est le même roman que la deuxième*. What the ceiling refuses is the
 * counter-brief — a reason long enough to specify the replacement would be
 * competing with the mission's own definition of what a direction is.
 */
export const DIRECTION_DISCARD_REASON_CHAR_CEILING = 500;

/**
 * Reads the author's optional reason, or refuses it with a French sentence.
 *
 * Absent, empty and whitespace are one answer — `null`, meaning *écartée sans
 * commentaire*, which is a complete answer and never an omission. A `Result`
 * rather than a throw (§7): somebody typing past the ceiling is a failure the
 * form has to show them. The sentence names the rule and never repeats what was
 * typed, which matters more than usual here — the text is the author's own
 * words about their novel (§9).
 */
export function parseDirectionDiscardReason(value: unknown): Result<string | null> {
  if (value === null || value === undefined) return succeed(null);

  if (typeof value !== "string") {
    return fail(
      new ValidationError({
        message: "discard reason is not text",
        userMessage: "Cette raison n'a pas pu être lue.",
        fieldPath: "reason",
      }),
    );
  }

  const reason = value.trim();

  if (reason === "") return succeed(null);

  if (reason.length > DIRECTION_DISCARD_REASON_CHAR_CEILING) {
    return fail(
      new ValidationError({
        message: "discard reason exceeds its ceiling",
        userMessage: `Une raison est limitée à ${DIRECTION_DISCARD_REASON_CHAR_CEILING} caractères.`,
        fieldPath: "reason",
      }),
    );
  }

  return succeed(reason);
}

/**
 * The engines a replacement may not reproduce, in the order the report indexes
 * them: the discarded direction's first, then the kept ones in the order they
 * stand on screen.
 *
 * The order is part of the contract rather than an accident of a `map` — index
 * `0` is *the one that was rejected*, which is the only distinction a reader of
 * the report (or of a log line) can make between three otherwise interchangeable
 * clauses. Duplicates are kept: two identical engines in the exclusion set would
 * mean the three directions never diverged in the first place, and silently
 * collapsing them would hide that from the report.
 */
export function excludedEnginesForReplacement(
  discarded: NarrativeEngine,
  retained: readonly NarrativeEngine[],
): readonly NarrativeEngine[] {
  return [discarded, ...retained];
}

/** The candidate against one excluded engine — `excluded` indexes the list. */
export interface ExcludedEngineComparison extends NarrativeEngineComparison {
  readonly excluded: number;
}

export interface DirectionReplacementReport {
  /** Distinct from every excluded engine — the gate the answer passes or fails. */
  readonly acceptable: boolean;
  /** One comparison per excluded engine, in the exclusion list's own order. */
  readonly comparisons: readonly ExcludedEngineComparison[];
  /**
   * The excluded engines the candidate reproduces. Empty when it is
   * acceptable; containing `0` when it reproduces the engine of the very
   * direction that was rejected, which is the backlog's own acceptance
   * criterion read straight off the report.
   */
  readonly collidingWith: readonly number[];
}

/**
 * The exclusion gate over a candidate engine.
 *
 * An empty exclusion list is trivially acceptable: nothing to collide with.
 * That is not a hole to close — a replacement is always asked with at least
 * the discarded direction's engine excluded, and the schema below demands it —
 * but a gate that answered *refused* on an empty list would be answering a
 * question nobody asked.
 */
export function checkDirectionReplacement(
  excludedEngines: readonly NarrativeEngine[],
  candidate: NarrativeEngine,
): DirectionReplacementReport {
  const comparisons = excludedEngines.map((excluded, index) => ({
    excluded: index,
    ...compareNarrativeEngines(excluded, candidate),
  }));

  const collidingWith = comparisons
    .filter((comparison) => !comparison.distinct)
    .map((comparison) => comparison.excluded);

  return {
    acceptable: collidingWith.length === 0,
    comparisons,
    collidingWith,
  };
}

/**
 * What one replacement was asked — the payload `Generation.input` carries.
 *
 * `excludedEngines` is the ask itself rather than a derivation of it: the
 * clauses the prompt quotes are built from these five-tuples, and a kept
 * direction reworded without its engine moving is genuinely the same question.
 * Naming the ids of the kept directions instead would make a rename of one of
 * them a new generation to pay for.
 */
export const directionReplacementInputSchema = z.strictObject({
  /** The source text version the mission reads — never the text itself. */
  sourceTextVersionId: z.string().trim().min(1),
  /** The direction being replaced. */
  discardedDirectionId: z.string().trim().min(1),
  /** The author's reason, or null when they gave none. */
  discardReason: z.string().trim().min(1).max(DIRECTION_DISCARD_REASON_CHAR_CEILING).nullable(),
  /** The discarded engine first, then the kept ones — never empty. */
  excludedEngines: z.array(narrativeEngineSchema).min(1),
});

export type DirectionReplacementInput = z.infer<typeof directionReplacementInputSchema>;

/**
 * The answer to `replace-direction`: one direction, of exactly the shape
 * `propose-directions` returns three of.
 *
 * Wrapped in an object rather than returned bare, as `directionProposalsSchema`
 * is: `@calepin/ai`'s repair classifier decides *off-topic* structurally, by
 * whether an answer shares a field name with the contract (§6), and a bare
 * direction gives it twelve field names to match on instead of one — a
 * malformed answer would read as an off-topic one and lose its repair pass.
 */
export const directionReplacementSchema = z.strictObject({
  direction: directionProposalSchema.describe("The replacement direction."),
});

export type DirectionReplacement = z.infer<typeof directionReplacementSchema>;

/** The gate over the parsed answer and its own ask — the mission-shaped entry point. */
export function checkDirectionReplacementAnswer(
  input: DirectionReplacementInput,
  replacement: DirectionReplacement,
): DirectionReplacementReport {
  return checkDirectionReplacement(input.excludedEngines, replacement.direction.narrativeEngine);
}
