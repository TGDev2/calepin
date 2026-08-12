/**
 * The world's rules and bounds as the lines a prompt carries and a screen
 * shows (CAL-092) — `describeRelationshipGraph`'s role, one section over.
 *
 * This is where *rendre détectable plus tard une résolution reposant sur une
 * commodité* stops being a promise the schema makes and becomes something a
 * later reader can act on. A limit stored in a column nobody quotes is a limit
 * the writing model never sees; CAL-107's context and CAL-159's originality
 * controls both need the same sentences, and a second phrasing for the screen
 * would be a second answer able to disagree with the first.
 *
 * **What the world forbids leads.** Each rule renders as its statement and
 * then what it makes impossible; each capability as what it does and then, on
 * their own lines, what it cannot do, what it takes and when it fails. The
 * ordering is the argument: a model composing a scene reads the constraint
 * before the power, so the power arrives already bounded rather than as an
 * open offer it must remember to restrain itself against.
 *
 * Its input is the minimum a rendering needs rather than a `VerifiedWorldBible`
 * — `resolveRelationshipGraph`'s discipline — so a row read back out of
 * `WorldRule` satisfies it as readily as a model's answer, and one
 * implementation serves the composer, the page and the coherence check. That
 * is why it takes `ResolvedWorldRuleRow` and not the contract's two arrays:
 * after `resolveWorldRules`, a row and an answer are the same shape.
 *
 * Returned as a list rather than a block so the caller decides the separator,
 * and so a context budget can bound one line at a time.
 *
 * **These lines are literary content** (§9) — they carry the world's own
 * prose. They are prompt and screen material, never a log line; what is safe
 * to log is `countWorldRows`.
 */

import type { ResolvedWorldRuleRow } from "./resolve";

/** What introduces what a rule makes impossible. */
export const WORLD_FORBIDS_NOTICE = "Interdit :";

/** What introduces a capability's ceiling — what it cannot do at any price. */
export const WORLD_LIMITS_NOTICE = "Ne peut pas :";

/** What introduces what a capability takes from whoever uses it. */
export const WORLD_COSTS_NOTICE = "Coûte :";

/** What introduces the circumstances in which a capability fails outright. */
export const WORLD_FAILURE_NOTICE = "Échoue quand :";

/** What marks a rule the world treats as out of the ordinary. */
export const WORLD_CAPABILITY_NOTICE = "hors norme";

/** What separates the entries of one bound list on a line. */
export const WORLD_BOUND_SEPARATOR = " ; ";

/**
 * One rule as its lines: the rule itself, then one line per bound list it
 * carries.
 *
 * An ordinary rule yields one line, since `resolveWorldRules` has already
 * folded what it forbids into the statement and left its three bound lists
 * empty. A capability yields four, and never fewer — a verified capability
 * cannot have an empty bound list, so a caller reading three bound lines is
 * reading a guarantee rather than a coincidence.
 */
export function describeWorldRule(rule: ResolvedWorldRuleRow): readonly string[] {
  const heading = rule.isSupernatural
    ? `${rule.name} (${WORLD_CAPABILITY_NOTICE}) — ${rule.statement}`
    : `${rule.name} — ${rule.statement}`;

  const lines = [heading];

  if (rule.limits.length > 0) {
    lines.push(`${WORLD_LIMITS_NOTICE} ${rule.limits.join(WORLD_BOUND_SEPARATOR)}`);
  }

  if (rule.costs.length > 0) {
    lines.push(`${WORLD_COSTS_NOTICE} ${rule.costs.join(WORLD_BOUND_SEPARATOR)}`);
  }

  if (rule.failureConditions.length > 0) {
    lines.push(`${WORLD_FAILURE_NOTICE} ${rule.failureConditions.join(WORLD_BOUND_SEPARATOR)}`);
  }

  return lines;
}

/**
 * Every rule of the world as the lines a context carries, ordinary rules
 * first and each capability followed by its three bounds.
 *
 * Ordinary before out-of-norm, whatever order the caller passes: what the
 * world ordinarily allows is the frame a reader needs before an exception to
 * it means anything, and a capability read first is read as the world.
 */
export function describeWorldBounds(rules: readonly ResolvedWorldRuleRow[]): readonly string[] {
  return [
    ...rules.filter((rule) => !rule.isSupernatural),
    ...rules.filter((rule) => rule.isSupernatural),
  ].flatMap(describeWorldRule);
}

/**
 * How many out-of-norm capabilities the world declares, and how many bounds
 * they carry between them — counts, so this one *is* safe to log (§9).
 *
 * Worth its own function because it is the number an operator would want when
 * asking whether a world is bounded at all, and reaching for it must never
 * mean reaching for `describeWorldBounds` and counting the strings.
 */
export function countWorldBounds(rules: readonly ResolvedWorldRuleRow[]): {
  readonly capabilities: number;
  readonly bounds: number;
} {
  const capabilities = rules.filter((rule) => rule.isSupernatural);

  return {
    capabilities: capabilities.length,
    bounds: capabilities.reduce(
      (total, rule) => total + rule.limits.length + rule.costs.length + rule.failureConditions.length,
      0,
    ),
  };
}
