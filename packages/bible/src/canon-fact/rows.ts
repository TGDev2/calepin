/**
 * The columns a verified canon becomes (CAL-094).
 *
 * `resolveCharacterSheet`'s and `resolveTimelineEvents`' role, one table over:
 * persistence, when its task comes, is a copy and not a translation. Nothing
 * here writes — the AI layer never touches a database (§5.6) and neither does a
 * pure rule (§8) — and nothing here resolves an identifier. A subject names a
 * character or a place, an ended fact names an event, and turning a name into a
 * `Character.id` is business code's job, with a live scope in hand (§6).
 *
 * **`validity` is written from the list the fact came out of.** It is the one
 * route the answer has to `CanonFact.validity`, because no field of the contract
 * declares one — CAL-092's `isSupernatural` device, and here it also makes the
 * three branches of `canon_facts_validity_check` unreachable by accident: a
 * permanent fact has no bound to write, an ended fact has no bound field at all,
 * and a period fact's bounds are the only ones that exist.
 *
 * **`source` is written from the kind of the passage the fact quotes**, never
 * from anything the answer says. `./verify` has already proved the quotation is
 * in that passage, so the provenance column records something checked rather
 * than something claimed.
 *
 * **`status` is deliberately not resolved.** `CanonFactStatus` defaults to
 * `PROPOSED`, and only the author moves a fact into the canon (CAL-098) — a
 * resolver that wrote `CONFIRMED` would confirm on their behalf, which is the
 * one thing the lifecycle exists to prevent.
 *
 * **Why not `PendingCanonFact`.** CAL-091's shape carries one subject and
 * exactly two beliefs, because an asymmetry has exactly two ends; a canon fact
 * has none to six subjects, any number of beliefs, a temporal window and a
 * source. Bending the older type to fit would have made every asymmetry carry
 * six empty fields. What reconciles them is one rung up: both project into
 * `DeduplicableCanonFact`, so the facts CAL-091 derives enter this mission's ask
 * as `knownFacts` and are never proposed twice.
 */

import type { TimelinePrecisionInput } from "../timeline/schema";
import {
  CANON_FACT_LISTS,
  CANON_FACT_VALIDITY_BY_LIST,
  type CanonFactBeliefDeclaration,
  type CanonFactSourceKind,
  type CanonFactSubjectDeclaration,
  type InitialCanonFacts,
  type InitialCanonFactsInput,
} from "./schema";
import type { CanonFactSource, CanonFactValidity } from "./types";
import { flattenCanonFacts, type VerifiedInitialCanonFacts } from "./verify";

/**
 * Which `CanonFactSource` member each corpus kind writes.
 *
 * Total over `CANON_FACT_SOURCE_KINDS` and onto only two of the four members:
 * `CHAPTER` belongs to the epic that writes chapters and `USER` to the author's
 * own hand, and neither is reachable from a mission that reads the bible and the
 * source text. `rows.test.ts` pins the totality.
 */
export const CANON_FACT_SOURCE_BY_KIND: Readonly<Record<CanonFactSourceKind, CanonFactSource>> = {
  "source-text": "SOURCE_TEXT",
  identity: "BIBLE",
  character: "BIBLE",
  relationship: "BIBLE",
  world: "BIBLE",
  timeline: "BIBLE",
};

/** One `CanonFactSubject` row, still named rather than keyed. */
export type ResolvedCanonFactSubjectRow = CanonFactSubjectDeclaration;

/** One `CanonFactBelief` row, still named rather than keyed. */
export type ResolvedCanonFactBeliefRow = CanonFactBeliefDeclaration;

/**
 * One `CanonFact` row and the rows that hang off it.
 *
 * The bound columns are spelled as `CanonFact` spells them, flattened out of the
 * contract's `validFrom` / `validUntil` objects, because that is the shape the
 * table has and a resolver's whole job is to stop being clever about it.
 */
export interface ResolvedCanonFactRow {
  readonly statement: string;
  readonly isTrue: boolean;
  readonly validity: CanonFactValidity;
  readonly validFromDay: number | null;
  readonly validFromPrecision: TimelinePrecisionInput | null;
  readonly validFromLabel: string | null;
  readonly validUntilDay: number | null;
  readonly validUntilPrecision: TimelinePrecisionInput | null;
  readonly validUntilLabel: string | null;
  /** The name of the event that ends it — business code resolves the id. */
  readonly invalidatedByEventName: string | null;
  readonly source: CanonFactSource;
  readonly subjects: readonly ResolvedCanonFactSubjectRow[];
  readonly beliefs: readonly ResolvedCanonFactBeliefRow[];
}

/**
 * The rows a verified canon becomes, in the answer's own order.
 *
 * The ask is a parameter because provenance lives there: a fact names a source
 * key, and which `CanonFactSource` that key stands for is the ask's to say.
 * Passing the answer alone would leave the resolver reading a member off the
 * model's word, which is exactly what `./verify` spent a verbatim match
 * avoiding.
 */
export function resolveInitialCanonFacts(
  facts: VerifiedInitialCanonFacts,
  input: InitialCanonFactsInput,
): readonly ResolvedCanonFactRow[] {
  const kinds = new Map(input.sources.map((source) => [source.key, source.kind] as const));

  return CANON_FACT_LISTS.flatMap((list) =>
    facts[list].map((fact): ResolvedCanonFactRow => {
      const kind = kinds.get(fact.basis.sourceKey);

      if (kind === undefined) {
        // A verified fact quotes a passage the ask offered. Reaching here is a
        // programming error, and §7 says a bug is a throw.
        throw new Error("a verified canon fact names a source the ask never offered");
      }

      const from = "validFrom" in fact ? fact.validFrom : null;
      const until = "validUntil" in fact ? fact.validUntil : null;

      return {
        statement: fact.statement,
        isTrue: fact.isTrue,
        validity: CANON_FACT_VALIDITY_BY_LIST[list],
        validFromDay: from?.day ?? null,
        validFromPrecision: from?.precision ?? null,
        validFromLabel: from?.label ?? null,
        validUntilDay: until?.day ?? null,
        validUntilPrecision: until?.precision ?? null,
        validUntilLabel: until?.label ?? null,
        invalidatedByEventName: "endedByEventName" in fact ? fact.endedByEventName : null,
        source: CANON_FACT_SOURCE_BY_KIND[kind],
        subjects: fact.subjects,
        beliefs: fact.knownBy,
      };
    }),
  );
}

/**
 * How many rows a canon comes to.
 *
 * Takes the bare answer rather than the branded one, `countTimelineRows`'
 * arrangement and for its reason: counting is not a write, and a caller sizing a
 * transaction or writing a log line (§9) should not have to hold a verified
 * value to do it.
 */
export function countCanonFactRows(answer: InitialCanonFacts): {
  readonly facts: number;
  readonly permanent: number;
  readonly period: number;
  readonly ended: number;
  readonly subjects: number;
  readonly beliefs: number;
  readonly decompositions: number;
} {
  const facts = flattenCanonFacts(answer);

  return {
    facts: facts.length,
    permanent: answer.permanentFacts.length,
    period: answer.periodFacts.length,
    ended: answer.endedFacts.length,
    subjects: facts.reduce((total, fact) => total + fact.subjects.length, 0),
    beliefs: facts.reduce((total, fact) => total + fact.knownBy.length, 0),
    decompositions: answer.decompositions.length,
  };
}
