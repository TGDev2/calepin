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
 */

import { toFieldPath } from "@calepin/shared/errors";
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

/** Clauses quoted back to the model. A wholly wrong answer cannot inflate the prompt. */
const MAX_REPAIR_CLAUSES = 10;

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

/**
 * The targeted re-ask: the original request, the rejected answer, and one line
 * per violation.
 *
 * **The rejected answer travels back.** A provider call is stateless — system
 * and prompt, no conversation — so a model asked to "fix the fields below" has
 * nothing to fix unless it is shown what it produced. Without it this would be
 * a re-ask wearing a repair's name, which is the blind retry §6 rules out.
 *
 * **The clauses are built from issue codes, never from issue messages.** A
 * validator's message is the one place a received *value* can appear, and
 * `@calepin/shared/errors` already refuses that bridge for the same reason. An
 * expectation assembled from the issue's own structural fields — the expected
 * type, the bound, the schema's options, the keys to drop — cannot carry one by
 * accident.
 *
 * **It is French**, like the mission prompt it is appended to: the fields it
 * asks the model to correct hold French narrative content, and an English
 * instruction inside a French prompt moves the answer's language. CAL-053 lifts
 * it into the prompt registry as a versioned resource.
 */
export function buildRepairPrompt(options: {
  readonly prompt: string;
  readonly value: unknown;
  readonly issues: readonly z.core.$ZodIssue[];
}): string {
  const clauses = options.issues.slice(0, MAX_REPAIR_CLAUSES).map(repairClause).join("\n");

  return [
    options.prompt,
    "",
    "---",
    "",
    "La réponse précédente a été rejetée : elle ne respecte pas le schéma JSON demandé.",
    "",
    "Réponse rejetée :",
    "```json",
    JSON.stringify(options.value),
    "```",
    "",
    "Points à corriger :",
    clauses,
    "",
    "Renvoie l'objet JSON complet et corrigé, conforme au schéma. Conserve le contenu déjà correct ; ne corrige que ce qui est signalé ci-dessus. Ne renvoie rien d'autre que cet objet : ni explication, ni commentaire, ni texte avant ou après.",
  ].join("\n");
}

function repairClause(issue: z.core.$ZodIssue): string {
  const path = toFieldPath(issue.path);
  const expectation = expectationOf(issue);

  return path === undefined ? `- ${expectation}` : `- ${path} : ${expectation}`;
}

/**
 * What the schema wanted there, in the model's language.
 *
 * Every branch reads a field the *schema* put on the issue, so nothing the
 * model produced can travel through here — except `unrecognized_keys`, whose
 * `keys` are key names the model invented and which are precisely what it has
 * to be told to drop.
 */
function expectationOf(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return `type attendu « ${issue.expected} » — champ absent, vide ou d'un autre type`;
    case "invalid_value":
      return `valeur attendue parmi ${quoteAll(issue.values)}`;
    case "too_small":
      return `minimum attendu : ${issue.minimum}`;
    case "too_big":
      return `maximum attendu : ${issue.maximum}`;
    case "invalid_format":
      return `format attendu « ${issue.format} »`;
    case "not_multiple_of":
      return `multiple de ${issue.divisor} attendu`;
    case "unrecognized_keys":
      return `clés non prévues par le schéma, à retirer : ${quoteAll(issue.keys)}`;
    case "invalid_union":
      return "aucune des formes prévues par le schéma n'est respectée";
    case "invalid_key":
    case "invalid_element":
      return "clé ou élément non conforme au schéma";
    default:
      // `custom` and anything a later Zod adds. A refinement's own message is
      // deliberately not quoted: it is the one clause a domain could write
      // around the value that failed.
      return "contrainte du schéma non satisfaite";
  }
}

function quoteAll(values: readonly unknown[]): string {
  return values.map((value) => `« ${String(value)} »`).join(", ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
