/**
 * Reads a canon back against the ask that produced it (CAL-094).
 *
 * Six mechanical questions, in this order: does the fact quote a passage the ask
 * actually offered, is that quotation really in it, does the statement say one
 * thing, do its names reach the cast, the places and the chronology, and does
 * another fact already say it. Provenance and form, never sufficiency — whether
 * a fact is *worth* being canon is the author's call (CAL-098) and whether two
 * facts contradict each other is CAL-099's.
 *
 * **The graded regime is the repository's own, and here the grades are far
 * apart.** A fact is a list entry, so a defective one drops with a report line
 * and the rest of the canon stands (CAL-075's regime, the one available when
 * evidence is required and there is nothing to clear). What refuses the answer
 * whole is the canon falling **below the contract's own floor** once the drops
 * are applied — re-parsed against `CANON_FACT_TOTAL_COUNTS.min`, the same
 * constant the schema uses, because a verifier that drops entries and then
 * re-parses must refuse against the schema's minimums and both numbers must come
 * from one place (lesson 80).
 *
 * **The quotation is what decides the source.** `./rows` reads
 * `CanonFact.source` off the kind of the entry a fact quotes, never off a
 * declaration, so a fact that cannot prove where it came from cannot be written
 * at all — §6 applied to the one table every later chapter is checked against.
 * CAL-088's device, with CAL-084's argument: a model can cite only what it was
 * shown, so a citation to something outside the composed context is impossible
 * by construction rather than merely wrong.
 *
 * **Names are compared through `sameWords`** and the spelling written back is
 * always **the ask's**, never the model's echo — the no-second-answer doctrine
 * applied to a string, and what makes a later name→id resolution a lookup rather
 * than a guess.
 *
 * **The result is branded, because this function rewrites.** Drops, spelling
 * write-backs and the belief merge make the verified canon a different value
 * from the answer, so downstream code must be unable to take the unverified one.
 *
 * Every reported field is an index, a count or a closed reason — never a name,
 * a statement or a quotation, all three of which are literary content (§9).
 */

import { createVerbatimMatcher, sameWords } from "@calepin/shared/text";

import { checkCanonFactStatement } from "./atomicity";
import {
  type CanonFactDuplication,
  type DeduplicableCanonFact,
  deduplicateCanonFacts,
} from "./dedup";
import {
  type AnsweredCanonFact,
  CANON_FACT_LISTS,
  CANON_FACT_TOTAL_COUNTS,
  CANON_FACT_VALIDITY_BY_LIST,
  type CanonFactBeliefDeclaration,
  type CanonFactList,
  type CanonFactSourceKind,
  type CanonFactSubjectDeclaration,
  type EndedFact,
  type InitialCanonFacts,
  type InitialCanonFactsInput,
  initialCanonFactsSchema,
  type PeriodFact,
} from "./schema";

/**
 * Why an answer is refused whole. One reason, and it is a count rather than a
 * judgement: everything else this function finds is a property of one entry.
 */
export const CANON_FACT_REFUSALS = ["below-floor"] as const;

export type CanonFactRefusal = (typeof CANON_FACT_REFUSALS)[number];

/** Why one entry was dropped rather than kept — closed, so it is loggable. */
export const CANON_FACT_DROP_REASONS = [
  /** The basis names a key the ask never offered. */
  "unknown-source",
  /** The quotation is not in the passage the basis names. */
  "unverified-quotation",
  /** The statement says more than one thing — see `./atomicity`. */
  "composite-statement",
  /** The ending event names nothing in the chronology the ask showed. */
  "unknown-event",
  /** A subject names nobody in the cast and nothing in the places. */
  "unknown-subject",
  /** The same entity is a subject of this fact twice. */
  "duplicate-subject",
  /** A belief names nobody in the cast. */
  "unknown-character",
  /** The same character holds two stances on this fact. */
  "duplicate-belief",
  /** Another fact of this answer already says it — beliefs merged into that one. */
  "duplicate-fact",
  /** The bible already holds it, confirmed or refused. */
  "already-known",
  /** A decomposition points outside the answer's facts. */
  "unknown-decomposed-fact",
  /** A decomposition names one of its parts twice. */
  "duplicate-decomposed-fact",
  /** A decomposition names a fact that did not survive. */
  "dropped-decomposed-fact",
  /** The statement a decomposition claims to have broken up is already atomic. */
  "fake-decomposition",
] as const;

export type CanonFactDropReason = (typeof CANON_FACT_DROP_REASONS)[number];

