/**
 * What to do with an answer that failed its mission's schema (CAL-052).
 *
 * CLAUDE.md §6 asks for two treatments, never one: *a malformed shape — a
 * missing field, a wrong type — is worth one targeted retry. An off-topic or
 * substantively wrong answer is not repairable by retrying; it fails cleanly.*
 * A blind replay of everything is the failure mode this file exists to prevent:
 * it doubles the cost of every unusable answer and fixes only the half that was
 * ever fixable.
 *
 * **The classification is structural, never semantic.** This layer may not know
 * what a chapter means (§5.7), so "off-topic" has to be provable from the
 * contract and the answer alone. Two signals do it, and nothing else does:
 *
 *  1. *The answer is not of the contract's kind* — a string, an array, a null,
 *     or no JSON at all where an object was required. The model did not attempt
 *     the contract.
 *  2. *The answer shares no field name with the contract* — `{}`, or a refusal
 *     wearing its own shape. It is an answer to some other question.
 *
 * Everything else is a form error: the answer is recognisably an attempt at the
 * contract and some field of it is wrong, which is exactly what one targeted
 * re-ask can fix.
 *
 * An answer that fits the schema and is *semantically* off-topic — right
 * fields, wrong subject — is invisible here by construction, and must stay so.
 * That is the domain's own refinements' job; a failed refinement is
 * field-located, so it takes the repair path like any other field failure.
 *
 * **The decision is here; the wording is not.** The re-ask itself is a prompt,
 * and since CAL-053 every prompt is a versioned resource in `prompts/` —
 * `prompts/repair.ts` holds the text and `deriveRepairPrompt` builds the pass.
 * This file classifies and bounds, and contains no instruction to a model.
 */

import type { z } from "zod";

export const OUTPUT_FAILURE_KINDS = ["malformed", "off-topic"] as const;

/**
 * *Erreur de forme* against *erreur de fond*: the first is repairable by a
 * targeted re-ask, the second is not repairable at all.
 */
export type OutputFailureKind = (typeof OUTPUT_FAILURE_KINDS)[number];

export interface RepairPolicy {
  /**
   * Repair passes allowed after the first answer. `0` disables repair
   * entirely; the default is **one**, which is what §6 asks for — the bound is
   * a declared number rather than a loop nobody can see the end of.
   */
  readonly maxRepairAttempts: number;
}

export const DEFAULT_REPAIR_POLICY: RepairPolicy = { maxRepairAttempts: 1 };

/**
 * Issue codes that say the value is not of the kind the contract asked for, as
 * opposed to being of that kind and wrong somewhere inside.
 */
const KIND_MISMATCH_CODES: readonly string[] = ["invalid_type", "invalid_union"];

export function classifyOutputFailure(
  issues: readonly z.core.$ZodIssue[],
  value: unknown,
  contract: Readonly<Record<string, unknown>>,
): OutputFailureKind {
  // A failure located at the root is a failure of the whole answer. The one
  // carve-out is `unrecognized_keys`, which Zod reports at the parent's path
  // although it names the offending keys — a field-level failure wearing a
  // root path, and one of the most repairable there is.
  if (issues.some((issue) => issue.path.length === 0 && KIND_MISMATCH_CODES.includes(issue.code))) {
    return "off-topic";
  }

  const properties = contract["properties"];

  if (isRecord(value) && isRecord(properties)) {
    const overlaps = Object.keys(value).some((key) => Object.hasOwn(properties, key));

    if (!overlaps) {
      return "off-topic";
    }
  }

  return "malformed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
