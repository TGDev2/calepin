/**
 * The bible screen's origin indicator (CAL-096) — two derivations feeding one
 * shared vocabulary, because the bible has two different sources of
 * provenance and neither should invent a third.
 *
 * Eight of the nine lockable models (everything but `CanonFact`) carry the
 * `ContentOrigin` column CAL-096's migration added, and
 * `resolveProvenanceState` in `@calepin/shared/provenance` is the only place
 * that may turn one into a `ProvenanceState` — `bibleElementProvenanceState`
 * only supplies the second half of that function's input.
 * `reviewedByAuthor` is the bible's own `validatedAt`: a bible element has no
 * enclosing revision the way an analysis section does, so the bible's own
 * validation (CAL-100) is what stands for "the container was reviewed",
 * exactly the role `AnalysisSectionRevision.origin` plays one epic over.
 *
 * `CanonFact` deliberately has no `origin` column (`@calepin/shared/repository`'s
 * `bible.ts` says why): it already carries `source` and `status`, two
 * independent, real signals, and `canonFactProvenanceState` reads the same
 * three-state answer off them instead of adding a column able to disagree
 * with either.
 */

import {
  type ContentOrigin,
  type ProvenanceState,
  resolveProvenanceState,
} from "@calepin/shared/provenance";
import type { BibleCanonFactRow } from "@calepin/shared/repository";

export interface BibleElementProvenanceInput {
  readonly origin: ContentOrigin;
  readonly bibleValidatedAt: Date | null;
}

/** The eight `ContentOrigin`-bearing bible models. */
export function bibleElementProvenanceState({
  origin,
  bibleValidatedAt,
}: BibleElementProvenanceInput): ProvenanceState {
  return resolveProvenanceState({ origin, reviewedByAuthor: bibleValidatedAt !== null });
}

export type CanonFactProvenanceInput = Pick<BibleCanonFactRow, "source" | "status">;

/**
 * `CanonFact`'s own three-state reading: a confirmed fact is validated
 * whatever proposed it, a fact the author typed themselves and has not yet
 * confirmed is their own, and everything else is still a proposal awaiting
 * arbitration (CAL-098). Never returns `"edited"` — nothing distinguishes a
 * fact reworded after extraction from one kept verbatim, so this function
 * does not claim to know the difference.
 */
export function canonFactProvenanceState({
  source,
  status,
}: CanonFactProvenanceInput): ProvenanceState {
  if (status === "CONFIRMED") return "accepted";
  if (source === "USER") return "user-written";
  return "proposed";
}

/**
 * The bible's own wording for the four states — `PROVENANCE_LABELS`'
 * (`@/lib/analysis-edit`) sibling rather than a reuse of it: that one speaks
 * of "l'analyse" by name, and a bible element may come from any of seven
 * missions, so the text here names no single one.
 */
export const BIBLE_PROVENANCE_LABELS: Record<
  ProvenanceState,
  { readonly label: string; readonly explanation: string }
> = {
  proposed: {
    label: "Proposition du modèle",
    explanation: "Écrit par une génération. Vous ne l'avez pas encore relu.",
  },
  accepted: {
    label: "Élément validé",
    explanation: "Proposé par une génération, puis conservé tel quel après relecture.",
  },
  edited: {
    label: "Modification manuelle",
    explanation: "Proposé par une génération, puis réécrit par vous.",
  },
  "user-written": {
    label: "Rédigé par vous",
    explanation: "Ajouté par vous ; aucune génération ne l'avait proposé.",
  },
};