/**
 * One entry that did not survive.
 *
 * `entry` names the sub-list when the drop is one of a fact's own — a subject or
 * a belief — and is null when the whole fact went. Required-but-nullable
 * (CAL-077): the absence is written rather than elided, so a caller reading a
 * report cannot mistake *the fact went* for *the field was forgotten*.
 */
export interface CanonFactDroppedEntry {
  readonly list: CanonFactList | "decompositions";
  readonly index: number;
  readonly reason: CanonFactDropReason;
  readonly entry: { readonly list: "subjects" | "knownBy"; readonly index: number } | null;
}

/**
 * What the pass established, in counts. Safe to log, and deliberately silent
 * about which facts they were.
 */
export interface InitialCanonFactsReport {
  readonly answered: number;
  readonly verified: number;
  readonly permanent: number;
  readonly period: number;
  readonly ended: number;
  readonly subjects: number;
  readonly beliefs: number;
  readonly decompositions: number;
  readonly duplications: readonly CanonFactDuplication[];
}

/**
 * The brand on `globalThis`'s shared symbol registry via `Symbol.for`, for the
 * reason every other brand here uses one: the packages are compiled from source
 * into more than one chunk graph (§12), and a `unique symbol` per chunk would be
 * several brands pretending to be one.
 */
export const VERIFIED_INITIAL_CANON_FACTS_BRAND: unique symbol = Symbol.for(
  "calepin.VerifiedInitialCanonFacts",
);

export type VerifiedInitialCanonFacts = InitialCanonFacts & {
  readonly [VERIFIED_INITIAL_CANON_FACTS_BRAND]: true;
};

export function isVerifiedInitialCanonFacts(value: unknown): value is VerifiedInitialCanonFacts {
  return typeof value === "object" && value !== null && VERIFIED_INITIAL_CANON_FACTS_BRAND in value;
}

/**
 * What verification decided. Refused: too little survived to be a canon, and the
 * remedy — re-ask, or show the author — is the caller's. Verified: the facts to
 * keep, with the ask's spellings written back, plus what was dropped and what
 * was counted.
 */
export type InitialCanonFactsVerification =
  | {
      readonly outcome: "refused";
      readonly refusals: readonly CanonFactRefusal[];
      readonly dropped: readonly CanonFactDroppedEntry[];
    }
  | {
      readonly outcome: "verified";
      readonly facts: VerifiedInitialCanonFacts;
      readonly dropped: readonly CanonFactDroppedEntry[];
      readonly report: InitialCanonFactsReport;
    };

/** The answer's facts, in the order `factIndexes` and every report index use. */
export function flattenCanonFacts(answer: InitialCanonFacts): readonly AnsweredCanonFact[] {
  return CANON_FACT_LISTS.flatMap((list) => answer[list]);
}

/** A position in that flattened order, translated back into the answer's lists. */
export function locateCanonFact(
  answer: InitialCanonFacts,
  factIndex: number,
): { readonly list: CanonFactList; readonly index: number } | null {
  let remaining = factIndex;

  if (!Number.isInteger(factIndex) || factIndex < 0) return null;

  for (const list of CANON_FACT_LISTS) {
    if (remaining < answer[list].length) return { list, index: remaining };
    remaining -= answer[list].length;
  }

  return null;
}

/** A fact that survived the per-entry checks, with where it came from. */
interface CheckedFact {
  readonly list: CanonFactList;
  readonly index: number;
  readonly flatIndex: number;
  readonly fact: AnsweredCanonFact;
  readonly sourceKind: CanonFactSourceKind;
}

function isPeriodFact(fact: AnsweredCanonFact): fact is PeriodFact {
  return "validFrom" in fact;
}

function isEndedFact(fact: AnsweredCanonFact): fact is EndedFact {
  return "endedByEventName" in fact;
}

/** The shape `./dedup` reads, projected out of one checked fact. */
function toDeduplicable(checked: CheckedFact): DeduplicableCanonFact {
  const { fact } = checked;

  return {
    statement: fact.statement,
    isTrue: fact.isTrue,
    validity: CANON_FACT_VALIDITY_BY_LIST[checked.list],
    validFromDay: isPeriodFact(fact) ? (fact.validFrom?.day ?? null) : null,
    validUntilDay: isPeriodFact(fact) ? (fact.validUntil?.day ?? null) : null,
    endingEventKey: isEndedFact(fact) ? fact.endedByEventName : null,
    subjectKeys: fact.subjects.map((subject) => `${subject.kind} ${subject.name}`),
    beliefs: fact.knownBy.map((belief) => ({
      characterKey: belief.characterName,
      state: belief.state,
    })),
  };
}

