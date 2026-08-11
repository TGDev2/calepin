/**
 * Reads every field of an identity back against what it claims to rest on
 * (CAL-088).
 *
 * The backlog's requirement — *chaque champ doit être traçable à un élément de
 * la direction ou de l'analyse, sans invention non motivée* — as a mechanical
 * re-read. Two things are checked per field, and nothing else: the named
 * source was actually offered by the ask, and the quotation is verbatim in it.
 *
 * **Provenance, never sufficiency**, as everywhere in this codebase. It answers
 * whether the passage exists and says who it belongs to; it never answers
 * whether the passage supports the field. That second question is the author's,
 * and `justification` is what they read to settle it.
 *
 * **An unverifiable basis refuses the answer whole.** The three regimes already
 * in the repository all need somewhere to put the failure: CAL-071 reclassifies
 * a marker the model chose, CAL-076 and CAL-081 clear a nullable quotation,
 * CAL-075 drops a finding. None applies here — the basis is required on every
 * field and every field is required, so there is no nullable to clear and no
 * item to drop. That is CAL-084's exact position, and the answer is CAL-084's:
 * the whole answer is refused and re-asked, because a field's traceability is
 * its substance.
 *
 * **A report, never a `Result`, and no brand** —
 * `checkDirectionReplacement`'s doctrine. Two fields untraced is an answer
 * about the answer, not a failure of this function, and the remedy is a
 * decision the caller makes: re-ask, or show the author what could not be
 * traced. Nothing here rewrites the identity, so there is nothing a brand could
 * promise that a parse does not already say.
 *
 * Every field of the report is a count, a field identifier, a position or a
 * source kind — safe to log whole (§9). Never a key of the ask, which the
 * composer may have built from the author's own headings; never a quotation.
 */

import { createVerbatimMatcher } from "@calepin/shared/text";

import {
  IDENTITY_SOURCE_KINDS,
  type IdentitySource,
  type IdentitySourceKind,
  NOVEL_IDENTITY_SCALAR_FIELDS,
  type NovelIdentityBasis,
  type NovelIdentityField,
  type TracedNovelIdentity,
} from "./schema";

/** Why one field failed to trace. Two reasons, and they have two remedies. */
export const NOVEL_IDENTITY_BASIS_FAILURES = ["unknown-source", "quotation-not-found"] as const;

export type NovelIdentityBasisFailure = (typeof NOVEL_IDENTITY_BASIS_FAILURES)[number];

/**
 * One field whose basis did not hold up: which field, where, and why.
 *
 * `index` is the position in `thematicAxes` for a theme or a counter-theme,
 * and `null` for the seven fields a contract has exactly one of — the
 * `{ list, index }` shape CAL-076 and CAL-081 report with, adapted to a
 * contract whose fields are mostly scalars.
 */
export interface NovelIdentityUntracedField {
  readonly field: NovelIdentityField;
  readonly index: number | null;
  readonly reason: NovelIdentityBasisFailure;
}

/** What the check found, in counts and identifiers — safe to log whole. */
export interface NovelIdentityBasisReport {
  /**
   * Whether every field traced. The caller's decision hangs off this one
   * boolean; `untraced` is what it shows or logs to explain it.
   */
  readonly acceptable: boolean;
  /** Fields read — the seven scalars plus two per thematic axis. */
  readonly fields: number;
  readonly untraced: readonly NovelIdentityUntracedField[];
  /**
   * Which upstreams the answer actually drew on, in `IDENTITY_SOURCE_KINDS`
   * order and counting only bases that held up.
   *
   * Reported rather than required: the backlog asks the mission to work *from*
   * the direction and the analysis, and it does — but a short text whose
   * analysis says nothing the direction does not say better is a project where
   * every field legitimately traces to the direction. Refusing that would be
   * ordering a citation rather than checking one. What a screen or a log can
   * do with this is notice the answer that read only half of what it was given.
   */
  readonly citedKinds: readonly IdentitySourceKind[];
}

interface Corpus {
  readonly kind: IdentitySourceKind;
  readonly quotes: (quotation: string) => boolean;
}

/**
 * Reads an identity's nine fields against the corpus the ask offered.
 *
 * The input has already been parsed by `tracedNovelIdentitySchema` (§6); the
 * sources are the ones `novelIdentityInputSchema` accepted, so their keys are
 * unique and this map cannot lose one.
 *
 * One matcher per source, built once — `createVerbatimMatcher` is a factory
 * because the corpus is the expensive side, and an identity cites nine times
 * into a corpus of dozens of passages.
 */
export function checkNovelIdentityBasis(
  identity: TracedNovelIdentity,
  sources: readonly IdentitySource[],
): NovelIdentityBasisReport {
  const corpora = new Map<string, Corpus>(
    sources.map((source) => [
      source.key,
      { kind: source.kind, quotes: createVerbatimMatcher(source.text) },
    ]),
  );

  const untraced: NovelIdentityUntracedField[] = [];
  const cited = new Set<IdentitySourceKind>();
  let fields = 0;

  function check(field: NovelIdentityField, index: number | null, basis: NovelIdentityBasis): void {
    fields += 1;

    const corpus = corpora.get(basis.sourceKey);

    if (corpus === undefined) {
      untraced.push({ field, index, reason: "unknown-source" });
      return;
    }

    if (!corpus.quotes(basis.quotation)) {
      untraced.push({ field, index, reason: "quotation-not-found" });
      return;
    }

    cited.add(corpus.kind);
  }

  for (const field of NOVEL_IDENTITY_SCALAR_FIELDS) {
    check(field, null, identity[field].basis);
  }

  identity.thematicAxes.forEach((axis, index) => {
    check("theme", index, axis.theme.basis);
    check("counterTheme", index, axis.counterTheme.basis);
  });

  return {
    acceptable: untraced.length === 0,
    fields,
    untraced,
    citedKinds: orderedKinds(cited),
  };
}

/**
 * The cited kinds in `IDENTITY_SOURCE_KINDS` order rather than in the order
 * the answer happened to cite them, so two runs that read the same upstreams
 * report the same list.
 */
function orderedKinds(cited: ReadonlySet<IdentitySourceKind>): readonly IdentitySourceKind[] {
  return IDENTITY_SOURCE_KINDS.filter((kind) => cited.has(kind));
}
