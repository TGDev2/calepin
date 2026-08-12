/**
 * The gate between a parsed answer and anything that acts on it (CAL-101).
 *
 * **One regime, and it is refusal** — the timeline's, on the timeline's own
 * grounds: the parts are mutually load-bearing and the thread indexes point
 * into the answer's own list, so there is nothing to drop and nothing to
 * clear, and the answer stands or falls whole. Advisories ride along in the
 * report either way — they are a person's to weigh, and hiding them behind
 * the refusal would lose them exactly when the answer is otherwise good.
 *
 * The result is branded (`VerifiedPartStructure`), minted only here and never
 * serialised, so whatever later persists the parts takes a checked structure
 * instead of remembering to check one — `VerifiedBibleTimeline`'s
 * arrangement, one epic earlier.
 */

import { checkPartStructure, type PartStructureReport } from "./check";
import { type PartStructure, type PartStructureInput, partStructureSchema } from "./schema";

/**
 * The brand on `globalThis`'s shared symbol registry via `Symbol.for`, for
 * the reason `VerifiedSourceTextAnalysis` uses one: the packages are compiled
 * from source into more than one chunk graph (§12), and a `unique symbol`
 * per chunk would be several brands pretending to be one.
 */
export const VERIFIED_PART_STRUCTURE_BRAND: unique symbol = Symbol.for(
  "calepin.VerifiedPartStructure",
);

export type VerifiedPartStructure = PartStructure & {
  readonly [VERIFIED_PART_STRUCTURE_BRAND]: true;
};

export function isVerifiedPartStructure(value: unknown): value is VerifiedPartStructure {
  return typeof value === "object" && value !== null && VERIFIED_PART_STRUCTURE_BRAND in value;
}

export type PartStructureVerification =
  | { readonly outcome: "refused"; readonly report: PartStructureReport }
  | {
      readonly outcome: "verified";
      readonly structure: VerifiedPartStructure;
      readonly report: PartStructureReport;
    };

/**
 * Runs the calculable checks over the answer, against the ask's own target
 * word count — the count gate re-derives its range from the same function
 * the prompt's variables came from, which is what makes the refusal and the
 * ask agree about what was admissible.
 */
export function verifyPartStructure(
  answer: PartStructure,
  input: PartStructureInput,
): PartStructureVerification {
  const report = checkPartStructure({
    novelTargetWordCount: input.targetWordCount,
    threads: answer.threads.map((thread) => ({ label: thread.label })),
    parts: answer.parts.map((part) => ({
      title: part.title,
      dramaticObjective: part.dramaticObjective,
      initialState: part.initialState,
      finalState: part.finalState,
      threadIndexes: part.threadIndexes,
    })),
  });

  if (!report.acceptable) return { outcome: "refused", report };

  return { outcome: "verified", structure: mint(answer), report };
}

/**
 * Re-parsed before the brand goes on, `verifyAnalysisEvidence`'s discipline:
 * the schema is the only authority on whether what is being certified is
 * still a part structure.
 */
function mint(structure: PartStructure): VerifiedPartStructure {
  const parsed = partStructureSchema.safeParse(structure);

  if (!parsed.success) {
    throw new Error("a verified part structure no longer parses", { cause: parsed.error });
  }

  return { ...parsed.data, [VERIFIED_PART_STRUCTURE_BRAND]: true };
}