/**
 * Reads a parsed answer against the ask it came from.
 *
 * The answer has already been parsed by `initialCanonFactsSchema` (§6) and the
 * input by `initialCanonFactsInputSchema`, so every period fact is already
 * placed by a bound, every ended fact already names an event, and the ask's
 * names and keys are already unique.
 */
export function verifyInitialCanonFacts(
  answer: InitialCanonFacts,
  input: InitialCanonFactsInput,
): InitialCanonFactsVerification {
  const dropped: CanonFactDroppedEntry[] = [];
  const checked: CheckedFact[] = [];

  // One reduction per passage rather than one per quotation: the text is the
  // expensive side, which is why `createVerbatimMatcher` is a factory.
  const matchers = new Map(
    input.sources.map((source) => [source.key, createVerbatimMatcher(source.text)] as const),
  );
  const sources = new Map(input.sources.map((source) => [source.key, source] as const));

  let flatIndex = -1;

  for (const list of CANON_FACT_LISTS) {
    answer[list].forEach((fact, index) => {
      flatIndex += 1;

      const drop = (
        reason: CanonFactDropReason,
        entry: CanonFactDroppedEntry["entry"] = null,
      ): void => {
        dropped.push({ list, index, reason, entry });
      };

      const source = sources.get(fact.basis.sourceKey);
      const matches = matchers.get(fact.basis.sourceKey);

      if (source === undefined || matches === undefined) {
        drop("unknown-source");
        return;
      }

      if (!matches(fact.basis.quotation)) {
        drop("unverified-quotation");
        return;
      }

      if (checkCanonFactStatement(fact.statement).length > 0) {
        drop("composite-statement");
        return;
      }

      // The chronology's own spelling, resolved before anything else is
      // rewritten: an ended fact that anchors to nothing has no window at all.
      const endingEvent = isEndedFact(fact)
        ? input.events.find((candidate) => sameWords(fact.endedByEventName, candidate.name))
        : null;

      if (isEndedFact(fact) && endingEvent === undefined) {
        drop("unknown-event");
        return;
      }

      const subjects: CanonFactSubjectDeclaration[] = [];

      fact.subjects.forEach((subject, entryIndex) => {
        const offered =
          subject.kind === "character"
            ? input.cast.find((member) => sameWords(subject.name, member.name))
            : input.places.find((place) => sameWords(subject.name, place.name));

        if (offered === undefined) {
          drop("unknown-subject", { list: "subjects", index: entryIndex });
          return;
        }

        // Compared on the ask's spellings: two echoes of one entry are one
        // entity, whatever the model retyped. `canon_fact_subjects_factId_*_key`
        // refuses the pair at the row, so it is refused here first.
        if (subjects.some((kept) => kept.kind === subject.kind && kept.name === offered.name)) {
          drop("duplicate-subject", { list: "subjects", index: entryIndex });
          return;
        }

        subjects.push({ kind: subject.kind, name: offered.name });
      });

      const knownBy: CanonFactBeliefDeclaration[] = [];

      fact.knownBy.forEach((belief, entryIndex) => {
        const member = input.cast.find((candidate) =>
          sameWords(belief.characterName, candidate.name),
        );

        if (member === undefined) {
          drop("unknown-character", { list: "knownBy", index: entryIndex });
          return;
        }

        // `@@unique([factId, characterId])` at the row; first stance wins here.
        if (knownBy.some((kept) => kept.characterName === member.name)) {
          drop("duplicate-belief", { list: "knownBy", index: entryIndex });
          return;
        }

        knownBy.push({ characterName: member.name, state: belief.state });
      });

      checked.push({
        list,
        index,
        flatIndex,
        sourceKind: source.kind,
        fact:
          isEndedFact(fact) && endingEvent !== null && endingEvent !== undefined
            ? { ...fact, subjects, knownBy, endedByEventName: endingEvent.name }
            : { ...fact, subjects, knownBy },
      });
    });
  }

  const deduplication = deduplicateCanonFacts(checked.map(toDeduplicable), input.knownFacts);
  const survivors = new Set(deduplication.kept);

  // The beliefs a merged duplicate contributed, gathered before anything is
  // dropped: the survivor is named by its position in `checked`.
  const absorbed = new Map<number, CanonFactBeliefDeclaration[]>();

  for (const merge of deduplication.merges) {
    const duplicate = checked[merge.index];

    if (duplicate === undefined) continue;

    const into = absorbed.get(merge.intoIndex) ?? [];

    for (const beliefIndex of merge.beliefIndexes) {
      const belief = duplicate.fact.knownBy[beliefIndex];

      if (
        belief !== undefined &&
        !into.some((kept) => kept.characterName === belief.characterName)
      ) {
        into.push(belief);
      }
    }

    absorbed.set(merge.intoIndex, into);
  }

  for (const duplication of deduplication.report.duplications) {
    if (duplication.kind !== "duplicate" && duplication.kind !== "already-known") continue;

    const entry = checked[duplication.index];

    if (entry === undefined) continue;

    dropped.push({
      list: entry.list,
      index: entry.index,
      reason: duplication.kind === "duplicate" ? "duplicate-fact" : "already-known",
      entry: null,
    });
  }

  const kept = checked
    .map((entry, position): CheckedFact | null => {
      if (!survivors.has(position)) return null;

      const extra = absorbed.get(position);

      if (extra === undefined || extra.length === 0) return entry;

      return { ...entry, fact: { ...entry.fact, knownBy: [...entry.fact.knownBy, ...extra] } };
    })
    .filter((entry): entry is CheckedFact => entry !== null);

  if (kept.length < CANON_FACT_TOTAL_COUNTS.min) {
    return { outcome: "refused", refusals: ["below-floor"], dropped };
  }

  // Decompositions are checked last, because *did this part survive* is only
  // answerable once every drop above has been applied.
  const survivingFlatIndexes = new Set(kept.map((entry) => entry.flatIndex));
  const factCount = flatIndex + 1;
  const decompositions = answer.decompositions.filter((decomposition, index) => {
    const drop = (reason: CanonFactDropReason): false => {
      dropped.push({ list: "decompositions", index, reason, entry: null });
      return false;
    };

    if (decomposition.factIndexes.some((at) => at < 0 || at >= factCount)) {
      return drop("unknown-decomposed-fact");
    }

    if (new Set(decomposition.factIndexes).size !== decomposition.factIndexes.length) {
      return drop("duplicate-decomposed-fact");
    }

    if (decomposition.factIndexes.some((at) => !survivingFlatIndexes.has(at))) {
      return drop("dropped-decomposed-fact");
    }

    // The half that cannot be filled when the declaration is fake: a
    // decomposition of something already atomic is padding, and the checker
    // that judges the parts is the one that judges the whole.
    if (checkCanonFactStatement(decomposition.composite).length === 0) {
      return drop("fake-decomposition");
    }

    return true;
  });

  // Narrowed by the guards rather than asserted: a fact that reached the wrong
  // list would be a bug here, and `mint`'s strict re-parse is what catches it.
  const verified: InitialCanonFacts = {
    permanentFacts: kept
      .filter((entry) => entry.list === "permanentFacts")
      .map((entry) => entry.fact),
    periodFacts: kept
      .filter((entry) => entry.list === "periodFacts")
      .map((entry) => entry.fact)
      .filter(isPeriodFact),
    endedFacts: kept
      .filter((entry) => entry.list === "endedFacts")
      .map((entry) => entry.fact)
      .filter(isEndedFact),
    decompositions,
  };

  return {
    outcome: "verified",
    facts: mint(verified),
    dropped,
    report: {
      answered: factCount,
      verified: kept.length,
      permanent: verified.permanentFacts.length,
      period: verified.periodFacts.length,
      ended: verified.endedFacts.length,
      subjects: kept.reduce((total, entry) => total + entry.fact.subjects.length, 0),
      beliefs: kept.reduce((total, entry) => total + entry.fact.knownBy.length, 0),
      decompositions: decompositions.length,
      duplications: deduplication.report.duplications,
    },
  };
}

/**
 * Re-parsed before the brand goes on, `verifyCharacterRelations`' discipline:
 * the value was reassembled here, and the schema is the only authority on
 * whether what was reassembled is still a canon.
 */
function mint(facts: InitialCanonFacts): VerifiedInitialCanonFacts {
  const parsed = initialCanonFactsSchema.safeParse(facts);

  if (!parsed.success) {
    throw new Error("a verified canon no longer parses", { cause: parsed.error });
  }

  return { ...parsed.data, [VERIFIED_INITIAL_CANON_FACTS_BRAND]: true };
}
